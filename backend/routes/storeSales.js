const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { getTrustedNowSqlite } = require('../utils/time');
const { emitDashboardRefresh, emitInventoryRefresh } = require('../utils/events');
const { nextNumber } = require('../services/settings');

const router = express.Router();
router.use(authenticate);

const PAYMENT_METHODS = ['cash', 'pix', 'debit_card', 'credit_card'];

function sanitizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      product_id: sanitizeInt(item.product_id, 0),
      quantity: Math.max(1, sanitizeInt(item.quantity, 1)),
    }))
    .filter((item) => item.product_id > 0);
}

async function getSaleById(saleId, includeCanceled = false, storeId = 1, client = db) {
  const sale = await client.queryOne(`
    SELECT
      s.*,
      COALESCE(s.created_by_name_snapshot, u.full_name) as seller_name,
      COALESCE(s.canceled_by_name_snapshot, uc.full_name) as canceled_by_name
    FROM store_sales s
    LEFT JOIN users u ON u.id = s.created_by
    LEFT JOIN users uc ON uc.id = s.canceled_by
    WHERE s.id = $1 AND s.store_id = $2 ${includeCanceled ? '' : 'AND COALESCE(s.is_canceled, 0) = 0'}
  `, [saleId, storeId]);

  if (!sale) return null;

  const items = await client.query(`
    SELECT
      i.*, p.model, c.name as category_name
    FROM store_sale_items i
    LEFT JOIN stock_products p ON p.id = i.product_id
    LEFT JOIN stock_categories c ON c.id = p.category_id
    WHERE i.sale_id = $1 ${includeCanceled ? '' : 'AND COALESCE(i.is_canceled, 0) = 0'}
    ORDER BY i.id ASC
  `, [saleId]);

  return { ...sale, items };
}

async function cancelSaleWithReversal({ saleId, trustedNow, cancelReason, user }) {
  const storeId = user.store_id || 1;
  return db.transaction(async (tx) => {
    const sale = await tx.queryOne('SELECT * FROM store_sales WHERE id = $1 AND store_id = $2', [saleId, storeId]);
    if (!sale) throw new Error('SALE_NOT_FOUND');
    if (Number(sale.is_canceled) === 1) throw new Error('SALE_ALREADY_CANCELED');

    const items = await tx.query(`
      SELECT * FROM store_sale_items
      WHERE sale_id = $1 AND COALESCE(is_canceled, 0) = 0
      ORDER BY id ASC
    `, [saleId]);
    if (!items.length) throw new Error('SALE_ITEMS_NOT_FOUND');

    for (const item of items) {
      let stockLevel = await tx.queryOne('SELECT quantity FROM stock_levels WHERE product_id = $1', [item.product_id]);
      if (!stockLevel) {
        // Se o produto existir mas não tiver registro em stock_levels, inicializa com 0
        await tx.execute('INSERT INTO stock_levels (product_id, quantity, updated_at) VALUES ($1, 0, $2)', [item.product_id, trustedNow]);
        stockLevel = { quantity: 0 };
      }

      const previousQuantity = sanitizeInt(stockLevel.quantity, 0);
      const restoreQty = Math.max(0, sanitizeInt(item.quantity, 0));
      const newQuantity = previousQuantity + restoreQty;

      await tx.execute('UPDATE stock_levels SET quantity = $1, updated_at = $2 WHERE product_id = $3', [newQuantity, trustedNow, item.product_id]);

      await tx.execute(`
        INSERT INTO stock_movements (
          store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity,
          reason, reference_type, reference_id, user_id, user_name, created_at
        ) VALUES ($1, $2, 'adjustment', $3, $4, $5, $6, 'sale_reversal', $7, $8, $9, $10)
      `, [
        storeId,
        item.product_id,
        restoreQty,
        previousQuantity,
        newQuantity,
        `Estorno de venda ${sale.sale_number}${cancelReason ? ` - ${cancelReason}` : ''}`,
        saleId,
        user.id,
        user.full_name,
        trustedNow
      ]);
    }

    await tx.execute('UPDATE store_sale_items SET is_canceled = 1, canceled_at = $1 WHERE sale_id = $2', [trustedNow, saleId]);
    await tx.execute(`
      UPDATE store_sales
      SET is_canceled = 1, canceled_at = $1, canceled_by = $2, cancel_reason = $3
      WHERE id = $4 AND store_id = $5
    `, [trustedNow, user.id, cancelReason, saleId, storeId]);

    return sale;
  });
}

