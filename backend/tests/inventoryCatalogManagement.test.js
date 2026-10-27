const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itech-catalog-'));
process.env.ITECH_DB_PATH = path.join(tempDir, 'catalog.db');
const db = require('../db/database');
const inventory = require('../routes/inventory');

function handler(method, routePath) {
  const route = inventory.stack.find(item => item.route?.path === routePath && item.route.methods[method]);
  assert.ok(route, `${method} ${routePath}`);
  return route.route.stack.at(-1).handle;
}

async function call(fn, { body = {}, params = {}, query = {} } = {}) {
  const result = { statusCode: 200 };
  const res = { status(code) { result.statusCode = code; return this; }, json(bodyValue) { result.body = bodyValue; return this; } };
  await fn({ body, params, query, user: { id: 1, role: 'admin', full_name: 'Teste' } }, res, error => { if (error) throw error; });
  return result;
}

test('catálogo exclui fisicamente e preserva produtos, OS e snapshots históricos', async t => {
  t.after(() => { db.close(); fs.rmSync(tempDir, { recursive: true, force: true }); });
  db.prepare("INSERT INTO users(id,full_name,username,password_hash,role) VALUES(1,'Teste','catalog-test','x','admin')").run();
  const customerId = db.prepare("INSERT INTO customers(first_name,last_name) VALUES('Cliente','Teste')").run().lastInsertRowid;
  const supplier = (await call(handler('post', '/suppliers'), { body: { name: 'Fornecedor Compartilhado', contact_info: '79999999999', notes: 'Histórico' } })).body;
  const category = (await call(handler('post', '/categories'), { body: { name: 'Categoria Teste' } })).body;
  const productId = db.prepare("INSERT INTO stock_products(name,code,category_id,supplier_id) VALUES('Produto','CAT-1',?,?)").run(category.id, supplier.id).lastInsertRowid;
  db.prepare('INSERT INTO stock_levels(product_id,quantity) VALUES(?,1)').run(productId);
  const orderId = db.prepare("INSERT INTO service_orders(order_number,customer_id,entry_date,supplier_id) VALUES('CAT-OS',?,'2026-09-20',?)").run(customerId, supplier.id).lastInsertRowid;
  db.prepare("INSERT INTO cash_withdrawals(amount,reason,withdrawal_date,source_type,service_order_id,supplier_id,supplier_name) VALUES(10,'Custo','2026-09-20','service_order_part',?,?,?)").run(orderId, supplier.id, supplier.name);

  const supplierResult = await call(handler('delete', '/suppliers/:id'), { params: { id: supplier.id } });
  assert.equal(supplierResult.body.mode, 'deleted');
  assert.deepEqual([supplierResult.body.product_count, supplierResult.body.service_order_count, supplierResult.body.withdrawal_count], [1, 1, 1]);
  assert.equal(db.prepare('SELECT supplier_id FROM service_orders WHERE id=?').get(orderId).supplier_id, null);
  assert.equal(db.prepare('SELECT supplier_name_snapshot FROM service_orders WHERE id=?').get(orderId).supplier_name_snapshot, supplier.name);
  assert.equal(db.prepare('SELECT supplier_name FROM cash_withdrawals WHERE service_order_id=?').get(orderId).supplier_name, supplier.name);
  assert.equal(db.prepare('SELECT supplier_id FROM stock_products WHERE id=?').get(productId).supplier_id, null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM stock_suppliers WHERE id=?').get(supplier.id).n, 0);

  const categoryResult = await call(handler('delete', '/categories/:id'), { params: { id: category.id } });
  assert.equal(categoryResult.body.mode, 'deleted');
  assert.equal(db.prepare('SELECT category_id FROM stock_products WHERE id=?').get(productId).category_id, null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM stock_categories WHERE id=?').get(category.id).n, 0);

  const unusedSupplier = (await call(handler('post', '/suppliers'), { body: { name: 'Nunca Usado' } })).body;
  assert.equal((await call(handler('delete', '/suppliers/:id'), { params: { id: unusedSupplier.id } })).body.mode, 'deleted');
  const unusedCategory = (await call(handler('post', '/categories'), { body: { name: 'Nunca Usada' } })).body;
  assert.equal((await call(handler('delete', '/categories/:id'), { params: { id: unusedCategory.id } })).body.mode, 'deleted');

  const columns = db.prepare('PRAGMA table_info(stock_products)').all().map(column => column.name);
  assert.ok(columns.includes('image_url'));
  assert.ok(columns.includes('image_public_id'));
});
