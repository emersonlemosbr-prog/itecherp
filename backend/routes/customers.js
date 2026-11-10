// routes/customers.js
const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { dispatchNotification } = require('../services/notificationService');

const router = express.Router();
router.use(authenticate);

// Listar / buscar (busca instantânea por nome ou telefone)
router.get('/', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const { q } = req.query;
    let customers;

    if (q) {
      const terms = String(q)
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      if (terms.length === 0) {
        customers = await db.query('SELECT * FROM customers WHERE store_id = $1 AND is_system = 0 ORDER BY first_name LIMIT 200', [storeId]);
        return res.json(customers);
      }

      const normalizedNameExpr = "LOWER(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))";
      customers = await db.query(`
        SELECT * FROM customers
        WHERE store_id = ? AND is_system = 0 AND ${terms.map(() => `(
          ${normalizedNameExpr} LIKE ?
          OR LOWER(COALESCE(first_name, '')) LIKE ?
          OR LOWER(COALESCE(last_name, '')) LIKE ?
          OR COALESCE(phone, '') LIKE ?
        )`).join(' AND ')}
        ORDER BY LOWER(first_name), LOWER(last_name)
        LIMIT 50
      `, storeId, ...terms.flatMap((term) => {
        const like = `%${term}%`;
        return [like, like, like, like];
      }));
    } else {
      customers = await db.query('SELECT * FROM customers WHERE store_id = $1 AND is_system = 0 ORDER BY first_name LIMIT 200', [storeId]);
    }
    res.json(customers);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const customer = await db.queryOne('SELECT * FROM customers WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado nesta loja.' });
    res.json(customer);
  } catch (err) {
    next(err);
  }
});

