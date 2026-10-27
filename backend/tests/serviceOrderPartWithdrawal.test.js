const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itech-part-withdrawal-'));
process.env.ITECH_DB_PATH = path.join(tempDir, 'test.db');

const db = require('../db/database');
const orders = require('../routes/serviceOrders');
const inventory = require('../routes/inventory');
const withdrawals = require('../routes/cashWithdrawals');
const { computeMonthlySnapshot } = require('../utils/financialHistory');
db.exec(`CREATE TABLE IF NOT EXISTS document_sequences (kind TEXT PRIMARY KEY, next_value INTEGER NOT NULL);
  INSERT OR IGNORE INTO document_sequences (kind, next_value) VALUES ('order', 1);
  CREATE TABLE IF NOT EXISTS system_settings (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
  INSERT OR IGNORE INTO system_settings (id, value) VALUES (1, '{"documents":{"warranty_days":90}}');`);

function route(router, method, routePath) {
  const item = router.stack.find(entry => entry.route?.path === routePath && entry.route.methods[method]);
  assert.ok(item, `${method} ${routePath} exists`);
  return item.route.stack.at(-1).handle;
}

async function call(handler, { body = {}, params = {}, user = { id: 1, role: 'admin' } } = {}) {
  const result = { statusCode: 200, body: null };
  const res = { status(code) { result.statusCode = code; return this; }, json(body) { result.body = body; return this; } };
  let failure;
  await handler({ body, params, user }, res, error => { failure = error; });
  if (failure) throw Object.assign(new Error(failure.message), { statusCode: failure.statusCode, cause: failure });
  return result;
}

