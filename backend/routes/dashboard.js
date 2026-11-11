// routes/dashboard.js
const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { getTrustedNowSqlite } = require('../utils/time');
const { ensureFinancialHistoryUpToDate, getMonthDateRangeForSqlite } = require('../utils/financialHistory');
const { calculateFinancialSummary } = require('../services/financialSummary');

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Resolve o intervalo de datas (startDate inclusivo, nextStartDate exclusivo)
 * no fuso horário oficial America/Sao_Paulo com base no período solicitado.
 * Suporta:
 *  - 'today': dia corrente em Brasília
 *  - '7d' ou '7days': últimos 7 dias (incluindo hoje)
 *  - 'this_month': do primeiro dia do mês atual até o início do próximo mês (padrão)
 *  - 'last_month': do primeiro dia ao último dia do mês anterior
 *  - 'custom': intervalo [startDate, endDate] informado com validações
 */
function resolvePeriodRange(query, trustedNowStr) {
  const period = String(query.period || 'this_month').toLowerCase();
  // trustedNowStr vem em formato 'YYYY-MM-DD HH:MM:SS' em UTC
  let baseDate;
  if (trustedNowStr) {
    const isoUtc = trustedNowStr.replace(' ', 'T') + (trustedNowStr.endsWith('Z') ? '' : 'Z');
    baseDate = new Date(isoUtc);
    if (Number.isNaN(baseDate.getTime())) baseDate = new Date();
  } else {
    baseDate = new Date();
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(baseDate);
  const m = {};
  for (const p of parts) m[p.type] = p.value;
  const curY = Number(m.year);
  const curM = Number(m.month);
  const curD = Number(m.day);

  if (period === 'today') {
    const todayStr = `${curY}-${pad2(curM)}-${pad2(curD)}`;
    const nextD = new Date(Date.UTC(curY, curM - 1, curD + 1));
    const nextStr = `${nextD.getUTCFullYear()}-${pad2(nextD.getUTCMonth() + 1)}-${pad2(nextD.getUTCDate())}`;
    return { startDate: todayStr, nextStartDate: nextStr, period: 'today' };
  }

  if (period === '7d' || period === '7days') {
    const start7 = new Date(Date.UTC(curY, curM - 1, curD - 6));
    const startStr = `${start7.getUTCFullYear()}-${pad2(start7.getUTCMonth() + 1)}-${pad2(start7.getUTCDate())}`;
    const nextD = new Date(Date.UTC(curY, curM - 1, curD + 1));
    const nextStr = `${nextD.getUTCFullYear()}-${pad2(nextD.getUTCMonth() + 1)}-${pad2(nextD.getUTCDate())}`;
    return { startDate: startStr, nextStartDate: nextStr, period: '7d' };
  }

  if (period === 'last_month') {
    let prevY = curY;
    let prevM = curM - 1;
    if (prevM === 0) {
      prevM = 12;
      prevY -= 1;
    }
    const startStr = `${prevY}-${pad2(prevM)}-01`;
    const nextStr = `${curY}-${pad2(curM)}-01`;
    return { startDate: startStr, nextStartDate: nextStr, period: 'last_month' };
  }

  if (period === 'custom') {
    const customStart = String(query.startDate || '').trim();
    const customEnd = String(query.endDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customStart) || !/^\d{4}-\d{2}-\d{2}$/.test(customEnd)) {
      const err = new Error('Datas inicial e final são obrigatórias no formato AAAA-MM-DD para período personalizado.');
      err.status = 400;
      throw err;
    }
    if (customStart > customEnd) {
      const err = new Error('A data inicial não pode ser posterior à data final.');
      err.status = 400;
      throw err;
    }
    const [eY, eM, eD] = customEnd.split('-').map(Number);
    const nextD = new Date(Date.UTC(eY, eM - 1, eD + 1));
    const nextStr = `${nextD.getUTCFullYear()}-${pad2(nextD.getUTCMonth() + 1)}-${pad2(nextD.getUTCDate())}`;
    return { startDate: customStart, nextStartDate: nextStr, period: 'custom' };
  }

  // Default: this_month
  let nextY = curY;
  let nextM = curM + 1;
  if (nextM === 13) {
    nextM = 1;
    nextY += 1;
  }
  const startStr = `${curY}-${pad2(curM)}-01`;
  const nextStr = `${nextY}-${pad2(nextM)}-01`;
  return { startDate: startStr, nextStartDate: nextStr, period: 'this_month' };
}

