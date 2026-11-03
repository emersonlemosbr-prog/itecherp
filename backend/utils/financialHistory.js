// utils/financialHistory.js
const db = require('../db/database');
const { getTrustedNowSqlite } = require('./time');
const { calculateFinancialSummary } = require('../services/financialSummary');

const CARD_METHODS = new Set(['credit_card', 'debit_card']);

let closeProcessPromise = null;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function parseYearMonth(nowStr) {
  const [yearText, monthText] = String(nowStr || '').slice(0, 7).split('-');
  return {
    year: Number(yearText),
    month: Number(monthText),
  };
}

function getNextYearMonth(year, month) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

function getMonthStartDate(year, month) {
  return `${year}-${pad2(month)}-01`;
}

function getMonthEndDate(year, month) {
  const date = new Date(Date.UTC(year, month, 0));
  const endYear = date.getUTCFullYear();
  const endMonth = date.getUTCMonth() + 1;
  const endDay = date.getUTCDate();
  return `${endYear}-${pad2(endMonth)}-${pad2(endDay)}`;
}

function isBeforeMonth(left, right) {
  return left.year < right.year || (left.year === right.year && left.month < right.month);
}

function isSameMonth(left, right) {
  return left.year === right.year && left.month === right.month;
}

function isAfterMonth(left, right) {
  return !isSameMonth(left, right) && !isBeforeMonth(left, right);
}

function getPreviousYearMonth(year, month) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function monthToComparableValue(period) {
  return period.year * 100 + period.month;
}

function getMonthDateRangeForSqlite(nowStr) {
  const current = parseYearMonth(nowStr);
  const next = getNextYearMonth(current.year, current.month);

  return {
    ...current,
    startDate: getMonthStartDate(current.year, current.month),
    nextStartDate: getMonthStartDate(next.year, next.month),
  };
}

function sumByPaymentBucket(rows) {
  return rows.reduce((acc, row) => {
    const method = row.payment_method;
    const total = Number(row.total) || 0;

    if (method === 'cash') acc.cash += total;
    else if (method === 'pix') acc.pix += total;
    else if (CARD_METHODS.has(method)) acc.card += total;
    else acc.other += total;

    return acc;
  }, { cash: 0, pix: 0, card: 0, other: 0 });
}

async function computeMonthlySnapshot(year, month, storeId = 1) {
  const startDate = getMonthStartDate(year, month);
  const next = getNextYearMonth(year, month);
  const nextStartDate = getMonthStartDate(next.year, next.month);

  const summary = await calculateFinancialSummary(db, startDate, nextStartDate, { storeId });

  const serviceStats = await db.queryOne(`
    SELECT COUNT(*) AS total_services
    FROM service_orders
    WHERE (store_id = $1 OR store_id IS NULL)
      AND (COALESCE(delivery_date, entry_date))::date >= $2::date
      AND (COALESCE(delivery_date, entry_date))::date < $3::date
  `, [storeId, startDate, nextStartDate]);

  const storeStats = await db.queryOne(`
    SELECT COUNT(*) AS total_sales
    FROM store_sales
    WHERE (store_id = $1 OR store_id IS NULL)
      AND COALESCE(is_canceled, 0) = 0
      AND created_at::date >= $2::date
      AND created_at::date < $3::date
  `, [storeId, startDate, nextStartDate]);

  const expenses = await db.queryOne(`
    SELECT COALESCE(SUM(CASE WHEN w.source_type = 'service_order_part'
        AND so.payment_status IN ('paid', 'credit_account')
        AND (COALESCE(so.delivery_date, so.entry_date))::date >= $1::date
        AND (COALESCE(so.delivery_date, so.entry_date))::date < $2::date
        THEN w.amount ELSE 0 END), 0) AS already_in_service_profit
    FROM cash_withdrawals w
    LEFT JOIN service_orders so ON so.id = w.service_order_id AND (so.store_id = w.store_id OR w.store_id IS NULL OR so.store_id IS NULL)
    WHERE (w.store_id = $3 OR w.store_id IS NULL)
      AND w.withdrawal_date::date >= $1::date
      AND w.withdrawal_date::date < $2::date
  `, [startDate, nextStartDate, storeId]);

  const servicePayments = await db.query(`
    SELECT payment_method, COALESCE(SUM(service_price), 0) AS total
    FROM service_orders
    WHERE (store_id = $1 OR store_id IS NULL)
      AND payment_status = 'paid'
      AND (COALESCE(delivery_date, entry_date))::date >= $2::date
      AND (COALESCE(delivery_date, entry_date))::date < $3::date
    GROUP BY payment_method
  `, [storeId, startDate, nextStartDate]);

  const storePayments = await db.query(`
    SELECT payment_method, COALESCE(SUM(total_amount), 0) AS total
    FROM store_sales
    WHERE (store_id = $1 OR store_id IS NULL)
      AND COALESCE(is_canceled, 0) = 0
      AND created_at::date >= $2::date
      AND created_at::date < $3::date
    GROUP BY payment_method
  `, [storeId, startDate, nextStartDate]);

  const paymentBuckets = sumByPaymentBucket([...servicePayments, ...storePayments]);

  const received = paymentBuckets.cash + paymentBuckets.pix + paymentBuckets.card + paymentBuckets.other;
  const pending = summary.pendingRevenue;
  const revenue = summary.totalRevenue;
  const profit = summary.totalProfit;
  const totalServices = Number(serviceStats?.total_services) || 0;
  const totalSales = Number(storeStats?.total_sales) || 0;
  const ordersCount = totalServices + totalSales;
  const averageTicket = ordersCount > 0 ? revenue / ordersCount : 0;
  const netProfit = profit - (summary.cashWithdrawals - Number(expenses?.already_in_service_profit || 0));

  return {
    store_id: storeId,
    month,
    year,
    revenue,
    received,
    pending,
    profit,
    net_profit: netProfit,
    total_services: totalServices,
    total_sales: totalSales,
    average_ticket: averageTicket,
    cash_total: paymentBuckets.cash,
    pix_total: paymentBuckets.pix,
    card_total: paymentBuckets.card,
    other_total: paymentBuckets.other,
    expenses: summary.cashWithdrawals,
    opened_at: `${startDate} 00:00:00`,
    closed_at: `${getMonthEndDate(year, month)} 23:59:59`,
  };
}