// Histórico completo do cliente
router.get('/:id/history', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const customer = await db.queryOne('SELECT * FROM customers WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado nesta loja.' });

    const orders = await db.query(`
      SELECT so.*, w.warranty_end
      FROM service_orders so
      LEFT JOIN warranties w ON w.service_order_id = so.id
      WHERE so.customer_id = $1 AND so.store_id = $2
      ORDER BY so.entry_date DESC
    `, [req.params.id, storeId]);

    const totals = await db.queryOne(`
      SELECT COUNT(*) as total_repairs, COALESCE(SUM(service_price), 0) as total_spent, MAX(entry_date) as last_visit
      FROM service_orders WHERE customer_id = $1 AND store_id = $2
    `, [req.params.id, storeId]);

    res.json({ customer, orders, totals: totals || { total_repairs: 0, total_spent: 0, last_visit: null } });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const { first_name, last_name, birth_date, address, phone } = req.body;
    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'Nome e sobrenome são obrigatórios.' });
    }

    const info = await db.queryOne(`
      INSERT INTO customers (store_id, first_name, last_name, birth_date, address, phone)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [storeId, first_name, last_name, birth_date || null, address || null, phone || null]);

    const customerId = info.id;
    await logAction({ user: req.user, action: 'create_customer', recordType: 'customer', recordId: customerId, storeId });
    dispatchNotification({
      storeId,
      actorId: req.user.id,
      eventKey: 'customer_created',
      title: 'Novo Cliente Cadastrado',
      description: `Cliente ${first_name} ${last_name} cadastrado no sistema.`,
      link: `/clientes/${customerId}`,
      metadata: { customerId, name: `${first_name} ${last_name}` }
    }).catch(err => console.error('[NOTIF_ERROR]', err.message));
    res.status(201).json({ id: customerId });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const { first_name, last_name, birth_date, address, phone } = req.body;
    const existing = await db.queryOne('SELECT * FROM customers WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado nesta loja.' });

    await db.query(`
      UPDATE customers SET first_name = $1, last_name = $2, birth_date = $3, address = $4, phone = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6 AND store_id = $7
    `, [
      first_name ?? existing.first_name,
      last_name ?? existing.last_name,
      birth_date ?? existing.birth_date,
      address ?? existing.address,
      phone ?? existing.phone,
      req.params.id,
      storeId
    ]);

    await logAction({ user: req.user, action: 'update_customer', recordType: 'customer', recordId: req.params.id, storeId });
    dispatchNotification({
      storeId,
      actorId: req.user.id,
      eventKey: 'customer_updated',
      title: 'Cliente Atualizado',
      description: `Cadastro do cliente ${first_name || existing.first_name} ${last_name || existing.last_name} foi atualizado.`,
      link: `/clientes/${req.params.id}`,
      metadata: { customerId: req.params.id }
    }).catch(err => console.error('[NOTIF_ERROR]', err.message));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const customer = await db.queryOne('SELECT * FROM customers WHERE id = $1 AND (store_id = $2 OR store_id IS NULL) AND is_system = 0', [req.params.id, storeId]);
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado nesta loja.' });

    let historicalCustomer = await db.queryOne('SELECT id FROM customers WHERE is_system = 1 AND (store_id = $1 OR store_id IS NULL)', [storeId]);
    if (!historicalCustomer) {
      const ins = await db.queryOne("INSERT INTO customers (store_id, first_name, last_name, is_system) VALUES ($1, 'Histórico', 'Excluído', 1) RETURNING id", [storeId]);
      historicalCustomer = { id: ins.id };
    }

    const fullName = `${customer.first_name} ${customer.last_name}`.trim();
    const usage = await db.transaction(async (tx) => {
      const counts = {
        service_orders: Number((await tx.queryOne('SELECT COUNT(*) AS n FROM service_orders WHERE customer_id = $1 AND (store_id = $2 OR store_id IS NULL)', [customer.id, storeId]))?.n || 0),
        warranties: Number((await tx.queryOne('SELECT COUNT(*) AS n FROM warranties WHERE customer_id = $1 AND (store_id = $2 OR store_id IS NULL)', [customer.id, storeId]))?.n || 0),
        credit_accounts: Number((await tx.queryOne('SELECT COUNT(*) AS n FROM credit_accounts WHERE customer_id = $1 AND (store_id = $2 OR store_id IS NULL)', [customer.id, storeId]))?.n || 0),
        device_sales: Number((await tx.queryOne('SELECT COUNT(*) AS n FROM device_sales WHERE customer_id = $1 AND (store_id = $2 OR store_id IS NULL)', [customer.id, storeId]))?.n || 0),
      };
      await tx.query('UPDATE service_orders SET customer_name_snapshot = COALESCE(customer_name_snapshot, $1), customer_phone_snapshot = COALESCE(customer_phone_snapshot, $2), customer_address_snapshot = COALESCE(customer_address_snapshot, $3), customer_id = $4 WHERE customer_id = $5 AND (store_id = $6 OR store_id IS NULL)', [fullName, customer.phone, customer.address, historicalCustomer.id, customer.id, storeId]);
      await tx.query('UPDATE warranties SET customer_name_snapshot = COALESCE(customer_name_snapshot, $1), customer_id = $2 WHERE customer_id = $3 AND (store_id = $4 OR store_id IS NULL)', [fullName, historicalCustomer.id, customer.id, storeId]);
      await tx.query('UPDATE credit_accounts SET customer_name_snapshot = COALESCE(customer_name_snapshot, $1), customer_id = $2 WHERE customer_id = $3 AND (store_id = $4 OR store_id IS NULL)', [fullName, historicalCustomer.id, customer.id, storeId]);
      await tx.query('UPDATE device_sales SET customer_id = NULL WHERE customer_id = $1 AND (store_id = $2 OR store_id IS NULL)', [customer.id, storeId]);
      await tx.query('DELETE FROM customers WHERE id = $1 AND (store_id = $2 OR store_id IS NULL)', [customer.id, storeId]);
      return counts;
    });

    await logAction({ user: req.user, action: 'delete_customer', recordType: 'customer', recordId: req.params.id, storeId });
    res.json({ success: true, mode: 'deleted', preserved: usage });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
