// routes/reports.js
const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Relatório de ordens filtrado por período, cliente, técnico, forma de pagamento e status
router.get('/service-orders', requireRole('admin'), (req, res) => {
  const storeId = req.user.store_id || 1;
  const { from, to, customer_id, created_by, payment_method, status } = req.query;
  let sql = `
    SELECT so.*, c.first_name, c.last_name, COALESCE(so.created_by_name_snapshot, u.full_name) as technician
    FROM service_orders so
    JOIN customers c ON c.id = so.customer_id
    LEFT JOIN users u ON u.id = so.created_by
    WHERE so.store_id = ?
  `;
  const params = [storeId];
  if (from) { sql += ' AND so.entry_date >= ?'; params.push(from); }
  if (to) { sql += ' AND so.entry_date <= ?'; params.push(to); }
  if (customer_id) { sql += ' AND so.customer_id = ?'; params.push(customer_id); }
  if (created_by) { sql += ' AND so.created_by = ?'; params.push(created_by); }
  if (payment_method) { sql += ' AND so.payment_method = ?'; params.push(payment_method); }
  if (status) { sql += ' AND so.status = ?'; params.push(status); }
  sql += ' ORDER BY so.entry_date DESC';

  const rows = db.prepare(sql).all(...params);
  const summary = rows.reduce((acc, r) => {
    acc.total_revenue += (r.payment_status === 'paid' || r.payment_status === 'credit_account') ? r.service_price : 0;
    acc.total_profit += (r.payment_status === 'paid' || r.payment_status === 'credit_account') ? r.profit : 0;
    acc.count += 1;
    return acc;
  }, { total_revenue: 0, total_profit: 0, count: 0 });

  res.json({
    rows,
    summary,
    report_number: require('../services/settings').nextNumber('report', storeId),
    store: require('../services/settings').readSettings(storeId).store
  });
});

// Lucro por período (diário / semanal / mensal / anual)
router.get('/profit', requireRole('admin'), (req, res) => {
  const storeId = req.user.store_id || 1;
  const { granularity } = req.query; // day | week | month | year
  const formatMap = {
    day: '%Y-%m-%d',
    week: '%Y-%W',
    month: '%Y-%m',
    year: '%Y'
  };
  const fmt = formatMap[granularity] || formatMap.month;

  const rows = db.prepare(`
    SELECT strftime('${fmt}', entry_date) as period, COALESCE(SUM(profit),0) as profit, COALESCE(SUM(service_price),0) as revenue
    FROM service_orders
    WHERE store_id = ? AND payment_status IN ('paid','credit_account')
    GROUP BY period ORDER BY period DESC LIMIT 24
  `).all(storeId);

  res.json(rows);
});

// Exporta todas as tabelas principais em JSON (usado como base para exportação/backup)
router.get('/backup', requireRole('admin'), (_req, res) => res.status(410).json({ error: 'Gere o backup criptografado em Configurações > Sistema e Preferências.' }));

router.get('/audit-log', requireRole('admin'), (req, res) => {
  const storeId = req.user.store_id || 1;
  res.json(db.prepare('SELECT * FROM audit_log WHERE store_id = ? ORDER BY id DESC LIMIT 500').all(storeId));
});

module.exports = router;
