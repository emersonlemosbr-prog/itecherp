function calculateFinancialSummary(db, startDate, nextStartDate, { includeProfit = true, storeId = 1 } = {}) {
  const serviceRevenue = Number(db.prepare(`
    SELECT COALESCE(SUM(service_price), 0) AS total
    FROM service_orders
    WHERE (store_id = ? OR store_id IS NULL)
      AND payment_status IN ('paid', 'credit_account')
      AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) >= date(?)
      AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) < date(?)
  `).get(storeId, startDate, nextStartDate).total);

  const storeRevenue = Number(db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) AS total
    FROM store_sales
    WHERE (store_id = ? OR store_id IS NULL)
      AND COALESCE(is_canceled, 0) = 0
      AND date(created_at) >= date(?)
      AND date(created_at) < date(?)
  `).get(storeId, startDate, nextStartDate).total);

  const pendingRevenue = Number(db.prepare(`
    SELECT COALESCE(SUM(service_price), 0) AS total
    FROM service_orders
    WHERE (store_id = ? OR store_id IS NULL)
      AND payment_status IN ('pending', 'credit_account')
      AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) >= date(?)
      AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) < date(?)
  `).get(storeId, startDate, nextStartDate).total);

  const serviceProfit = includeProfit ? Number(db.prepare(`
    SELECT COALESCE(SUM(profit), 0) AS total
    FROM service_orders
    WHERE (store_id = ? OR store_id IS NULL)
      AND payment_status IN ('paid', 'credit_account')
      AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) >= date(?)
      AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) < date(?)
  `).get(storeId, startDate, nextStartDate).total) : null;

  const storeProfit = includeProfit ? Number(db.prepare(`
    SELECT COALESCE(SUM((i.unit_price - COALESCE(i.cost_price, 0)) * i.quantity), 0) AS total
    FROM store_sale_items i
    JOIN store_sales s ON s.id = i.sale_id
    WHERE (s.store_id = ? OR s.store_id IS NULL)
      AND COALESCE(s.is_canceled, 0) = 0
      AND COALESCE(i.is_canceled, 0) = 0
      AND date(s.created_at) >= date(?)
      AND date(s.created_at) < date(?)
  `).get(storeId, startDate, nextStartDate).total) : null;

  const cashWithdrawals = includeProfit ? Number(db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM cash_withdrawals
    WHERE (store_id = ? OR store_id IS NULL)
      AND date(withdrawal_date) >= date(?)
      AND date(withdrawal_date) < date(?)
  `).get(storeId, startDate, nextStartDate).total) : null;

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
