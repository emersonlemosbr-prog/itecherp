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
    const summary = await calculateFinancialSummary(db, startDate, nextStartDate, { includeProfit: isAdmin, storeId });

    const creditAccountsRow = await db.queryOne(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM credit_accounts
      WHERE store_id = $1
        AND status = 'open'
        AND created_at::date >= $2::date
        AND created_at::date < $3::date
    `, [storeId, startDate, nextStartDate]);
    const creditAccountsOpen = parseFloat(creditAccountsRow?.total || 0);

    const statusCounts = await db.query(`
      SELECT status, COUNT(*) as count
      FROM service_orders
      WHERE store_id = $1
        AND entry_date::date >= $2::date
        AND entry_date::date < $3::date
      GROUP BY status
    `, [storeId, startDate, nextStartDate]);

    const salesDayRevenueRow = await db.queryOne(`
      SELECT COALESCE(
        (
          SELECT SUM(service_price)
          FROM service_orders
          WHERE store_id = $1
            AND payment_status IN ('paid', 'credit_account')
            AND COALESCE(delivery_date, entry_date)::date = $2::date
        ), 0
      ) as total
    `, [storeId, trustedNow]);
    const salesDayRevenue = Number(salesDayRevenueRow?.total || 0);

    const salesMonthRevenueRow = await db.queryOne(`
      SELECT COALESCE(
        (
          SELECT SUM(service_price)
          FROM service_orders
          WHERE store_id = $1
            AND payment_status IN ('paid', 'credit_account')
            AND COALESCE(delivery_date, entry_date)::date >= $2::date
            AND COALESCE(delivery_date, entry_date)::date < $3::date
        ), 0
      ) as total
    `, [storeId, startDate, nextStartDate]);
    const salesMonthRevenue = Number(salesMonthRevenueRow?.total || 0);

    const salesStatsRow = await db.queryOne(`
      SELECT
        COUNT(*) as sales_count,
        COALESCE(AVG(total_amount), 0) as avg_ticket
      FROM store_sales
      WHERE store_id = $1
        AND COALESCE(is_canceled, 0) = 0
        AND created_at::date >= $2::date
        AND created_at::date < $3::date
    `, [storeId, startDate, nextStartDate]);

    const productsSoldRow = await db.queryOne(`
      SELECT COALESCE(SUM(i.quantity), 0) as qty
      FROM store_sale_items i
      JOIN store_sales s ON s.id = i.sale_id
      WHERE s.store_id = $1
        AND COALESCE(s.is_canceled, 0) = 0
        AND COALESCE(i.is_canceled, 0) = 0
        AND s.created_at::date >= $2::date
        AND s.created_at::date < $3::date
    `, [storeId, startDate, nextStartDate]);
    const productsSold = parseInt(productsSoldRow?.qty || 0, 10);

    const statusMap = Object.fromEntries(statusCounts.map(s => [s.status, parseInt(s.count, 10)]));

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
      sales_count: parseInt(salesStatsRow?.sales_count || 0, 10),
      sales_avg_ticket: parseFloat(salesStatsRow?.avg_ticket || 0),
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
    const rows = await db.query(`
      SELECT day::text, COALESCE(SUM(revenue), 0) as revenue
      FROM (
        SELECT COALESCE(delivery_date, entry_date)::date as day, COALESCE(SUM(service_price), 0) as revenue
        FROM service_orders
        WHERE store_id = $1
          AND payment_status IN ('paid', 'credit_account')
          AND COALESCE(delivery_date, entry_date)::date >= $2::date
          AND COALESCE(delivery_date, entry_date)::date <= $3::date
        GROUP BY COALESCE(delivery_date, entry_date)::date

        UNION ALL

        SELECT created_at::date as day, COALESCE(SUM(total_amount), 0) as revenue
        FROM store_sales
        WHERE store_id = $1
          AND created_at::date >= $2::date
          AND created_at::date <= $3::date
          AND COALESCE(is_canceled, 0) = 0
        GROUP BY created_at::date
      ) grouped
      GROUP BY day
      ORDER BY day ASC
    `, [storeId, startDate, trustedNow]);
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
    const rows = await db.query(`
      SELECT TO_CHAR($1::timestamptz, 'YYYY-MM') as month,
             COALESCE(service_revenue, 0) + COALESCE(store_revenue, 0) as revenue,
             COALESCE(service_profit, 0) + COALESCE(store_profit, 0) as profit
      FROM (
        SELECT
          (
            SELECT COALESCE(SUM(service_price), 0)
            FROM service_orders
            WHERE store_id = $2
              AND payment_status IN ('paid', 'credit_account')
              AND COALESCE(delivery_date, entry_date)::date >= $3::date
              AND COALESCE(delivery_date, entry_date)::date < $4::date
          ) as service_revenue,
          (
            SELECT COALESCE(SUM(profit), 0)
            FROM service_orders
            WHERE store_id = $2
              AND payment_status IN ('paid', 'credit_account')
              AND COALESCE(delivery_date, entry_date)::date >= $3::date
              AND COALESCE(delivery_date, entry_date)::date < $4::date
          ) as service_profit,
          (
            SELECT COALESCE(SUM(total_amount), 0)
            FROM store_sales
            WHERE store_id = $2
              AND COALESCE(is_canceled, 0) = 0
              AND created_at::date >= $3::date
              AND created_at::date < $4::date
          ) as store_revenue,
          (
            SELECT COALESCE(SUM((i.unit_price - COALESCE(i.cost_price, 0)) * i.quantity), 0)
            FROM store_sale_items i
            JOIN store_sales s ON s.id = i.sale_id
            WHERE s.store_id = $2
              AND COALESCE(s.is_canceled, 0) = 0
              AND COALESCE(i.is_canceled, 0) = 0
              AND s.created_at::date >= $3::date
              AND s.created_at::date < $4::date
          ) as store_profit
      ) sub
    `, [trustedNow, storeId, startDate, nextStartDate]);
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
    const rows = await db.query(`
      SELECT payment_method, COUNT(*) as count, COALESCE(SUM(service_price), 0) as total
      FROM service_orders
      WHERE store_id = $1
        AND entry_date::date >= $2::date
        AND entry_date::date < $3::date
      GROUP BY payment_method
    `, [storeId, startDate, nextStartDate]);
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
    const rows = await db.query(`
      SELECT status, COUNT(*) as count
      FROM service_orders
      WHERE store_id = $1
        AND entry_date::date >= $2::date
        AND entry_date::date < $3::date
      GROUP BY status
    `, [storeId, startDate, nextStartDate]);
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
    const revenueByDay = await db.query(`
      SELECT COALESCE(delivery_date, entry_date)::date::text as day, COALESCE(SUM(service_price), 0) as inflow
      FROM service_orders
      WHERE store_id = $1
        AND payment_status IN ('paid', 'credit_account')
        AND COALESCE(delivery_date, entry_date)::date >= $2::date
        AND COALESCE(delivery_date, entry_date)::date < $3::date
      GROUP BY COALESCE(delivery_date, entry_date)::date
    `, [storeId, startDate, nextStartDate]);

    const withdrawalsByDay = await db.query(`
      SELECT withdrawal_date::date::text as day, COALESCE(SUM(amount), 0) as outflow
      FROM cash_withdrawals
      WHERE store_id = $1
        AND withdrawal_date::date >= $2::date
        AND withdrawal_date::date < $3::date
      GROUP BY withdrawal_date::date
    `, [storeId, startDate, nextStartDate]);

    const map = {};
    revenueByDay.forEach(r => { map[r.day] = { day: r.day, inflow: parseFloat(r.inflow), outflow: 0 }; });
    withdrawalsByDay.forEach(r => {
      if (!map[r.day]) map[r.day] = { day: r.day, inflow: 0, outflow: 0 };
      map[r.day].outflow = parseFloat(r.outflow);
    });

    res.json(Object.values(map).sort((a, b) => a.day.localeCompare(b.day)));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