router.get('/products', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const q = String(req.query?.q || '').trim();

    let sql = `
      SELECT
        p.id,
        p.name,
        p.model,
        p.code,
        p.sale_price,
        p.cost_price,
        p.min_stock,
        c.name as category_name,
        COALESCE(l.quantity, 0) as quantity
      FROM stock_products p
      LEFT JOIN stock_categories c ON c.id = p.category_id
      LEFT JOIN stock_levels l ON l.product_id = p.id
      WHERE p.is_active = 1 AND p.store_id = $1
    `;

    const params = [storeId];
    let paramIndex = 2;
    if (q) {
      const like = `%${q}%`;
      sql += ` AND (p.name ILIKE $${paramIndex} OR p.code ILIKE $${paramIndex} OR COALESCE(p.model, '') ILIKE $${paramIndex})`;
      params.push(like);
      paramIndex++;
    }

    sql += ' ORDER BY LOWER(p.name) ASC LIMIT 120';
    const rows = await db.query(sql, ...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar produtos para venda: ' + err.message });
  }
});

router.get('/history', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const rows = await db.query(`
      SELECT
        s.id,
        s.sale_number,
        s.created_at,
        s.payment_method,
        s.total_amount,
        s.subtotal,
        s.discount_type,
        s.discount_value,
        s.discount_amount,
        COALESCE(s.created_by_name_snapshot, u.full_name) as seller_name,
        (
          SELECT STRING_AGG(i.product_name || ' x' || i.quantity, ' | ')
          FROM store_sale_items i
          WHERE i.sale_id = s.id AND COALESCE(i.is_canceled, 0) = 0
        ) as products_summary
      FROM store_sales s
      LEFT JOIN users u ON u.id = s.created_by
      WHERE COALESCE(s.is_canceled, 0) = 0 AND s.store_id = $1
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT 300
    `, [storeId]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar histórico de vendas: ' + err.message });
  }
});

router.get('/history/:id', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const includeCanceled = req.user.role === 'admin' && String(req.query.include_canceled || '').toLowerCase() === 'true';
    const sale = await getSaleById(req.params.id, includeCanceled, storeId);
    if (!sale) return res.status(404).json({ error: 'Venda não encontrada.' });
    res.json(sale);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar venda: ' + err.message });
  }
});