const router = express.Router();
router.use(authenticate);

router.get('/stats', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const trustedNow = await getTrustedNowSqlite();
    await ensureFinancialHistoryUpToDate(trustedNow, storeId);
    const { startDate, nextStartDate, period } = resolvePeriodRange(req.query, trustedNow);
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
    const { startDate, nextStartDate } = resolvePeriodRange(req.query, trustedNow);
    const rows = await db.query(`
      SELECT day::text, COALESCE(SUM(revenue), 0) as revenue
      FROM (
        SELECT COALESCE(delivery_date, entry_date)::date as day, COALESCE(SUM(service_price), 0) as revenue
        FROM service_orders
        WHERE store_id = $1
          AND payment_status IN ('paid', 'credit_account')
          AND COALESCE(delivery_date, entry_date)::date >= $2::date
          AND COALESCE(delivery_date, entry_date)::date < $3::date
        GROUP BY COALESCE(delivery_date, entry_date)::date

        UNION ALL

        SELECT created_at::date as day, COALESCE(SUM(total_amount), 0) as revenue
        FROM store_sales
        WHERE store_id = $1
          AND created_at::date >= $2::date
          AND created_at::date < $3::date
          AND COALESCE(is_canceled, 0) = 0
        GROUP BY created_at::date
      ) grouped
      GROUP BY day
      ORDER BY day ASC
    `, [storeId, startDate, nextStartDate]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/charts/monthly-revenue', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const trustedNow = await getTrustedNowSqlite();
    const { startDate, nextStartDate } = resolvePeriodRange(req.query, trustedNow);
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
    const { startDate, nextStartDate } = resolvePeriodRange(req.query, trustedNow);
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
    const { startDate, nextStartDate } = resolvePeriodRange(req.query, trustedNow);
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
    const { startDate, nextStartDate } = resolvePeriodRange(req.query, trustedNow);
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

/**
 * GET /api/dashboard/details/:indicator
 * Retorna a listagem detalhada e o resumo do indicador selecionado na Dashboard,
 * respeitando o escopo do mês atual e o multi-tenancy (storeId).
 */
router.get('/details/:indicator', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    let indicator = req.params.indicator;
    // Mapeamento de alias para total compatibilidade entre identificadores legados e novos
    const indicatorAliases = {
      'monthly-revenue': 'revenue',
      'revenue': 'revenue',
      'pending-revenue': 'pending-revenue',
      'open-credits': 'open-credits',
      'repairs-in-progress': 'repairs-in-progress',
      'repairs-ready': 'repairs-ready',
      'repairs-completed': 'repairs-completed',
      'repairs-canceled': 'repairs-not-performed',
      'repairs-not-performed': 'repairs-not-performed',
      'sales-volume': 'sales',
      'sales': 'sales',
      'products-volume': 'products',
      'products': 'products',
    };
    if (indicatorAliases[indicator]) {
      indicator = indicatorAliases[indicator];
    }
    const trustedNow = await getTrustedNowSqlite();
    const { startDate, nextStartDate } = resolvePeriodRange(req.query, trustedNow);

    switch (indicator) {
      // 1. Receita total (todas as entradas financeiras: Ordens de Serviço pagas + Vendas de Caixa do mês)
      case 'revenue': {
        const osEntries = await db.query(`
          SELECT
            'service_order' AS origin_type,
            so.id,
            so.order_number,
            CONCAT('OS #', so.order_number, ' - ', COALESCE(so.brand, ''), ' ', COALESCE(so.model, '')) AS title,
            COALESCE(so.description, 'Serviço prestado') AS description,
            so.service_price AS amount,
            COALESCE(so.delivery_date, so.entry_date) AS date,
            so.payment_method,
            so.payment_status,
            COALESCE(so.customer_name_snapshot, CONCAT(c.first_name, ' ', c.last_name)) AS customer_name,
            so.customer_id
          FROM service_orders so
          LEFT JOIN customers c ON c.id = so.customer_id
          WHERE (so.store_id = $1 OR so.store_id IS NULL)
            AND so.payment_status IN ('paid', 'credit_account')
            AND (COALESCE(so.delivery_date, so.entry_date))::date >= $2::date
            AND (COALESCE(so.delivery_date, so.entry_date))::date < $3::date
          ORDER BY date DESC, so.id DESC
        `, [storeId, startDate, nextStartDate]);

        const saleEntries = await db.query(`
          SELECT
            'store_sale' AS origin_type,
            s.id,
            s.sale_number,
            CONCAT('Venda de Caixa #', s.sale_number) AS title,
            'Venda de balcão / produtos' AS description,
            s.total_amount AS amount,
            s.created_at AS date,
            s.payment_method,
            'paid' AS payment_status,
            COALESCE(s.created_by_name_snapshot, u.full_name, 'Vendedor') AS customer_name,
            NULL::int AS customer_id
          FROM store_sales s
          LEFT JOIN users u ON u.id = s.created_by
          WHERE (s.store_id = $1 OR s.store_id IS NULL)
            AND COALESCE(s.is_canceled, 0) = 0
            AND s.created_at::date >= $2::date
            AND s.created_at::date < $3::date
          ORDER BY s.created_at DESC, s.id DESC
        `, [storeId, startDate, nextStartDate]);

        const combined = [...osEntries, ...saleEntries].sort((a, b) => new Date(b.date) - new Date(a.date));
        const totalAmount = combined.reduce((acc, item) => acc + Number(item.amount || 0), 0);

        return res.json({
          indicator,
          title: 'Receita Total',
          subtitle: 'Todas as entradas financeiras que compõem a receita do período',
          total_count: combined.length,
          total_amount: totalAmount,
          has_financial: true,
          records: combined,
        });
      }

      // 2. Receita pendente (OS não pagas com status pending ou credit_account no período)
      case 'pending-revenue': {
        const rows = await db.query(`
          SELECT
            'service_order' AS origin_type,
            so.id,
            so.order_number,
            CONCAT('OS #', so.order_number, ' - ', COALESCE(so.brand, ''), ' ', COALESCE(so.model, '')) AS title,
            COALESCE(so.description, 'Aguardando pagamento') AS description,
            so.service_price AS amount,
            COALESCE(so.delivery_date, so.entry_date) AS date,
            so.payment_method,
            so.payment_status,
            so.status AS order_status,
            COALESCE(so.customer_name_snapshot, CONCAT(c.first_name, ' ', c.last_name)) AS customer_name,
            so.customer_id
          FROM service_orders so
          LEFT JOIN customers c ON c.id = so.customer_id
          WHERE (so.store_id = $1 OR so.store_id IS NULL)
            AND so.payment_status IN ('pending', 'credit_account')
            AND (COALESCE(so.delivery_date, so.entry_date))::date >= $2::date
            AND (COALESCE(so.delivery_date, so.entry_date))::date < $3::date
          ORDER BY date DESC, so.id DESC
        `, [storeId, startDate, nextStartDate]);

        const totalAmount = rows.reduce((acc, item) => acc + Number(item.amount || 0), 0);

        return res.json({
          indicator,
          title: 'Receita Pendente',
          subtitle: 'Valores faturados no período que ainda precisam ser recebidos',
          total_count: rows.length,
          total_amount: totalAmount,
          has_financial: true,
          records: rows,
        });
      }

      // 3. Pendentes em aberto (Contas de clientes em aberto / Fiados gerados no mês)
      case 'open-credits': {
        const rows = await db.query(`
          SELECT
            'credit_account' AS origin_type,
            ca.id,
            ca.service_order_id,
            so.order_number,
            COALESCE(ca.description, 'Saldo pendente') AS title,
            CONCAT('Cliente com prazo · Vencimento: ', COALESCE(ca.pickup_date::text, 'Não definido')) AS description,
            ca.amount,
            ca.created_at AS date,
            ca.pickup_date,
            ca.status,
            COALESCE(ca.customer_name_snapshot, CONCAT(c.first_name, ' ', c.last_name)) AS customer_name,
            ca.customer_id
          FROM credit_accounts ca
          LEFT JOIN customers c ON c.id = ca.customer_id
          LEFT JOIN service_orders so ON so.id = ca.service_order_id
          WHERE ca.store_id = $1
            AND ca.status = 'open'
            AND ca.created_at::date >= $2::date
            AND ca.created_at::date < $3::date
          ORDER BY ca.created_at DESC, ca.id DESC
        `, [storeId, startDate, nextStartDate]);

        const totalAmount = rows.reduce((acc, item) => acc + Number(item.amount || 0), 0);

        return res.json({
          indicator,
          title: 'Pendentes em Aberto',
          subtitle: 'Saldos de clientes em aberto com prazo no período',
          total_count: rows.length,
          total_amount: totalAmount,
          has_financial: true,
          records: rows,
        });
      }

      // 4. Ordens em andamento (status: diagnosis, waiting_parts, repairing)
      case 'repairs-in-progress': {
        const rows = await db.query(`
          SELECT
            'service_order' AS origin_type,
            so.id,
            so.order_number,
            CONCAT('OS #', so.order_number, ' - ', COALESCE(so.brand, ''), ' ', COALESCE(so.model, '')) AS title,
            COALESCE(so.description, 'Em manutenção') AS description,
            so.service_price AS amount,
            so.entry_date AS date,
            so.status AS order_status,
            so.payment_status,
            COALESCE(so.customer_name_snapshot, CONCAT(c.first_name, ' ', c.last_name)) AS customer_name,
            so.customer_id
          FROM service_orders so
          LEFT JOIN customers c ON c.id = so.customer_id
          WHERE (so.store_id = $1 OR so.store_id IS NULL)
            AND so.status IN ('diagnosis', 'waiting_parts', 'repairing')
            AND so.entry_date::date >= $2::date
            AND so.entry_date::date < $3::date
          ORDER BY so.entry_date DESC, so.id DESC
        `, [storeId, startDate, nextStartDate]);

        const totalAmount = rows.reduce((acc, item) => acc + Number(item.amount || 0), 0);

        return res.json({
          indicator,
          title: 'Ordens de Serviço em Andamento',
          subtitle: 'Ordens atualmente em diagnóstico, aguardando peças ou em reparo',
          total_count: rows.length,
          total_amount: totalAmount,
          has_financial: true,
          records: rows,
        });
      }

      // 5. Ordens prontas (status: ready)
      case 'repairs-ready': {
        const rows = await db.query(`
          SELECT
            'service_order' AS origin_type,
            so.id,
            so.order_number,
            CONCAT('OS #', so.order_number, ' - ', COALESCE(so.brand, ''), ' ', COALESCE(so.model, '')) AS title,
            COALESCE(so.description, 'Pronto para entrega') AS description,
            so.service_price AS amount,
            so.entry_date AS date,
            so.status AS order_status,
            so.payment_status,
            COALESCE(so.customer_name_snapshot, CONCAT(c.first_name, ' ', c.last_name)) AS customer_name,
            so.customer_id
          FROM service_orders so
          LEFT JOIN customers c ON c.id = so.customer_id
          WHERE (so.store_id = $1 OR so.store_id IS NULL)
            AND so.status = 'ready'
            AND so.entry_date::date >= $2::date
            AND so.entry_date::date < $3::date
          ORDER BY so.entry_date DESC, so.id DESC
        `, [storeId, startDate, nextStartDate]);

        const totalAmount = rows.reduce((acc, item) => acc + Number(item.amount || 0), 0);

        return res.json({
          indicator,
          title: 'Ordens de Serviço Prontas',
          subtitle: 'Reparos concluídos aguardando retirada ou entrega ao cliente',
          total_count: rows.length,
          total_amount: totalAmount,
          has_financial: true,
          records: rows,
        });
      }

      // 6. Ordens concluídas (status: delivered)
      case 'repairs-completed': {
        const rows = await db.query(`
          SELECT
            'service_order' AS origin_type,
            so.id,
            so.order_number,
            CONCAT('OS #', so.order_number, ' - ', COALESCE(so.brand, ''), ' ', COALESCE(so.model, '')) AS title,
            COALESCE(so.description, 'Entregue ao cliente') AS description,
            so.service_price AS amount,
            COALESCE(so.delivery_date, so.entry_date) AS date,
            so.status AS order_status,
            so.payment_status,
            COALESCE(so.customer_name_snapshot, CONCAT(c.first_name, ' ', c.last_name)) AS customer_name,
            so.customer_id
          FROM service_orders so
          LEFT JOIN customers c ON c.id = so.customer_id
          WHERE (so.store_id = $1 OR so.store_id IS NULL)
            AND so.status = 'delivered'
            AND so.entry_date::date >= $2::date
            AND so.entry_date::date < $3::date
          ORDER BY date DESC, so.id DESC
        `, [storeId, startDate, nextStartDate]);

        const totalAmount = rows.reduce((acc, item) => acc + Number(item.amount || 0), 0);

        return res.json({
          indicator,
          title: 'Ordens de Serviço Concluídas',
          subtitle: 'Ordens de serviço efetivamente entregues e finalizadas no período',
          total_count: rows.length,
          total_amount: totalAmount,
          has_financial: true,
          records: rows,
        });
      }

      // 7. Ordens não realizadas (status: not_performed)
      case 'repairs-not-performed': {
        const rows = await db.query(`
          SELECT
            'service_order' AS origin_type,
            so.id,
            so.order_number,
            CONCAT('OS #', so.order_number, ' - ', COALESCE(so.brand, ''), ' ', COALESCE(so.model, '')) AS title,
            COALESCE(so.description, 'Cancelada / Sem reparo') AS description,
            so.service_price AS amount,
            so.entry_date AS date,
            so.status AS order_status,
            so.payment_status,
            COALESCE(so.customer_name_snapshot, CONCAT(c.first_name, ' ', c.last_name)) AS customer_name,
            so.customer_id
          FROM service_orders so
          LEFT JOIN customers c ON c.id = so.customer_id
          WHERE (so.store_id = $1 OR so.store_id IS NULL)
            AND so.status = 'not_performed'
            AND so.entry_date::date >= $2::date
            AND so.entry_date::date < $3::date
          ORDER BY so.entry_date DESC, so.id DESC
        `, [storeId, startDate, nextStartDate]);

        const totalAmount = rows.reduce((acc, item) => acc + Number(item.amount || 0), 0);

        return res.json({
          indicator,
          title: 'Ordens Não Realizadas',
          subtitle: 'Ordens de serviço canceladas, recusadas ou sem reparo viável',
          total_count: rows.length,
          total_amount: totalAmount,
          has_financial: true,
          records: rows,
        });
      }

      // 8. Vendas do mês (store_sales com seus itens detalhados)
      case 'sales': {
        const sales = await db.query(`
          SELECT
            'store_sale' AS origin_type,
            s.id,
            s.sale_number,
            CONCAT('Venda de Caixa #', s.sale_number) AS title,
            s.total_amount AS amount,
            s.payment_method,
            s.notes,
            s.created_at AS date,
            COALESCE(s.created_by_name_snapshot, u.full_name, 'Vendedor') AS seller_name,
            (
              SELECT json_agg(json_build_object(
                'id', i.id,
                'product_name', i.product_name,
                'quantity', i.quantity,
                'unit_price', i.unit_price,
                'total_price', COALESCE(i.subtotal, (i.unit_price * i.quantity))
              ))
              FROM store_sale_items i
              WHERE i.sale_id = s.id AND COALESCE(i.is_canceled, 0) = 0
            ) AS items
          FROM store_sales s
          LEFT JOIN users u ON u.id = s.created_by
          WHERE (s.store_id = $1 OR s.store_id IS NULL)
            AND COALESCE(s.is_canceled, 0) = 0
            AND s.created_at::date >= $2::date
            AND s.created_at::date < $3::date
          ORDER BY s.created_at DESC, s.id DESC
        `, [storeId, startDate, nextStartDate]);

        const totalAmount = sales.reduce((acc, item) => acc + Number(item.amount || 0), 0);

        return res.json({
          indicator,
          title: 'Vendas Realizadas no Período',
          subtitle: 'Listagem completa das vendas efetuadas com produtos e valores',
          total_count: sales.length,
          total_amount: totalAmount,
          has_financial: true,
          records: sales,
        });
      }

      // 9. Produtos cadastrados no estoque (relação completa dos produtos ativos)
      case 'products': {
        const products = await db.query(`
          SELECT
            'stock_product' AS origin_type,
            p.id,
            p.code,
            p.name,
            p.model,
            p.barcode,
            p.cost_price,
            p.sale_price,
            p.min_stock,
            COALESCE(l.quantity, 0) AS quantity,
            c.name AS category_name,
            s.name AS supplier_name,
            p.updated_at AS date
          FROM stock_products p
          LEFT JOIN stock_levels l ON l.product_id = p.id
          LEFT JOIN stock_categories c ON c.id = p.category_id
          LEFT JOIN stock_suppliers s ON s.id = p.supplier_id
          WHERE (p.store_id = $1 OR p.store_id IS NULL)
            AND p.is_active = 1
          ORDER BY p.name ASC, p.id ASC
        `, [storeId]);

        const totalStockQty = products.reduce((acc, item) => acc + Number(item.quantity || 0), 0);

        return res.json({
          indicator,
          title: 'Produtos em Estoque',
          subtitle: 'Relação de produtos ativos cadastrados no estoque',
          total_count: products.length,
          total_quantity: totalStockQty,
          has_financial: false,
          records: products,
        });
      }

      default:
        return res.status(400).json({ error: 'Indicador de dashboard inválido.' });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
