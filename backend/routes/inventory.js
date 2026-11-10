const express = require('express');
const multer = require('multer');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { getTrustedNowSqlite } = require('../utils/time');
const cloudPhotos = require('../services/cloudinaryPhotos');
const { dispatchNotification } = require('../services/notificationService');

const router = express.Router();
router.use(authenticate);

const productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
    ? cb(null, true) : cb(new Error('Formato de imagem inválido.')),
});

function sanitizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeName(value) {
  return String(value || '').trim();
}

async function resolveCategoryId(name, storeId = 1, client = db) {
  const clean = normalizeName(name);
  if (!clean) return null;
  const existing = await client.queryOne('SELECT id FROM stock_categories WHERE store_id = $1 AND lower(name) = lower($2)', [storeId, clean]);
  if (existing) return existing.id;
  const info = await client.execute('INSERT INTO stock_categories (store_id, name) VALUES ($1, $2) RETURNING id', [storeId, clean]);
  return info.id;
}

async function resolveSupplierId(name, storeId = 1, client = db) {
  const clean = normalizeName(name);
  if (!clean) return null;
  const existing = await client.queryOne('SELECT id FROM stock_suppliers WHERE store_id = $1 AND lower(name) = lower($2)', [storeId, clean]);
  if (existing) return existing.id;
  const info = await client.execute('INSERT INTO stock_suppliers (store_id, name) VALUES ($1, $2) RETURNING id', [storeId, clean]);
  return info.id;
}

async function getDashboardData(storeId = 1, client = db) {
  return client.queryOne(`
    SELECT
      COUNT(p.id) as total_products,
      COALESCE(SUM(COALESCE(l.quantity, 0)), 0) as total_stock_qty,
      COALESCE(SUM(CASE WHEN COALESCE(l.quantity, 0) <= 0 THEN 1 ELSE 0 END), 0) as out_of_stock,
      COALESCE(SUM(CASE WHEN COALESCE(l.quantity, 0) > 0 AND COALESCE(l.quantity, 0) <= p.min_stock THEN 1 ELSE 0 END), 0) as low_stock,
      COALESCE(SUM(COALESCE(l.quantity, 0) * p.cost_price), 0) as stock_cost_value
    FROM stock_products p
    LEFT JOIN stock_levels l ON l.product_id = p.id
    WHERE p.store_id = $1 AND p.is_active = 1
  `, [storeId]);
}

async function getProductById(id, includeInactive = false, storeId = 1, client = db) {
  return client.queryOne(`
    SELECT
      p.*, c.name as category_name, s.name as supplier_name,
      COALESCE(l.quantity, 0) as quantity
    FROM stock_products p
    LEFT JOIN stock_categories c ON c.id = p.category_id
    LEFT JOIN stock_suppliers s ON s.id = p.supplier_id
    LEFT JOIN stock_levels l ON l.product_id = p.id
    WHERE p.id = $1 AND p.store_id = $2 ${includeInactive ? '' : 'AND p.is_active = 1'}
  `, [id, storeId]);
}

async function recordMovement({ productId, movementType, quantityDelta, previousQuantity, newQuantity, reason, referenceType, referenceId, user, createdAt, storeId = 1 }, client = db) {
  await client.execute(`
    INSERT INTO stock_movements (
      store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity,
      reason, reference_type, reference_id, user_id, user_name, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `, [
    storeId,
    productId,
    movementType,
    quantityDelta,
    previousQuantity,
    newQuantity,
    reason || null,
    referenceType || null,
    referenceId || null,
    user?.id || null,
    user?.full_name || 'sistema',
    createdAt || null
  ]);
}

