const { logAction } = require('../utils/audit');
const { emitDashboardRefresh } = require('../utils/events');
const { dispatchNotification } = require('./notificationService');
const { ensureFinancialHistoryUpToDate } = require('../utils/financialHistory');
const { getTrustedNowSqlite } = require('../utils/time');
const { toCents, fromCents } = require('./purchasesService');

function createHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function getTodaySaoPaulo() {
  const trustedNow = await getTrustedNowSqlite();
  return trustedNow.slice(0, 10);
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

async function getPayablesDashboard(db, storeId) {
  const today = await getTodaySaoPaulo();
  const in7Days = addDays(today, 7);
  const monthPrefix = today.slice(0, 7);
  const isSqlite = Boolean(db.isSqlite);

  const openRow = await db.queryOne(`
    SELECT COALESCE(SUM(amount - paid_amount), 0) AS total
    FROM payable_installments
    WHERE store_id = $1 AND status IN ('open', 'partial')
  `, [storeId]);

  const overdueRow = await db.queryOne(`
    SELECT COALESCE(SUM(amount - paid_amount), 0) AS total
    FROM payable_installments
    WHERE store_id = $1 AND status IN ('open', 'partial') AND due_date < $2
  `, [storeId, today]);

  const dueSoonRow = await db.queryOne(`
    SELECT COALESCE(SUM(amount - paid_amount), 0) AS total
    FROM payable_installments
    WHERE store_id = $1 AND status IN ('open', 'partial') AND due_date >= $2 AND due_date <= $3
  `, [storeId, today, in7Days]);

  const monthFilter = isSqlite ? `substr(payment_date, 1, 7) = $2` : `TO_CHAR(payment_date, 'YYYY-MM') = $2`;
  const paidMonthRow = await db.queryOne(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM payable_payments
    WHERE store_id = $1 AND ${monthFilter}
  `, [storeId, monthPrefix]);

  return {
    open_total: Number(openRow?.total || 0),
    overdue_total: Number(overdueRow?.total || 0),
    due_soon_total: Number(dueSoonRow?.total || 0),
    paid_this_month: Number(paidMonthRow?.total || 0),
    today,
  };
}

async function listPayables(db, storeId, { filter = 'all', q = '' } = {}) {
  const today = await getTodaySaoPaulo();
  const in7Days = addDays(today, 7);
  const in30Days = addDays(today, 30);

  const conditions = ['pi.store_id = $1'];
  const params = [storeId];

  if (filter === 'open') {
    conditions.push("pi.status IN ('open', 'partial')");
  } else if (filter === 'overdue') {
    params.push(today);
    conditions.push(`pi.status IN ('open', 'partial') AND pi.due_date < $${params.length}`);
  } else if (filter === 'paid') {
    conditions.push("pi.status = 'paid'");
  } else if (filter === 'due_today') {
    params.push(today);
    conditions.push(`pi.status IN ('open', 'partial') AND pi.due_date = $${params.length}`);
  } else if (filter === 'due_7d') {
    params.push(today, in7Days);
    conditions.push(`pi.status IN ('open', 'partial') AND pi.due_date >= $${params.length - 1} AND pi.due_date <= $${params.length}`);
  } else if (filter === 'due_30d') {
    params.push(today, in30Days);
    conditions.push(`pi.status IN ('open', 'partial') AND pi.due_date >= $${params.length - 1} AND pi.due_date <= $${params.length}`);
  }

  const cleanQ = String(q || '').trim();
  if (cleanQ) {
    params.push(`%${cleanQ.toLowerCase()}%`);
    const pIdx = params.length;
    conditions.push(`(
      LOWER(ap.description) LIKE $${pIdx}
      OR LOWER(COALESCE(ap.supplier_name, '')) LIKE $${pIdx}
      OR LOWER(COALESCE(p.purchase_number, '')) LIKE $${pIdx}
    )`);
  }

  const rows = await db.query(`
    SELECT
      pi.*,
      ap.description,
      ap.supplier_id,
      ap.supplier_name,
      ap.origin_type,
      ap.category,
      ap.purchase_id,
      ap.notes AS payable_notes,
      ap.total_amount AS payable_total_amount,
      p.purchase_number
    FROM payable_installments pi
    JOIN accounts_payable ap ON ap.id = pi.payable_id
    LEFT JOIN purchases p ON p.id = ap.purchase_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY
      CASE WHEN pi.status IN ('open', 'partial') THEN 0 ELSE 1 END ASC,
      pi.due_date ASC,
      pi.id ASC
  `, params);

  return rows.map((row) => ({
    ...row,
    remaining_amount: fromCents(toCents(row.amount) - toCents(row.paid_amount)),
    is_overdue: (row.status === 'open' || row.status === 'partial') && String(row.due_date).slice(0, 10) < today,
  }));
}

async function createManualPayable(db, storeId, user, payload) {
  const b = payload || {};
  const description = String(b.description || '').trim();
  const dueDate = String(b.due_date || '').slice(0, 10);
  const amountCents = toCents(b.amount ?? b.total_amount);

  if (!description) throw createHttpError(400, 'Descrição é obrigatória.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw createHttpError(400, 'Data de vencimento inválida.');
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw createHttpError(400, 'Valor deve ser maior que zero.');

  const supplierId = b.supplier_id ? Number(b.supplier_id) : null;
  let supplierName = b.supplier_name ? String(b.supplier_name).trim() : null;

  const created = await db.transaction(async (tx) => {
    if (supplierId) {
      const supp = await tx.queryOne('SELECT id, name FROM stock_suppliers WHERE id = $1 AND store_id = $2', [supplierId, storeId]);
      if (!supp) throw createHttpError(404, 'Fornecedor não encontrado nesta loja.');
      supplierName = supp.name;
    }

    const payable = await tx.queryOne(`
      INSERT INTO accounts_payable (
        store_id, supplier_id, supplier_name, origin_type, category,
        description, total_amount, paid_amount, status, due_date, notes, created_by
      ) VALUES ($1, $2, $3, 'manual', $4, $5, $6, 0, 'open', $7, $8, $9)
      RETURNING *
    `, [
      storeId, supplierId, supplierName, b.category || 'Despesa operacional',
      description, fromCents(amountCents), dueDate, b.notes || null, user?.id || null
    ]);

    const installment = await tx.queryOne(`
      INSERT INTO payable_installments (
        store_id, payable_id, installment_number, total_installments,
        amount, paid_amount, due_date, status
      ) VALUES ($1, $2, 1, 1, $3, 0, $4, 'open')
      RETURNING *
    `, [storeId, payable.id, fromCents(amountCents), dueDate]);

    return { payable, installment };
  });

  await logAction({
    user,
    action: 'create_account_payable',
    recordType: 'account_payable',
    recordId: created.payable.id,
    details: { description, amount: fromCents(amountCents), due_date: dueDate },
    storeId
  });

  return created;
}

async function payInstallment(db, storeId, user, installmentId, payload) {
  const b = payload || {};
  const idempotencyKey = b.idempotency_key ? String(b.idempotency_key).trim().slice(0, 128) : null;
  const paymentDate = String(b.payment_date || (await getTodaySaoPaulo())).slice(0, 10);
  const paymentMethod = String(b.payment_method || '').trim();
  const notes = b.notes ? String(b.notes).trim() : null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    throw createHttpError(400, 'Data efetiva do pagamento inválida.');
  }
  if (!paymentMethod) {
    throw createHttpError(400, 'Informe a forma de pagamento.');
  }

  const trustedNow = await getTrustedNowSqlite();

  const result = await db.transaction(async (tx) => {
    if (idempotencyKey) {
      const existingPayment = await tx.queryOne(
        'SELECT * FROM payable_payments WHERE store_id = $1 AND idempotency_key = $2',
        [storeId, idempotencyKey]
      );
      if (existingPayment) {
        return { payment: existingPayment, idempotentReplay: true };
      }
    }

    const instSql = tx.isSqlite
      ? `SELECT pi.*, ap.description, ap.supplier_id, ap.supplier_name, ap.purchase_id
         FROM payable_installments pi
         JOIN accounts_payable ap ON ap.id = pi.payable_id
         WHERE pi.id = $1 AND pi.store_id = $2`
      : `SELECT pi.*, ap.description, ap.supplier_id, ap.supplier_name, ap.purchase_id
         FROM payable_installments pi
         JOIN accounts_payable ap ON ap.id = pi.payable_id
         WHERE pi.id = $1 AND pi.store_id = $2 FOR UPDATE`;

    const inst = await tx.queryOne(instSql, [installmentId, storeId]);
    if (!inst) {
      throw createHttpError(404, 'Parcela não encontrada nesta loja.');
    }
    if (inst.status === 'paid') {
      throw createHttpError(409, 'Esta parcela já foi paga.');
    }
    if (inst.status === 'canceled') {
      throw createHttpError(409, 'Esta conta foi cancelada.');
    }

    const totalCents = toCents(inst.amount);
    const alreadyPaidCents = toCents(inst.paid_amount);
    const remainingCents = totalCents - alreadyPaidCents;

    const requestedCents = b.amount !== undefined && b.amount !== null && b.amount !== ''
      ? toCents(b.amount)
      : remainingCents;

    if (!Number.isFinite(requestedCents) || requestedCents <= 0) {
      throw createHttpError(400, 'Valor do pagamento inválido.');
    }
    if (requestedCents > remainingCents) {
      throw createHttpError(400, `O valor informado ultrapassa o saldo devedor da parcela (R$ ${fromCents(remainingCents).toFixed(2)}).`);
    }

    const newPaidCents = alreadyPaidCents + requestedCents;
    const newStatus = newPaidCents >= totalCents ? 'paid' : 'partial';

    const reason = `Pgto ${inst.description} (${inst.installment_number}/${inst.total_installments}) [${paymentMethod}]`;
    const withdrawal = await tx.queryOne(`
      INSERT INTO cash_withdrawals (
        store_id, amount, reason, withdrawal_date, notes,
        source_type, supplier_id, supplier_name, created_by, created_by_name_snapshot
      ) VALUES ($1, $2, $3, $4, $5, 'payable_payment', $6, $7, $8, $9)
      RETURNING id
    `, [
      storeId, fromCents(requestedCents), reason, paymentDate, notes,
      inst.supplier_id || null, inst.supplier_name || null,
      user?.id || null, user?.full_name || user?.username || null
    ]);

    const payment = await tx.queryOne(`
      INSERT INTO payable_payments (
        store_id, payable_id, installment_id, amount, payment_date,
        payment_method, cash_withdrawal_id, idempotency_key, notes,
        created_by, created_by_name_snapshot
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      storeId, inst.payable_id, inst.id, fromCents(requestedCents), paymentDate,
      paymentMethod, withdrawal.id, idempotencyKey, notes,
      user?.id || null, user?.full_name || user?.username || null
    ]);

    await tx.execute(`
      UPDATE payable_installments
      SET paid_amount = $1,
          status = $2,
          paid_at = $3,
          payment_method = $4,
          cash_withdrawal_id = $5,
          updated_at = $6
      WHERE id = $7 AND store_id = $8
    `, [
      fromCents(newPaidCents), newStatus, newStatus === 'paid' ? paymentDate : inst.paid_at,
      paymentMethod, withdrawal.id, trustedNow, inst.id, storeId
    ]);

    const agg = await tx.queryOne(`
      SELECT
        COALESCE(SUM(paid_amount), 0) AS total_paid,
        COUNT(CASE WHEN status IN ('open', 'partial') THEN 1 END) AS pending_count
      FROM payable_installments
      WHERE payable_id = $1 AND store_id = $2
    `, [inst.payable_id, storeId]);

    const payableStatus = Number(agg?.pending_count || 0) === 0 ? 'paid' : 'partial';
    await tx.execute(`
      UPDATE accounts_payable
      SET paid_amount = $1, status = $2, updated_at = $3
      WHERE id = $4 AND store_id = $5
    `, [Number(agg?.total_paid || 0), payableStatus, trustedNow, inst.payable_id, storeId]);

    return {
      payment,
      cash_withdrawal_id: withdrawal.id,
      installment_status: newStatus,
      payable_status: payableStatus,
      description: inst.description,
      amount: fromCents(requestedCents),
      idempotentReplay: false,
    };
  });

  if (!result.idempotentReplay) {
    await logAction({
      user,
      action: 'pay_account_payable_installment',
      recordType: 'payable_installment',
      recordId: installmentId,
      details: { amount: result.amount, payment_method: paymentMethod, payment_date: paymentDate },
      storeId
    });
    emitDashboardRefresh({ source: 'payable_payment', installmentId: Number(installmentId) });
    dispatchNotification({
      storeId,
      actorId: user?.id,
      eventKey: 'finance_expense',
      title: 'Conta Paga',
      description: `Pagamento de R$ ${Number(result.amount).toFixed(2)} registrado para "${result.description}".`,
      link: '/contas-a-pagar',
      metadata: { installmentId, amount: result.amount }
    }).catch(() => {});
    await ensureFinancialHistoryUpToDate(trustedNow, storeId);
  }

  return result;
}

