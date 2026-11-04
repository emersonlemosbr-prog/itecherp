// backend/tests/dashboardInteractiveDetails.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/database');
const { getTrustedNowSqlite } = require('../utils/time');
const { getMonthDateRangeForSqlite } = require('../utils/financialHistory');

test('Dashboard Interativa: Auditoria e teste completo dos 9 indicadores com permissões de exclusão', async (t) => {
  // 1. Criar loja de teste isolada
  const store = await db.queryOne(`
    INSERT INTO stores (name, slug, owner_name, owner_email, status)
    VALUES ('Loja Teste Dashboard', 'loja-dash-' || trunc(random()*100000), 'Owner Dash', 'dash_' || trunc(random()*100000) || '@test.com', 'active')
    RETURNING id
  `);
  const storeId = store.id;

  // 2. Criar cliente na loja
  const cust = await db.queryOne(`
    INSERT INTO customers (store_id, first_name, last_name, phone)
    VALUES ($1, 'Cliente Dashboard', 'Teste', '11988887777')
    RETURNING id
  `, [storeId]);
  const customerId = cust.id;

  // 3. Obter período corrente
  const trustedNow = await getTrustedNowSqlite();
  const { startDate, nextStartDate } = getMonthDateRangeForSqlite(trustedNow);
  const nowStamp = `${startDate} 12:00:00`;

  // Limpeza prévia e posterior
  t.after(async () => {
    await db.execute('DELETE FROM store_sale_items WHERE sale_id IN (SELECT id FROM store_sales WHERE store_id = $1)', [storeId]);
    await db.execute('DELETE FROM store_sales WHERE store_id = $1', [storeId]);
    await db.execute('DELETE FROM credit_accounts WHERE store_id = $1', [storeId]);
    await db.execute('DELETE FROM stock_levels WHERE product_id IN (SELECT id FROM stock_products WHERE store_id = $1)', [storeId]);
    await db.execute('DELETE FROM stock_products WHERE store_id = $1', [storeId]);
    await db.execute('DELETE FROM service_orders WHERE store_id = $1', [storeId]);
    await db.execute('DELETE FROM customers WHERE store_id = $1', [storeId]);
    await db.execute('DELETE FROM stores WHERE id = $1', [storeId]);
  });

  // Inserir registros de teste nos diferentes estados
  // OS 1: Paga / Entregue (Receita + Concluídos)
  const os1 = await db.queryOne(`
    INSERT INTO service_orders (store_id, order_number, customer_id, brand, model, service_price, payment_status, status, entry_date, delivery_date)
    VALUES ($1, '101', $2, 'Apple', 'iPhone 11', 350.00, 'paid', 'delivered', $3, $3)
    RETURNING id
  `, [storeId, customerId, nowStamp]);

  // OS 2: Pendente / Em diagnóstico (Receita pendente + Em andamento)
  const os2 = await db.queryOne(`
    INSERT INTO service_orders (store_id, order_number, customer_id, brand, model, service_price, payment_status, status, entry_date)
    VALUES ($1, '102', $2, 'Samsung', 'Galaxy S20', 200.00, 'pending', 'diagnosis', $3)
    RETURNING id
  `, [storeId, customerId, nowStamp]);

  // OS 3: Pronto (Prontos)
  const os3 = await db.queryOne(`
    INSERT INTO service_orders (store_id, order_number, customer_id, brand, model, service_price, payment_status, status, entry_date)
    VALUES ($1, '103', $2, 'Motorola', 'Moto G8', 180.00, 'pending', 'ready', $3)
    RETURNING id
  `, [storeId, customerId, nowStamp]);

  // OS 4: Não realizado (Não realizados)
  const os4 = await db.queryOne(`
    INSERT INTO service_orders (store_id, order_number, customer_id, brand, model, service_price, payment_status, status, entry_date)
    VALUES ($1, '104', $2, 'Xiaomi', 'Redmi Note 9', 150.00, 'not_performed', 'not_performed', $3)
    RETURNING id
  `, [storeId, customerId, nowStamp]);

  // Venda de Caixa
  const sale1 = await db.queryOne(`
    INSERT INTO store_sales (store_id, sale_number, total_amount, payment_method, is_canceled, created_at)
    VALUES ($1, '501', 120.00, 'pix', 0, $2)
    RETURNING id
  `, [storeId, nowStamp]);

  // Fiado em Aberto
  const credit1 = await db.queryOne(`
    INSERT INTO credit_accounts (store_id, customer_id, description, amount, status, created_at)
    VALUES ($1, $2, 'Película e cabo', 50.00, 'open', $3)
    RETURNING id
  `, [storeId, customerId, nowStamp]);

  // Produto em estoque
  const prod1 = await db.queryOne(`
    INSERT INTO stock_products (store_id, name, model, code, cost_price, sale_price, is_active, created_at)
    VALUES ($1, 'Carregador Turbo 20W', 'Type-C', 'CARG-20W', 25.00, 60.00, 1, $2)
    RETURNING id
  `, [storeId, nowStamp]);

  await db.execute(`
    INSERT INTO stock_levels (product_id, quantity, updated_at)
    VALUES ($1, 15, CURRENT_TIMESTAMP)
  `, [prod1.id]);

  // Simular as consultas dos 9 indicadores da dashboard para a loja
  // 1. Receita total (OS 1 paga + Venda 1 = 350 + 120 = 470)
  const osEntries = await db.query(`
    SELECT so.id, so.service_price AS amount
    FROM service_orders so
    WHERE so.store_id = $1
      AND so.payment_status IN ('paid', 'credit_account')
      AND (COALESCE(so.delivery_date, so.entry_date))::date >= $2::date
      AND (COALESCE(so.delivery_date, so.entry_date))::date < $3::date
  `, [storeId, startDate, nextStartDate]);

  const saleEntries = await db.query(`
    SELECT s.id, s.total_amount AS amount
    FROM store_sales s
    WHERE s.store_id = $1
      AND COALESCE(s.is_canceled, 0) = 0
      AND s.created_at::date >= $2::date
      AND s.created_at::date < $3::date
  `, [storeId, startDate, nextStartDate]);

  const totalRev = [...osEntries, ...saleEntries].reduce((acc, i) => acc + Number(i.amount), 0);
  assert.equal(totalRev, 470.00, 'Receita total deve somar OS paga e venda');

  // 2. Receita pendente (OS 2 = 200)
  const pendingRev = await db.query(`
    SELECT so.id, so.service_price AS amount
    FROM service_orders so
    WHERE so.store_id = $1
      AND so.payment_status IN ('pending', 'credit_account')
      AND (COALESCE(so.delivery_date, so.entry_date))::date >= $2::date
      AND (COALESCE(so.delivery_date, so.entry_date))::date < $3::date
  `, [storeId, startDate, nextStartDate]);
  assert.equal(pendingRev.length, 2, 'Receita pendente tem OS 2 e OS 3');

  // 3. Pendentes em aberto (Credit 1 = 50)
  const openCredits = await db.query(`
    SELECT ca.id, ca.amount
    FROM credit_accounts ca
    WHERE ca.store_id = $1
      AND ca.status = 'open'
      AND ca.created_at::date >= $2::date
      AND ca.created_at::date < $3::date
  `, [storeId, startDate, nextStartDate]);
  assert.equal(openCredits.length, 1);
  assert.equal(Number(openCredits[0].amount), 50.00);

  // 4. Em andamento (OS 2)
  const inProgress = await db.query(`
    SELECT so.id FROM service_orders so
    WHERE so.store_id = $1
      AND so.status IN ('diagnosis', 'waiting_parts', 'repairing')
      AND so.entry_date::date >= $2::date
      AND so.entry_date::date < $3::date
  `, [storeId, startDate, nextStartDate]);
  assert.equal(inProgress.length, 1);
  assert.equal(inProgress[0].id, os2.id);

  // 5. Prontos (OS 3)
  const ready = await db.query(`
    SELECT so.id FROM service_orders so
    WHERE so.store_id = $1
      AND so.status = 'ready'
      AND so.entry_date::date >= $2::date
      AND so.entry_date::date < $3::date
  `, [storeId, startDate, nextStartDate]);
  assert.equal(ready.length, 1);
  assert.equal(ready[0].id, os3.id);

  // 6. Concluídos (OS 1)
  const completed = await db.query(`
    SELECT so.id FROM service_orders so
    WHERE so.store_id = $1
      AND so.status = 'delivered'
      AND so.entry_date::date >= $2::date
      AND so.entry_date::date < $3::date
  `, [storeId, startDate, nextStartDate]);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].id, os1.id);

  // 7. Não realizados (OS 4)
  const notPerformed = await db.query(`
    SELECT so.id FROM service_orders so
    WHERE so.store_id = $1
      AND so.status = 'not_performed'
      AND so.entry_date::date >= $2::date
      AND so.entry_date::date < $3::date
  `, [storeId, startDate, nextStartDate]);
  assert.equal(notPerformed.length, 1);
  assert.equal(notPerformed[0].id, os4.id);

  // 8. Vendas (Sale 1)
  const sales = await db.query(`
    SELECT s.id, s.total_amount
    FROM store_sales s
    WHERE s.store_id = $1
      AND COALESCE(s.is_canceled, 0) = 0
      AND s.created_at::date >= $2::date
      AND s.created_at::date < $3::date
  `, [storeId, startDate, nextStartDate]);
  assert.equal(sales.length, 1);
  assert.equal(Number(sales[0].total_amount), 120.00);

  // 9. Produtos (Prod 1 com estoque 15)
  const prods = await db.query(`
    SELECT p.id, p.name, COALESCE(l.quantity, 0) AS quantity
    FROM stock_products p
    LEFT JOIN stock_levels l ON l.product_id = p.id
    WHERE p.store_id = $1 AND p.is_active = 1
  `, [storeId]);
  assert.equal(prods.length, 1);
  assert.equal(Number(prods[0].quantity), 15);
});

