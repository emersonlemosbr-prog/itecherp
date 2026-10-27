// routes/dashboard.js
const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { getTrustedNowSqlite } = require('../utils/time');
const { ensureFinancialHistoryUpToDate, getMonthDateRangeForSqlite } = require('../utils/financialHistory');
const { calculateFinancialSummary } = require('../services/financialSummary');

const router = express.Router();
router.use(authenticate);

router.get('/stats', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const trustedNow = await getTrustedNowSqlite();
    await ensureFinancialHistoryUpToDate(trustedNow, storeId);
    const { startDate, nextStartDate } = getMonthDateRangeForSqlite(trustedNow);
    const isAdmin = req.user.role === 'admin';
    const summary = calculateFinancialSummary(db, startDate, nextStartDate, { includeProfit: isAdmin, storeId });

    const creditAccountsOpen = db.prepare(`
      SELECT COALESCE(SUM(amount),0) as total
      FROM credit_accounts
      WHERE store_id = ?
        AND status='open'
        AND date(created_at) >= date(?)
        AND date(created_at) < date(?)
    `).get(storeId, startDate, nextStartDate).total;

    const statusCounts = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM service_orders
      WHERE store_id = ?
        AND date(entry_date) >= date(?)
        AND date(entry_date) < date(?)
      GROUP BY status
    `).all(storeId, startDate, nextStartDate);

    const salesDayRevenueRow = db.prepare(`
      SELECT COALESCE(
        (
          SELECT SUM(service_price)
          FROM service_orders
          WHERE store_id = ?
            AND payment_status IN ('paid', 'credit_account')
            AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) = date(?)
        ), 0
      ) as total
    `).get(storeId, trustedNow);
    const salesDayRevenue = Number(salesDayRevenueRow?.total || 0);

    const salesMonthRevenueRow = db.prepare(`
      SELECT COALESCE(
        (
          SELECT SUM(service_price)
          FROM service_orders
          WHERE store_id = ?
            AND payment_status IN ('paid', 'credit_account')
            AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) >= date(?)
            AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) < date(?)
        ), 0
      ) as total
    `).get(storeId, startDate, nextStartDate);
    const salesMonthRevenue = Number(salesMonthRevenueRow?.total || 0);

    const salesStats = db.prepare(`
      SELECT
        COUNT(*) as sales_count,
        COALESCE(AVG(total_amount), 0) as avg_ticket
      FROM store_sales
      WHERE store_id = ?
        AND COALESCE(is_canceled, 0) = 0
        AND date(created_at) >= date(?)
        AND date(created_at) < date(?)
    `).get(storeId, startDate, nextStartDate);

    const productsSold = db.prepare(`
      SELECT COALESCE(SUM(i.quantity), 0) as qty
      FROM store_sale_items i
      JOIN store_sales s ON s.id = i.sale_id
      WHERE s.store_id = ?
        AND COALESCE(s.is_canceled, 0) = 0
        AND COALESCE(i.is_canceled, 0) = 0
        AND date(s.created_at) >= date(?)
        AND date(s.created_at) < date(?)
    `).get(storeId, startDate, nextStartDate).qty;

    const statusMap = Object.fromEntries(statusCounts.map(s => [s.status, s.count]));

    res.json({
      total_revenue: summary.totalRevenue,
      pending_revenue: summary.pendingRevenue,
      total_profit: summary.totalProfit,
      cash_withdrawals: summary.cashWithdrawals,
      credit_accounts_open: creditAccountsOpen,
      repairs_in_progress: (statusMap.diagnosis || 0) + (statusMap.waiting_parts || 0) + (statusMap.repairing || 0),
      repairs_ready: statusMap.ready || 0,
      repairs_completed: statusMap.delivered || 0,
      repairs_not_performed: statusMap.not_performed || 0,
      status_distribution: statusMap,
      sales_day_revenue: salesDayRevenue,
      sales_month_revenue: salesMonthRevenue,
      sales_total_revenue: salesMonthRevenue,
      sales_count: salesStats.sales_count,
      sales_avg_ticket: salesStats.avg_ticket,
      products_sold: productsSold,
      sales_profit: summary.storeProfit,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/charts/daily-revenue', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const trustedNow = await getTrustedNowSqlite();
    const { startDate } = getMonthDateRangeForSqlite(trustedNow);
    const rows = db.prepare(`
      SELECT day, COALESCE(SUM(revenue), 0) as revenue
      FROM (
        SELECT date(COALESCE(NULLIF(delivery_date, ''), entry_date)) as day, COALESCE(SUM(service_price),0) as revenue
        FROM service_orders
        WHERE store_id = ?
          AND payment_status IN ('paid','credit_account')
          AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) >= date(?)
          AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) <= date(?)
        GROUP BY date(COALESCE(NULLIF(delivery_date, ''), entry_date))

        UNION ALL

        SELECT date(created_at) as day, COALESCE(SUM(total_amount),0) as revenue
        FROM store_sales
        WHERE store_id = ?
          AND date(created_at) >= date(?)
          AND date(created_at) <= date(?)
          AND COALESCE(is_canceled, 0) = 0
        GROUP BY date(created_at)
      ) grouped
      GROUP BY day
      ORDER BY day ASC
    `).all(storeId, startDate, trustedNow, storeId, startDate, trustedNow);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/charts/monthly-revenue', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const trustedNow = await getTrustedNowSqlite();
    const { startDate, nextStartDate } = getMonthDateRangeForSqlite(trustedNow);
    const rows = db.prepare(`
      SELECT strftime('%Y-%m', ?) as month,
             COALESCE(service_revenue, 0) + COALESCE(store_revenue, 0) as revenue,
             COALESCE(service_profit, 0) + COALESCE(store_profit, 0) as profit
      FROM (
        SELECT
          (
            SELECT COALESCE(SUM(service_price), 0)
            FROM service_orders
            WHERE store_id = ?
              AND payment_status IN ('paid', 'credit_account')
              AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) >= date(?)
              AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) < date(?)
          ) as service_revenue,
          (
            SELECT COALESCE(SUM(profit), 0)
            FROM service_orders
            WHERE store_id = ?
              AND payment_status IN ('paid', 'credit_account')
              AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) >= date(?)
              AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) < date(?)
          ) as service_profit,
          (
            SELECT COALESCE(SUM(total_amount), 0)
            FROM store_sales
            WHERE store_id = ?
              AND COALESCE(is_canceled, 0) = 0
              AND date(created_at) >= date(?)
              AND date(created_at) < date(?)
          ) as store_revenue,
          (
            SELECT COALESCE(SUM((i.unit_price - COALESCE(i.cost_price, 0)) * i.quantity), 0)
            FROM store_sale_items i
            JOIN store_sales s ON s.id = i.sale_id
            WHERE s.store_id = ?
              AND COALESCE(s.is_canceled, 0) = 0
              AND COALESCE(i.is_canceled, 0) = 0
              AND date(s.created_at) >= date(?)
              AND date(s.created_at) < date(?)
          ) as store_profit
      )
    `).all(
      trustedNow,
      storeId, startDate, nextStartDate,
      storeId, startDate, nextStartDate,
      storeId, startDate, nextStartDate,
      storeId, startDate, nextStartDate
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/charts/payment-methods', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const trustedNow = await getTrustedNowSqlite();
    const { startDate, nextStartDate } = getMonthDateRangeForSqlite(trustedNow);
    const rows = db.prepare(`
      SELECT payment_method, COUNT(*) as count, COALESCE(SUM(service_price),0) as total
      FROM service_orders
      WHERE store_id = ?
        AND date(entry_date) >= date(?)
        AND date(entry_date) < date(?)
      GROUP BY payment_method
    `).all(storeId, startDate, nextStartDate);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/charts/status-distribution', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const trustedNow = await getTrustedNowSqlite();
    const { startDate, nextStartDate } = getMonthDateRangeForSqlite(trustedNow);
    const rows = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM service_orders
      WHERE store_id = ?
        AND date(entry_date) >= date(?)
        AND date(entry_date) < date(?)
      GROUP BY status
    `).all(storeId, startDate, nextStartDate);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/charts/cash-flow', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const trustedNow = await getTrustedNowSqlite();
    const { startDate, nextStartDate } = getMonthDateRangeForSqlite(trustedNow);
    const revenueByDay = db.prepare(`
      SELECT date(COALESCE(NULLIF(delivery_date, ''), entry_date)) as day, COALESCE(SUM(service_price),0) as inflow
      FROM service_orders
      WHERE store_id = ?
        AND payment_status IN ('paid','credit_account')
        AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) >= date(?)
        AND date(COALESCE(NULLIF(delivery_date, ''), entry_date)) < date(?)
      GROUP BY date(COALESCE(NULLIF(delivery_date, ''), entry_date))
    `).all(storeId, startDate, nextStartDate);
    const withdrawalsByDay = db.prepare(`
      SELECT withdrawal_date as day, COALESCE(SUM(amount),0) as outflow
      FROM cash_withdrawals
      WHERE store_id = ?
        AND date(withdrawal_date) >= date(?)
        AND date(withdrawal_date) < date(?)
      GROUP BY withdrawal_date
    `).all(storeId, startDate, nextStartDate);

    const map = {};
    revenueByDay.forEach(r => { map[r.day] = { day: r.day, inflow: r.inflow, outflow: 0 }; });
    withdrawalsByDay.forEach(r => {
      if (!map[r.day]) map[r.day] = { day: r.day, inflow: 0, outflow: 0 };
      map[r.day].outflow = r.outflow;
    });

    res.json(Object.values(map).sort((a, b) => a.day.localeCompare(b.day)));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
