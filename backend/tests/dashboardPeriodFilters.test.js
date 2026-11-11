// backend/tests/dashboardPeriodFilters.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { createStoreWithInitialData } = require('../services/multiTenantService');
const dashboardRouter = require('../routes/dashboard');

test('Dashboard: Validação completa dos 5 filtros de período com dados reais e isolamento multi-tenant', async (t) => {
  const suffixA = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const suffixB = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // 1. Criar lojas usando o serviço oficial do sistema para herdar dados e usuários corretos
  const storeA = await createStoreWithInitialData({
    storeName: 'Loja Alfa Period',
    ownerName: 'Owner Alfa',
    ownerEmail: `alfa_${suffixA}@teste.com`,
    ownerPassword: 'SenhaForteAlfa123!',
    phone: '11999991111',
    nickname: `alfa_${suffixA}`,
    erpPassword: 'SenhaForteAlfa123!',
  });

  const storeB = await createStoreWithInitialData({
    storeName: 'Loja Beta Period',
    ownerName: 'Owner Beta',
    ownerEmail: `beta_${suffixB}@teste.com`,
    ownerPassword: 'SenhaForteBeta123!',
    phone: '11999992222',
    nickname: `beta_${suffixB}`,
    erpPassword: 'SenhaForteBeta123!',
  });

  const storeIdA = storeA.storeId;
  const storeIdB = storeB.storeId;

  // Ativar as lojas para permitir acesso
  await db.query(`UPDATE stores SET status = 'active' WHERE id = $1`, [storeIdA]);
  await db.query(`UPDATE stores SET status = 'active' WHERE id = $1`, [storeIdB]);

  const custA = await db.queryOne(`
    INSERT INTO customers (store_id, first_name, last_name, phone)
    VALUES ($1, 'Cliente Alfa', 'Periodo', '11988880001')
    RETURNING id
  `, [storeIdA]);

  const custB = await db.queryOne(`
    INSERT INTO customers (store_id, first_name, last_name, phone)
    VALUES ($1, 'Cliente Beta', 'Periodo', '11988880002')
    RETURNING id
  `, [storeIdB]);

  // Teardown
  t.after(async () => {
    await db.query('DELETE FROM store_sale_items WHERE sale_id IN (SELECT id FROM store_sales WHERE store_id = ANY($1::int[]))', [[storeIdA, storeIdB]]);
    await db.query('DELETE FROM store_sales WHERE store_id = ANY($1::int[])', [[storeIdA, storeIdB]]);
    await db.query('DELETE FROM stock_products WHERE store_id = ANY($1::int[])', [[storeIdA, storeIdB]]);
    await db.query('DELETE FROM credit_accounts WHERE store_id = ANY($1::int[])', [[storeIdA, storeIdB]]);
    await db.query('DELETE FROM service_orders WHERE store_id = ANY($1::int[])', [[storeIdA, storeIdB]]);
    await db.query('DELETE FROM customers WHERE store_id = ANY($1::int[])', [[storeIdA, storeIdB]]);
    await db.query('DELETE FROM users WHERE store_id = ANY($1::int[])', [[storeIdA, storeIdB]]);
    await db.query('DELETE FROM system_settings WHERE store_id = ANY($1::int[])', [[storeIdA, storeIdB]]);
    await db.query('DELETE FROM stores WHERE id = ANY($1::int[])', [[storeIdA, storeIdB]]);
  });

  // Criar registros em datas específicas
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const m = {};
  for (const p of parts) m[p.type] = p.value;
  const todayStr = `${m.year}-${m.month}-${m.day}`;

  const d3 = new Date(Date.UTC(Number(m.year), Number(m.month) - 1, Number(m.day) - 3));
  const threeDaysAgoStr = `${d3.getUTCFullYear()}-${String(d3.getUTCMonth() + 1).padStart(2, '0')}-${String(d3.getUTCDate()).padStart(2, '0')}`;

  let prevYear = Number(m.year);
  let prevMonth = Number(m.month) - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const lastMonthMidStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-15`;

  // Inserções Loja A:
  // 1. Hoje: OS paga de 100
  await db.query(`
    INSERT INTO service_orders (store_id, order_number, customer_id, brand, model, service_price, payment_status, status, entry_date, delivery_date)
    VALUES ($1, 'OS-HOJE', $2, 'Apple', 'iPhone', 100.00, 'paid', 'delivered', ($3 || ' 10:00:00')::timestamptz, ($3 || ' 10:00:00')::timestamptz)
  `, [storeIdA, custA.id, todayStr]);

  // 2. 3 dias atrás: Venda de caixa de 50
  const prodA = await db.queryOne(`
    INSERT INTO stock_products (store_id, name, code, cost_price, sale_price, is_active)
    VALUES ($1, 'Cabo USB', 'CB-01', 10.00, 50.00, 1)
    RETURNING id
  `, [storeIdA]);

  const sale3 = await db.queryOne(`
    INSERT INTO store_sales (store_id, sale_number, total_amount, payment_method, is_canceled, created_at)
    VALUES ($1, 9901, 50.00, 'pix', 0, ($2 || ' 14:00:00')::timestamptz)
    RETURNING id
  `, [storeIdA, threeDaysAgoStr]);

  await db.query(`
    INSERT INTO store_sale_items (store_id, sale_id, product_id, product_name, quantity, unit_price, subtotal, is_canceled)
    VALUES ($1, $2, $3, 'Cabo USB', 1, 50.00, 50.00, 0)
  `, [storeIdA, sale3.id, prodA.id]);

  // 3. Mês passado: OS paga de 300
  await db.query(`
    INSERT INTO service_orders (store_id, order_number, customer_id, brand, model, service_price, payment_status, status, entry_date, delivery_date)
    VALUES ($1, 'OS-ANTIGA', $2, 'Samsung', 'Galaxy', 300.00, 'paid', 'delivered', ($3 || ' 09:00:00')::timestamptz, ($3 || ' 09:00:00')::timestamptz)
  `, [storeIdA, custA.id, lastMonthMidStr]);

  // Inserção Loja B: OS paga hoje de 999 (não pode vazar para Loja A)
  await db.query(`
    INSERT INTO service_orders (store_id, order_number, customer_id, brand, model, service_price, payment_status, status, entry_date, delivery_date)
    VALUES ($1, 'OS-BETA', $2, 'Motorola', 'G10', 999.00, 'paid', 'delivered', ($3 || ' 11:00:00')::timestamptz, ($3 || ' 11:00:00')::timestamptz)
  `, [storeIdB, custB.id, todayStr]);

  // Obter session_version do userA
  const userRowA = await db.queryOne('SELECT session_version FROM users WHERE id = $1', [storeA.userId]);
  const tokenA = jwt.sign({ id: storeA.userId, session_version: userRowA.session_version }, process.env.JWT_SECRET);

  const app = express();
  app.use('/api/dashboard', dashboardRouter);
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(() => {
    server.close();
    server.closeAllConnections();
  });

  const headers = { Authorization: `Bearer ${tokenA}` };

  // Teste 1: Filtro "Hoje"
  await t.test('1. Filtro Hoje considera apenas movimentações do dia corrente', async () => {
    const res = await fetch(`${base}/api/dashboard/stats?period=today`, { headers });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.total_revenue, 100);
  });

  // Teste 2: Filtro "7 dias"
  await t.test('2. Filtro 7 dias considera hoje + 3 dias atrás', async () => {
    const res = await fetch(`${base}/api/dashboard/stats?period=7d`, { headers });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.total_revenue, 150);
  });

  // Teste 3: Filtro "Mês passado"
  await t.test('3. Filtro Mês passado traz apenas a movimentação do mês anterior', async () => {
    const res = await fetch(`${base}/api/dashboard/stats?period=last_month`, { headers });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.total_revenue, 300);
  });

  // Teste 4: Filtro "Personalizado" válido
  await t.test('4. Filtro Personalizado com intervalo exato', async () => {
    const res = await fetch(`${base}/api/dashboard/stats?period=custom&startDate=${threeDaysAgoStr}&endDate=${threeDaysAgoStr}`, { headers });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.total_revenue, 50);
  });

  // Teste 5: Filtro "Personalizado" com validação de erro (data inicial > final)
  await t.test('5. Filtro Personalizado com data inicial posterior à final retorna erro 400', async () => {
    const res = await fetch(`${base}/api/dashboard/stats?period=custom&startDate=2026-11-20&endDate=2026-11-10`, { headers });
    assert.equal(res.status, 400);
  });

  // Teste 6: Detalhes do indicador respeitam o período
  await t.test('6. Endpoint de detalhes respeita o período informado', async () => {
    const res = await fetch(`${base}/api/dashboard/details/revenue?period=today`, { headers });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.total_amount, 100);
    assert.equal(json.records.length, 1);
    assert.equal(json.records[0].order_number, 'OS-HOJE');
  });
});
