// routes/reports.js
const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { nextNumber, readSettings } = require('../services/settings');

const router = express.Router();
router.use(authenticate);

// Relatório de ordens filtrado por período, cliente, técnico, forma de pagamento e status
router.get('/service-orders', requireRole('admin'), async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const { from, to, customer_id, created_by, payment_method, status } = req.query;
    let sql = `
      SELECT so.*, c.first_name, c.last_name, COALESCE(so.created_by_name_snapshot, u.full_name) as technician
      FROM service_orders so
      JOIN customers c ON c.id = so.customer_id
      LEFT JOIN users u ON u.id = so.created_by
      WHERE so.store_id = $1
    `;
    const params = [storeId];
    let paramIndex = 2;

    if (from) { sql += ` AND so.entry_date >= $${paramIndex++}`; params.push(from); }
    if (to) { sql += ` AND so.entry_date <= $${paramIndex++}`; params.push(to); }
    if (customer_id) { sql += ` AND so.customer_id = $${paramIndex++}`; params.push(customer_id); }
    if (created_by) { sql += ` AND so.created_by = $${paramIndex++}`; params.push(created_by); }
    if (payment_method) { sql += ` AND so.payment_method = $${paramIndex++}`; params.push(payment_method); }
    if (status) { sql += ` AND so.status = $${paramIndex++}`; params.push(status); }
    sql += ' ORDER BY so.entry_date DESC';

    const rows = await db.query(sql, ...params);
    const summary = rows.reduce((acc, r) => {
      const price = parseFloat(r.service_price) || 0;
      const prof = parseFloat(r.profit) || 0;
      acc.total_revenue += (r.payment_status === 'paid' || r.payment_status === 'credit_account') ? price : 0;
      acc.total_profit += (r.payment_status === 'paid' || r.payment_status === 'credit_account') ? prof : 0;
      acc.count += 1;
      return acc;
    }, { total_revenue: 0, total_profit: 0, count: 0 });

    const reportNumber = await nextNumber('report', storeId);
    const storeSettings = await readSettings(storeId);

    res.json({
      rows,
      summary,
      report_number: reportNumber,
      store: storeSettings.store
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar relatório de ordens: ' + err.message });
  }
});

// Lucro por período (diário / semanal / mensal / anual)
router.get('/profit', requireRole('admin'), async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const { granularity } = req.query; // day | week | month | year
    const formatMap = {
      day: 'YYYY-MM-DD',
      week: 'IYYY-IW',
      month: 'YYYY-MM',
      year: 'YYYY'
    };
    const fmt = formatMap[granularity] || formatMap.month;

    const rows = await db.query(`
      SELECT TO_CHAR(entry_date, $1) as period, COALESCE(SUM(profit), 0) as profit, COALESCE(SUM(service_price), 0) as revenue
      FROM service_orders
      WHERE store_id = $2 AND payment_status IN ('paid', 'credit_account')
      GROUP BY period ORDER BY period DESC LIMIT 24
    `, fmt, storeId);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao consultar lucro por período: ' + err.message });
  }
});

// Exporta todas as tabelas principais em JSON (usado como base para exportação/backup)
router.get('/backup', requireRole('admin'), (_req, res) => res.status(410).json({ error: 'Gere o backup criptografado em Configurações > Sistema e Preferências.' }));

router.get('/audit-log', requireRole('admin'), async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const rows = await db.query('SELECT * FROM audit_log WHERE store_id = $1 ORDER BY id DESC LIMIT 500', storeId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar log de auditoria: ' + err.message });
  }
});

module.exports = router;
