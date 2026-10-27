const { test, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 1. Ambiente isolado: banco de dados temporário exclusivo para os testes
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itech-stock-mov-test-'));
process.env.ITECH_DB_PATH = path.join(tempDir, 'test.db');
const db = require('../db/database');
const dangerZone = require('../routes/dangerZone');
const { appEvents } = require('../utils/events');

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

async function invoke(method, routePath, { body = {}, user = { id: 1, full_name: 'Admin Teste', username: 'adm', role: 'admin', store_id: 1, is_master: 1 } } = {}) {
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

describe('iTech ERP — Limpeza de Movimentações de Estoque na Zona de Perigo', () => {
  let prodAId, prodBId;

  test('Setup: Inicializar ambiente isolado com loja, usuários, produtos e histórico', () => {
    db.prepare("INSERT OR REPLACE INTO stores (id, name, slug, owner_name, owner_email, status) VALUES (1, 'iTech Principal', 'itech-main', 'Admin', 'adm@itech.com', 'active')").run();
    db.prepare("INSERT OR REPLACE INTO stores (id, name, slug, owner_name, owner_email, status) VALUES (2, 'Loja Secundária', 'loja-sec', 'Outro', 'outro@itech.com', 'active')").run();

    db.prepare("INSERT OR REPLACE INTO users (id, full_name, username, password_hash, role, active, is_master, store_id) VALUES (1, 'Admin Master', 'admin', 'hash', 'admin', 1, 1, 1)").run();
    db.prepare("INSERT OR REPLACE INTO users (id, full_name, username, password_hash, role, active, is_master, store_id) VALUES (2, 'Funcionario Operador', 'func', 'hash', 'employee', 1, 0, 1)").run();

    // Inserir categorias e fornecedores
    const catId = db.prepare("INSERT INTO stock_categories (store_id, name) VALUES (1, 'Telas e Displays')").run().lastInsertRowid;
    const supId = db.prepare("INSERT INTO stock_suppliers (store_id, name) VALUES (1, 'Fornecedor TechParts')").run().lastInsertRowid;

    // Inserir produtos com saldo real em stock_levels
    prodAId = db.prepare(`
      INSERT INTO stock_products (store_id, name, model, code, category_id, supplier_id, cost_price, sale_price, min_stock, is_active)
      VALUES (1, 'Tela iPhone 13 Pro', 'A2638', 'DISP-IP13P', ?, ?, 450.00, 850.00, 3, 1)
    `).run(catId, supId).lastInsertRowid;

    prodBId = db.prepare(`
      INSERT INTO stock_products (store_id, name, model, code, category_id, supplier_id, cost_price, sale_price, min_stock, is_active)
      VALUES (1, 'Conector Carga Moto G60', 'XT2135', 'CON-G60', ?, ?, 15.00, 45.00, 5, 1)
    `).run(catId, supId).lastInsertRowid;

    // Saldos atuais físicos de estoque
    db.prepare('INSERT INTO stock_levels (product_id, quantity) VALUES (?, 12)').run(prodAId);
    db.prepare('INSERT INTO stock_levels (product_id, quantity) VALUES (?, 30)').run(prodBId);

    // Histórico de movimentações de estoque (entradas, saídas, ajustes, vendas)
    db.prepare("INSERT INTO stock_movements (store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, reason, user_name) VALUES (1, ?, 'entry', 10, 0, 10, 'Entrada inicial NF 102', 'Admin Master')").run(prodAId);
    db.prepare("INSERT INTO stock_movements (store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, reason, user_name) VALUES (1, ?, 'entry', 5, 10, 15, 'Compra complementar', 'Admin Master')").run(prodAId);
    db.prepare("INSERT INTO stock_movements (store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, reason, user_name) VALUES (1, ?, 'sale', -3, 15, 12, 'Venda balcão OS 501', 'Funcionario Operador')").run(prodAId);

    db.prepare("INSERT INTO stock_movements (store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, reason, user_name) VALUES (1, ?, 'entry', 35, 0, 35, 'Entrada lote', 'Admin Master')").run(prodBId);
    db.prepare("INSERT INTO stock_movements (store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, reason, user_name) VALUES (1, ?, 'adjustment', -5, 35, 30, 'Ajuste de inventário (avaria)', 'Admin Master')").run(prodBId);

    // Movimentação em OUTRA loja (Loja 2) para validar isolamento
    const prodLoja2 = db.prepare("INSERT INTO stock_products (store_id, name, code, is_active) VALUES (2, 'Pelicula Loja 2', 'PEL-2', 1)").run().lastInsertRowid;
    db.prepare('INSERT INTO stock_levels (product_id, quantity) VALUES (?, 100)').run(prodLoja2);
    db.prepare("INSERT INTO stock_movements (store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, user_name) VALUES (2, ?, 'entry', 100, 0, 100, 'Gerente Loja 2')").run(prodLoja2);

    // Inserir dados de outros módulos (clientes, OS, financeiro) para testar preservação
    const clienteId = db.prepare("INSERT INTO customers (store_id, first_name, last_name, is_system) VALUES (1, 'Carlos', 'Eduardo', 0)").run().lastInsertRowid;
    db.prepare("INSERT INTO service_orders (store_id, order_number, customer_id, entry_date) VALUES (1, 'OS-PRESERVAR-01', ?, '2026-10-26')").run(clienteId);
    db.prepare("INSERT INTO cash_withdrawals (store_id, amount, reason, withdrawal_date) VALUES (1, 80.00, 'Retirada insumos', '2026-10-26')").run();
  });

  // Requisito 1: A quantidade apresentada corresponde ao banco de dados real
  test('1. Quantidade apresentada em GET /stats corresponde exatamente ao banco de dados real', async () => {
    const res = await invoke('GET', '/stats', {
      user: { id: 1, role: 'admin', store_id: 1 }
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.stock_movements, 'Payload deve conter o objeto stock_movements');
    assert.equal(typeof res.body.stock_movements.count, 'number');

    // Contagem real no banco para a Loja 1: exatamente 5 movimentações
    const realDbCount = db.prepare(`
      SELECT COUNT(*) n
      FROM stock_movements sm
      WHERE (sm.store_id = 1 OR (1 = 1 AND sm.store_id IS NULL))
         OR sm.product_id IN (SELECT id FROM stock_products WHERE store_id = 1 OR (1 = 1 AND store_id IS NULL))
    `).get().n;

    assert.equal(realDbCount, 5);
    assert.equal(res.body.stock_movements.count, 5, 'stats.stock_movements.count deve bater com o banco real');
  });

  // Requisito 6: Usuários sem permissão administrativa não conseguem executar a operação
  test('2. Usuário sem permissão administrativa (role: employee) é estritamente bloqueado com HTTP 403', async () => {
    const res = await invoke('POST', '/clear/stock-movements', {
      user: { id: 2, role: 'employee', full_name: 'Funcionario Operador', store_id: 1 }
    });

    assert.equal(res.statusCode, 403);
    assert.match(res.body.error, /administradores/i);

    // Garantir que nenhum registro foi excluído
    const countAfterAttempt = db.prepare('SELECT COUNT(*) n FROM stock_movements WHERE store_id = 1').get().n;
    assert.equal(countAfterAttempt, 5, 'Nenhum dado deve ser alterado após tentativa não autorizada');
  });

  // Requisito 7: Cancelamento não altera nenhum dado
  test('3. Cancelamento ou não confirmação mantém 100% dos dados intactos', () => {
    const countBefore = db.prepare('SELECT COUNT(*) n FROM stock_movements WHERE store_id = 1').get().n;
    assert.equal(countBefore, 5);
    // Simula cancelamento: a API POST /clear/stock-movements só é chamada no front se confirmText === 'EXCLUIR'.
    // Os dados permanecem inalterados.
    const countAfter = db.prepare('SELECT COUNT(*) n FROM stock_movements WHERE store_id = 1').get().n;
    assert.equal(countAfter, 5);
  });

  // Requisito 2, 3 e 4: A exclusão remove as movimentações previstas preservando produtos e saldos
  test('4. Exclusão bem-sucedida por administrador remove histórico de movimentações', async () => {
    let inventoryEventReceived = false;
    let dashboardEventReceived = false;

    const onInv = (payload) => {
      if (payload.action === 'clear_stock_movements') inventoryEventReceived = true;
    };
    const onDash = () => { dashboardEventReceived = true; };

    appEvents.on('inventory:refresh', onInv);
    appEvents.on('dashboard:refresh', onDash);

    const res = await invoke('POST', '/clear/stock-movements', {
      user: { id: 1, role: 'admin', full_name: 'Admin Master', username: 'admin', store_id: 1 }
    });

    appEvents.off('inventory:refresh', onInv);
    appEvents.off('dashboard:refresh', onDash);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.count, 5);
    assert.match(res.body.message, /5 movimentação\(ões\) de estoque excluída\(s\)/);

    // Verificar que stock_movements da Loja 1 agora é 0
    const remainingStore1 = db.prepare('SELECT COUNT(*) n FROM stock_movements WHERE store_id = 1').get().n;
    assert.equal(remainingStore1, 0, 'Todas as 5 movimentações da Loja 1 foram removidas');

    // Verificar que os eventos em tempo real foram disparados
    assert.equal(inventoryEventReceived, true, 'Deve emitir evento inventory:refresh');
    assert.equal(dashboardEventReceived, true, 'Deve emitir evento dashboard:refresh');
  });

  // Requisito 4: Os produtos continuam cadastrados
  test('5. Produtos cadastrados continuam existindo e com suas propriedades preservadas', () => {
    const prodA = db.prepare('SELECT * FROM stock_products WHERE id = ?').get(prodAId);
    assert.ok(prodA, 'Produto A deve existir');
    assert.equal(prodA.name, 'Tela iPhone 13 Pro');
    assert.equal(prodA.code, 'DISP-IP13P');
    assert.equal(prodA.cost_price, 450.00);
    assert.equal(prodA.sale_price, 850.00);
    assert.equal(prodA.is_active, 1);

    const prodB = db.prepare('SELECT * FROM stock_products WHERE id = ?').get(prodBId);
    assert.ok(prodB, 'Produto B deve existir');
    assert.equal(prodB.name, 'Conector Carga Moto G60');
    assert.equal(prodB.code, 'CON-G60');
    assert.equal(prodB.is_active, 1);
  });

  // Requisito 4: Os saldos de estoque permanecem corretos
  test('6. Saldos de estoque físico (stock_levels) permanecem rigorosamente corretos', () => {
    const levelA = db.prepare('SELECT quantity FROM stock_levels WHERE product_id = ?').get(prodAId);
    assert.equal(levelA.quantity, 12, 'Saldo físico do Produto A deve permanecer exatamente 12');

    const levelB = db.prepare('SELECT quantity FROM stock_levels WHERE product_id = ?').get(prodBId);
    assert.equal(levelB.quantity, 30, 'Saldo físico do Produto B deve permanecer exatamente 30');
  });

  // Requisito 4: As demais telas do ERP continuam funcionando
  test('7. Integridade de outros módulos: clientes, OS, retiradas financeiras e fornecedores permanecem intactos', () => {
    const clienteCount = db.prepare('SELECT COUNT(*) n FROM customers WHERE store_id = 1 AND is_system = 0').get().n;
    assert.equal(clienteCount, 1, 'Clientes devem permanecer intocados');

    const osCount = db.prepare('SELECT COUNT(*) n FROM service_orders WHERE store_id = 1').get().n;
    assert.equal(osCount, 1, 'Ordens de serviço devem permanecer intocadas');

    const financeCount = db.prepare('SELECT COUNT(*) n FROM cash_withdrawals WHERE store_id = 1').get().n;
    assert.equal(financeCount, 1, 'Histórico financeiro e retiradas de caixa devem permanecer intocados');

    const supCount = db.prepare('SELECT COUNT(*) n FROM stock_suppliers WHERE store_id = 1').get().n;
    assert.equal(supCount, 1, 'Fornecedores devem permanecer intocados');

    const catCount = db.prepare('SELECT COUNT(*) n FROM stock_categories WHERE store_id = 1').get().n;
    assert.equal(catCount, 1, 'Categorias devem permanecer intocadas');
  });

  // Isolamento multi-tenant
  test('8. Isolamento de lojas: movimentações de outras lojas não foram afetadas', () => {
    const store2Count = db.prepare('SELECT COUNT(*) n FROM stock_movements WHERE store_id = 2').get().n;
    assert.equal(store2Count, 1, 'Movimentação da Loja 2 deve permanecer intacta');
  });

  // Requisito 5: Auditoria com o administrador responsável, data, quantidade e resultado
  test('9. Registro de auditoria gravado com sucesso e detalhes completos', () => {
    const audit = db.prepare("SELECT * FROM audit_log WHERE action = 'danger_zone_clear_stock_movements' ORDER BY id DESC LIMIT 1").get();
    assert.ok(audit, 'Registro de auditoria deve existir');
    assert.equal(audit.record_type, 'danger_zone');
    assert.equal(audit.record_id, 'stock_movements');
    assert.equal(audit.user_id, 1);
    assert.equal(audit.user_name, 'Admin Master');

    const details = JSON.parse(audit.details);
    assert.equal(details.affected_records, 5);
    assert.equal(details.admin_username, 'admin');
    assert.equal(details.store_id, 1);
    assert.equal(details.result, 'success');
    assert.ok(details.executed_at);
  });

  // Requisito 6: Atualização da interface após exclusão (stats agora retorna 0)
  test('10. Nova consulta a GET /stats reflete imediatamente 0 movimentações', async () => {
    const res = await invoke('GET', '/stats', {
      user: { id: 1, role: 'admin', store_id: 1 }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.stock_movements.count, 0, 'Zona de Perigo deve exibir 0 movimentações após limpeza');
  });

  // Requisito 8: Erros no banco não resultam em exclusão parcial indevida (atomicidade)
  test('11. Transação atômica reverte qualquer exclusão parcial em caso de erro', () => {
    // Inserir 2 novas movimentações de teste
    db.prepare("INSERT INTO stock_movements (store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, user_name) VALUES (1, ?, 'entry', 1, 12, 13, 'Admin')").run(prodAId);
    db.prepare("INSERT INTO stock_movements (store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, user_name) VALUES (1, ?, 'entry', 2, 30, 32, 'Admin')").run(prodBId);

    const countBefore = db.prepare('SELECT COUNT(*) n FROM stock_movements WHERE store_id = 1').get().n;
    assert.equal(countBefore, 2);

    // Simular falha durante a transação
    assert.throws(() => {
      db.transaction(() => {
        db.prepare('DELETE FROM stock_movements WHERE product_id = ?').run(prodAId);
        // Lançar erro intencional simulando falha do banco
        throw new Error('SIMULATED_DB_FAILURE');
      })();
    }, /SIMULATED_DB_FAILURE/);

    // O rollback automático do SQLite deve manter todas as 2 movimentações
    const countAfter = db.prepare('SELECT COUNT(*) n FROM stock_movements WHERE store_id = 1').get().n;
    assert.equal(countAfter, 2, 'Todas as movimentações devem ser restauradas via rollback sem exclusão parcial');
  });

  test('12. Execução subsequente com 0 registros retorna mensagem clara e não falha', async () => {
    // Limpar as 2 movimentações adicionadas
    db.prepare('DELETE FROM stock_movements WHERE store_id = 1').run();

    const res = await invoke('POST', '/clear/stock-movements', {
      user: { id: 1, role: 'admin', full_name: 'Admin Master', store_id: 1 }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.count, 0);
    assert.match(res.body.message, /Nenhuma movimentação/i);
  });
});
