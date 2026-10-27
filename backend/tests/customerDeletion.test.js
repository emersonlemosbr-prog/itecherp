const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itech-customer-delete-'));
process.env.ITECH_DB_PATH = path.join(tempDir, 'test.db');
const db = require('../db/database');
const customers = require('../routes/customers');

function route(method, routePath) { return customers.stack.find(item => item.route?.path === routePath && item.route.methods[method]).route.stack.at(-1).handle; }
async function call(fn, params) { const out={statusCode:200}; const res={status(n){out.statusCode=n;return this},json(body){out.body=body;return this}}; await fn({params,user:{id:1,role:'admin'}},res,error=>{if(error)throw error}); return out; }

test('exclusão física do cliente preserva documentos usando snapshots', async t => {
  t.after(() => { db.close(); fs.rmSync(tempDir,{recursive:true,force:true}); });
  db.prepare("INSERT INTO users(id,full_name,username,password_hash,role) VALUES(1,'Admin','admin-test','x','admin')").run();
  const customerId=db.prepare("INSERT INTO customers(first_name,last_name,phone,address) VALUES('Cliente','Exclusão','79999999999','Rua Teste')").run().lastInsertRowid;
  const orderId=db.prepare("INSERT INTO service_orders(order_number,customer_id,entry_date) VALUES('DELETE-TEST',?,'2026-09-20')").run(customerId).lastInsertRowid;
  const warrantyId=db.prepare("INSERT INTO warranties(service_order_id,customer_id,warranty_start,warranty_end) VALUES(?,?, '2026-09-20','2026-12-20')").run(orderId,customerId).lastInsertRowid;
  const creditId=db.prepare("INSERT INTO credit_accounts(customer_id,service_order_id,amount) VALUES(?,?,10)").run(customerId,orderId).lastInsertRowid;
  const saleId=db.prepare("INSERT INTO device_sales(order_number,customer_id,sale_date,customer_name) VALUES('VD-DELETE',?,'2026-09-20','Cliente Exclusão')").run(customerId).lastInsertRowid;
  const result=await call(route('delete','/:id'),{id:customerId});
  assert.equal(result.body.mode,'deleted');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM customers WHERE id=?').get(customerId).n,0);
  assert.equal(db.prepare('SELECT customer_name_snapshot FROM service_orders WHERE id=?').get(orderId).customer_name_snapshot,'Cliente Exclusão');
  assert.equal(db.prepare('SELECT customer_name_snapshot FROM warranties WHERE id=?').get(warrantyId).customer_name_snapshot,'Cliente Exclusão');
  assert.equal(db.prepare('SELECT customer_name_snapshot FROM credit_accounts WHERE id=?').get(creditId).customer_name_snapshot,'Cliente Exclusão');
  assert.equal(db.prepare('SELECT customer_id FROM device_sales WHERE id=?').get(saleId).customer_id,null);
});
