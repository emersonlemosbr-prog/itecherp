// routes/cashWithdrawals.js
const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { emitDashboardRefresh } = require('../utils/events');
const { dispatchNotification } = require('../services/notificationService');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const rows = await db.query(`
      SELECT w.*, COALESCE(NULLIF(w.supplier_name, ''), s.name) AS supplier_name, so.order_number
      FROM cash_withdrawals w
      LEFT JOIN service_orders so ON so.id = w.service_order_id
      LEFT JOIN stock_suppliers s ON s.id = w.supplier_id
      WHERE w.store_id = $1
      ORDER BY w.withdrawal_date DESC, w.id DESC
    `, [storeId]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const { amount, reason, withdrawal_date, notes } = req.body;
    if (!amount || !reason || !withdrawal_date) {
      return res.status(400).json({ error: 'Valor, motivo e data são obrigatórios.' });
    }

    const info = await db.queryOne(`
      INSERT INTO cash_withdrawals (store_id, amount, reason, withdrawal_date, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [storeId, amount, reason, withdrawal_date, notes || null, req.user.id]);

    const withdrawalId = info.id;
    await logAction({ user: req.user, action: 'create_cash_withdrawal', recordType: 'cash_withdrawal', recordId: withdrawalId, details: { amount }, storeId });
    emitDashboardRefresh({ source: 'cash_withdrawal_create', cashWithdrawalId: withdrawalId });

    dispatchNotification({
      storeId,
      actorId: req.user.id,
      eventKey: 'finance_expense',
      title: 'Retirada de Caixa / Despesa',
      description: `Lançada retirada/despesa de R$ ${Number(amount).toFixed(2)}: ${reason}.`,
      link: '/caixa',
      metadata: { withdrawalId, amount, reason }
    }).catch(err => console.error('[NOTIF_ERROR]', err.message));
    res.status(201).json({ id: withdrawalId });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const withdrawal = await db.queryOne('SELECT id, source_type FROM cash_withdrawals WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!withdrawal) return res.status(404).json({ error: 'Retirada não encontrada nesta loja.' });
    if (withdrawal.source_type === 'service_order_part') {
      return res.status(409).json({ error: 'A retirada automática da OS não pode ser excluída.' });
    }

    await db.query('DELETE FROM cash_withdrawals WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    await logAction({ user: req.user, action: 'delete_cash_withdrawal', recordType: 'cash_withdrawal', recordId: req.params.id, storeId });
    emitDashboardRefresh({ source: 'cash_withdrawal_delete', cashWithdrawalId: Number(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
