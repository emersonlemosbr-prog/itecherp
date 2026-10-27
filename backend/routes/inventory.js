const express = require('express');
const multer = require('multer');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { getTrustedNowSqlite } = require('../utils/time');
const cloudPhotos = require('../services/cloudinaryPhotos');

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

function resolveCategoryId(name, storeId = 1) {
  const clean = normalizeName(name);
  if (!clean) return null;
  const existing = db.prepare('SELECT id FROM stock_categories WHERE store_id = ? AND lower(name) = lower(?)').get(storeId, clean);
  if (existing) return existing.id;
  const info = db.prepare('INSERT INTO stock_categories (store_id, name) VALUES (?, ?)').run(storeId, clean);
  return info.lastInsertRowid;
}

function resolveSupplierId(name, storeId = 1) {
  const clean = normalizeName(name);
  if (!clean) return null;
  const existing = db.prepare('SELECT id FROM stock_suppliers WHERE store_id = ? AND lower(name) = lower(?)').get(storeId, clean);
  if (existing) return existing.id;
  const info = db.prepare('INSERT INTO stock_suppliers (store_id, name) VALUES (?, ?)').run(storeId, clean);
  return info.lastInsertRowid;
}

function getDashboardData(storeId = 1) {
  return db.prepare(`
    SELECT
      COUNT(p.id) as total_products,
      COALESCE(SUM(COALESCE(l.quantity, 0)), 0) as total_stock_qty,
      COALESCE(SUM(CASE WHEN COALESCE(l.quantity, 0) <= 0 THEN 1 ELSE 0 END), 0) as out_of_stock,
      COALESCE(SUM(CASE WHEN COALESCE(l.quantity, 0) > 0 AND COALESCE(l.quantity, 0) <= p.min_stock THEN 1 ELSE 0 END), 0) as low_stock,
      COALESCE(SUM(COALESCE(l.quantity, 0) * p.cost_price), 0) as stock_cost_value
    FROM stock_products p
    LEFT JOIN stock_levels l ON l.product_id = p.id
    WHERE p.store_id = ? AND p.is_active = 1
  `).get(storeId);
}

function getProductById(id, includeInactive = false, storeId = 1) {
  return db.prepare(`
    SELECT
      p.*, c.name as category_name, s.name as supplier_name,
      COALESCE(l.quantity, 0) as quantity
    FROM stock_products p
    LEFT JOIN stock_categories c ON c.id = p.category_id
    LEFT JOIN stock_suppliers s ON s.id = p.supplier_id
    LEFT JOIN stock_levels l ON l.product_id = p.id
    WHERE p.id = ? AND p.store_id = ? ${includeInactive ? '' : 'AND p.is_active = 1'}
  `).get(id, storeId);
}

function recordMovement({ productId, movementType, quantityDelta, previousQuantity, newQuantity, reason, referenceType, referenceId, user, createdAt, storeId = 1 }) {
  db.prepare(`
    INSERT INTO stock_movements (
      store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity,
      reason, reference_type, reference_id, user_id, user_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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
  );
}

function runSqliteTransaction(work) {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignora erro de rollback para preservar o erro original.
    }
    throw error;
  }
}

function revertMovementById({ movementId, trustedNow, user, storeId = 1 }) {
  return runSqliteTransaction(() => {
    const movement = db.prepare(`
      SELECT
        m.*,
        p.name as product_name,
        p.code as product_code,
        p.is_active,
        COALESCE(l.quantity, 0) as current_quantity
      FROM stock_movements m
      JOIN stock_products p ON p.id = m.product_id
      LEFT JOIN stock_levels l ON l.product_id = m.product_id
      WHERE m.id = ? AND p.store_id = ?
    `).get(movementId, storeId);

    if (!movement) throw new Error('MOVEMENT_NOT_FOUND');
    if (!movement.is_active) throw new Error('INACTIVE_PRODUCT');
    if (String(movement.reference_type || '') === 'movement_reversal') throw new Error('MOVEMENT_IS_REVERSAL');
    if (String(movement.reference_type || '') === 'sale' || String(movement.reference_type || '') === 'sale_reversal') {
      throw new Error('USE_SALE_CANCEL');
    }

    const alreadyReversed = db.prepare(`
      SELECT id
      FROM stock_movements
      WHERE reference_type = 'movement_reversal' AND reference_id = ?
      LIMIT 1
    `).get(movementId);
    if (alreadyReversed) throw new Error('MOVEMENT_ALREADY_REVERSED');

    const latestNonReversal = db.prepare(`
      SELECT id
      FROM stock_movements
      WHERE product_id = ?
        AND COALESCE(reference_type, '') <> 'movement_reversal'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).get(movement.product_id);

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

    db.prepare('UPDATE stock_levels SET quantity = ?, updated_at = ? WHERE product_id = ?').run(newQuantity, trustedNow, movement.product_id);

    recordMovement({
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
    });

    return {
      movement,
      newQuantity,
      reversalDelta,
    };
  });
}