test('fornecedor, entrega e retirada única preservam lucro e dados após reabertura', async () => {
  db.prepare("INSERT INTO users (full_name, username, password_hash, role) VALUES ('Teste', 'parts-test', 'hash', 'admin')").run();
  const customerId = db.prepare("INSERT INTO customers (first_name,last_name) VALUES ('Cliente','Teste')").run().lastInsertRowid;
  const createSupplier = route(inventory, 'post', '/suppliers');
  const supplierA = (await call(createSupplier, { body: { name: 'Fornecedor Teste', contact_info: '11999990000', notes: 'Entrega rápida' } })).body;
  const supplierB = (await call(createSupplier, { body: { name: 'Fornecedor B' } })).body;
  assert.equal(supplierA.contact_info, '11999990000');
  assert.equal(supplierA.notes, 'Entrega rápida');

  const today = new Date().toISOString().slice(0, 10);
  const createOrder = route(orders, 'post', '/');
  const updateOrder = route(orders, 'put', '/:id');
  const created = await call(createOrder, { body: {
    customer_id: customerId, entry_date: today, brand: 'TESTE', model: 'TESTE',
    service_price: 250, parts_cost: 80, supplier_id: supplierA.id, payment_method: 'pix', status: 'received',
  } });
  assert.equal(created.statusCode, 201);
  const id = created.body.id;
  assert.equal(created.body.parts_cost, 80);
  assert.equal(created.body.supplier_id, supplierA.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cash_withdrawals').get().n, 0);

  await call(updateOrder, { params: { id }, body: { parts_cost: 85, supplier_id: supplierB.id } });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cash_withdrawals').get().n, 0);
  const edited = db.prepare('SELECT parts_cost,supplier_id FROM service_orders WHERE id=?').get(id);
  assert.deepEqual(edited, { parts_cost: 85, supplier_id: supplierB.id });

  await call(updateOrder, { params: { id }, body: { parts_cost: 80, supplier_id: supplierA.id, status: 'delivered', delivery_date: today } });
  const withdrawal = db.prepare('SELECT * FROM cash_withdrawals WHERE service_order_id=?').get(id);
  assert.ok(withdrawal);
  assert.equal(withdrawal.amount, 80);
  assert.equal(withdrawal.supplier_name, 'Fornecedor Teste');
  assert.equal(withdrawal.source_type, 'service_order_part');
  assert.equal(withdrawal.withdrawal_date, today);
  assert.equal(db.prepare('SELECT profit FROM service_orders WHERE id=?').get(id).profit, 170);

  const [year, month] = today.split('-').map(Number);
  const snapshot = computeMonthlySnapshot(year, month);
  assert.equal(snapshot.profit, 170);
  assert.equal(snapshot.expenses, 80);
  assert.equal(snapshot.net_profit, 170);

  const listed = await call(route(withdrawals, 'get', '/'));
  assert.equal(listed.body.find(item => item.id === withdrawal.id).order_number, created.body.order_number);
  db.prepare('UPDATE cash_withdrawals SET supplier_name = NULL WHERE id = ?').run(withdrawal.id);
  const listedWithSupplierFallback = await call(route(withdrawals, 'get', '/'));
  assert.equal(listedWithSupplierFallback.body.find(item => item.id === withdrawal.id).supplier_name, 'Fornecedor Teste');
  db.prepare("UPDATE cash_withdrawals SET supplier_name = 'Fornecedor Teste' WHERE id = ?").run(withdrawal.id);
  const manual = await call(route(withdrawals, 'post', '/'), { body: { amount: 10, reason: 'Despesa manual', withdrawal_date: today } });
  assert.equal(manual.statusCode, 201);
  const withManualExpense = computeMonthlySnapshot(year, month);
  assert.equal(withManualExpense.expenses, 90);
  assert.equal(withManualExpense.net_profit, 160);
  await call(updateOrder, { params: { id }, body: { payment_method: 'pending' } });
  const pendingPayment = computeMonthlySnapshot(year, month);
  assert.equal(pendingPayment.profit, 0);
  assert.equal(pendingPayment.net_profit, -90);
  await call(updateOrder, { params: { id }, body: { payment_method: 'pix' } });

  const changeAfterDelivery = await call(updateOrder, { params: { id }, body: { parts_cost: 90 } });
  assert.equal(changeAfterDelivery.statusCode, 200);
  assert.equal(db.prepare('SELECT amount FROM cash_withdrawals WHERE id=?').get(withdrawal.id).amount, 90);
  await call(updateOrder, { params: { id }, body: { parts_cost: 150, supplier_id: supplierB.id } });
  assert.equal(db.prepare('SELECT supplier_name FROM cash_withdrawals WHERE id=?').get(withdrawal.id).supplier_name, supplierB.name);
  assert.equal(db.prepare('SELECT amount FROM cash_withdrawals WHERE id=?').get(withdrawal.id).amount, 150);
  await call(updateOrder, { params: { id }, body: { supplier_id: supplierA.id } });

  await call(updateOrder, { params: { id }, body: { notes: 'Edição posterior' } });
  await call(updateOrder, { params: { id }, body: { status: 'ready' } });
  await call(updateOrder, { params: { id }, body: { status: 'delivered' } });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cash_withdrawals WHERE service_order_id=?').get(id).n, 1);
  assert.throws(() => db.prepare(`INSERT INTO cash_withdrawals (amount,reason,withdrawal_date,source_type,service_order_id)
    VALUES (80,'Custo da peça',?,'service_order_part',?)`).run(today, id), /UNIQUE/);

  const blocked = await call(route(withdrawals, 'delete', '/:id'), { params: { id: withdrawal.id } });
  assert.equal(blocked.statusCode, 409);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cash_withdrawals WHERE service_order_id=?').get(id).n, 1);

  const reopened = new (require('better-sqlite3'))(process.env.ITECH_DB_PATH, { readonly: true });
  assert.equal(reopened.prepare('SELECT supplier_id FROM service_orders WHERE id=?').get(id).supplier_id, supplierA.id);
  assert.equal(reopened.prepare('SELECT COUNT(*) n FROM cash_withdrawals WHERE service_order_id=?').get(id).n, 1);
  reopened.close();

  const oldOrderId = db.prepare(`INSERT INTO service_orders (order_number, customer_id, entry_date, parts_cost, status)
    VALUES ('OS-LEGACY', ?, ?, 35, 'received')`).run(customerId, today).lastInsertRowid;
  assert.equal((await call(updateOrder, { params: { id: oldOrderId }, body: { notes: 'Edição de OS antiga' } })).statusCode, 200);
  await call(updateOrder, { params: { id: oldOrderId }, body: { status: 'delivered' } });
  const oldOrder = db.prepare('SELECT delivery_date FROM service_orders WHERE id=?').get(oldOrderId);
  assert.equal(oldOrder.delivery_date, today);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cash_withdrawals WHERE service_order_id=?').get(oldOrderId).n, 1);

  const createdDelivered = await call(createOrder, { body: {
    customer_id: customerId, entry_date: today, service_price: 250, parts_cost: 80,
    supplier_id: supplierA.id, payment_method: 'pix', status: 'delivered',
  } });
  assert.equal(createdDelivered.statusCode, 201);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM cash_withdrawals WHERE service_order_id=? AND source_type='service_order_part'").get(createdDelivered.body.id).n, 1);
});

test('sem custo não lança retirada; fornecedor opcional, custo zero e backfill idempotente', async t => {
  t.after(() => { db.close(); fs.rmSync(tempDir, { recursive: true, force: true }); });
  const customerId = db.prepare("INSERT INTO customers (first_name,last_name) VALUES ('Cliente','Sem Peça')").run().lastInsertRowid;
  const today = new Date().toISOString().slice(0, 10);
  const createOrder = route(orders, 'post', '/');
  const updateOrder = route(orders, 'put', '/:id');
  const noSupplier = await call(createOrder, { body: { customer_id: customerId, entry_date: today, parts_cost: 100, status: 'delivered' } });
  const automatic = db.prepare('SELECT * FROM cash_withdrawals WHERE service_order_id=?').get(noSupplier.body.id);
  assert.equal(automatic.amount, 100);
  assert.equal(automatic.supplier_id, null);
  const manualBefore = db.prepare("SELECT * FROM cash_withdrawals WHERE source_type='manual'").all();
  await call(updateOrder, { params: { id: noSupplier.body.id }, body: { parts_cost: 150 } });
  assert.equal(db.prepare('SELECT amount FROM cash_withdrawals WHERE id=?').get(automatic.id).amount, 150);
  const zeroed = await call(updateOrder, { params: { id: noSupplier.body.id }, body: { parts_cost: 0 } });
  assert.equal(zeroed.body.part_withdrawal_id, null);
  assert.equal(db.prepare('SELECT * FROM cash_withdrawals WHERE id=?').get(automatic.id), undefined);
  assert.deepEqual(db.prepare("SELECT * FROM cash_withdrawals WHERE source_type='manual'").all(), manualBefore);
  const legacy = db.prepare(`INSERT INTO service_orders(order_number,customer_id,entry_date,delivery_date,parts_cost,status)
    VALUES ('BACKFILL',?,'2026-07-01','2026-07-15',42,'delivered')`).run(customerId).lastInsertRowid;
  const { execFileSync } = require('node:child_process');
  const runBackfill = () => execFileSync(process.execPath, [path.join(__dirname, '../scripts/backfillServiceOrderPartWithdrawals.js'), '--apply'], { env: process.env });
  runBackfill();
  const repaired = db.prepare('SELECT * FROM cash_withdrawals WHERE service_order_id=?').get(legacy);
  assert.equal(repaired.amount, 42);
  assert.equal(repaired.withdrawal_date, '2026-07-15');
  const allBefore = db.prepare('SELECT * FROM cash_withdrawals ORDER BY id').all();
  runBackfill();
  assert.deepEqual(db.prepare('SELECT * FROM cash_withdrawals ORDER BY id').all(), allBefore);
  assert.deepEqual(db.prepare("SELECT * FROM cash_withdrawals WHERE source_type='manual'").all(), manualBefore);
  const created = await call(createOrder, { body: { customer_id: customerId, entry_date: today, parts_cost: 0 } });
  await call(updateOrder, { params: { id: created.body.id }, body: { status: 'delivered' } });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cash_withdrawals WHERE service_order_id=?').get(created.body.id).n, 0);
});
