const db = require('../db/database');
const { getTrustedNowSqlite } = require('./time');
const { calculateFinancialSummary } = require('../services/financialSummary');

const CARD_METHODS = new Set(['credit_card', 'debit_card']);

let closeProcessPromise = null;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function parseYearMonth(nowSqlite) {
  const [yearText, monthText] = String(nowSqlite || '').slice(0, 7).split('-');
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

function getMonthDateRangeForSqlite(nowSqlite) {
  const current = parseYearMonth(nowSqlite);
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

function computeMonthlySnapshot(year, month, storeId = 1) {
  const startDate = getMonthStartDate(year, month);
  const next = getNextYearMonth(year, month);
  const nextStartDate = getMonthStartDate(next.year, next.month);

  const summary = calculateFinancialSummary(db, startDate, nextStartDate, { storeId });

  const serviceStats = db.prepare(`
    SELECT
      COUNT(*) AS total_services
    FROM service_orders
    WHERE (store_id = ? OR store_id IS NULL)
      AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) >= date(?)
      AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) < date(?)
  `).get(storeId, startDate, nextStartDate);

  const storeStats = db.prepare(`
    SELECT COUNT(*) AS total_sales
    FROM store_sales
    WHERE (store_id = ? OR store_id IS NULL)
      AND COALESCE(is_canceled, 0) = 0
      AND date(created_at) >= date(?)
      AND date(created_at) < date(?)
  `).get(storeId, startDate, nextStartDate);

  const expenses = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN w.source_type = 'service_order_part'
        AND so.payment_status IN ('paid', 'credit_account')
        AND date(COALESCE(NULLIF(so.delivery_date, ''), so.entry_date)) >= date(?)
        AND date(COALESCE(NULLIF(so.delivery_date, ''), so.entry_date)) < date(?)
        THEN w.amount ELSE 0 END), 0) AS already_in_service_profit
    FROM cash_withdrawals w
    LEFT JOIN service_orders so ON so.id = w.service_order_id AND (so.store_id = w.store_id OR w.store_id IS NULL OR so.store_id IS NULL)
    WHERE (w.store_id = ? OR w.store_id IS NULL)
      AND date(w.withdrawal_date) >= date(?)
      AND date(w.withdrawal_date) < date(?)
  `).get(startDate, nextStartDate, storeId, startDate, nextStartDate);

  const servicePayments = db.prepare(`
    SELECT payment_method, COALESCE(SUM(service_price), 0) AS total
    FROM service_orders
    WHERE (store_id = ? OR store_id IS NULL)
      AND payment_status = 'paid'
      AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) >= date(?)
      AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) < date(?)
    GROUP BY payment_method
  `).all(storeId, startDate, nextStartDate);

  const storePayments = db.prepare(`
    SELECT payment_method, COALESCE(SUM(total_amount), 0) AS total
    FROM store_sales
    WHERE (store_id = ? OR store_id IS NULL)
      AND COALESCE(is_canceled, 0) = 0
      AND date(created_at) >= date(?)
      AND date(created_at) < date(?)
    GROUP BY payment_method
  `).all(storeId, startDate, nextStartDate);

  const paymentBuckets = sumByPaymentBucket([...servicePayments, ...storePayments]);

  const received = paymentBuckets.cash + paymentBuckets.pix + paymentBuckets.card + paymentBuckets.other;
  const pending = summary.pendingRevenue;
  const revenue = summary.totalRevenue;
  const profit = summary.totalProfit;
  const totalServices = Number(serviceStats.total_services) || 0;
  const totalSales = Number(storeStats.total_sales) || 0;
  const ordersCount = totalServices + totalSales;
  const averageTicket = ordersCount > 0 ? revenue / ordersCount : 0;
  const netProfit = profit - (summary.cashWithdrawals - Number(expenses.already_in_service_profit));

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

function upsertSnapshot(snapshot) {
  return db.prepare(`
    INSERT INTO financial_history (
      store_id, month, year, revenue, received, pending, profit, net_profit,
      total_services, total_sales, average_ticket,
      cash_total, pix_total, card_total, other_total, expenses,
      opened_at, closed_at
    ) VALUES (
      @store_id, @month, @year, @revenue, @received, @pending, @profit, @net_profit,
      @total_services, @total_sales, @average_ticket,
      @cash_total, @pix_total, @card_total, @other_total, @expenses,
      @opened_at, @closed_at
    )
    ON CONFLICT(store_id, year, month) DO UPDATE SET
      revenue = excluded.revenue,
      received = excluded.received,
      pending = excluded.pending,
      profit = excluded.profit,
      net_profit = excluded.net_profit,
      total_services = excluded.total_services,
      total_sales = excluded.total_sales,
      average_ticket = excluded.average_ticket,
      cash_total = excluded.cash_total,
      pix_total = excluded.pix_total,
      card_total = excluded.card_total,
      other_total = excluded.other_total,
      expenses = excluded.expenses,
      opened_at = excluded.opened_at,
      closed_at = excluded.closed_at
  `).run(snapshot);
}

function getActivityMonthsBefore(current, storeId = 1) {
  const currentComparable = monthToComparableValue(current);

  const rows = db.prepare(`
    SELECT DISTINCT ym
    FROM (
      SELECT strftime('%Y-%m', COALESCE(NULLIF(delivery_date, ''), entry_date)) AS ym FROM service_orders WHERE store_id = ?
      UNION ALL
      SELECT strftime('%Y-%m', created_at) AS ym FROM store_sales WHERE store_id = ? AND COALESCE(is_canceled, 0) = 0
      UNION ALL
      SELECT strftime('%Y-%m', withdrawal_date) AS ym FROM cash_withdrawals WHERE store_id = ?
    )
    WHERE ym IS NOT NULL
    ORDER BY ym ASC
  `).all(storeId, storeId, storeId);

  return rows
    .map((row) => {
      const [yearText, monthText] = String(row.ym).split('-');
      return { year: Number(yearText), month: Number(monthText) };
    })
    .filter((period) => monthToComparableValue(period) <= currentComparable);
}

function closePendingMonths(current, storeId = 1) {
  const monthsToProcess = getActivityMonthsBefore(current, storeId);
  if (monthsToProcess.length === 0) return [];

  const runInTransaction = db.transaction((months) => {
    const processed = [];

    for (const monthCursor of months) {
      const snapshot = computeMonthlySnapshot(monthCursor.year, monthCursor.month, storeId);
      upsertSnapshot(snapshot);
      processed.push({ year: monthCursor.year, month: monthCursor.month });
    }

    return processed;
  });

  return runInTransaction(monthsToProcess);
}

async function ensureFinancialHistoryUpToDate(referenceNowSqlite = null, storeId = 1) {
  if (closeProcessPromise) {
    return closeProcessPromise;
  }

  closeProcessPromise = (async () => {
    const nowSqlite = referenceNowSqlite || await getTrustedNowSqlite();
    const current = parseYearMonth(nowSqlite);
    const createdMonths = closePendingMonths(current, storeId);

    return {
      nowSqlite,
      createdMonths,
    };
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
