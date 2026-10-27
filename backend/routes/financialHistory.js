const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { getTrustedNowSqlite } = require('../utils/time');
const { computeMonthlySnapshot, ensureFinancialHistoryUpToDate, getMonthDateRangeForSqlite } = require('../utils/financialHistory');

const router = express.Router();
router.use(authenticate);

const MONTH_LABELS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function normalizeQueryValue(value) {
  return String(value || '').trim().toLowerCase();
}

function applyQuickSearch(rows, query) {
  if (!query) return rows;

  return rows.filter((row) => {
    const label = `${MONTH_LABELS[row.month - 1] || row.month}/${row.year}`.toLowerCase();
    const periodIso = `${row.year}-${String(row.month).padStart(2, '0')}`;
    return label.includes(query) || periodIso.includes(query) || String(row.year).includes(query);
  });
}

function parseOptionalInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function formatHistoryItem(row, isCurrentMonth = false) {
  const monthLabel = MONTH_LABELS[row.month - 1] || `Mês ${row.month}`;
  return {
    ...row,
    month_label: monthLabel,
    period_label: `${monthLabel}/${row.year}`,
    is_current_month: isCurrentMonth,
  };
}

function comparePeriods(left, right) {
  if (left.year !== right.year) return left.year - right.year;
  return left.month - right.month;
}

function parseYearMonthKey(value) {
  const [yearText, monthText] = String(value || '').split('-');
  return { year: Number(yearText), month: Number(monthText) };
}

function getOpenPeriods(current, storeId = 1) {
  const rows = db.prepare(`
    SELECT DISTINCT ym
    FROM (
      SELECT strftime('%Y-%m', entry_date) AS ym FROM service_orders WHERE store_id = ?
      UNION ALL
      SELECT strftime('%Y-%m', created_at) AS ym FROM store_sales WHERE store_id = ? AND COALESCE(is_canceled, 0) = 0
      UNION ALL
      SELECT strftime('%Y-%m', withdrawal_date) AS ym FROM cash_withdrawals WHERE store_id = ?
    )
    WHERE ym IS NOT NULL
  `).all(storeId, storeId, storeId);

  const periods = new Map();
  periods.set(`${current.year}-${current.month}`, current);

  for (const row of rows) {
    const period = parseYearMonthKey(row.ym);
    if (!Number.isInteger(period.year) || !Number.isInteger(period.month)) continue;
    if (comparePeriods(period, current) >= 0) {
      periods.set(`${period.year}-${period.month}`, period);
    }
  }

  return [...periods.values()].sort((left, right) => comparePeriods(right, left));
}

function getClosedSnapshots(current, storeId = 1) {
  return db.prepare(`
    SELECT *
    FROM financial_history
    WHERE store_id = ? AND (year < ? OR (year = ? AND month < ?))
    ORDER BY year DESC, month DESC
  `).all(storeId, current.year, current.year, current.month);
}

router.get('/', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const trustedNow = await getTrustedNowSqlite();
    await ensureFinancialHistoryUpToDate(trustedNow, storeId);
    const currentPeriod = getMonthDateRangeForSqlite(trustedNow);

    const filterYear = parseOptionalInt(req.query.year);
    const filterMonth = parseOptionalInt(req.query.month);
    const quickSearch = normalizeQueryValue(req.query.q);

    const closedSnapshots = getClosedSnapshots(currentPeriod, storeId);
    const openPeriods = getOpenPeriods(currentPeriod, storeId).filter((period) => {
      if (filterYear && period.year !== filterYear) return false;
      if (filterMonth && period.month !== filterMonth) return false;
      return true;
    });

    const openItems = openPeriods.map((period) => {
      const liveSnapshot = computeMonthlySnapshot(period.year, period.month, storeId);
      return formatHistoryItem({
        id: `live-${period.year}-${String(period.month).padStart(2, '0')}`,
        created_at: trustedNow,
        ...liveSnapshot,
      }, true);
    });

    const closedItems = closedSnapshots
      .filter((row) => {
        if (filterYear && row.year !== filterYear) return false;
        if (filterMonth && row.month !== filterMonth) return false;
        return true;
      })
      .map((row) => formatHistoryItem(row, false));

    const items = [...openItems, ...closedItems].sort((left, right) => {
      if (left.year !== right.year) return right.year - left.year;
      return right.month - left.month;
    });

    const filteredRows = applyQuickSearch(items, quickSearch);

    const availableYears = db.prepare(`
      SELECT DISTINCT year
      FROM financial_history
      WHERE store_id = ?
      ORDER BY year DESC
    `).all(storeId).map((row) => row.year);

    if (!availableYears.includes(currentPeriod.year)) {
      availableYears.unshift(currentPeriod.year);
    }

    res.json({
      items: filteredRows,
      filters: {
        years: availableYears,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const trustedNow = await getTrustedNowSqlite();
    await ensureFinancialHistoryUpToDate(trustedNow, storeId);
    const currentPeriod = getMonthDateRangeForSqlite(trustedNow);

    const paramId = String(req.params.id || '').trim();
    const liveMatch = paramId.match(/^live-(\d{4})-(\d{2})$/);
    if (liveMatch) {
      const period = { year: Number(liveMatch[1]), month: Number(liveMatch[2]) };
      if (comparePeriods(period, currentPeriod) < 0) {
        return res.status(404).json({ error: 'Registro não encontrado nesta loja.' });
      }

      return res.json(formatHistoryItem({
        id: paramId,
        created_at: trustedNow,
        ...computeMonthlySnapshot(period.year, period.month, storeId),
      }, true));
    }

    const id = Number(paramId);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido.' });
    }

    const row = db.prepare('SELECT * FROM financial_history WHERE id = ? AND store_id = ?').get(id, storeId);
    if (!row) {
      return res.status(404).json({ error: 'Registro não encontrado nesta loja.' });
    }

    return res.json(formatHistoryItem(row, false));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
