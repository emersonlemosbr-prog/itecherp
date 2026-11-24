const { test, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itech-dz-suppliers-'));
process.env.ITECH_DB_PATH = path.join(tempDir, 'test.db');
const db = require('../db/database');
const dangerZone = require('../routes/dangerZone');

after(() => {
  try {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}
});

function findHandler(method, routePath) {
  const layer = dangerZone.stack.find(
    (item) => item.route?.path === routePath && item.route.methods[method.toLowerCase()]
  );
  if (!layer) throw new Error(`Handler não encontrado para ${method} ${routePath}`);
  return layer.route.stack.at(-1).handle;
}

async function invoke(
  method,
  routePath,
  { params = {}, body = {}, user = { id: 1, full_name: 'Admin Master', role: 'admin', store_id: 1, is_master: 1 } } = {}
) {
  const handler = findHandler(method, routePath);
  const out = { statusCode: 200, body: null };
  const res = {
    status(code) {
      out.statusCode = code;
      return this;
    },
    json(data) {
      out.body = data;
      return this;
    },
  };
  const req = { params, body, user, store: { id: user.store_id || 1 } };

  await new Promise((resolve, reject) => {
    try {
      const p = handler(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
      if (p && typeof p.then === 'function') {
        p.then(resolve).catch(reject);
      } else {
        resolve();
      }
    } catch (err) {
      reject(err);
    }
  });
  return out;
}

describe('Danger Zone — Fornecedores (Listagem e Exclusão Individual)', () => {
  test('cenários completos: sem vínculos, com produto, com OS, com retirada, multi-tenant, contagem e lote', async () => {
    try {
    // Inserir fornecedores na loja 1 e loja 2
    const sLivre = await db.execute(
      `INSERT INTO stock_suppliers (store_id, name, contact_info) VALUES (1, 'Fornecedor Livre', '11999990001')`
    );
    const sProd = await db.execute(
      `INSERT INTO stock_suppliers (store_id, name) VALUES (1, 'Fornecedor Com Produto')`
    );
    const sOs = await db.execute(
      `INSERT INTO stock_suppliers (store_id, name) VALUES (1, 'Fornecedor Com OS')`
    );
    const sRet = await db.execute(
      `INSERT INTO stock_suppliers (store_id, name) VALUES (1, 'Fornecedor Com Retirada')`
    );
    const sLoja2 = await db.execute(
      `INSERT INTO stock_suppliers (store_id, name) VALUES (2, 'Fornecedor Loja 2')`
    );

    // Criar vínculos
    await db.execute(
      `INSERT INTO stock_products (store_id, name, supplier_id) VALUES (1, 'Tela Teste', ?)`,
      [sProd.id]
    );
    const cust = await db.execute(
      `INSERT INTO customers (store_id, first_name, last_name, is_system) VALUES (1, 'Cliente', 'Teste', 0)`
    );
    await db.execute(
      `INSERT INTO service_orders (store_id, order_number, customer_id, model, entry_date, supplier_id, status) VALUES (1, 'OS-9001', ?, 'iPhone 13', '2026-11-24', ?, 'Aberto')`,
      [cust.id, sOs.id]
    );
    await db.execute(
      `INSERT INTO cash_withdrawals (store_id, amount, reason, supplier_id) VALUES (1, 100.0, 'Compra peça', ?)`,
      [sRet.id]
    );

    // 1. Listar fornecedores da loja 1 (não deve retornar o da loja 2)
    const listRes = await invoke('GET', '/suppliers');
    assert.equal(listRes.statusCode, 200);
    assert.equal(listRes.body.suppliers.length, 4);
    assert.ok(!listRes.body.suppliers.some((s) => s.id === sLoja2.id));

    // 2. Fornecedor de outra loja: não pode ser excluído
    const delOther = await invoke('DELETE', '/suppliers/:id', { params: { id: String(sLoja2.id) } });
    assert.equal(delOther.statusCode, 404);

    // 2b. Fornecedor inexistente: retorna 404
    const delNotFound = await invoke('DELETE', '/suppliers/:id', { params: { id: '999999' } });
    assert.equal(delNotFound.statusCode, 404);

    // 3. Fornecedor com produto: exclusão bloqueada
    const delProd = await invoke('DELETE', '/suppliers/:id', { params: { id: String(sProd.id) } });
    assert.equal(delProd.statusCode, 409);
    assert.equal(delProd.body.blocked, true);
    assert.equal(delProd.body.dependencies.products, 1);

    // 4. Fornecedor com OS vinculada: exclusão bloqueada
    const delOs = await invoke('DELETE', '/suppliers/:id', { params: { id: String(sOs.id) } });
    assert.equal(delOs.statusCode, 409);
    assert.equal(delOs.body.blocked, true);
    assert.equal(delOs.body.dependencies.service_orders, 1);

    // 5. Fornecedor com retirada de caixa vinculada: exclusão bloqueada
    const delRet = await invoke('DELETE', '/suppliers/:id', { params: { id: String(sRet.id) } });
    assert.equal(delRet.statusCode, 409);
    assert.equal(delRet.body.blocked, true);
    assert.equal(delRet.body.dependencies.cash_withdrawals, 1);

    // 6. Fornecedor sem vínculos: exclusão individual permitida
    const delLivre = await invoke('DELETE', '/suppliers/:id', { params: { id: String(sLivre.id) } });
    assert.equal(delLivre.statusCode, 200);
    assert.equal(delLivre.body.success, true);

    // 7. Quantidade atualizada após exclusão
    const statsRes = await invoke('GET', '/stats');
    assert.equal(statsRes.statusCode, 200);
    assert.equal(statsRes.body.suppliers.count, 3);

    // 8. Exclusão em lote continua funcionando (bloqueada enquanto há vínculos)
    const clearBlocked = await invoke('POST', '/clear/suppliers');
    assert.equal(clearBlocked.statusCode, 409);
    assert.equal(clearBlocked.body.blocked, true);
    } catch (err) {
      console.error('EXACT ERROR:', err?.message || err);
      throw err;
    }
  });
});