router.post('/finalize', async (req, res, next) => {
  try {
    const payload = req.body || {};
    const items = normalizeItems(payload.items);
    const paymentMethod = String(payload.payment_method || '').trim();
    const discountType = payload.discount_type === 'percent' ? 'percent' : (payload.discount_type === 'value' ? 'value' : null);
    const discountValue = Math.max(0, sanitizeNumber(payload.discount_value, 0));
    const notes = String(payload.notes || '').trim();

    if (!items.length) {
      return res.status(400).json({ error: 'Adicione pelo menos um item para finalizar a venda.' });
    }

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: 'Forma de pagamento inválida.' });
    }

    const storeId = req.user.store_id || 1;
    const trustedNow = await getTrustedNowSqlite();
    const saleNumber = await nextNumber('sale', storeId);

    let saleId;
    try {
      saleId = await db.transaction(async (tx) => {
        const expandedItems = [];
        for (const item of items) {
          const product = await tx.queryOne(`
            SELECT p.id, p.name, p.code, p.sale_price, p.cost_price, p.is_active, COALESCE(l.quantity, 0) as quantity
            FROM stock_products p
            JOIN stock_levels l ON l.product_id = p.id
            WHERE p.id = $1 AND p.store_id = $2
          `, [item.product_id, storeId]);

          if (!product) throw new Error(`PRODUCT_NOT_FOUND:${item.product_id}`);
          if (!product.is_active) throw new Error(`INACTIVE_PRODUCT:${item.product_id}`);
          if (item.quantity > product.quantity) throw new Error(`INSUFFICIENT_STOCK:${product.id}`);

          const unitPrice = sanitizeNumber(product.sale_price, 0);
          const costPrice = sanitizeNumber(product.cost_price, 0);
          const subtotal = unitPrice * item.quantity;
          expandedItems.push({ ...item, product, unitPrice, costPrice, subtotal });
        }

        const subtotal = expandedItems.reduce((sum, item) => sum + item.subtotal, 0);
        const discountAmount = discountType === 'percent'
          ? Math.min(subtotal, subtotal * (discountValue / 100))
          : Math.min(subtotal, discountValue);
        const totalAmount = Math.max(0, subtotal - discountAmount);

        const saleInfo = await tx.execute(`
          INSERT INTO store_sales (
            store_id, sale_number, subtotal, discount_type, discount_value, discount_amount,
            total_amount, payment_method, notes, is_canceled, created_by, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11)
          RETURNING id
        `, [
          storeId,
          saleNumber,
          subtotal,
          discountType,
          discountValue,
          discountAmount,
          totalAmount,
          paymentMethod,
          notes || null,
          req.user.id,
          trustedNow
        ]);

        const newSaleId = saleInfo.id;

        for (const item of expandedItems) {
          await tx.execute(`
            INSERT INTO store_sale_items (
              store_id, sale_id, product_id, product_name, product_code, cost_price, unit_price, quantity, subtotal, is_canceled
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0)
          `, [
            storeId,
            newSaleId,
            item.product.id,
            item.product.name,
            item.product.code,
            item.costPrice,
            item.unitPrice,
            item.quantity,
            item.subtotal
          ]);

          const previousQuantity = sanitizeInt(item.product.quantity, 0);
          const newQuantity = previousQuantity - item.quantity;

          await tx.execute('UPDATE stock_levels SET quantity = $1, updated_at = $2 WHERE product_id = $3', [newQuantity, trustedNow, item.product.id]);

          await tx.execute(`
            INSERT INTO stock_movements (
              store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity,
              reason, reference_type, reference_id, user_id, user_name, created_at
            ) VALUES ($1, $2, 'sale', $3, $4, $5, $6, 'sale', $7, $8, $9, $10)
          `, [
            storeId,
            item.product.id,
            -item.quantity,
            previousQuantity,
            newQuantity,
            `Venda ${newSaleId}`,
            newSaleId,
            req.user.id,
            req.user.full_name,
            trustedNow
          ]);
        }

        return newSaleId;
      });
    } catch (error) {
      const message = String(error.message || '');
      if (message.startsWith('PRODUCT_NOT_FOUND:')) {
        return res.status(404).json({ error: 'Um dos produtos não foi encontrado. Atualize a lista e tente novamente.' });
      }
      if (message.startsWith('INSUFFICIENT_STOCK:')) {
        const productId = message.split(':')[1];
        const product = await db.queryOne('SELECT name, code FROM stock_products WHERE id = $1 AND store_id = $2', [productId, storeId]);
        return res.status(400).json({ error: `Estoque insuficiente para ${product?.name || 'um produto'} (${product?.code || 'sem código'}).` });
      }
      if (message.startsWith('INACTIVE_PRODUCT:')) {
        return res.status(400).json({ error: 'Um dos produtos selecionados está inativo e não pode ser vendido.' });
      }
      return next(error);
    }

    const sale = await getSaleById(saleId, false, storeId);
    await logAction({ user: req.user, action: 'finalize_store_sale', recordType: 'store_sale', recordId: saleId, details: { sale_number: sale.sale_number } });
    emitDashboardRefresh({ source: 'store_sale', saleId, saleNumber: sale.sale_number });
    emitInventoryRefresh({ source: 'store_sale', saleId, saleNumber: sale.sale_number });
    res.status(201).json(sale);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/cancel', requireRole('admin'), async (req, res, next) => {
  try {
    const saleId = sanitizeInt(req.params.id, 0);
    if (!saleId) return res.status(400).json({ error: 'ID da venda inválido.' });

    const trustedNow = await getTrustedNowSqlite();
    const cancelReason = String(req.body?.reason || '').trim() || 'Estorno administrativo de venda';

    let canceledSale;
    try {
      canceledSale = await cancelSaleWithReversal({
        saleId,
        trustedNow,
        cancelReason,
        user: req.user,
      });
    } catch (error) {
      const message = String(error.message || '');
      if (message === 'SALE_NOT_FOUND') return res.status(404).json({ error: 'Venda não encontrada.' });
      if (message === 'SALE_ALREADY_CANCELED') return res.status(400).json({ error: 'Esta venda já foi cancelada anteriormente.' });
      if (message === 'SALE_ITEMS_NOT_FOUND') return res.status(400).json({ error: 'Itens da venda não encontrados para estorno.' });
      if (message.startsWith('STOCK_LEVEL_NOT_FOUND:')) {
        const productId = message.split(':')[1];
        return res.status(500).json({ error: `Nível de estoque não encontrado para o produto #${productId}.` });
      }
      throw error;
    }

    await logAction({
      user: req.user,
      action: 'cancel_store_sale',
      recordType: 'store_sale',
      recordId: saleId,
      details: { sale_number: canceledSale.sale_number, reason: cancelReason },
    });

    emitDashboardRefresh({ source: 'store_sale_cancel', saleId, saleNumber: canceledSale.sale_number });
    emitInventoryRefresh({ source: 'store_sale_cancel', saleId, saleNumber: canceledSale.sale_number });

    res.json({ success: true, canceled_sale_id: saleId, sale_number: canceledSale.sale_number });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const saleId = sanitizeInt(req.params.id, 0);
    if (!saleId) return res.status(400).json({ error: 'ID da venda invalido.' });

    const trustedNow = await getTrustedNowSqlite();
    const cancelReason = String(req.body?.reason || '').trim() || 'Exclusao com estorno de venda';

    let canceledSale;
    try {
      canceledSale = await cancelSaleWithReversal({
        saleId,
        trustedNow,
        cancelReason,
        user: req.user,
      });
    } catch (error) {
      const message = String(error.message || '');
      if (message === 'SALE_NOT_FOUND') return res.status(404).json({ error: 'Venda nao encontrada.' });
      if (message === 'SALE_ALREADY_CANCELED') return res.status(400).json({ error: 'Esta venda ja foi estornada anteriormente.' });
      if (message === 'SALE_ITEMS_NOT_FOUND') return res.status(400).json({ error: 'Itens da venda nao encontrados para estorno.' });
      if (message.startsWith('STOCK_LEVEL_NOT_FOUND:')) {
        const productId = message.split(':')[1];
        return res.status(500).json({ error: `Nivel de estoque nao encontrado para o produto #${productId}.` });
      }
      throw error;
    }

    await logAction({
      user: req.user,
      action: 'delete_store_sale_with_reversal',
      recordType: 'store_sale',
      recordId: saleId,
      details: { sale_number: canceledSale.sale_number, reason: cancelReason },
    });

    emitDashboardRefresh({ source: 'store_sale_delete_reversal', saleId, saleNumber: canceledSale.sale_number });
    emitInventoryRefresh({ source: 'store_sale_delete_reversal', saleId, saleNumber: canceledSale.sale_number });

    res.json({ success: true, deleted_sale_id: saleId, sale_number: canceledSale.sale_number, mode: 'reverted' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
