const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itech-purchases-'));
process.env.NODE_ENV = 'test';
process.env.ITECH_DB_PATH = path.join(tmpDir, 'test.db');

const db = require('../db/database');
const { createPurchase } = require('../services/purchasesService');
const { payInstallment, getPayablesDashboard, listPayables } = require('../services/payablesService');

const admin1 = { id: 1, store_id: 1, role: 'admin', full_name: 'Admin Loja 1', username: 'admin1' };
const admin2 = { id: 2, store_id: 2, role: 'admin', full_name: 'Admin Loja 2', username: 'admin2' };

let supplier1Id;
let supplier2Id;
let product1Id;
let customer1Id;

test.before(async () => {
  await db.execute("INSERT OR IGNORE INTO stores (id, name, slug, owner_name, owner_email, status) VALUES (1, 'Loja 1', 'loja-1', 'A1', 'a1@test.local', 'active')");
  await db.execute("INSERT OR IGNORE INTO stores (id, name, slug, owner_name, owner_email, status) VALUES (2, 'Loja 2', 'loja-2', 'A2', 'a2@test.local', 'active')");
  await db.execute("INSERT OR IGNORE INTO users (id, store_id, full_name, username, password_hash, role, active, is_master) VALUES (1, 1, 'Admin 1', 'admin1', 'hash', 'admin', 1, 1)");
  await db.execute("INSERT OR IGNORE INTO users (id, store_id, full_name, username, password_hash, role, active, is_master) VALUES (2, 2, 'Admin 2', 'admin2', 'hash', 'admin', 1, 1)");

  const s1 = await db.queryOne("INSERT INTO stock_suppliers (store_id, name) VALUES (1, 'Fornecedor Alfa') RETURNING id");
  const s2 = await db.queryOne("INSERT INTO stock_suppliers (store_id, name) VALUES (2, 'Fornecedor Beta') RETURNING id");
  supplier1Id = s1.id;
  supplier2Id = s2.id;

  const p1 = await db.queryOne("INSERT INTO stock_products (store_id, name, code, cost_price, sale_price, is_active) VALUES (1, 'Película 3D', 'PEL-3D', 10.00, 35.00, 1) RETURNING id");
  product1Id = p1.id;
  await db.execute('INSERT INTO stock_levels (product_id, quantity) VALUES ($1, 10)', [product1Id]);

  const c1 = await db.queryOne("INSERT INTO customers (store_id, first_name, last_name, phone) VALUES (1, 'João', 'Silva', '11999990000') RETURNING id");
  customer1Id = c1.id;
});

