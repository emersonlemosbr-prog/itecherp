// routes/cashWithdrawals.js
const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { emitDashboardRefresh } = require('../utils/events');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

router.get('/', (req, res) => {
  const storeId = req.user.store_id || 1;
  res.json(db.prepare(`
    SELECT w.*, COALESCE(NULLIF(w.supplier_name, ''), s.name) AS supplier_name, so.order_number
    FROM cash_withdrawals w
    LEFT JOIN service_orders so ON so.id = w.service_order_id
    LEFT JOIN stock_suppliers s ON s.id = w.supplier_id
    WHERE w.store_id = ?
    ORDER BY w.withdrawal_date DESC, w.id DESC
  `).all(storeId));
});

router.post('/', (req, res) => {
  const storeId = req.user.store_id || 1;
  const { amount, reason, withdrawal_date, notes } = req.body;
  if (!amount || !reason || !withdrawal_date) {
    return res.status(400).json({ error: 'Valor, motivo e data são obrigatórios.' });
  }

  const info = db.prepare(`
    INSERT INTO cash_withdrawals (store_id, amount, reason, withdrawal_date, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(storeId, amount, reason, withdrawal_date, notes || null, req.user.id);

  logAction({ user: req.user, action: 'create_cash_withdrawal', recordType: 'cash_withdrawal', recordId: info.lastInsertRowid, details: { amount } });
  emitDashboardRefresh({ source: 'cash_withdrawal_create', cashWithdrawalId: info.lastInsertRowid });
  res.status(201).json({ id: info.lastInsertRowid });
});

router.delete('/:id', (req, res) => {
  const storeId = req.user.store_id || 1;
  const withdrawal = db.prepare('SELECT id, source_type FROM cash_withdrawals WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
  if (!withdrawal) return res.status(404).json({ error: 'Retirada não encontrada nesta loja.' });
  if (withdrawal.source_type === 'service_order_part') {
    return res.status(409).json({ error: 'A retirada automática da OS não pode ser excluída.' });
  }

  db.prepare('DELETE FROM cash_withdrawals WHERE id = ? AND store_id = ?').run(req.params.id, storeId);
  logAction({ user: req.user, action: 'delete_cash_withdrawal', recordType: 'cash_withdrawal', recordId: req.params.id });
  emitDashboardRefresh({ source: 'cash_withdrawal_delete', cashWithdrawalId: Number(req.params.id) });
  res.json({ success: true });
});

module.exports = router;