router.get('/dashboard', (req, res) => {
  const storeId = req.user.store_id || 1;
  res.json(getDashboardData(storeId));
});

router.get('/categories', (req, res) => {
  const storeId = req.user.store_id || 1;
  const rows = db.prepare(`SELECT c.id, c.name, c.is_active,
    (SELECT COUNT(*) FROM stock_products p WHERE p.category_id = c.id AND p.store_id = c.store_id) AS product_count
    FROM stock_categories c WHERE c.store_id = ? ORDER BY c.name COLLATE NOCASE`).all(storeId);
  res.json(rows);
});

router.post('/categories', (req, res) => {
  const storeId = req.user.store_id || 1;
  const name = normalizeName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });

  const exists = db.prepare('SELECT id FROM stock_categories WHERE store_id = ? AND lower(name) = lower(?)').get(storeId, name);
  if (exists) return res.status(409).json({ error: 'Categoria já cadastrada nesta loja.' });

  const info = db.prepare('INSERT INTO stock_categories (store_id, name) VALUES (?, ?)').run(storeId, name);
  res.status(201).json(db.prepare('SELECT id, name, is_active FROM stock_categories WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/categories/:id', (req, res) => {
  const storeId = req.user.store_id || 1;
  const existing = db.prepare('SELECT * FROM stock_categories WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
  if (!existing) return res.status(404).json({ error: 'Categoria não encontrada nesta loja.' });
  const name = normalizeName(req.body?.name ?? existing.name);
  if (!name) return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });
  const duplicate = db.prepare('SELECT id FROM stock_categories WHERE store_id = ? AND lower(name)=lower(?) AND id<>?').get(storeId, name, req.params.id);
  if (duplicate) return res.status(409).json({ error: 'Categoria já cadastrada nesta loja.' });
  db.prepare('UPDATE stock_categories SET name=?, is_active=? WHERE id=? AND store_id=?').run(name, req.body?.is_active === undefined ? existing.is_active : (req.body.is_active ? 1 : 0), req.params.id, storeId);
  res.json(db.prepare('SELECT id,name,is_active FROM stock_categories WHERE id=?').get(req.params.id));
});

router.delete('/categories/:id', requireRole('admin'), (req, res) => {
  const storeId = req.user.store_id || 1;
  const existing = db.prepare('SELECT * FROM stock_categories WHERE id=? AND store_id=?').get(req.params.id, storeId);
  if (!existing) return res.status(404).json({ error: 'Categoria não encontrada nesta loja.' });
  const productCount = db.prepare('SELECT COUNT(*) n FROM stock_products WHERE category_id=? AND store_id=?').get(req.params.id, storeId).n;
  db.transaction(() => {
    db.prepare('UPDATE stock_products SET category_id=NULL WHERE category_id=? AND store_id=?').run(req.params.id, storeId);
    db.prepare('DELETE FROM stock_categories WHERE id=? AND store_id=?').run(req.params.id, storeId);
  })();
  res.json({ success: true, mode: 'deleted', product_count: productCount });
});

router.get('/suppliers', (req, res) => {
  const storeId = req.user.store_id || 1;
  const rows = db.prepare(`SELECT s.id, s.name, s.contact_info, s.notes, s.is_active,
    (SELECT COUNT(*) FROM stock_products p WHERE p.supplier_id=s.id AND p.store_id=s.store_id) AS product_count,
    (SELECT COUNT(*) FROM service_orders so WHERE so.supplier_id=s.id AND so.store_id=s.store_id) AS service_order_count,
    (SELECT COUNT(*) FROM cash_withdrawals w WHERE w.supplier_id=s.id AND w.store_id=s.store_id) AS withdrawal_count
    FROM stock_suppliers s WHERE s.store_id = ? ORDER BY s.name COLLATE NOCASE`).all(storeId);
  res.json(rows);
});

