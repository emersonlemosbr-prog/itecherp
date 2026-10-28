// services/financialSummary.js
async function calculateFinancialSummary(db, startDate, nextStartDate, { includeProfit = true, storeId = 1 } = {}) {
  const serviceRevenueRow = await db.queryOne(`
    SELECT COALESCE(SUM(service_price), 0) AS total
    FROM service_orders
    WHERE (store_id = $1 OR store_id IS NULL)
      AND payment_status IN ('paid', 'credit_account')
      AND (COALESCE(NULLIF(delivery_date, ''), entry_date))::date >= $2::date
      AND (COALESCE(NULLIF(delivery_date, ''), entry_date))::date < $3::date
  `, [storeId, startDate, nextStartDate]);
  const serviceRevenue = Number(serviceRevenueRow?.total || 0);

  const storeRevenueRow = await db.queryOne(`
    SELECT COALESCE(SUM(total_amount), 0) AS total
    FROM store_sales
    WHERE (store_id = $1 OR store_id IS NULL)
      AND COALESCE(is_canceled, 0) = 0
      AND created_at::date >= $2::date
      AND created_at::date < $3::date
  `, [storeId, startDate, nextStartDate]);
  const storeRevenue = Number(storeRevenueRow?.total || 0);

  const pendingRevenueRow = await db.queryOne(`
    SELECT COALESCE(SUM(service_price), 0) AS total
    FROM service_orders
    WHERE (store_id = $1 OR store_id IS NULL)
      AND payment_status IN ('pending', 'credit_account')
      AND (COALESCE(NULLIF(delivery_date, ''), entry_date))::date >= $2::date
      AND (COALESCE(NULLIF(delivery_date, ''), entry_date))::date < $3::date
  `, [storeId, startDate, nextStartDate]);
  const pendingRevenue = Number(pendingRevenueRow?.total || 0);

  let serviceProfit = null;
  if (includeProfit) {
    const profitRow = await db.queryOne(`
      SELECT COALESCE(SUM(profit), 0) AS total
      FROM service_orders
      WHERE (store_id = $1 OR store_id IS NULL)
        AND payment_status IN ('paid', 'credit_account')
        AND (COALESCE(NULLIF(delivery_date, ''), entry_date))::date >= $2::date
        AND (COALESCE(NULLIF(delivery_date, ''), entry_date))::date < $3::date
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
        AND s.created_at::date >= $2::date
        AND s.created_at::date < $3::date
    `, [storeId, startDate, nextStartDate]);
    storeProfit = Number(storeProfitRow?.total || 0);
  }

  let cashWithdrawals = null;
  if (includeProfit) {
    const cashRow = await db.queryOne(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM cash_withdrawals
      WHERE (store_id = $1 OR store_id IS NULL)
        AND withdrawal_date::date >= $2::date
        AND withdrawal_date::date < $3::date
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