async function revertMovementById({ movementId, trustedNow, user, storeId = 1 }) {
  return db.transaction(async (tx) => {
    const movement = await tx.queryOne(`
      SELECT
        m.*,
        p.name as product_name,
        p.code as product_code,
        p.is_active,
        COALESCE(l.quantity, 0) as current_quantity
      FROM stock_movements m
      JOIN stock_products p ON p.id = m.product_id
      LEFT JOIN stock_levels l ON l.product_id = m.product_id
      WHERE m.id = $1 AND p.store_id = $2
    `, [movementId, storeId]);

    if (!movement) throw new Error('MOVEMENT_NOT_FOUND');
    if (!movement.is_active) throw new Error('INACTIVE_PRODUCT');
    if (String(movement.reference_type || '') === 'movement_reversal') throw new Error('MOVEMENT_IS_REVERSAL');
    if (String(movement.reference_type || '') === 'sale' || String(movement.reference_type || '') === 'sale_reversal') {
      throw new Error('USE_SALE_CANCEL');
    }

    const alreadyReversed = await tx.queryOne(`
      SELECT id
      FROM stock_movements
      WHERE reference_type = 'movement_reversal' AND reference_id = $1
      LIMIT 1
    `, [movementId]);
    if (alreadyReversed) throw new Error('MOVEMENT_ALREADY_REVERSED');

    const latestNonReversal = await tx.queryOne(`
      SELECT id
      FROM stock_movements
      WHERE product_id = $1
        AND COALESCE(reference_type, '') <> 'movement_reversal'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `, [movement.product_id]);

    if (!latestNonReversal || Number(latestNonReversal.id) !== Number(movement.id)) {
      throw new Error('MOVEMENT_NOT_LAST');
    }

    const previousQuantity = sanitizeInt(movement.current_quantity, 0);
    let newQuantity;
    let reversalDelta;

    if (movement.movement_type === 'entry') {
      reversalDelta = -Math.abs(movement.quantity_delta);
      newQuantity = previousQuantity + reversalDelta;
      if (newQuantity < 0) throw new Error('NEGATIVE_STOCK');
    } else if (movement.movement_type === 'exit') {
      reversalDelta = Math.abs(movement.quantity_delta);
      newQuantity = previousQuantity + reversalDelta;
    } else if (movement.movement_type === 'adjustment') {
      reversalDelta = movement.previous_quantity - movement.new_quantity;
      newQuantity = movement.previous_quantity;
      if (newQuantity < 0) throw new Error('NEGATIVE_STOCK');
    } else {
      throw new Error('UNSUPPORTED_MOVEMENT_TYPE');
    }

    await tx.execute('UPDATE stock_levels SET quantity = $1, updated_at = $2 WHERE product_id = $3', [newQuantity, trustedNow, movement.product_id]);

    await recordMovement({
      productId: movement.product_id,
      movementType: 'adjustment',
      quantityDelta: reversalDelta,
      previousQuantity,
      newQuantity,
      reason: `Estorno manual da movimentação #${movement.id}`,
      referenceType: 'movement_reversal',
      referenceId: movement.id,
      user,
      createdAt: trustedNow,
      storeId,
    }, tx);

    return {
      movement,
      newQuantity,
      reversalDelta,
    };
  });
}

