const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

process.env.ITECH_DB_PATH = path.join(os.tmpdir(), `itech-erp-financial-history-${process.pid}-${Date.now()}.db`);

const db = require('../db/database');
const { ensureFinancialHistoryUpToDate, computeMonthlySnapshot } = require('../utils/financialHistory');
const { calculateFinancialSummary } = require('../services/financialSummary');
const serviceOrdersRouter = require('../routes/serviceOrders');

db.prepare("INSERT INTO users (full_name, username, password_hash, role) VALUES ('Sistema', 'test-admin', 'hash', 'admin')").run();
const stockProductId = db.prepare("INSERT INTO stock_products (name, code, created_by) VALUES ('Produto de teste', 'P-1', 1)").run().lastInsertRowid;
db.prepare('INSERT INTO stock_levels (product_id, quantity) VALUES (?, ?)').run(stockProductId, 10);

test('September revenue should count only service orders, not device sales', () => {
  db.prepare("DELETE FROM store_sales WHERE sale_number = 'VD-TEST-SEP'").run();
  db.prepare("DELETE FROM service_orders WHERE order_number = 'SO-SEP-REGRESSION'").run();

  const customerId = db.prepare(`
    INSERT INTO customers (first_name, last_name, address, phone, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run('Cliente Sep', 'Financeiro', 'Rua Teste', '79999999998').lastInsertRowid;

  db.prepare(`
    INSERT INTO service_orders (
      order_number, customer_id, brand, model, imei1, imei2, entry_date, expected_delivery_date,
      delivery_date, description, notes, service_price, parts_cost, additional_costs, profit,
      payment_method, payment_status, status, warranty_days, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'SO-SEP-REGRESSION',
    customerId,
    'Samsung',
    'A13',
    'A',
    'B',
    '2026-09-01',
    '2026-09-02',
    '2026-09-01',
    'OS setembro',
    null,
    300,
    0,
    0,
    300,
    'pix',
    'paid',
    'delivered',
    90,
    1,
    '2026-09-01 10:00:00',
    '2026-09-01 10:00:00'
  );

  const saleId = db.prepare(`
    INSERT INTO store_sales (sale_number, subtotal, discount_type, discount_value, discount_amount,
      total_amount, payment_method, notes, is_canceled, created_by, created_at)
    VALUES (?, ?, NULL, 0, 0, ?, ?, ?, 0, ?, ?)
  `).run('VD-TEST-SEP', 1500, 1500, 'pix', 'device_sale:999999', 1, '2026-09-01 21:00:00').lastInsertRowid;

  db.prepare(`
    INSERT INTO store_sale_items (sale_id, product_id, product_name, product_code, cost_price, unit_price, quantity, subtotal, is_canceled)
    VALUES (?, ?, 'Aparelho', 'P-1', 0, 1500, 1, 1500, 0)
  `).run(saleId, stockProductId);

  const snapshot = computeMonthlySnapshot(2026, 9);
  assert.equal(Number(snapshot.revenue), 1800);
  assert.equal(Number(snapshot.received), 1800);

  db.prepare(`
    INSERT INTO service_orders (
      order_number, customer_id, entry_date, service_price, profit,
      payment_method, payment_status, status, created_by
    ) VALUES ('SO-PENDING-REGRESSION', ?, '2026-09-10', 1330, 1330, 'pending', 'pending', 'ready', 1)
  `).run(customerId);

  const dashboardSummary = calculateFinancialSummary(db, '2026-09-01', '2026-10-01');
  const snapshotWithPending = computeMonthlySnapshot(2026, 9);
  assert.equal(dashboardSummary.totalRevenue, 1800, 'a Dashboard não contabiliza OS pendente como receita');
  assert.equal(snapshotWithPending.revenue, dashboardSummary.totalRevenue, 'Histórico e Dashboard usam a mesma receita');
  assert.equal(snapshotWithPending.pending, 1330, 'o valor pendente continua disponível separadamente');
  assert.equal(snapshotWithPending.profit, dashboardSummary.totalProfit, 'Histórico e Dashboard usam o mesmo lucro');
});

function getPutHandler() {
  const route = serviceOrdersRouter.stack.find((entry) => entry.route && entry.route.path === '/:id' && entry.route.methods.put);
  if (!route || !route.route || !route.route.stack || !route.route.stack.length) {
    throw new Error('Rota PUT /:id não encontrada em serviceOrders');
  }
  return route.route.stack[0].handle;
}

test('September revenue should include only service orders, not device sales', () => {
  db.prepare("DELETE FROM store_sales WHERE notes = 'device_sale:999999'").run();

  const customerId = db.prepare(`
    INSERT INTO customers (first_name, last_name, address, phone, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run('Cliente Sep', 'Financeiro', 'Rua Teste', '79999999998').lastInsertRowid;

  db.prepare(`
    INSERT INTO service_orders (
      order_number, customer_id, brand, model, imei1, imei2, entry_date, expected_delivery_date,
      delivery_date, description, notes, service_price, parts_cost, additional_costs, profit,
      payment_method, payment_status, status, warranty_days, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `SO-SEP-${Date.now()}`,
    customerId,
    'Samsung',
    'A13',
    'A',
    'B',
    '2026-09-01',
    '2026-09-02',
    '2026-09-01',
    'OS setembro',
    null,
    300,
    0,
    0,
    300,
    'pix',
    'paid',
    'delivered',
    90,
    1,
    '2026-09-01 10:00:00',
    '2026-09-01 10:00:00'
  );

  const saleId = db.prepare(`
    INSERT INTO store_sales (sale_number, subtotal, discount_type, discount_value, discount_amount,
      total_amount, payment_method, notes, is_canceled, created_by, created_at)
    VALUES (?, ?, NULL, 0, 0, ?, ?, ?, 0, ?, ?)
  `).run('VD-TEST-SEP', 1500, 1500, 'pix', 'device_sale:999999', 1, '2026-09-01 21:00:00').lastInsertRowid;

  db.prepare(`
    INSERT INTO store_sale_items (sale_id, product_id, product_name, product_code, cost_price, unit_price, quantity, subtotal, is_canceled)
    VALUES (?, ?, 'Aparelho', 'P-1', 0, 1500, 1, 1500, 0)
  `).run(saleId, stockProductId);

  ensureFinancialHistoryUpToDate('2026-10-01 00:00:00');
  const snapshot = db.prepare('SELECT * FROM financial_history WHERE year = ? AND month = ?').get(2026, 9);
  assert.ok(snapshot, 'deve existir snapshot de setembro');
  assert.equal(Number(snapshot.revenue), 2100);
});

test('PUT /:id updates the financial history for the affected month', async () => {
  const supplierId = db.prepare("INSERT INTO stock_suppliers (name) VALUES ('Fornecedor do teste financeiro')").run().lastInsertRowid;
  const customerId = db.prepare(`
    INSERT INTO customers (first_name, last_name, address, phone, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(`Cliente OS ${Date.now()}`, 'Financeiro', 'Rua Teste', '79999999999').lastInsertRowid;

  const orderId = db.prepare(`
    INSERT INTO service_orders (
      order_number, customer_id, brand, model, imei1, imei2, entry_date, expected_delivery_date,
      delivery_date, description, notes, service_price, parts_cost, additional_costs, profit,
      payment_method, payment_status, status, warranty_days, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `SO-TEST-${Date.now()}`,
    customerId,
    'Samsung',
    'A13',
    '111',
    '222',
    '2026-08-15',
    '2026-08-20',
    '2026-08-15',
    'Teste histórico',
    null,
    300,
    0,
    0,
    300,
    'pending',
    'pending',
    'received',
    90,
    1,
    '2026-08-15 10:00:00',
    '2026-08-15 10:00:00'
  ).lastInsertRowid;

  await ensureFinancialHistoryUpToDate('2026-09-15 00:00:00');

  const handler = getPutHandler();
  let responseBody;
  const res = {
    json(value) {
      responseBody = value;
      return value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
  };

  await handler({
    params: { id: String(orderId) },
    body: {
      service_price: 480,
      parts_cost: 20,
      supplier_id: supplierId,
      additional_costs: 10,
      payment_method: 'pix',
      status: 'delivered',
      entry_date: '2026-08-15',
      delivery_date: '2026-08-15',
      description: 'Teste histórico atualizado',
      notes: 'Atualização do teste',
      warranty_days: 90,
    },
    user: { id: 1, role: 'admin' },
  }, res, () => {
    throw new Error('next should not be called');
  });

  const snapshot = db.prepare('SELECT * FROM financial_history WHERE year = ? AND month = ?').get(2026, 8);
  assert.ok(snapshot, 'deve existir snapshot do mês');
  assert.equal(Number(snapshot.revenue), 480, 'a receita deve refletir o valor atualizado da OS');
  assert.equal(Number(snapshot.profit), 450, 'o lucro deve refletir o ajuste da OS');
  assert.ok(responseBody, 'a rota deve responder com os dados atualizados');
});

test('Dashboard e Histórico permanecem iguais ao criar, editar, entregar, pagar e excluir uma OS', () => {
  const customerId = db.prepare(`
    INSERT INTO customers (first_name, last_name) VALUES ('Cliente', 'Consistência Financeira')
  `).run().lastInsertRowid;
  const startDate = '2027-01-01';
  const nextStartDate = '2027-02-01';

  const assertConsistent = (expectedRevenue, expectedProfit) => {
    const dashboard = calculateFinancialSummary(db, startDate, nextStartDate);
    const history = computeMonthlySnapshot(2027, 1);
    assert.equal(history.revenue, dashboard.totalRevenue);
    assert.equal(history.profit, dashboard.totalProfit);
    assert.equal(history.revenue, expectedRevenue);
    assert.equal(history.profit, expectedProfit);
  };

  const orderId = db.prepare(`
    INSERT INTO service_orders (
      order_number, customer_id, entry_date, service_price, parts_cost, profit,
      payment_method, payment_status, status, created_by
    ) VALUES ('SO-CONSISTENCY-FLOW', ?, '2027-01-10', 200, 50, 150,
      'pending', 'pending', 'received', 1)
  `).run(customerId).lastInsertRowid;
  assertConsistent(0, 0);

  db.prepare('UPDATE service_orders SET service_price=300, profit=250 WHERE id=?').run(orderId);
  assertConsistent(0, 0);

  db.prepare("UPDATE service_orders SET status='delivered', delivery_date='2027-01-12' WHERE id=?").run(orderId);
  assertConsistent(0, 0);

  db.prepare("UPDATE service_orders SET payment_method='pix', payment_status='paid' WHERE id=?").run(orderId);
  assertConsistent(300, 250);

  db.prepare('UPDATE service_orders SET service_price=350, profit=300 WHERE id=?').run(orderId);
  assertConsistent(350, 300);

  db.prepare('DELETE FROM service_orders WHERE id=?').run(orderId);
  assertConsistent(0, 0);
});