router.post('/suppliers', (req, res) => {
  const storeId = req.user.store_id || 1;
  const name = normalizeName(req.body?.name);
  const contactInfo = normalizeName(req.body?.contact_info);
  const notes = normalizeName(req.body?.notes);
  if (!name) return res.status(400).json({ error: 'Nome do fornecedor é obrigatório.' });
  if (name.length > 200 || contactInfo.length > 100 || notes.length > 1000) {
    return res.status(400).json({ error: 'Dados do fornecedor excedem o tamanho permitido.' });
  }

  const exists = db.prepare('SELECT id FROM stock_suppliers WHERE store_id = ? AND lower(name)=lower(?)').get(storeId, name);
  if (exists) return res.status(409).json({ error: 'Fornecedor já cadastrado nesta loja.' });

  const info = db.prepare('INSERT INTO stock_suppliers (store_id, name, contact_info, notes) VALUES (?, ?, ?, ?)').run(storeId, name, contactInfo || null, notes || null);
  res.status(201).json(db.prepare('SELECT id, name, contact_info, notes, is_active FROM stock_suppliers WHERE id=?').get(info.lastInsertRowid));
});

router.put('/suppliers/:id', (req, res) => {
  const storeId = req.user.store_id || 1;
  const existing = db.prepare('SELECT * FROM stock_suppliers WHERE id=? AND store_id=?').get(req.params.id, storeId);
  if (!existing) return res.status(404).json({ error: 'Fornecedor não encontrado nesta loja.' });
  const name = normalizeName(req.body?.name ?? existing.name);
  const contactInfo = normalizeName(req.body?.contact_info ?? existing.contact_info);
  const notes = normalizeName(req.body?.notes ?? existing.notes);
  if (!name) return res.status(400).json({ error: 'Nome do fornecedor é obrigatório.' });
  if (name.length > 200 || contactInfo.length > 100 || notes.length > 1000) {
    return res.status(400).json({ error: 'Dados do fornecedor excedem o tamanho permitido.' });
  }
  const duplicate = db.prepare('SELECT id FROM stock_suppliers WHERE store_id = ? AND lower(name)=lower(?) AND id<>?').get(storeId, name, req.params.id);
  if (duplicate) return res.status(409).json({ error: 'Fornecedor já cadastrado nesta loja.' });

  db.prepare('UPDATE stock_suppliers SET name=?, contact_info=?, notes=?, is_active=? WHERE id=? AND store_id=?').run(
    name, contactInfo || null, notes || null,
    req.body?.is_active === undefined ? existing.is_active : (req.body.is_active ? 1 : 0),
    req.params.id,
    storeId
  );
  res.json(db.prepare('SELECT id, name, contact_info, notes, is_active FROM stock_suppliers WHERE id=?').get(req.params.id));
});

router.delete('/suppliers/:id', requireRole('admin'), (req, res) => {
  const storeId = req.user.store_id || 1;
  const existing = db.prepare('SELECT * FROM stock_suppliers WHERE id=? AND (store_id=? OR store_id IS NULL)').get(req.params.id, storeId);
  if (!existing) return res.status(404).json({ error: 'Fornecedor não encontrado nesta loja.' });

  const productCount = db.prepare('SELECT COUNT(*) n FROM stock_products WHERE supplier_id=? AND (store_id=? OR store_id IS NULL)').get(req.params.id, storeId).n;
  const serviceOrderCount = db.prepare('SELECT COUNT(*) n FROM service_orders WHERE supplier_id=? AND (store_id=? OR store_id IS NULL)').get(req.params.id, storeId).n;
  const withdrawalCount = db.prepare('SELECT COUNT(*) n FROM cash_withdrawals WHERE supplier_id=? AND (store_id=? OR store_id IS NULL)').get(req.params.id, storeId).n;

  db.transaction(() => {
    db.prepare('UPDATE stock_products SET supplier_id=NULL WHERE supplier_id=? AND (store_id=? OR store_id IS NULL)').run(req.params.id, storeId);
    db.prepare('UPDATE service_orders SET supplier_name_snapshot=COALESCE(supplier_name_snapshot,?), supplier_id=NULL WHERE supplier_id=? AND (store_id=? OR store_id IS NULL)').run(existing.name, req.params.id, storeId);
    db.prepare('UPDATE cash_withdrawals SET supplier_name=COALESCE(supplier_name,?), supplier_id=NULL WHERE supplier_id=? AND (store_id=? OR store_id IS NULL)').run(existing.name, req.params.id, storeId);
    db.prepare('DELETE FROM stock_suppliers WHERE id=? AND (store_id=? OR store_id IS NULL)').run(req.params.id, storeId);
  })();

  res.json({ success: true, mode: 'deleted', product_count: productCount, service_order_count: serviceOrderCount, withdrawal_count: withdrawalCount });
});

