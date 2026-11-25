// services/financialSummary.js
async function calculateFinancialSummary(db, startDate, nextStartDate, { includeProfit = true, storeId = 1 } = {}) {
  const isSqlite = Boolean(db?.isSqlite);
  const soDateExpr = isSqlite ? 'substr(COALESCE(delivery_date, entry_date), 1, 10)' : '(COALESCE(delivery_date, entry_date))::date';
  const saleDateExpr = isSqlite ? 'substr(created_at, 1, 10)' : 'created_at::date';
  const sSaleDateExpr = isSqlite ? 'substr(s.created_at, 1, 10)' : 's.created_at::date';
  const withdrawalDateExpr = isSqlite ? 'substr(withdrawal_date, 1, 10)' : 'withdrawal_date::date';
  const paramCast = isSqlite ? '' : '::date';

  const serviceRevenueRow = await db.queryOne(`
    SELECT COALESCE(SUM(service_price), 0) AS total
    FROM service_orders
    WHERE (store_id = $1 OR store_id IS NULL)
      AND payment_status IN ('paid', 'credit_account')
      AND ${soDateExpr} >= $2${paramCast}
      AND ${soDateExpr} < $3${paramCast}
  `, [storeId, startDate, nextStartDate]);
  const serviceRevenue = Number(serviceRevenueRow?.total || 0);

  const storeRevenueRow = await db.queryOne(`
    SELECT COALESCE(SUM(total_amount), 0) AS total
    FROM store_sales
    WHERE (store_id = $1 OR store_id IS NULL)
      AND COALESCE(is_canceled, 0) = 0
      AND ${saleDateExpr} >= $2${paramCast}
      AND ${saleDateExpr} < $3${paramCast}
  `, [storeId, startDate, nextStartDate]);
  const storeRevenue = Number(storeRevenueRow?.total || 0);

  const pendingRevenueRow = await db.queryOne(`
    SELECT COALESCE(SUM(service_price), 0) AS total
    FROM service_orders
    WHERE (store_id = $1 OR store_id IS NULL)
      AND payment_status IN ('pending', 'credit_account')
      AND ${soDateExpr} >= $2${paramCast}
      AND ${soDateExpr} < $3${paramCast}
  `, [storeId, startDate, nextStartDate]);
  const pendingRevenue = Number(pendingRevenueRow?.total || 0);

  let serviceProfit = null;
  if (includeProfit) {
    const profitRow = await db.queryOne(`
      SELECT COALESCE(SUM(profit), 0) AS total
      FROM service_orders
      WHERE (store_id = $1 OR store_id IS NULL)
        AND payment_status IN ('paid', 'credit_account')
        AND ${soDateExpr} >= $2${paramCast}
        AND ${soDateExpr} < $3${paramCast}
    `, [storeId, startDate, nextStartDate]);
    serviceProfit = Number(profitRow?.total || 0);
  }

  let storeProfit = null;
  if (includeProfit) {
    const storeProfitRow = await db.queryOne(`
      SELECT COALESCE(SUM((i.unit_price - COALESCE(i.cost_price, 0)) * i.quantity), 0) AS total
      FROM store_sale_items i
      JOIN store_sales s ON s.id = i.sale_id
      WHERE (s.store_id = $1 OR s.store_id IS NULL)
        AND COALESCE(s.is_canceled, 0) = 0
        AND COALESCE(i.is_canceled, 0) = 0
        AND ${sSaleDateExpr} >= $2${paramCast}
        AND ${sSaleDateExpr} < $3${paramCast}
    `, [storeId, startDate, nextStartDate]);
    storeProfit = Number(storeProfitRow?.total || 0);
  }

  let cashWithdrawals = null;
  if (includeProfit) {
    const cashRow = await db.queryOne(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM cash_withdrawals
      WHERE (store_id = $1 OR store_id IS NULL)
        AND ${withdrawalDateExpr} >= $2${paramCast}
        AND ${withdrawalDateExpr} < $3${paramCast}
    `, [storeId, startDate, nextStartDate]);
    cashWithdrawals = Number(cashRow?.total || 0);
  }

  return {
    serviceRevenue,
    storeRevenue,
    totalRevenue: serviceRevenue + storeRevenue,
    pendingRevenue,
    serviceProfit,
    storeProfit,
    totalProfit: includeProfit ? serviceProfit + storeProfit : null,
    cashWithdrawals,
  };
}

module.exports = { calculateFinancialSummary };
