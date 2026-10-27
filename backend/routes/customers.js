// routes/customers.js
const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();
router.use(authenticate);

// Listar / buscar (busca instantânea por nome ou telefone)
router.get('/', (req, res) => {
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
      customers = db.prepare('SELECT * FROM customers WHERE store_id = ? AND is_system = 0 ORDER BY first_name LIMIT 200').all(storeId);
      res.json(customers);
      return;
    }

    const normalizedNameExpr = "LOWER(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))";
    customers = db.prepare(`
      SELECT * FROM customers
      WHERE store_id = ? AND is_system = 0 AND ${terms.map(() => `(
        ${normalizedNameExpr} LIKE ?
        OR LOWER(COALESCE(first_name, '')) LIKE ?
        OR LOWER(COALESCE(last_name, '')) LIKE ?
        OR COALESCE(phone, '') LIKE ?
      )`).join(' AND ')}
      ORDER BY first_name COLLATE NOCASE, last_name COLLATE NOCASE
      LIMIT 50
    `).all(storeId, ...terms.flatMap((term) => {
      const like = `%${term}%`;
      return [like, like, like, like];
    }));
  } else {
    customers = db.prepare('SELECT * FROM customers WHERE store_id = ? AND is_system = 0 ORDER BY first_name LIMIT 200').all(storeId);
  }
  res.json(customers);
});

router.get('/:id', (req, res) => {
  const storeId = req.user.store_id || 1;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
  if (!customer) return res.status(404).json({ error: 'Cliente não encontrado nesta loja.' });
  res.json(customer);
});

// Histórico completo do cliente
router.get('/:id/history', (req, res) => {
  const storeId = req.user.store_id || 1;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
  if (!customer) return res.status(404).json({ error: 'Cliente não encontrado nesta loja.' });

  const orders = db.prepare(`
    SELECT so.*, w.warranty_end
    FROM service_orders so
    LEFT JOIN warranties w ON w.service_order_id = so.id
    WHERE so.customer_id = ? AND so.store_id = ?
    ORDER BY so.entry_date DESC
  `).all(req.params.id, storeId);

  const totals = db.prepare(`
    SELECT COUNT(*) as total_repairs, COALESCE(SUM(service_price),0) as total_spent, MAX(entry_date) as last_visit
    FROM service_orders WHERE customer_id = ? AND store_id = ?
  `).get(req.params.id, storeId);

  res.json({ customer, orders, totals });
});

router.post('/', (req, res) => {
  const storeId = req.user.store_id || 1;
  const { first_name, last_name, birth_date, address, phone } = req.body;
  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'Nome e sobrenome são obrigatórios.' });
  }

  const info = db.prepare(`
    INSERT INTO customers (store_id, first_name, last_name, birth_date, address, phone)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(storeId, first_name, last_name, birth_date || null, address || null, phone || null);

  logAction({ user: req.user, action: 'create_customer', recordType: 'customer', recordId: info.lastInsertRowid });
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const storeId = req.user.store_id || 1;
  const { first_name, last_name, birth_date, address, phone } = req.body;
  const existing = db.prepare('SELECT * FROM customers WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
  if (!existing) return res.status(404).json({ error: 'Cliente não encontrado nesta loja.' });

  db.prepare(`
    UPDATE customers SET first_name=?, last_name=?, birth_date=?, address=?, phone=?, updated_at=datetime('now')
    WHERE id=? AND store_id=?
  `).run(
    first_name ?? existing.first_name,
    last_name ?? existing.last_name,
    birth_date ?? existing.birth_date,
    address ?? existing.address,
    phone ?? existing.phone,
    req.params.id,
    storeId
  );

  logAction({ user: req.user, action: 'update_customer', recordType: 'customer', recordId: req.params.id });
  res.json({ success: true });
});

router.delete('/:id', requireRole('admin'), (req, res, next) => {
  const storeId = req.user.store_id || 1;
  const customer = db.prepare('SELECT * FROM customers WHERE id=? AND (store_id=? OR store_id IS NULL) AND is_system=0').get(req.params.id, storeId);
  if (!customer) return res.status(404).json({ error: 'Cliente não encontrado nesta loja.' });

  try {
    let historicalCustomer = db.prepare('SELECT id FROM customers WHERE is_system=1 AND (store_id=? OR store_id IS NULL)').get(storeId);
    if (!historicalCustomer) {
      const ins = db.prepare("INSERT INTO customers (store_id, first_name, last_name, is_system) VALUES (?, 'Histórico', 'Excluído', 1)").run(storeId);
      historicalCustomer = { id: ins.lastInsertRowid };
    }

    const fullName = `${customer.first_name} ${customer.last_name}`.trim();
    const usage = db.transaction(() => {
      const counts = {
        service_orders: db.prepare('SELECT COUNT(*) n FROM service_orders WHERE customer_id=? AND (store_id=? OR store_id IS NULL)').get(customer.id, storeId).n,
        warranties: db.prepare('SELECT COUNT(*) n FROM warranties WHERE customer_id=? AND (store_id=? OR store_id IS NULL)').get(customer.id, storeId).n,
        credit_accounts: db.prepare('SELECT COUNT(*) n FROM credit_accounts WHERE customer_id=? AND (store_id=? OR store_id IS NULL)').get(customer.id, storeId).n,
        device_sales: db.prepare('SELECT COUNT(*) n FROM device_sales WHERE customer_id=? AND (store_id=? OR store_id IS NULL)').get(customer.id, storeId).n,
      };
      db.prepare('UPDATE service_orders SET customer_name_snapshot=COALESCE(customer_name_snapshot,?),customer_phone_snapshot=COALESCE(customer_phone_snapshot,?),customer_address_snapshot=COALESCE(customer_address_snapshot,?),customer_id=? WHERE customer_id=? AND (store_id=? OR store_id IS NULL)').run(fullName, customer.phone, customer.address, historicalCustomer.id, customer.id, storeId);
      db.prepare('UPDATE warranties SET customer_name_snapshot=COALESCE(customer_name_snapshot,?),customer_id=? WHERE customer_id=? AND (store_id=? OR store_id IS NULL)').run(fullName, historicalCustomer.id, customer.id, storeId);
      db.prepare('UPDATE credit_accounts SET customer_name_snapshot=COALESCE(customer_name_snapshot,?),customer_id=? WHERE customer_id=? AND (store_id=? OR store_id IS NULL)').run(fullName, historicalCustomer.id, customer.id, storeId);
      db.prepare('UPDATE device_sales SET customer_id=NULL WHERE customer_id=? AND (store_id=? OR store_id IS NULL)').run(customer.id, storeId);
      db.prepare('DELETE FROM customers WHERE id=? AND (store_id=? OR store_id IS NULL)').run(customer.id, storeId);
      return counts;
    })();

    logAction({ user: req.user, action: 'delete_customer', recordType: 'customer', recordId: req.params.id });
    res.json({ success: true, mode: 'deleted', preserved: usage });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