router.post('/products/:id/image', (req, res, next) => productImageUpload.single('image')(req, res, (err) => err ? res.status(400).json({ error: 'Envie uma imagem JPG, PNG ou WebP com até 10 MB.' }) : next()), async (req, res) => {
  const storeId = req.user.store_id || 1;
  const product = getProductById(req.params.id, true, storeId);
  if (!product) return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });

  try {
    if (product.image_public_id) await cloudPhotos.delete(product.image_public_id);
    const result = await cloudPhotos.uploadProductPhoto({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      productCode: product.code,
    });
    db.prepare('UPDATE stock_products SET image_url=?,image_public_id=?,updated_at=datetime(\'now\') WHERE id=? AND store_id=?').run(result.url, result.public_id, product.id, storeId);
    res.json({ success: true, image_url: result.url });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Falha ao salvar a imagem do produto.' });
  }
});

router.delete('/products/:id/image', async (req, res) => {
  const storeId = req.user.store_id || 1;
  const product = getProductById(req.params.id, true, storeId);
  if (!product) return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
  if (!product.image_public_id) return res.json({ success: true });
  try { await cloudPhotos.delete(product.image_public_id); }
  catch (_) { return res.status(502).json({ error: 'Falha ao remover a imagem. A foto foi preservada.' }); }
  db.prepare('UPDATE stock_products SET image_url=NULL,image_public_id=NULL,updated_at=datetime(\'now\') WHERE id=? AND store_id=?').run(product.id, storeId);
  res.json({ success: true });
});

