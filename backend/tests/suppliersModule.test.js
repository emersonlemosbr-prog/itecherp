const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itech-suppliers-'));
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-suppliers';
process.env.ITECH_DB_PATH = path.join(tmpDir, 'test.db');

const db = require('../db/database');
const app = require('../server');
const { createPurchase } = require('../services/purchasesService');

let server;
let baseUrl;
let token1;
let token2;

function apiReq(method, urlPath, token, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}${urlPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data || '{}') });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test.before(async () => {
  await db.execute("INSERT OR IGNORE INTO stores (id, name, slug, owner_name, owner_email, status) VALUES (1, 'Loja 1', 'loja-1', 'A1', 'a1@test.local', 'active')");
  await db.execute("INSERT OR IGNORE INTO stores (id, name, slug, owner_name, owner_email, status) VALUES (2, 'Loja 2', 'loja-2', 'A2', 'a2@test.local', 'active')");
  await db.execute("INSERT OR IGNORE INTO users (id, store_id, full_name, username, password_hash, role, active, is_master, session_version) VALUES (1, 1, 'Admin 1', 'admin1', 'hash', 'admin', 1, 1, 0)");
  await db.execute("INSERT OR IGNORE INTO users (id, store_id, full_name, username, password_hash, role, active, is_master, session_version) VALUES (2, 2, 'Admin 2', 'admin2', 'hash', 'admin', 1, 1, 0)");

  token1 = jwt.sign({ id: 1, store_id: 1, role: 'admin', session_version: 0 }, process.env.JWT_SECRET);
  token2 = jwt.sign({ id: 2, store_id: 2, role: 'admin', session_version: 0 }, process.env.JWT_SECRET);

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  try { db.close(); } catch (_) {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

test('1. Cadastro, validação de CNPJ inválido, edição e inativação/reativação', async () => {
  const invalid = await apiReq('POST', '/api/inventory/suppliers', token1, {
    name: 'Inválido LTDA',
    person_type: 'PJ',
    document: '11.111.111/1111-11',
  });
  assert.equal(invalid.status, 400);

  const created = await apiReq('POST', '/api/inventory/suppliers', token1, {
    name: 'Distribuidora Tech LTDA',
    trade_name: 'Tech Distribuidora',
    person_type: 'PJ',
    document: '11.222.333/0001-81',
    phone: '11988887777',
    city: 'São Paulo',
    state: 'SP',
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.trade_name, 'Tech Distribuidora');

  // Inativar
  const inact = await apiReq('PUT', `/api/inventory/suppliers/${created.data.id}`, token1, { is_active: 0 });
  assert.equal(inact.status, 200);
  assert.equal(inact.data.is_active, 0);

  // Filtro active_only=true não deve retornar inativo
  const activeList = await apiReq('GET', '/api/inventory/suppliers?active_only=true', token1);
  assert.equal(activeList.data.some(s => s.id === created.data.id), false);

  // Reativar
  const react = await apiReq('PUT', `/api/inventory/suppliers/${created.data.id}`, token1, { is_active: 1 });
  assert.equal(react.status, 200);
  assert.equal(react.data.is_active, 1);
});

test('2. Bloqueio de exclusão com compras vinculadas, histórico e isolamento multi-tenant', async () => {
  const created = await apiReq('POST', '/api/inventory/suppliers', token1, {
    name: 'Fornecedor Compras SA',
    person_type: 'PJ',
  });
  const supplierId = created.data.id;

  await createPurchase(db, 1, { id: 1, full_name: 'Admin 1', username: 'admin1' }, {
    origin_type: 'supplier',
    supplier_id: supplierId,
    purchase_date: '2026-11-26',
    payment_condition: 'cash',
    payment_method: 'pix',
    items: [
      { item_type: 'new_accessory', description: 'Cabo USB-C', identifier: 'CABO-C', quantity: 5, unit_cost: 20, sale_price: 50 },
    ],
  });

  // Exclusão deve ser bloqueada com 409
  const del = await apiReq('DELETE', `/api/inventory/suppliers/${supplierId}`, token1);
  assert.equal(del.status, 409);

  // Histórico de compras do fornecedor
  const hist = await apiReq('GET', `/api/inventory/suppliers/${supplierId}/purchases`, token1);
  assert.equal(hist.status, 200);
  assert.equal(hist.data.items.length, 1);
  assert.equal(Number(hist.data.total_purchased), 100);

  // Loja 2 não enxerga fornecedor da Loja 1
  const list2 = await apiReq('GET', '/api/inventory/suppliers', token2);
  assert.equal(list2.data.some(s => s.id === supplierId), false);
  const hist2 = await apiReq('GET', `/api/inventory/suppliers/${supplierId}/purchases`, token2);
  assert.equal(hist2.status, 404);
});
