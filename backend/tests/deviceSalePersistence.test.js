const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

process.env.ITECH_DB_PATH = path.join(os.tmpdir(), `itech-erp-device-sale-${process.pid}-${Date.now()}.db`);

const db = require('../db/database');
db.exec("CREATE TABLE IF NOT EXISTS document_sequences (kind TEXT PRIMARY KEY, next_value INTEGER NOT NULL); INSERT OR IGNORE INTO document_sequences (kind, next_value) VALUES ('device', 1), ('sale', 1);");
const { persistDeviceSale } = require('../routes/deviceSales');

db.prepare("INSERT INTO users (full_name, username, password_hash, role) VALUES ('Sistema', 'test-admin', 'hash', 'admin')").run();

test('persistDeviceSale registers the sale in device_sales and store_sales revenue', async () => {
  const customerName = `Cliente Device ${Date.now()}`;

  const productCode = `TEST-${Date.now()}`;
  const productInsert = db.prepare(`
    INSERT INTO stock_products (name, model, code, sale_price, cost_price, min_stock, is_active, created_by)
    VALUES (?, ?, ?, 1500, 900, 0, 1, 1)
  `);
  const productResult = productInsert.run('iPhone 13', 'iPhone 13', productCode);

  db.prepare("INSERT OR REPLACE INTO stock_levels (product_id, quantity, updated_at) VALUES (?, ?, datetime('now'))").run(productResult.lastInsertRowid, 5);

  const sale = await persistDeviceSale({
    user: { id: 1, full_name: 'Sistema' },
    payload: {
      customer_name: customerName,
      customer_cpf_cnpj: '123.456.789-09',
      phone: '(79) 99999-0000',
      address: 'Rua Teste, 123',
      city: 'Aracaju',
      state: 'SE',
      cep: '49000-000',
      email: 'cliente@example.com',
      sale_date: '2026-09-01',
      horario: '14:30',
      seller_name: 'Vendedor Teste',
      payment_method: 'pix',
      notes: 'Venda de aparelho de teste',
      items: [
        { product: 'iPhone 13', quantity: 1, unit_price: 1500 },
      ],
    },
  });

  assert.ok(sale && sale.id, 'deve retornar a venda salva');

  const insertedDeviceSale = db.prepare('SELECT * FROM device_sales WHERE id = ?').get(sale.id);
  assert.ok(insertedDeviceSale, 'a venda de aparelho deve existir no banco');
  assert.equal(insertedDeviceSale.customer_name, customerName);
  assert.equal(Number(insertedDeviceSale.total_amount), 1500);

  const storeSale = db.prepare('SELECT * FROM store_sales WHERE notes = ? ORDER BY id DESC LIMIT 1').get(`device_sale:${sale.id}`);
  assert.ok(storeSale, 'deve registrar a venda no fluxo financeiro do sistema');
  assert.equal(Number(storeSale.total_amount), 1500);
  assert.equal(storeSale.payment_method, 'pix');

  const storeSaleItem = db.prepare('SELECT * FROM store_sale_items WHERE sale_id = ? LIMIT 1').get(storeSale.id);
  assert.ok(storeSaleItem, 'deve registrar o item no resumo da venda');
  assert.equal(Number(storeSaleItem.quantity), 1);
});