async function syncPayableDueNotifications(db, storeId) {
  const today = await getTodaySaoPaulo();
  const in3Days = addDays(today, 3);
  const trustedNow = await getTrustedNowSqlite();

  const dueSoon = await db.query(`
    SELECT pi.id, pi.due_date, pi.amount, pi.paid_amount, ap.description
    FROM payable_installments pi
    JOIN accounts_payable ap ON ap.id = pi.payable_id
    WHERE pi.store_id = $1
      AND pi.status IN ('open', 'partial')
      AND pi.due_date >= $2
      AND pi.due_date <= $3
      AND pi.notified_due_soon_at IS NULL
  `, [storeId, today, in3Days]);

  for (const row of dueSoon) {
    const remaining = fromCents(toCents(row.amount) - toCents(row.paid_amount));
    await dispatchNotification({
      storeId,
      eventKey: 'finance_expense',
      title: 'Conta Próxima do Vencimento',
      description: `"${row.description}" vence em ${row.due_date} (R$ ${remaining.toFixed(2)}).`,
      link: '/contas-a-pagar',
      metadata: { installmentId: row.id, dueDate: row.due_date }
    }).catch(() => {});
    await db.execute(
      'UPDATE payable_installments SET notified_due_soon_at = $1 WHERE id = $2 AND store_id = $3',
      [trustedNow, row.id, storeId]
    );
  }

  const overdue = await db.query(`
    SELECT pi.id, pi.due_date, pi.amount, pi.paid_amount, ap.description
    FROM payable_installments pi
    JOIN accounts_payable ap ON ap.id = pi.payable_id
    WHERE pi.store_id = $1
      AND pi.status IN ('open', 'partial')
      AND pi.due_date < $2
      AND pi.notified_overdue_at IS NULL
  `, [storeId, today]);

  for (const row of overdue) {
    const remaining = fromCents(toCents(row.amount) - toCents(row.paid_amount));
    await dispatchNotification({
      storeId,
      eventKey: 'system_admin_alert',
      title: 'Conta a Pagar Vencida',
      description: `"${row.description}" venceu em ${row.due_date} (R$ ${remaining.toFixed(2)}).`,
      link: '/contas-a-pagar',
      metadata: { installmentId: row.id, dueDate: row.due_date }
    }).catch(() => {});
    await db.execute(
      'UPDATE payable_installments SET notified_overdue_at = $1 WHERE id = $2 AND store_id = $3',
      [trustedNow, row.id, storeId]
    );
  }
}

module.exports = {
  getPayablesDashboard,
  listPayables,
  createManualPayable,
  payInstallment,
  syncPayableDueNotifications,
};
