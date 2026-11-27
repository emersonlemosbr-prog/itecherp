// routes/cashWithdrawals.js
const express = require('express');
const bcrypt = require('bcryptjs');
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

    // Apenas o usuário proprietário (ADM Master da loja) tem permissão para excluir retiradas
    if (!req.user || !req.user.is_master) {
      return res.status(403).json({ error: 'Apenas o proprietário da loja tem permissão para excluir retiradas de caixa.' });
    }

    // Validação da senha do proprietário
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) {
      return res.status(400).json({ error: 'A senha do proprietário é obrigatória para confirmar a exclusão.' });
    }

    // Busca o usuário atual com seu hash de senha no banco de dados
    const currentUser = await db.queryOne('SELECT id, password_hash, is_master, store_id FROM users WHERE id = $1 AND store_id = $2', [req.user.id, storeId]);
    if (!currentUser || !currentUser.is_master) {
      return res.status(403).json({ error: 'Apenas o proprietário da loja tem permissão para excluir retiradas de caixa.' });
    }

    // Se a loja tiver owner_password_hash definido, também pode ser aceito, mas prioritariamente valida o hash do usuário master autenticado
    let isPasswordCorrect = false;
    if (currentUser.password_hash) {
      isPasswordCorrect = await bcrypt.compare(password, currentUser.password_hash);
    }
    if (!isPasswordCorrect) {
      const storeRecord = await db.queryOne('SELECT owner_password_hash FROM stores WHERE id = $1', [storeId]);
      if (storeRecord?.owner_password_hash) {
        isPasswordCorrect = await bcrypt.compare(password, storeRecord.owner_password_hash);
      }
    }

    if (!isPasswordCorrect) {
      return res.status(401).json({ error: 'Senha incorreta. A retirada não foi excluída.' });
    }

    const withdrawal = await db.queryOne('SELECT id, source_type, service_order_id, supplier_id, amount, reason, withdrawal_date FROM cash_withdrawals WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!withdrawal) {
      return res.status(404).json({ error: 'Retirada não encontrada nesta loja.' });
    }

    await db.transaction(async (tx) => {
      if (withdrawal.source_type === 'payable_payment') {
        const payment = await tx.queryOne(
          'SELECT * FROM payable_payments WHERE cash_withdrawal_id = $1 AND store_id = $2',
          [withdrawal.id, storeId]
        );
        if (payment) {
          const inst = await tx.queryOne(
            'SELECT * FROM payable_installments WHERE id = $1 AND store_id = $2',
            [payment.installment_id, storeId]
          );
          if (inst) {
            const newPaid = Math.max(0, Number(inst.paid_amount || 0) - Number(payment.amount || 0));
            const newStatus = newPaid <= 0 ? 'open' : 'partial';
            await tx.execute(
              'UPDATE payable_installments SET paid_amount = $1, status = $2, paid_at = $3, cash_withdrawal_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $4 AND store_id = $5',
              [newPaid, newStatus, newPaid <= 0 ? null : inst.paid_at, inst.id, storeId]
            );
          }
          await tx.execute('DELETE FROM payable_payments WHERE id = $1 AND store_id = $2', [payment.id, storeId]);
          const agg = await tx.queryOne(
            "SELECT COALESCE(SUM(paid_amount), 0) AS total_paid, COUNT(CASE WHEN status IN ('open', 'partial') THEN 1 END) AS pending_count FROM payable_installments WHERE payable_id = $1 AND store_id = $2",
            [payment.payable_id, storeId]
          );
          const apStatus = Number(agg?.total_paid || 0) <= 0 ? 'open' : (Number(agg?.pending_count || 0) === 0 ? 'paid' : 'partial');
          await tx.execute(
            'UPDATE accounts_payable SET paid_amount = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND store_id = $4',
            [Number(agg?.total_paid || 0), apStatus, payment.payable_id, storeId]
          );
        }
      } else if (withdrawal.source_type === 'purchase_payment') {
        const match = String(withdrawal.reason || '').match(/CMP-\d+/);
        if (match) {
          const purchase = await tx.queryOne(
            'SELECT * FROM purchases WHERE purchase_number = $1 AND store_id = $2',
            [match[0], storeId]
          );
          if (purchase && purchase.status !== 'canceled') {
            await tx.execute(
              "UPDATE purchases SET payment_condition = 'installments', down_payment = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND store_id = $2",
              [purchase.id, storeId]
            );
            const existingAp = await tx.queryOne(
              'SELECT * FROM accounts_payable WHERE purchase_id = $1 AND store_id = $2',
              [purchase.id, storeId]
            );
            if (!existingAp) {
              const ap = await tx.queryOne(`
                INSERT INTO accounts_payable (
                  store_id, purchase_id, supplier_id, supplier_name, origin_type, category,
                  description, total_amount, paid_amount, status, due_date, created_by
                ) VALUES ($1, $2, $3, $4, 'purchase', 'Compra', $5, $6, 0, 'open', $7, $8)
                RETURNING id
              `, [
                storeId, purchase.id, purchase.supplier_id, purchase.supplier_name,
                `Compra ${purchase.purchase_number} (Reconciliada)`,
                Number(withdrawal.amount || 0), String(purchase.purchase_date).slice(0, 10), req.user.id
              ]);
              await tx.execute(`
                INSERT INTO payable_installments (
                  store_id, payable_id, installment_number, total_installments, amount, paid_amount, due_date, status
                ) VALUES ($1, $2, 1, 1, $3, 0, $4, 'open')
              `, [storeId, ap.id, Number(withdrawal.amount || 0), String(purchase.purchase_date).slice(0, 10)]);
            }
          }
        }
      } else if (withdrawal.source_type === 'service_order_part' && withdrawal.service_order_id) {
        await tx.execute(
          'UPDATE service_orders SET parts_cost = 0 WHERE id = $1 AND store_id = $2',
          [withdrawal.service_order_id, storeId]
        );
      }

      await tx.execute('DELETE FROM cash_withdrawals WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    });
    await logAction({
      user: req.user,
      action: 'delete_cash_withdrawal',
      recordType: 'cash_withdrawal',
      recordId: req.params.id,
      details: { amount: withdrawal.amount, reason: withdrawal.reason, withdrawal_date: withdrawal.withdrawal_date },
      storeId
    });
    emitDashboardRefresh({ source: 'cash_withdrawal_delete', cashWithdrawalId: Number(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