router.get('/products', (req, res) => {
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
    WHERE p.store_id = ? AND p.is_active = 1
  `;

  const params = [storeId];
  if (q) {
    const like = `%${q}%`;
    sql += " AND (p.name LIKE ? OR p.code LIKE ? OR COALESCE(p.model, '') LIKE ? OR COALESCE(p.barcode, '') LIKE ?)";
    params.push(like, like, like, like);
  }
  if (category_id) {
    sql += ' AND p.category_id = ?';
    params.push(category_id);
  }
  if (supplier_id) {
    sql += ' AND p.supplier_id = ?';
    params.push(supplier_id);
  }
  if (String(low_stock || '') === '1' || String(low_stock || '').toLowerCase() === 'true') {
    sql += ' AND COALESCE(l.quantity, 0) > 0 AND COALESCE(l.quantity, 0) <= p.min_stock';
  }
  if (String(out_of_stock || '') === '1' || String(out_of_stock || '').toLowerCase() === 'true') {
    sql += ' AND COALESCE(l.quantity, 0) <= 0';
  }

  sql += ' ORDER BY p.name COLLATE NOCASE ASC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

router.get('/products/:id', (req, res) => {
  const storeId = req.user.store_id || 1;
  const row = getProductById(req.params.id, false, storeId);
  if (!row) return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
  res.json(row);
});

router.post('/products', async (req, res, next) => {
  const storeId = req.user.store_id || 1;
  const b = req.body || {};
  const name = normalizeName(b.name);
  const model = normalizeName(b.model);
  const code = normalizeName(b.code).toUpperCase();

  if (!name) return res.status(400).json({ error: 'Nome do produto é obrigatório.' });
  if (!code) return res.status(400).json({ error: 'Código do produto é obrigatório.' });

  const existingCode = db.prepare('SELECT id FROM stock_products WHERE store_id = ? AND code = ?').get(storeId, code);
  if (existingCode) return res.status(409).json({ error: 'Já existe um produto com esse código nesta loja.' });

  const createProductTx = () => runSqliteTransaction(() => {
    const categoryId = b.category_id ? sanitizeInt(b.category_id, null) : resolveCategoryId(b.category_name, storeId);
    const supplierId = b.supplier_id ? sanitizeInt(b.supplier_id, null) : resolveSupplierId(b.supplier_name, storeId);

    const info = db.prepare(`
      INSERT INTO stock_products (
        store_id, name, model, code, barcode, category_id, supplier_id,
        cost_price, sale_price, min_stock, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
    );

    const quantity = Math.max(0, sanitizeInt(b.initial_quantity, 0));
    db.prepare('INSERT INTO stock_levels (product_id, quantity) VALUES (?, ?)').run(info.lastInsertRowid, quantity);

    if (quantity > 0) {
      recordMovement({
        productId: info.lastInsertRowid,
        movementType: 'entry',
        quantityDelta: quantity,
        previousQuantity: 0,
        newQuantity: quantity,
        reason: 'Estoque inicial no cadastro do produto',
        referenceType: 'product_creation',
        referenceId: info.lastInsertRowid,
        user: req.user,
        storeId,
      });
    }

    return info.lastInsertRowid;
  });

  try {
    const trustedNow = await getTrustedNowSqlite();
    const productId = createProductTx();
    const product = getProductById(productId, false, storeId);

    if ((Number(b.initial_quantity) || 0) > 0) {
      db.prepare('UPDATE stock_movements SET created_at = ? WHERE product_id = ? AND reference_type = ?').run(trustedNow, productId, 'product_creation');
    }

    logAction({ user: req.user, action: 'create_stock_product', recordType: 'stock_product', recordId: productId, details: { code: product.code } });
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

router.put('/products/:id', (req, res) => {
  const storeId = req.user.store_id || 1;
  const existing = getProductById(req.params.id, true, storeId);
  if (!existing) return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
  if (!existing.is_active) return res.status(400).json({ error: 'Produto já está inativo.' });

  const b = req.body || {};
  const nextCode = normalizeName(b.code ?? existing.code).toUpperCase();
  if (!nextCode) return res.status(400).json({ error: 'Código do produto é obrigatório.' });

  const duplicateCode = db.prepare('SELECT id FROM stock_products WHERE store_id = ? AND code = ? AND id <> ?').get(storeId, nextCode, req.params.id);
  if (duplicateCode) return res.status(409).json({ error: 'Já existe outro produto com esse código nesta loja.' });

  const categoryId = b.category_id !== undefined
    ? (b.category_id ? sanitizeInt(b.category_id, null) : null)
    : (b.category_name !== undefined ? resolveCategoryId(b.category_name, storeId) : existing.category_id);

  const supplierId = b.supplier_id !== undefined
    ? (b.supplier_id ? sanitizeInt(b.supplier_id, null) : null)
    : (b.supplier_name !== undefined ? resolveSupplierId(b.supplier_name, storeId) : existing.supplier_id);

  db.prepare(`
    UPDATE stock_products SET
      name = ?, model = ?, code = ?, barcode = ?, category_id = ?, supplier_id = ?,
      cost_price = ?, sale_price = ?, min_stock = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ? AND store_id = ?
  `).run(
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
  );

  const updated = getProductById(req.params.id, false, storeId);
  logAction({ user: req.user, action: 'update_stock_product', recordType: 'stock_product', recordId: req.params.id, details: { code: updated.code } });
  res.json(updated);
});

router.delete('/products/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const productId = sanitizeInt(req.params.id, 0);

    if (!productId) return res.status(400).json({ error: 'ID de produto inválido.' });

    const existing = getProductById(productId, true, storeId);
    if (!existing) return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
    if (!existing.is_active) return res.status(400).json({ error: 'Produto já foi removido anteriormente.' });

    const trustedNow = await getTrustedNowSqlite();
    db.prepare(`
      UPDATE stock_products
      SET is_active = 0, deleted_at = ?, updated_at = ?
      WHERE id = ? AND store_id = ?
    `).run(trustedNow, trustedNow, productId, storeId);

    logAction({ user: req.user, action: 'delete_stock_product_soft', recordType: 'stock_product', recordId: productId, details: { code: existing.code } });
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

    runSqliteTransaction(() => {
      const product = getProductById(req.params.id, true, storeId);
      if (!product) throw new Error('NOT_FOUND');
      if (!product.is_active) throw new Error('INACTIVE_PRODUCT');

      const previousQuantity = sanitizeInt(product.quantity, 0);
      const newQuantity = previousQuantity + quantityToAdd;

      db.prepare('UPDATE stock_levels SET quantity = ?, updated_at = ? WHERE product_id = ?').run(newQuantity, trustedNow, req.params.id);

      recordMovement({
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
      });
    });
  } catch (error) {
    if (String(error.message) === 'NOT_FOUND') return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
    if (String(error.message) === 'INACTIVE_PRODUCT') return res.status(400).json({ error: 'Produto inativo não pode receber estoque.' });
    return next(error);
  }

  res.json(getProductById(req.params.id, false, req.user.store_id || 1));
});