test.after(() => {
  try { db.close(); } catch (_) {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

test('1. Compra à vista atualiza estoque, custo médio (sem alterar venda) e gera retirada', async () => {
  const res = await createPurchase(db, 1, admin1, {
    idempotency_key: 'cash-1',
    origin_type: 'supplier',
    supplier_id: supplier1Id,
    purchase_date: '2026-11-26',
    payment_condition: 'cash',
    payment_method: 'pix',
    payment_date: '2026-11-26',
    items: [
      { item_type: 'existing_accessory', product_id: product1Id, description: 'Película 3D', quantity: 10, unit_cost: 13.00 },
    ],
  });

  assert.equal(res.idempotentReplay, false);
  assert.equal(Number(res.purchase.total_amount), 130);

  const prod = await db.queryOne('SELECT cost_price, sale_price FROM stock_products WHERE id = $1', [product1Id]);
  const level = await db.queryOne('SELECT quantity FROM stock_levels WHERE product_id = $1', [product1Id]);
  assert.equal(Number(level.quantity), 20);
  // Média ponderada: (10 * 10 + 10 * 13) / 20 = 11.50
  assert.equal(Number(prod.cost_price), 11.5);
  assert.equal(Number(prod.sale_price), 35); // preço de venda preservado

  const withdrawals = await db.query("SELECT * FROM cash_withdrawals WHERE store_id = 1 AND source_type = 'purchase_payment'");
  assert.equal(withdrawals.length, 1);
  assert.equal(Number(withdrawals[0].amount), 130);

  // Idempotência: reenvio não duplica
  const replay = await createPurchase(db, 1, admin1, {
    idempotency_key: 'cash-1',
    origin_type: 'supplier',
    supplier_id: supplier1Id,
    purchase_date: '2026-11-26',
    payment_condition: 'cash',
    payment_method: 'pix',
    payment_date: '2026-11-26',
    items: [
      { item_type: 'existing_accessory', product_id: product1Id, description: 'Película 3D', quantity: 10, unit_cost: 13.00 },
    ],
  });
  assert.equal(replay.idempotentReplay, true);
  const levelAfter = await db.queryOne('SELECT quantity FROM stock_levels WHERE product_id = $1', [product1Id]);
  assert.equal(Number(levelAfter.quantity), 20);
});

test('2. Compra a prazo 3x de R$ 200 não gera retirada na compra e baixa parcela por parcela', async () => {
  const beforeWithdrawals = await db.query('SELECT COUNT(*) AS cnt FROM cash_withdrawals WHERE store_id = 1');
  const res = await createPurchase(db, 1, admin1, {
    idempotency_key: 'inst-1',
    origin_type: 'supplier',
    supplier_id: supplier1Id,
    purchase_date: '2026-11-26',
    payment_condition: 'installments',
    down_payment: 0,
    installments: [
      { amount: 200, due_date: '2026-12-26' },
      { amount: 200, due_date: '2027-01-26' },
      { amount: 200, due_date: '2027-02-26' },
    ],
    items: [
      { item_type: 'new_accessory', description: 'Carregador Turbo 20W', identifier: 'CAR-20W', quantity: 10, unit_cost: 60, sale_price: 120 },
    ],
  });

  const afterPurchaseWithdrawals = await db.query('SELECT COUNT(*) AS cnt FROM cash_withdrawals WHERE store_id = 1');
  assert.equal(Number(afterPurchaseWithdrawals[0].cnt), Number(beforeWithdrawals[0].cnt));

  const insts = await db.query(
    'SELECT pi.* FROM payable_installments pi JOIN accounts_payable ap ON ap.id = pi.payable_id WHERE ap.purchase_id = $1 ORDER BY pi.installment_number',
    [res.purchase.id]
  );
  assert.equal(insts.length, 3);

  // Paga 1ª parcela
  const pay1 = await payInstallment(db, 1, admin1, insts[0].id, {
    payment_date: '2026-11-26',
    payment_method: 'pix',
    idempotency_key: 'pay-inst-1',
  });
  assert.equal(pay1.installment_status, 'paid');

  // Tentativa duplicada na mesma parcela já paga deve falhar com 409
  await assert.rejects(
    () => payInstallment(db, 1, admin1, insts[0].id, { payment_date: '2026-11-26', payment_method: 'pix' }),
    (err) => err.statusCode === 409
  );
});

test('3. Compra com entrada de R$ 300 + 2x R$ 350 registra apenas entrada e cria 2 parcelas', async () => {
  const res = await createPurchase(db, 1, admin1, {
    origin_type: 'supplier',
    supplier_id: supplier1Id,
    purchase_date: '2026-11-26',
    payment_condition: 'installments',
    payment_method: 'cash',
    payment_date: '2026-11-26',
    down_payment: 300,
    installments: [
      { amount: 350, due_date: '2026-12-26' },
      { amount: 350, due_date: '2027-01-26' },
    ],
    items: [
      { item_type: 'device', brand: 'Apple', model: 'iPhone 12', imei1: '111222333444555', quantity: 1, unit_cost: 1000, sale_price: 1800 },
    ],
  });

  assert.equal(Number(res.purchase.down_payment), 300);
  const dev = await db.queryOne("SELECT * FROM devices WHERE store_id = 1 AND imei1 = '111222333444555'");
  assert.ok(dev);
  assert.equal(Number(dev.cost_price), 1000);
});

test('4. Rejeita divergência de centavos e reverte transação em caso de falha', async () => {
  await assert.rejects(
    () => createPurchase(db, 1, admin1, {
      origin_type: 'supplier',
      supplier_id: supplier1Id,
      purchase_date: '2026-11-26',
      payment_condition: 'installments',
      down_payment: 0,
      installments: [{ amount: 99.99, due_date: '2026-12-26' }],
      items: [{ item_type: 'existing_accessory', product_id: product1Id, description: 'Película 3D', quantity: 1, unit_cost: 100 }],
    }),
    (err) => err.statusCode === 400
  );

  // Falha no 2º item (IMEI duplicado) deve reverter alteração no 1º item
  const beforeLevel = await db.queryOne('SELECT quantity FROM stock_levels WHERE product_id = $1', [product1Id]);
  await assert.rejects(
    () => createPurchase(db, 1, admin1, {
      origin_type: 'supplier',
      supplier_id: supplier1Id,
      purchase_date: '2026-11-26',
      payment_condition: 'cash',
      payment_method: 'pix',
      items: [
        { item_type: 'existing_accessory', product_id: product1Id, description: 'Película 3D', quantity: 5, unit_cost: 10 },
        { item_type: 'device', brand: 'Apple', model: 'iPhone 12', imei1: '111222333444555', quantity: 1, unit_cost: 900 },
      ],
    }),
    (err) => err.statusCode === 409
  );
  const afterLevel = await db.queryOne('SELECT quantity FROM stock_levels WHERE product_id = $1', [product1Id]);
  assert.equal(Number(afterLevel.quantity), Number(beforeLevel.quantity));
});

test('5. Isolamento multi-tenant: Loja 2 não enxerga nem paga contas da Loja 1', async () => {
  const dash2 = await getPayablesDashboard(db, 2);
  const list2 = await listPayables(db, 2, {});
  assert.equal(dash2.open_total, 0);
  assert.equal(list2.length, 0);

  const inst1 = await db.queryOne('SELECT id FROM payable_installments WHERE store_id = 1 LIMIT 1');
  await assert.rejects(
    () => payInstallment(db, 2, admin2, inst1.id, { payment_date: '2026-11-26', payment_method: 'pix' }),
    (err) => err.statusCode === 404
  );

  // Aquisição de aparelho de cliente na Loja 1 funciona isoladamente
  const trade = await createPurchase(db, 1, admin1, {
    origin_type: 'customer_trade',
    customer_id: customer1Id,
    purchase_date: '2026-11-26',
    payment_condition: 'cash',
    payment_method: 'cash',
    items: [
      { item_type: 'device', brand: 'Samsung', model: 'S22', imei1: '999888777666555', quantity: 1, unit_cost: 1200, sale_price: 2000 },
    ],
  });
  assert.equal(trade.purchase.origin_type, 'customer_trade');
});