async function upsertSnapshot(snapshot) {
  return await db.query(`
    INSERT INTO financial_history (
      store_id, month, year, revenue, received, pending, profit, net_profit,
      total_services, total_sales, average_ticket,
      cash_total, pix_total, card_total, other_total, expenses,
      opened_at, closed_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11,
      $12, $13, $14, $15, $16,
      $17, $18
    )
    ON CONFLICT (store_id, year, month) DO UPDATE SET
      revenue = EXCLUDED.revenue,
      received = EXCLUDED.received,
      pending = EXCLUDED.pending,
      profit = EXCLUDED.profit,
      net_profit = EXCLUDED.net_profit,
      total_services = EXCLUDED.total_services,
      total_sales = EXCLUDED.total_sales,
      average_ticket = EXCLUDED.average_ticket,
      cash_total = EXCLUDED.cash_total,
      pix_total = EXCLUDED.pix_total,
      card_total = EXCLUDED.card_total,
      other_total = EXCLUDED.other_total,
      expenses = EXCLUDED.expenses,
      opened_at = EXCLUDED.opened_at,
      closed_at = EXCLUDED.closed_at
  `, [
    snapshot.store_id, snapshot.month, snapshot.year, snapshot.revenue, snapshot.received, snapshot.pending, snapshot.profit, snapshot.net_profit,
    snapshot.total_services, snapshot.total_sales, snapshot.average_ticket,
    snapshot.cash_total, snapshot.pix_total, snapshot.card_total, snapshot.other_total, snapshot.expenses,
    snapshot.opened_at, snapshot.closed_at
  ]);
}

async function getActivityMonthsBefore(current, storeId = 1) {
  const currentComparable = monthToComparableValue(current);

  const rows = await db.query(`
    SELECT DISTINCT ym
    FROM (
      SELECT TO_CHAR(COALESCE(delivery_date, entry_date)::timestamp, 'YYYY-MM') AS ym FROM service_orders WHERE store_id = $1
      UNION ALL
      SELECT TO_CHAR(created_at, 'YYYY-MM') AS ym FROM store_sales WHERE store_id = $1 AND COALESCE(is_canceled, 0) = 0
      UNION ALL
      SELECT TO_CHAR(withdrawal_date::timestamp, 'YYYY-MM') AS ym FROM cash_withdrawals WHERE store_id = $1
    ) t
    WHERE ym IS NOT NULL
    ORDER BY ym ASC
  `, [storeId]);

  return rows
    .map((row) => {
      const [yearText, monthText] = String(row.ym).split('-');
      return { year: Number(yearText), month: Number(monthText) };
    })
    .filter((period) => monthToComparableValue(period) <= currentComparable);
}

async function closePendingMonths(current, storeId = 1) {
  const monthsToProcess = await getActivityMonthsBefore(current, storeId);
  if (monthsToProcess.length === 0) return [];

  const processed = [];
  for (const monthCursor of monthsToProcess) {
    const snapshot = await computeMonthlySnapshot(monthCursor.year, monthCursor.month, storeId);
    await upsertSnapshot(snapshot);
    processed.push({ year: monthCursor.year, month: monthCursor.month });
  }

  return processed;
}

async function ensureFinancialHistoryUpToDate(referenceNowStr = null, storeId = 1) {
  if (closeProcessPromise) {
    return closeProcessPromise;
  }

  closeProcessPromise = (async () => {
    try {
      const nowStr = referenceNowStr || await getTrustedNowSqlite();
      const current = parseYearMonth(nowStr);
      const createdMonths = await closePendingMonths(current, storeId);

      return {
        nowSqlite: nowStr,
        createdMonths,
      };
    } catch (err) {
      console.warn('[FINANCIAL_HISTORY] Erro ao sincronizar fechamento mensal:', err.message);
      return { nowSqlite: new Date().toISOString(), createdMonths: [] };
    }
  })();

  try {
    return await closeProcessPromise;
  } finally {
    closeProcessPromise = null;
  }
}

module.exports = {
  computeMonthlySnapshot,
  ensureFinancialHistoryUpToDate,
  getMonthDateRangeForSqlite,
};