router.get('/dashboard', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    res.json(await getDashboardData(storeId));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar dados do dashboard: ' + err.message });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const rows = await db.query(`
      SELECT c.id, c.name, c.is_active,
      (SELECT COUNT(*) FROM stock_products p WHERE p.category_id = c.id AND p.store_id = c.store_id) AS product_count
      FROM stock_categories c WHERE c.store_id = $1 ORDER BY LOWER(c.name)
    `, [storeId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar categorias: ' + err.message });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const name = normalizeName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });

    const exists = await db.queryOne('SELECT id FROM stock_categories WHERE store_id = $1 AND lower(name) = lower($2)', [storeId, name]);
    if (exists) return res.status(409).json({ error: 'Categoria já cadastrada nesta loja.' });

    const info = await db.execute('INSERT INTO stock_categories (store_id, name) VALUES ($1, $2) RETURNING id', [storeId, name]);
    res.status(201).json(await db.queryOne('SELECT id, name, is_active FROM stock_categories WHERE id = $1', [info.id]));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao cadastrar categoria: ' + err.message });
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const existing = await db.queryOne('SELECT * FROM stock_categories WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!existing) return res.status(404).json({ error: 'Categoria não encontrada nesta loja.' });
    const name = normalizeName(req.body?.name ?? existing.name);
    if (!name) return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });
    const duplicate = await db.queryOne('SELECT id FROM stock_categories WHERE store_id = $1 AND lower(name) = lower($2) AND id <> $3', [storeId, name, req.params.id]);
    if (duplicate) return res.status(409).json({ error: 'Categoria já cadastrada nesta loja.' });

    await db.execute('UPDATE stock_categories SET name = $1, is_active = $2 WHERE id = $3 AND store_id = $4', [
      name,
      req.body?.is_active === undefined ? existing.is_active : (req.body.is_active ? 1 : 0),
      req.params.id,
      storeId
    ]);
    res.json(await db.queryOne('SELECT id, name, is_active FROM stock_categories WHERE id = $1', [req.params.id]));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar categoria: ' + err.message });
  }
});

router.delete('/categories/:id', requireRole('admin'), async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const existing = await db.queryOne('SELECT * FROM stock_categories WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!existing) return res.status(404).json({ error: 'Categoria não encontrada nesta loja.' });
    const countRow = await db.queryOne('SELECT COUNT(*) as n FROM stock_products WHERE category_id = $1 AND store_id = $2', [req.params.id, storeId]);
    const productCount = parseInt(countRow?.n || 0, 10);

    await db.transaction(async (tx) => {
      await tx.execute('UPDATE stock_products SET category_id = NULL WHERE category_id = $1 AND store_id = $2', [req.params.id, storeId]);
      await tx.execute('DELETE FROM stock_categories WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    });
    res.json({ success: true, mode: 'deleted', product_count: productCount });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir categoria: ' + err.message });
  }
});

router.get('/suppliers', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const rows = await db.query(`
      SELECT s.id, s.name, s.contact_info, s.notes, s.is_active,
      (SELECT COUNT(*) FROM stock_products p WHERE p.supplier_id = s.id AND p.store_id = s.store_id) AS product_count,
      (SELECT COUNT(*) FROM service_orders so WHERE so.supplier_id = s.id AND so.store_id = s.store_id) AS service_order_count,
      (SELECT COUNT(*) FROM cash_withdrawals w WHERE w.supplier_id = s.id AND w.store_id = s.store_id) AS withdrawal_count
      FROM stock_suppliers s WHERE s.store_id = $1 ORDER BY LOWER(s.name)
    `, [storeId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar fornecedores: ' + err.message });
  }
});

router.post('/suppliers', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const name = normalizeName(req.body?.name);
    const contactInfo = normalizeName(req.body?.contact_info);
    const notes = normalizeName(req.body?.notes);
    if (!name) return res.status(400).json({ error: 'Nome do fornecedor é obrigatório.' });
    if (name.length > 200 || contactInfo.length > 100 || notes.length > 1000) {
      return res.status(400).json({ error: 'Dados do fornecedor excedem o tamanho permitido.' });
    }

    const exists = await db.queryOne('SELECT id FROM stock_suppliers WHERE store_id = $1 AND lower(name) = lower($2)', [storeId, name]);
    if (exists) return res.status(409).json({ error: 'Fornecedor já cadastrado nesta loja.' });

    const info = await db.execute('INSERT INTO stock_suppliers (store_id, name, contact_info, notes) VALUES ($1, $2, $3, $4) RETURNING id', [
      storeId, name, contactInfo || null, notes || null
    ]);
    res.status(201).json(await db.queryOne('SELECT id, name, contact_info, notes, is_active FROM stock_suppliers WHERE id = $1', [info.id]));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao cadastrar fornecedor: ' + err.message });
  }
});

router.put('/suppliers/:id', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const existing = await db.queryOne('SELECT * FROM stock_suppliers WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!existing) return res.status(404).json({ error: 'Fornecedor não encontrado nesta loja.' });
    const name = normalizeName(req.body?.name ?? existing.name);
    const contactInfo = normalizeName(req.body?.contact_info ?? existing.contact_info);
    const notes = normalizeName(req.body?.notes ?? existing.notes);
    if (!name) return res.status(400).json({ error: 'Nome do fornecedor é obrigatório.' });
    if (name.length > 200 || contactInfo.length > 100 || notes.length > 1000) {
      return res.status(400).json({ error: 'Dados do fornecedor excedem o tamanho permitido.' });
    }
    const duplicate = await db.queryOne('SELECT id FROM stock_suppliers WHERE store_id = $1 AND lower(name) = lower($2) AND id <> $3', [storeId, name, req.params.id]);
    if (duplicate) return res.status(409).json({ error: 'Fornecedor já cadastrado nesta loja.' });

    await db.execute('UPDATE stock_suppliers SET name = $1, contact_info = $2, notes = $3, is_active = $4 WHERE id = $5 AND store_id = $6', [
      name, contactInfo || null, notes || null,
      req.body?.is_active === undefined ? existing.is_active : (req.body.is_active ? 1 : 0),
      req.params.id,
      storeId
    ]);
    res.json(await db.queryOne('SELECT id, name, contact_info, notes, is_active FROM stock_suppliers WHERE id = $1', [req.params.id]));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar fornecedor: ' + err.message });
  }
});

router.delete('/suppliers/:id', requireRole('admin'), async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const existing = await db.queryOne('SELECT * FROM stock_suppliers WHERE id = $1 AND (store_id = $2 OR store_id IS NULL)', [req.params.id, storeId]);
    if (!existing) return res.status(404).json({ error: 'Fornecedor não encontrado nesta loja.' });

    const prodCountRow = await db.queryOne('SELECT COUNT(*) as n FROM stock_products WHERE supplier_id = $1 AND (store_id = $2 OR store_id IS NULL)', [req.params.id, storeId]);
    const soCountRow = await db.queryOne('SELECT COUNT(*) as n FROM service_orders WHERE supplier_id = $1 AND (store_id = $2 OR store_id IS NULL)', [req.params.id, storeId]);
    const withCountRow = await db.queryOne('SELECT COUNT(*) as n FROM cash_withdrawals WHERE supplier_id = $1 AND (store_id = $2 OR store_id IS NULL)', [req.params.id, storeId]);

    await db.transaction(async (tx) => {
      await tx.execute('UPDATE stock_products SET supplier_id = NULL WHERE supplier_id = $1 AND (store_id = $2 OR store_id IS NULL)', [req.params.id, storeId]);
      await tx.execute('UPDATE service_orders SET supplier_name_snapshot = COALESCE(supplier_name_snapshot, $1), supplier_id = NULL WHERE supplier_id = $2 AND (store_id = $3 OR store_id IS NULL)', [existing.name, req.params.id, storeId]);
      await tx.execute('UPDATE cash_withdrawals SET supplier_name = COALESCE(supplier_name, $1), supplier_id = NULL WHERE supplier_id = $2 AND (store_id = $3 OR store_id IS NULL)', [existing.name, req.params.id, storeId]);
      await tx.execute('DELETE FROM stock_suppliers WHERE id = $1 AND (store_id = $2 OR store_id IS NULL)', [req.params.id, storeId]);
    });

    res.json({
      success: true,
      mode: 'deleted',
      product_count: parseInt(prodCountRow?.n || 0, 10),
      service_order_count: parseInt(soCountRow?.n || 0, 10),
      withdrawal_count: parseInt(withCountRow?.n || 0, 10)
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir fornecedor: ' + err.message });
  }
});

router.post('/products/:id/image', (req, res, next) => productImageUpload.single('image')(req, res, (err) => err ? res.status(400).json({ error: 'Envie uma imagem JPG, PNG ou WebP com até 10 MB.' }) : next()), async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const product = await getProductById(req.params.id, true, storeId);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });

    if (product.image_public_id) await cloudPhotos.delete(product.image_public_id);
    const result = await cloudPhotos.uploadProductPhoto({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      productCode: product.code,
    });
    await db.execute('UPDATE stock_products SET image_url = $1, image_public_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND store_id = $4', [result.url, result.public_id, product.id, storeId]);
    res.json({ success: true, image_url: result.url });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Falha ao salvar a imagem do produto.' });
  }
});

router.delete('/products/:id/image', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const product = await getProductById(req.params.id, true, storeId);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
    if (!product.image_public_id) return res.json({ success: true });
    try { await cloudPhotos.delete(product.image_public_id); }
    catch (_) { return res.status(502).json({ error: 'Falha ao remover a imagem. A foto foi preservada.' }); }
    await db.execute('UPDATE stock_products SET image_url = NULL, image_public_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND store_id = $2', [product.id, storeId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/products', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const { q, category_id, supplier_id, low_stock, out_of_stock } = req.query;

    let sql = `
      SELECT
        p.*, c.name as category_name, s.name as supplier_name,
        COALESCE(l.quantity, 0) as quantity,
        CASE
          WHEN COALESCE(l.quantity, 0) <= 0 THEN 'out'
          WHEN COALESCE(l.quantity, 0) <= p.min_stock THEN 'low'
          ELSE 'normal'
        END as stock_status
      FROM stock_products p
      LEFT JOIN stock_categories c ON c.id = p.category_id
      LEFT JOIN stock_suppliers s ON s.id = p.supplier_id
      LEFT JOIN stock_levels l ON l.product_id = p.id
      WHERE p.store_id = $1 AND p.is_active = 1
    `;

    const params = [storeId];
    let paramIndex = 2;
    if (q) {
      const like = `%${q}%`;
      sql += ` AND (p.name ILIKE $${paramIndex} OR p.code ILIKE $${paramIndex} OR COALESCE(p.model, '') ILIKE $${paramIndex} OR COALESCE(p.barcode, '') ILIKE $${paramIndex})`;
      params.push(like);
      paramIndex++;
    }
    if (category_id) {
      sql += ` AND p.category_id = $${paramIndex++}`;
      params.push(category_id);
    }
    if (supplier_id) {
      sql += ` AND p.supplier_id = $${paramIndex++}`;
      params.push(supplier_id);
    }
    if (String(low_stock || '') === '1' || String(low_stock || '').toLowerCase() === 'true') {
      sql += ' AND COALESCE(l.quantity, 0) > 0 AND COALESCE(l.quantity, 0) <= p.min_stock';
    }
    if (String(out_of_stock || '') === '1' || String(out_of_stock || '').toLowerCase() === 'true') {
      sql += ' AND COALESCE(l.quantity, 0) <= 0';
    }

    sql += ' ORDER BY LOWER(p.name) ASC';
    const rows = await db.query(sql, ...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar produtos de estoque: ' + err.message });
  }
});

router.get('/products/:id', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const row = await getProductById(req.params.id, false, storeId);
    if (!row) return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar produto: ' + err.message });
  }
});

router.post('/products', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const b = req.body || {};
    const name = normalizeName(b.name);
    const model = normalizeName(b.model);
    const code = normalizeName(b.code).toUpperCase();

    if (!name) return res.status(400).json({ error: 'Nome do produto é obrigatório.' });
    if (!code) return res.status(400).json({ error: 'Código do produto é obrigatório.' });

    const existingCode = await db.queryOne('SELECT id FROM stock_products WHERE store_id = $1 AND code = $2', [storeId, code]);
    if (existingCode) return res.status(409).json({ error: 'Já existe um produto com esse código nesta loja.' });

    const trustedNow = await getTrustedNowSqlite();

    const productId = await db.transaction(async (tx) => {
      const categoryId = b.category_id ? sanitizeInt(b.category_id, null) : await resolveCategoryId(b.category_name, storeId, tx);
      const supplierId = b.supplier_id ? sanitizeInt(b.supplier_id, null) : await resolveSupplierId(b.supplier_name, storeId, tx);

      const info = await tx.execute(`
        INSERT INTO stock_products (
          store_id, name, model, code, barcode, category_id, supplier_id,
          cost_price, sale_price, min_stock, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `, [
        storeId,
        name,
        model || null,
        code,
        normalizeName(b.barcode) || null,
        categoryId,
        supplierId,
        sanitizeNumber(b.cost_price, 0),
        sanitizeNumber(b.sale_price, 0),
        Math.max(0, sanitizeInt(b.min_stock, 0)),
        normalizeName(b.notes) || null,
        req.user.id
      ]);

      const quantity = Math.max(0, sanitizeInt(b.initial_quantity, 0));
      await tx.execute('INSERT INTO stock_levels (product_id, quantity) VALUES ($1, $2)', [info.id, quantity]);

      if (quantity > 0) {
        await recordMovement({
          productId: info.id,
          movementType: 'entry',
          quantityDelta: quantity,
          previousQuantity: 0,
          newQuantity: quantity,
          reason: 'Estoque inicial no cadastro do produto',
          referenceType: 'product_creation',
          referenceId: info.id,
          user: req.user,
          createdAt: trustedNow,
          storeId,
        }, tx);
      }

      return info.id;
    });

    const product = await getProductById(productId, false, storeId);
    await logAction({ user: req.user, action: 'create_stock_product', recordType: 'stock_product', recordId: productId, details: { code: product.code } });

    dispatchNotification({
      storeId,
      actorId: req.user.id,
      eventKey: 'product_created',
      title: 'Novo Produto Cadastrado',
      description: `Produto "${product.name}" (${product.code}) cadastrado no estoque.`,
      link: '/estoque',
      metadata: { productId, code: product.code, name: product.name }
    }).catch(err => console.error('[NOTIF_ERROR]', err.message));

    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

router.put('/products/:id', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const existing = await getProductById(req.params.id, true, storeId);
    if (!existing) return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
    if (!existing.is_active) return res.status(400).json({ error: 'Produto já está inativo.' });

    const b = req.body || {};
    const nextCode = normalizeName(b.code ?? existing.code).toUpperCase();
    if (!nextCode) return res.status(400).json({ error: 'Código do produto é obrigatório.' });

    const duplicateCode = await db.queryOne('SELECT id FROM stock_products WHERE store_id = $1 AND code = $2 AND id <> $3', [storeId, nextCode, req.params.id]);
    if (duplicateCode) return res.status(409).json({ error: 'Já existe outro produto com esse código nesta loja.' });

    const categoryId = b.category_id !== undefined
      ? (b.category_id ? sanitizeInt(b.category_id, null) : null)
      : (b.category_name !== undefined ? await resolveCategoryId(b.category_name, storeId) : existing.category_id);

    const supplierId = b.supplier_id !== undefined
      ? (b.supplier_id ? sanitizeInt(b.supplier_id, null) : null)
      : (b.supplier_name !== undefined ? await resolveSupplierId(b.supplier_name, storeId) : existing.supplier_id);

    await db.execute(`
      UPDATE stock_products SET
        name = $1, model = $2, code = $3, barcode = $4, category_id = $5, supplier_id = $6,
        cost_price = $7, sale_price = $8, min_stock = $9, notes = $10, updated_at = CURRENT_TIMESTAMP
      WHERE id = $11 AND store_id = $12
    `, [
      normalizeName(b.name ?? existing.name),
      normalizeName(b.model ?? existing.model) || null,
      nextCode,
      normalizeName(b.barcode ?? existing.barcode) || null,
      categoryId,
      supplierId,
      sanitizeNumber(b.cost_price ?? existing.cost_price, 0),
      sanitizeNumber(b.sale_price ?? existing.sale_price, 0),
      Math.max(0, sanitizeInt(b.min_stock ?? existing.min_stock, 0)),
      normalizeName(b.notes ?? existing.notes) || null,
      req.params.id,
      storeId
    ]);

    const updated = await getProductById(req.params.id, false, storeId);
    await logAction({ user: req.user, action: 'update_stock_product', recordType: 'stock_product', recordId: req.params.id, details: { code: updated.code } });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar produto: ' + err.message });
  }
});

router.delete('/products/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const productId = sanitizeInt(req.params.id, 0);

    if (!productId) return res.status(400).json({ error: 'ID de produto inválido.' });

    const existing = await getProductById(productId, true, storeId);
    if (!existing) return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
    if (!existing.is_active) return res.status(400).json({ error: 'Produto já foi removido anteriormente.' });

    const trustedNow = await getTrustedNowSqlite();
    await db.execute(`
      UPDATE stock_products
      SET is_active = 0, deleted_at = $1, updated_at = $2
      WHERE id = $3 AND store_id = $4
    `, [trustedNow, trustedNow, productId, storeId]);

    await logAction({ user: req.user, action: 'delete_stock_product_soft', recordType: 'stock_product', recordId: productId, details: { code: existing.code } });
    res.json({ success: true, mode: 'soft_delete' });
  } catch (error) {
    next(error);
  }
});

router.post('/products/:id/add-stock', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const quantityToAdd = Math.max(0, sanitizeInt(req.body?.quantity, 0));
    const reason = normalizeName(req.body?.reason) || 'Entrada manual de estoque';
    if (!quantityToAdd) return res.status(400).json({ error: 'Informe uma quantidade válida para entrada.' });

    const trustedNow = await getTrustedNowSqlite();

    try {
      await db.transaction(async (tx) => {
        const product = await getProductById(req.params.id, true, storeId, tx);
        if (!product) throw new Error('NOT_FOUND');
        if (!product.is_active) throw new Error('INACTIVE_PRODUCT');

        const previousQuantity = sanitizeInt(product.quantity, 0);
        const newQuantity = previousQuantity + quantityToAdd;

        await tx.execute('UPDATE stock_levels SET quantity = $1, updated_at = $2 WHERE product_id = $3', [newQuantity, trustedNow, req.params.id]);

        await recordMovement({
          productId: req.params.id,
          movementType: 'entry',
          quantityDelta: quantityToAdd,
          previousQuantity,
          newQuantity,
          reason,
          referenceType: 'manual',
          referenceId: null,
          user: req.user,
          createdAt: trustedNow,
          storeId,
        }, tx);
      });
    } catch (error) {
      if (String(error.message) === 'NOT_FOUND') return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
      if (String(error.message) === 'INACTIVE_PRODUCT') return res.status(400).json({ error: 'Produto inativo não pode receber estoque.' });
      return next(error);
    }

    const updated = await getProductById(req.params.id, false, req.user.store_id || 1);

    dispatchNotification({
      storeId,
      actorId: req.user.id,
      eventKey: 'stock_entry',
      title: 'Entrada de Estoque',
      description: `Entrada de +${quantityToAdd} un no produto "${updated.name}" (${updated.code}). Saldo: ${updated.quantity}.`,
      link: '/estoque',
      metadata: { productId: updated.id, code: updated.code, quantityToAdd, newQuantity: updated.quantity }
    }).catch(err => console.error('[NOTIF_ERROR]', err.message));

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/products/:id/remove-stock', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const quantityToRemove = Math.max(0, sanitizeInt(req.body?.quantity, 0));
    const reason = normalizeName(req.body?.reason) || 'Saída manual de estoque';
    if (!quantityToRemove) return res.status(400).json({ error: 'Informe uma quantidade válida para saída.' });

    const trustedNow = await getTrustedNowSqlite();

    try {
      await db.transaction(async (tx) => {
        const product = await getProductById(req.params.id, true, storeId, tx);
        if (!product) throw new Error('NOT_FOUND');
        if (!product.is_active) throw new Error('INACTIVE_PRODUCT');

        const previousQuantity = sanitizeInt(product.quantity, 0);
        if (quantityToRemove > previousQuantity) throw new Error('INSUFFICIENT_STOCK');

        const newQuantity = previousQuantity - quantityToRemove;
        await tx.execute('UPDATE stock_levels SET quantity = $1, updated_at = $2 WHERE product_id = $3', [newQuantity, trustedNow, req.params.id]);

        await recordMovement({
          productId: req.params.id,
          movementType: 'exit',
          quantityDelta: -quantityToRemove,
          previousQuantity,
          newQuantity,
          reason,
          referenceType: 'manual',
          referenceId: null,
          user: req.user,
          createdAt: trustedNow,
          storeId,
        }, tx);
      });
    } catch (error) {
      if (String(error.message) === 'NOT_FOUND') return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
      if (String(error.message) === 'INSUFFICIENT_STOCK') return res.status(400).json({ error: 'Quantidade em estoque insuficiente para esta saída.' });
      if (String(error.message) === 'INACTIVE_PRODUCT') return res.status(400).json({ error: 'Produto inativo não pode ser movimentado.' });
      return next(error);
    }

    const updated = await getProductById(req.params.id, false, req.user.store_id || 1);

    (async () => {
      await dispatchNotification({
        storeId,
        actorId: req.user.id,
        eventKey: 'stock_exit',
        title: 'Saída de Estoque',
        description: `Saída de -${quantityToRemove} un no produto "${updated.name}" (${updated.code}). Saldo: ${updated.quantity}.`,
        link: '/estoque',
        metadata: { productId: updated.id, code: updated.code, quantityToRemove, newQuantity: updated.quantity }
      });

      if (updated.quantity === 0) {
        await dispatchNotification({
          storeId,
          actorId: req.user.id,
          eventKey: 'stock_out',
          title: 'Produto Sem Estoque!',
          description: `O produto "${updated.name}" (${updated.code}) está esgotado (0 un).`,
          link: '/estoque',
          metadata: { productId: updated.id, code: updated.code }
        });
      } else if (updated.min_stock && updated.quantity <= updated.min_stock) {
        await dispatchNotification({
          storeId,
          actorId: req.user.id,
          eventKey: 'stock_min_reached',
          title: 'Estoque Mínimo Atingido',
          description: `Produto "${updated.name}" atingiu o estoque mínimo: ${updated.quantity} un (mínimo: ${updated.min_stock}).`,
          link: '/estoque',
          metadata: { productId: updated.id, code: updated.code, current: updated.quantity, min: updated.min_stock }
        });
      }
    })().catch(err => console.error('[NOTIF_ERROR]', err.message));

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/products/:id/adjust-stock', requireRole('admin'), async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const targetQuantity = Math.max(0, sanitizeInt(req.body?.quantity, 0));
    const reason = normalizeName(req.body?.reason) || 'Ajuste manual de estoque';
    const trustedNow = await getTrustedNowSqlite();

    try {
      await db.transaction(async (tx) => {
        const product = await getProductById(req.params.id, true, storeId, tx);
        if (!product) throw new Error('NOT_FOUND');
        if (!product.is_active) throw new Error('INACTIVE_PRODUCT');

        const previousQuantity = sanitizeInt(product.quantity, 0);
        const delta = targetQuantity - previousQuantity;

        await tx.execute('UPDATE stock_levels SET quantity = $1, updated_at = $2 WHERE product_id = $3', [targetQuantity, trustedNow, req.params.id]);

        if (delta !== 0) {
          await recordMovement({
            productId: req.params.id,
            movementType: 'adjustment',
            quantityDelta: delta,
            previousQuantity,
            newQuantity: targetQuantity,
            reason,
            referenceType: 'manual',
            referenceId: null,
            user: req.user,
            createdAt: trustedNow,
            storeId,
          }, tx);
        }
      });
    } catch (error) {
      if (String(error.message) === 'NOT_FOUND') return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
      if (String(error.message) === 'INACTIVE_PRODUCT') return res.status(400).json({ error: 'Produto inativo não pode ser ajustado.' });
      return next(error);
    }

    res.json(await getProductById(req.params.id, false, req.user.store_id || 1));
  } catch (err) {
    next(err);
  }
});

router.get('/products/:id/movements', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const product = await getProductById(req.params.id, true, storeId);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });

    const rows = await db.query(`
      SELECT m.*, p.name as product_name, p.code as product_code
      FROM stock_movements m
      JOIN stock_products p ON p.id = m.product_id
      WHERE m.product_id = $1 AND p.store_id = $2
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 300
    `, [req.params.id, storeId]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar movimentações do produto: ' + err.message });
  }
});

router.post('/movements/:id/revert', requireRole('admin'), async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const movementId = sanitizeInt(req.params.id, 0);
    if (!movementId) return res.status(400).json({ error: 'ID da movimentação inválido.' });

    const trustedNow = await getTrustedNowSqlite();

    let result;
    try {
      result = await revertMovementById({ movementId, trustedNow, user: req.user, storeId });
    } catch (error) {
      const message = String(error.message || '');
      if (message === 'MOVEMENT_NOT_FOUND') return res.status(404).json({ error: 'Movimentação não encontrada nesta loja.' });
      if (message === 'INACTIVE_PRODUCT') return res.status(400).json({ error: 'Produto inativo não pode receber estorno de movimentação.' });
      if (message === 'MOVEMENT_IS_REVERSAL') return res.status(400).json({ error: 'Não é possível estornar um estorno.' });
      if (message === 'USE_SALE_CANCEL') return res.status(400).json({ error: 'Para vendas, utilize o estorno da venda no histórico de vendas.' });
      if (message === 'MOVEMENT_ALREADY_REVERSED') return res.status(400).json({ error: 'Esta movimentação já foi estornada.' });
      if (message === 'MOVEMENT_NOT_LAST') return res.status(400).json({ error: 'Só é possível estornar a última movimentação do produto para manter o estoque consistente.' });
      if (message === 'NEGATIVE_STOCK') return res.status(400).json({ error: 'Não foi possível estornar: o estoque resultaria em valor negativo.' });
      throw error;
    }

    await logAction({
      user: req.user,
      action: 'revert_stock_movement',
      recordType: 'stock_movement',
      recordId: movementId,
      details: {
        product_id: result.movement.product_id,
        product_code: result.movement.product_code,
        original_type: result.movement.movement_type,
        reversal_delta: result.reversalDelta,
      },
    });

    res.json({
      success: true,
      movement_id: movementId,
      product_id: result.movement.product_id,
      new_quantity: result.newQuantity,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/movements/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const movementId = sanitizeInt(req.params.id, 0);
    if (!movementId) return res.status(400).json({ error: 'ID da movimentação inválido.' });

    const trustedNow = await getTrustedNowSqlite();

    let result;
    try {
      result = await revertMovementById({ movementId, trustedNow, user: req.user, storeId });
    } catch (error) {
      const message = String(error.message || '');
      if (message === 'MOVEMENT_NOT_FOUND') return res.status(404).json({ error: 'Movimentação não encontrada nesta loja.' });
      if (message === 'INACTIVE_PRODUCT') return res.status(400).json({ error: 'Produto inativo não pode receber estorno de movimentação.' });
      if (message === 'MOVEMENT_IS_REVERSAL') return res.status(400).json({ error: 'Não é possível excluir um estorno.' });
      if (message === 'USE_SALE_CANCEL') return res.status(400).json({ error: 'Para vendas, utilize o estorno da venda no histórico de vendas.' });
      if (message === 'MOVEMENT_ALREADY_REVERSED') return res.status(400).json({ error: 'Esta movimentação já foi estornada.' });
      if (message === 'MOVEMENT_NOT_LAST') return res.status(400).json({ error: 'Só é possível excluir/desfazer a última movimentação do produto.' });
      if (message === 'NEGATIVE_STOCK') return res.status(400).json({ error: 'Não foi possível desfazer: o estoque resultaria em valor negativo.' });
      throw error;
    }

    await logAction({
      user: req.user,
      action: 'delete_stock_movement_with_reversal',
      recordType: 'stock_movement',
      recordId: movementId,
      details: {
        product_id: result.movement.product_id,
        product_code: result.movement.product_code,
        original_type: result.movement.movement_type,
      },
    });

    res.json({
      success: true,
      mode: 'reverted',
      movement_id: movementId,
      product_id: result.movement.product_id,
      new_quantity: result.newQuantity,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/movements', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const { movement_type, q, category_id, supplier_id } = req.query;

    let sql = `
      SELECT
        m.*, p.name as product_name, p.code as product_code,
        c.name as category_name, s.name as supplier_name
      FROM stock_movements m
      JOIN stock_products p ON p.id = m.product_id
      LEFT JOIN stock_categories c ON c.id = p.category_id
      LEFT JOIN stock_suppliers s ON s.id = p.supplier_id
      WHERE p.store_id = $1
    `;
    const params = [storeId];
    let paramIndex = 2;

    if (movement_type) {
      sql += ` AND m.movement_type = $${paramIndex++}`;
      params.push(movement_type);
    }
    if (category_id) {
      sql += ` AND p.category_id = $${paramIndex++}`;
      params.push(category_id);
    }
    if (supplier_id) {
      sql += ` AND p.supplier_id = $${paramIndex++}`;
      params.push(supplier_id);
    }
    if (q) {
      const like = `%${q}%`;
      sql += ` AND (p.name ILIKE $${paramIndex} OR p.code ILIKE $${paramIndex} OR COALESCE(m.reason, '') ILIKE $${paramIndex} OR COALESCE(m.user_name, '') ILIKE $${paramIndex})`;
      params.push(like);
      paramIndex++;
    }

    sql += ' ORDER BY m.created_at DESC, m.id DESC LIMIT 600';
    const rows = await db.query(sql, ...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar movimentações de estoque: ' + err.message });
  }
});

module.exports = router;