router.post('/products/:id/remove-stock', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const quantityToRemove = Math.max(0, sanitizeInt(req.body?.quantity, 0));
    const reason = normalizeName(req.body?.reason) || 'Saída manual de estoque';
    if (!quantityToRemove) return res.status(400).json({ error: 'Informe uma quantidade válida para saída.' });

    const trustedNow = await getTrustedNowSqlite();

    runSqliteTransaction(() => {
      const product = getProductById(req.params.id, true, storeId);
      if (!product) throw new Error('NOT_FOUND');
      if (!product.is_active) throw new Error('INACTIVE_PRODUCT');

      const previousQuantity = sanitizeInt(product.quantity, 0);
      if (quantityToRemove > previousQuantity) throw new Error('INSUFFICIENT_STOCK');

      const newQuantity = previousQuantity - quantityToRemove;
      db.prepare('UPDATE stock_levels SET quantity = ?, updated_at = ? WHERE product_id = ?').run(newQuantity, trustedNow, req.params.id);

      recordMovement({
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
      });
    });
  } catch (error) {
    if (String(error.message) === 'NOT_FOUND') return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
    if (String(error.message) === 'INSUFFICIENT_STOCK') return res.status(400).json({ error: 'Quantidade em estoque insuficiente para esta saída.' });
    if (String(error.message) === 'INACTIVE_PRODUCT') return res.status(400).json({ error: 'Produto inativo não pode ser movimentado.' });
    return next(error);
  }

  res.json(getProductById(req.params.id, false, req.user.store_id || 1));
});

router.post('/products/:id/adjust-stock', requireRole('admin'), async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const targetQuantity = Math.max(0, sanitizeInt(req.body?.quantity, 0));
    const reason = normalizeName(req.body?.reason) || 'Ajuste manual de estoque';
    const trustedNow = await getTrustedNowSqlite();

    runSqliteTransaction(() => {
      const product = getProductById(req.params.id, true, storeId);
      if (!product) throw new Error('NOT_FOUND');
      if (!product.is_active) throw new Error('INACTIVE_PRODUCT');

      const previousQuantity = sanitizeInt(product.quantity, 0);
      const delta = targetQuantity - previousQuantity;

      db.prepare('UPDATE stock_levels SET quantity = ?, updated_at = ? WHERE product_id = ?').run(targetQuantity, trustedNow, req.params.id);

      if (delta !== 0) {
        recordMovement({
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
        });
      }
    });
  } catch (error) {
    if (String(error.message) === 'NOT_FOUND') return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
    if (String(error.message) === 'INACTIVE_PRODUCT') return res.status(400).json({ error: 'Produto inativo não pode ser ajustado.' });
    return next(error);
  }

  res.json(getProductById(req.params.id, false, req.user.store_id || 1));
});

router.get('/products/:id/movements', (req, res) => {
  const storeId = req.user.store_id || 1;
  const product = getProductById(req.params.id, true, storeId);
  if (!product) return res.status(404).json({ error: 'Produto não encontrado nesta loja.' });

  const rows = db.prepare(`
    SELECT m.*, p.name as product_name, p.code as product_code
    FROM stock_movements m
    JOIN stock_products p ON p.id = m.product_id
    WHERE m.product_id = ? AND p.store_id = ?
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 300
  `).all(req.params.id, storeId);

  res.json(rows);
});

router.post('/movements/:id/revert', requireRole('admin'), async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const movementId = sanitizeInt(req.params.id, 0);
    if (!movementId) return res.status(400).json({ error: 'ID da movimentação inválido.' });

    const trustedNow = await getTrustedNowSqlite();

    let result;
    try {
      result = revertMovementById({ movementId, trustedNow, user: req.user, storeId });
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

    logAction({
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
      result = revertMovementById({ movementId, trustedNow, user: req.user, storeId });
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

    logAction({
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

router.get('/movements', (req, res) => {
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
    WHERE p.store_id = ?
  `;
  const params = [storeId];

  if (movement_type) {
    sql += ' AND m.movement_type = ?';
    params.push(movement_type);
  }
  if (category_id) {
    sql += ' AND p.category_id = ?';
    params.push(category_id);
  }
  if (supplier_id) {
    sql += ' AND p.supplier_id = ?';
    params.push(supplier_id);
  }
  if (q) {
    const like = `%${q}%`;
    sql += " AND (p.name LIKE ? OR p.code LIKE ? OR COALESCE(m.reason, '') LIKE ? OR COALESCE(m.user_name, '') LIKE ?)";
    params.push(like, like, like, like);
  }

  sql += ' ORDER BY m.created_at DESC, m.id DESC LIMIT 600';
  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
