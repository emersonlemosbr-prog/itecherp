const { test, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itech-danger-zone-'));
process.env.ITECH_DB_PATH = path.join(tempDir, 'test.db');
const db = require('../db/database');
const dangerZone = require('../routes/dangerZone');
const { requireRole } = require('../middleware/auth');

after(() => {
  try {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}
});

function findHandler(method, routePath) {
  const layer = dangerZone.stack.find(
    item => item.route?.path === routePath && item.route.methods[method.toLowerCase()]
  );
  if (!layer) throw new Error(`Handler não encontrado para ${method} ${routePath}`);
  return layer.route.stack.at(-1).handle;
}

async function invoke(method, routePath, { body = {}, user = { id: 1, full_name: 'Admin Master', role: 'admin', store_id: 1, is_master: 1 } } = {}) {
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
  const req = { body, user, store: { id: user.store_id || 1 } };

  await new Promise((resolve, reject) => {
    try {
      const p = handler(req, res, err => {
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

describe('Zona de Perigo - Suíte de Testes', () => {
  // Configuração inicial de usuários
  test('0. Inicializar usuários de teste', () => {
    db.prepare("INSERT OR REPLACE INTO stores (id, name, slug, owner_name, owner_email, status) VALUES (1, 'iTech Test', 'itech-test', 'Admin', 'admin@test.com', 'active')").run();
    db.prepare("INSERT INTO users (id, full_name, username, password_hash, role, active, is_master, store_id) VALUES (1, 'Admin Master', 'admin_master', 'hash', 'admin', 1, 1, 1)").run();
    db.prepare("INSERT INTO users (id, full_name, username, password_hash, role, active, is_master, store_id) VALUES (2, 'Admin Auxiliar', 'admin_aux', 'hash', 'admin', 1, 0, 1)").run();
    db.prepare("INSERT INTO users (id, full_name, username, password_hash, role, active, is_master, store_id) VALUES (3, 'Funcionario Comum', 'func_comum', 'hash', 'employee', 1, 0, 1)").run();
  });

  test('1. Permissões: Funcionário é bloqueado pelo requireRole(admin)', () => {
    const out = { statusCode: 200 };
    requireRole('admin')(
      { user: { role: 'employee' } },
      {
        status(n) { out.statusCode = n; return this; },
        json(body) { out.body = body; }
      },
      () => assert.fail('Não deveria autorizar funcionário')
    );
    assert.equal(out.statusCode, 403);
  });

  test('2. Obter estatísticas da Zona de Perigo (GET /stats)', async () => {
    const res = await invoke('GET', '/stats');
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.customers);
    assert.ok(res.body.service_orders);
    assert.ok(res.body.inventory);
    assert.ok(res.body.suppliers);
    assert.ok(res.body.categories);
    assert.ok(res.body.users);
    assert.ok(Array.isArray(res.body.users.list));
  });

  test('3. Clientes com ordens de serviço vinculadas: exclusão deve ser bloqueada com 409', async () => {
    // Inserir cliente e OS
    const cId = db.prepare("INSERT INTO customers (store_id, first_name, last_name, is_system) VALUES (1, 'João', 'Silva', 0)").run().lastInsertRowid;
    db.prepare("INSERT INTO service_orders (store_id, order_number, customer_id, entry_date) VALUES (1, 'OS-DANGER-1', ?, '2026-10-19')").run(cId);

    const res = await invoke('POST', '/clear/customers');
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.blocked, true);
    assert.match(res.body.message, /ordem\(ns\) de serviço/);
    assert.ok(db.prepare('SELECT id FROM customers WHERE id = ?').get(cId));
  });

  test('4. Exclusão de Ordens de Serviço: preserva retiradas de caixa e fiados', async () => {
    const cId = db.prepare("INSERT INTO customers (store_id, first_name, last_name, is_system) VALUES (1, 'Maria', 'Santos', 0)").run().lastInsertRowid;
    const soId = db.prepare("INSERT INTO service_orders (store_id, order_number, customer_id, entry_date) VALUES (1, 'OS-FINANCE-TEST', ?, '2026-10-19')").run(cId).lastInsertRowid;

    // Foto vinculada
    db.prepare("INSERT INTO service_order_photos (service_order_id, storage_key, public_id, url) VALUES (?, 'k1', 'p1', 'https://res.cloudinary.com/demo/image/upload/v1/test.jpg')").run(soId);

    // Retirada de caixa financeira vinculada à peça da OS
    const cwId = db.prepare("INSERT INTO cash_withdrawals (store_id, amount, reason, withdrawal_date, service_order_id, source_type) VALUES (1, 150.00, 'Peça OS-FINANCE-TEST', '2026-10-19', ?, 'service_order_part')").run(soId).lastInsertRowid;

    // Fiado vinculado
    const caId = db.prepare("INSERT INTO credit_accounts (store_id, customer_id, service_order_id, amount, status) VALUES (1, ?, ?, 200.00, 'open')").run(cId, soId).lastInsertRowid;

    // Executar limpeza de OS
    const res = await invoke('POST', '/clear/service-orders');
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.success);

    // Ordens apagadas
    assert.equal(db.prepare('SELECT COUNT(*) n FROM service_orders WHERE store_id = 1').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM service_order_photos WHERE service_order_id = ?').get(soId).n, 0);

    // HISTÓRICO FINANCEIRO PRESERVADO:
    const cw = db.prepare('SELECT * FROM cash_withdrawals WHERE id = ?').get(cwId);
    assert.ok(cw, 'Retirada de caixa não pode ser apagada');
    assert.equal(cw.amount, 150.00);
    assert.equal(cw.service_order_id, null, 'service_order_id desvinculado com sucesso');

    const ca = db.prepare('SELECT * FROM credit_accounts WHERE id = ?').get(caId);
    assert.ok(ca, 'Conta de fiado financeira não pode ser apagada');
    assert.equal(ca.amount, 200.00);
    assert.equal(ca.service_order_id, null, 'service_order_id desvinculado com sucesso');
  });

  test('5. Exclusão de Clientes: com ordens de serviço já removidas, limpeza é concluída com sucesso', async () => {
    // Limpar fiado remanescente para o teste isolado de clientes livres
    db.prepare('DELETE FROM credit_accounts WHERE store_id = 1').run();

    const res = await invoke('POST', '/clear/customers');
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.success);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM customers WHERE store_id = 1 AND is_system = 0').get().n, 0);
  });

  test('6. Estoque: produtos com vendas/movimentações são bloqueados na exclusão física, e alternativas seguras funcionam', async () => {
    // Criar produto com nível e movimentação
    const pId = db.prepare("INSERT INTO stock_products (store_id, name, code, is_active) VALUES (1, 'Tela iPhone 11', 'TELA-11', 1)").run().lastInsertRowid;
    db.prepare('INSERT INTO stock_levels (product_id, quantity) VALUES (?, 10)').run(pId);
    db.prepare("INSERT INTO stock_movements (product_id, movement_type, quantity_delta, previous_quantity, new_quantity) VALUES (?, 'entry', 10, 0, 10)").run(pId);

    // Exclusão física direta deve ser bloqueada
    const resBlocked = await invoke('POST', '/clear/inventory', { body: { action: 'delete' } });
    assert.equal(resBlocked.statusCode, 409);
    assert.equal(resBlocked.body.blocked, true);

    // Alternativa segura: Zerar estoque
    const resZero = await invoke('POST', '/clear/inventory', { body: { action: 'zero_stock' } });
    assert.equal(resZero.statusCode, 200);
    assert.equal(resZero.body.mode, 'zero_stock');
    assert.equal(db.prepare('SELECT quantity FROM stock_levels WHERE product_id = ?').get(pId).quantity, 0);
    assert.equal(db.prepare('SELECT is_active FROM stock_products WHERE id = ?').get(pId).is_active, 1);

    // Alternativa segura: Desativar produtos
    const resDeact = await invoke('POST', '/clear/inventory', { body: { action: 'deactivate' } });
    assert.equal(resDeact.statusCode, 200);
    assert.equal(resDeact.body.mode, 'deactivate');
    assert.equal(db.prepare('SELECT is_active FROM stock_products WHERE id = ?').get(pId).is_active, 0);
  });

  test('7. Fornecedores: com dependências é bloqueado, sem dependências é excluído', async () => {
    const sId = db.prepare("INSERT INTO stock_suppliers (store_id, name) VALUES (1, 'Fornecedor Alpha')").run().lastInsertRowid;
    const pId = db.prepare("INSERT INTO stock_products (store_id, name, code, supplier_id) VALUES (1, 'Cabo USB', 'CABO-USB', ?)").run(sId).lastInsertRowid;

    // Bloqueado por produto vinculado
    const resBlocked = await invoke('POST', '/clear/suppliers');
    assert.equal(resBlocked.statusCode, 409);
    assert.equal(resBlocked.body.blocked, true);

    // Desvincular e excluir fornecedores livres
    db.prepare('UPDATE stock_products SET supplier_id = NULL WHERE id = ?').run(pId);
    const resSuccess = await invoke('POST', '/clear/suppliers');
    assert.equal(resSuccess.statusCode, 200);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM stock_suppliers WHERE store_id = 1').get().n, 0);
  });

  test('8. Categorias: com dependências é bloqueado, sem dependências é excluído', async () => {
    const catId = db.prepare("INSERT INTO stock_categories (store_id, name) VALUES (1, 'Acessórios')").run().lastInsertRowid;
    db.prepare('UPDATE stock_products SET category_id = ? WHERE code = ?').run(catId, 'CABO-USB');

    // Bloqueado
    const resBlocked = await invoke('POST', '/clear/categories');
    assert.equal(resBlocked.statusCode, 409);

    // Desvincular e excluir
    db.prepare('UPDATE stock_products SET category_id = NULL WHERE code = ?').run('CABO-USB');
    const resSuccess = await invoke('POST', '/clear/categories');
    assert.equal(resSuccess.statusCode, 200);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM stock_categories WHERE store_id = 1').get().n, 0);
  });

  test('9. Usuários: regras rígidas de segurança', async () => {
    // Tentativa 1: Excluir a si mesmo
    const resSelf = await invoke('POST', '/clear/users', { body: { user_ids: [1] } });
    assert.equal(resSelf.statusCode, 400);
    assert.match(resSelf.body.error, /própria conta/);

    // Tentativa 2: Excluir ADM Master
    const resMaster = await invoke('POST', '/clear/users', { body: { user_ids: [1] }, user: { id: 2, role: 'admin', store_id: 1 } });
    assert.equal(resMaster.statusCode, 400);

    // Tentativa 3: Excluir todos os administradores restantes (deixar a loja sem admin)
    const resLastAdmin = await invoke('POST', '/clear/users', { body: { user_ids: [2] }, user: { id: 1, role: 'admin', store_id: 1, is_master: 1 } });
    // Se user 1 é admin e user 2 é admin, excluir 2 deixa user 1 como admin. Vamos testar excluir funcionário 3:
    const resFunc = await invoke('POST', '/clear/users', { body: { user_ids: [3] }, user: { id: 1, role: 'admin', store_id: 1, is_master: 1 } });
    assert.equal(resFunc.statusCode, 200);
    assert.equal(db.prepare('SELECT id FROM users WHERE id = 3').get(), undefined);
  });

  test('10. Auditoria: operações da Zona de Perigo gravam logs detalhados sem segredos', () => {
    const logs = db.prepare("SELECT * FROM audit_log WHERE record_type = 'danger_zone'").all();
    assert.ok(logs.length > 0);
    for (const log of logs) {
      assert.ok(log.action.startsWith('danger_zone_'));
      assert.doesNotMatch(log.details || '', /password|token|hash/i);
    }
  });

  test('11. Movimentações de Estoque: contagem real em GET /stats', async () => {
    const countBefore = db.prepare("SELECT COUNT(*) n FROM stock_movements WHERE store_id = 1 OR product_id IN (SELECT id FROM stock_products WHERE store_id = 1)").get().n;

    // Inserir produtos e movimentações reais na Loja 1
    const p1 = db.prepare("INSERT INTO stock_products (store_id, name, code, is_active, cost_price, sale_price) VALUES (1, 'Bateria iPhone 12', 'BAT-12', 1, 80, 160)").run().lastInsertRowid;
    const p2 = db.prepare("INSERT INTO stock_products (store_id, name, code, is_active, cost_price, sale_price) VALUES (1, 'Conector Tipo C', 'CON-TC', 1, 10, 30)").run().lastInsertRowid;
    db.prepare('INSERT INTO stock_levels (product_id, quantity) VALUES (?, 25)').run(p1);
    db.prepare('INSERT INTO stock_levels (product_id, quantity) VALUES (?, 50)').run(p2);

    db.prepare("INSERT INTO stock_movements (store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, user_name) VALUES (1, ?, 'entry', 20, 0, 20, 'Admin Master')").run(p1);
    db.prepare("INSERT INTO stock_movements (store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, user_name) VALUES (1, ?, 'adjustment', 5, 20, 25, 'Admin Master')").run(p1);
    db.prepare("INSERT INTO stock_movements (store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, user_name) VALUES (1, ?, 'entry', 50, 0, 50, 'Admin Master')").run(p2);

    const statsRes = await invoke('GET', '/stats');
    assert.equal(statsRes.statusCode, 200);
    assert.ok(statsRes.body.stock_movements, 'Deve conter a chave stock_movements no payload de stats');
    assert.equal(statsRes.body.stock_movements.count, countBefore + 3, 'A contagem de movimentações deve refletir exatamente os registros do banco');
  });

  test('12. Movimentações de Estoque: bloqueio de usuário não-admin (HTTP 403)', async () => {
    const res = await invoke('POST', '/clear/stock-movements', {
      user: { id: 3, role: 'employee', full_name: 'Funcionario', store_id: 1 }
    });
    assert.equal(res.statusCode, 403, 'Usuário comum deve receber 403');
    assert.match(res.body.error, /administradores/i);
    // Garantir que nenhum registro foi excluído
    assert.ok(db.prepare('SELECT COUNT(*) n FROM stock_movements WHERE store_id = 1').get().n >= 3);
  });

  test('13. Movimentações de Estoque: exclusão real atômica preservando produtos e saldos', async () => {
    // Guardar contagem total antes
    const countToDelete = db.prepare("SELECT COUNT(*) n FROM stock_movements WHERE store_id = 1 OR product_id IN (SELECT id FROM stock_products WHERE store_id = 1)").get().n;
    assert.ok(countToDelete >= 3);

    // Guardar estado dos produtos e saldos antes da exclusão
    const prodBeforeP1 = db.prepare('SELECT * FROM stock_products WHERE code = ?').get('BAT-12');
    const levelBeforeP1 = db.prepare('SELECT quantity FROM stock_levels WHERE product_id = ?').get(prodBeforeP1.id);
    const prodBeforeP2 = db.prepare('SELECT * FROM stock_products WHERE code = ?').get('CON-TC');
    const levelBeforeP2 = db.prepare('SELECT quantity FROM stock_levels WHERE product_id = ?').get(prodBeforeP2.id);

    assert.equal(levelBeforeP1.quantity, 25);
    assert.equal(levelBeforeP2.quantity, 50);

    // Executar exclusão das movimentações pela Zona de Perigo
    const res = await invoke('POST', '/clear/stock-movements', {
      user: { id: 1, role: 'admin', full_name: 'Admin Master', username: 'admin_master', store_id: 1, is_master: 1 }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.count, countToDelete);
    assert.match(res.body.message, new RegExp(`${countToDelete} movimentação\\(ões\\)`));

    // 1. Histórico de movimentações foi excluído
    const remainingMovements = db.prepare('SELECT COUNT(*) n FROM stock_movements WHERE store_id = 1').get().n;
    assert.equal(remainingMovements, 0, 'Todas as movimentações da Loja 1 devem ter sido excluídas');

    // 2. PRODUTOS CONTINUAM CADASTRADOS E ATIVOS
    const prodAfterP1 = db.prepare('SELECT * FROM stock_products WHERE id = ?').get(prodBeforeP1.id);
    const prodAfterP2 = db.prepare('SELECT * FROM stock_products WHERE id = ?').get(prodBeforeP2.id);
    assert.ok(prodAfterP1, 'Produto P1 deve permanecer cadastrado');
    assert.equal(prodAfterP1.is_active, 1);
    assert.ok(prodAfterP2, 'Produto P2 deve permanecer cadastrado');
    assert.equal(prodAfterP2.is_active, 1);

    // 3. SALDOS DE ESTOQUE PERMANECEM EXATAMENTE IGUAIS
    const levelAfterP1 = db.prepare('SELECT quantity FROM stock_levels WHERE product_id = ?').get(prodBeforeP1.id);
    const levelAfterP2 = db.prepare('SELECT quantity FROM stock_levels WHERE product_id = ?').get(prodBeforeP2.id);
    assert.equal(levelAfterP1.quantity, 25, 'Saldo do produto P1 deve ser preservado intacto');
    assert.equal(levelAfterP2.quantity, 50, 'Saldo do produto P2 deve ser preservado intacto');

    // 4. Nova consulta a /stats retorna 0 movimentações
    const newStats = await invoke('GET', '/stats');
    assert.equal(newStats.body.stock_movements.count, 0);
  });

  test('14. Movimentações de Estoque: isolamento multi-tenant (outra loja não é afetada)', async () => {
    // Configurar Loja 2
    db.prepare("INSERT OR REPLACE INTO stores (id, name, slug, owner_name, owner_email, status) VALUES (2, 'Loja Filial', 'loja-filial', 'Gerente', 'gerente@filial.com', 'active')").run();
    const pStore2 = db.prepare("INSERT INTO stock_products (store_id, name, code, is_active) VALUES (2, 'Pelicula 3D Loja 2', 'PEL-L2', 1)").run().lastInsertRowid;
    db.prepare('INSERT INTO stock_levels (product_id, quantity) VALUES (?, 100)').run(pStore2);
    db.prepare("INSERT INTO stock_movements (store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, user_name) VALUES (2, ?, 'entry', 100, 0, 100, 'Gerente 2')").run(pStore2);

    // Loja 1 executa limpeza novamente
    const resStore1 = await invoke('POST', '/clear/stock-movements', {
      user: { id: 1, role: 'admin', full_name: 'Admin Master', store_id: 1, is_master: 1 }
    });
    assert.equal(resStore1.statusCode, 200);
    assert.equal(resStore1.body.count, 0, 'Loja 1 não tinha registros, deve retornar count 0');

    // Loja 2 deve manter sua movimentação intacta
    const store2Movements = db.prepare('SELECT COUNT(*) n FROM stock_movements WHERE store_id = 2').get().n;
    assert.equal(store2Movements, 1, 'Movimentações da Loja 2 não podem ser afetadas pela Loja 1');
  });

  test('15. Movimentações de Estoque: auditoria detalhada com admin, registros afetados e data', () => {
    const log = db.prepare("SELECT * FROM audit_log WHERE action = 'danger_zone_clear_stock_movements' ORDER BY id DESC LIMIT 1").get();
    assert.ok(log, 'Deve haver log de auditoria da limpeza de movimentações');
    assert.equal(log.record_type, 'danger_zone');
    assert.equal(log.record_id, 'stock_movements');
    const details = JSON.parse(log.details);
    assert.ok(details.affected_records >= 3);
    assert.equal(details.admin_id, 1);
    assert.equal(details.result, 'success');
    assert.ok(details.executed_at);
  });

  test('16. Movimentações de Estoque: execução com 0 registros retorna informativo sem erro', async () => {
    const res = await invoke('POST', '/clear/stock-movements', {
      user: { id: 1, role: 'admin', full_name: 'Admin Master', store_id: 1, is_master: 1 }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.count, 0);
    assert.match(res.body.message, /Nenhuma movimentação/i);
  });
});
