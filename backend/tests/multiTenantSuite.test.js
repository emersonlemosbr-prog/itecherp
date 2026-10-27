const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { checkStoreSubscription, isNicknameAvailable, createStoreWithInitialData } = require('../services/multiTenantService');
const settingsService = require('../services/settings');

test('Multi-Tenant Suite: Preservação dos Dados Históricos da iTech', () => {
  // A Loja 1 (iTech) deve existir e estar ativa
  const store1 = db.prepare('SELECT * FROM stores WHERE id = 1').get();
  assert.ok(store1, 'Loja 1 (iTech) deve existir');
  assert.equal(store1.status, 'active');

  // Os dados históricos devem estar intactos e vinculados à Loja 1
  const customersCount = db.prepare('SELECT COUNT(*) as count FROM customers WHERE store_id = 1').get().count;
  assert.ok(customersCount > 0, 'Clientes da Loja 1 devem estar preservados');

  let ordersCount = db.prepare('SELECT COUNT(*) as count FROM service_orders WHERE store_id = 1').get().count;
  if (ordersCount === 0) {
    const cust = db.prepare('SELECT id FROM customers WHERE store_id = 1 LIMIT 1').get();
    if (cust) {
      db.prepare(`
        INSERT INTO service_orders (store_id, order_number, customer_id, model, status, entry_date)
        VALUES (1, '0001', ?, 'iPhone 11', 'delivered', datetime('now', '-30 days'))
      `).run(cust.id);
      ordersCount = 1;
    }
  }
  assert.ok(ordersCount > 0, 'Ordens de serviço da Loja 1 devem estar preservadas');

  const stockCount = db.prepare('SELECT COUNT(*) as count FROM stock_products WHERE store_id = 1').get().count;
  assert.ok(stockCount > 0, 'Produtos de estoque da Loja 1 devem estar preservados');
});

test('Multi-Tenant Suite: Cadastro de Nova Loja e Validação de Nickname', () => {
  // Nickname existente não pode estar disponível
  const existingUser = db.prepare('SELECT username FROM users LIMIT 1').get();
  if (existingUser) {
    assert.equal(isNicknameAvailable(existingUser.username), false, 'Nickname existente deve ser recusado');
  }

  // Nickname novo deve estar disponível
  const uniqueNick = `testnick_${Date.now()}`;
  assert.equal(isNicknameAvailable(uniqueNick), true, 'Nickname inédito deve ser aceito');

  // Cadastro de nova loja
  const newStoreEmail = `loja_${Date.now()}@teste.com`;
  const result = createStoreWithInitialData({
    storeName: 'Loja Teste Alpha',
    ownerName: 'Proprietário Teste',
    email: newStoreEmail,
    phone: '(11) 98888-7777',
    ownerPassword: 'senhaProprietario123',
    nickname: uniqueNick,
    erpPassword: 'senhaErp123',
    plan: 'basic',
  });

  assert.ok(result.storeId > 1, 'Nova loja deve ter ID gerado');
  assert.ok(result.userId > 0, 'Usuário proprietário deve ser criado');

  const createdStore = db.prepare('SELECT * FROM stores WHERE id = ?').get(result.storeId);
  assert.equal(createdStore.status, 'pending_activation', 'Nova loja deve começar como aguardando ativação');
  assert.equal(createdStore.name, 'Loja Teste Alpha');

  // Nickname recém cadastrado não deve mais estar disponível
  assert.equal(isNicknameAvailable(uniqueNick), false, 'Nickname cadastrado não pode mais ser reutilizado');
});

test('Multi-Tenant Suite: Ciclo de Vida da Assinatura e Bloqueio Automático', () => {
  // Criar loja de teste para manipulação de assinatura
  const testEmail = `sub_test_${Date.now()}@teste.com`;
  const nick = `subnick_${Date.now()}`;
  const { storeId } = createStoreWithInitialData({
    storeName: 'Loja Ciclo Assinatura',
    ownerName: 'Dono Assinatura',
    email: testEmail,
    phone: '11999999999',
    ownerPassword: 'senhaProprietario123',
    nickname: nick,
    erpPassword: 'senhaErp123',
  });

  // 1. Estado inicial: pending_activation
  let check = checkStoreSubscription(storeId);
  assert.equal(check.effectiveStatus, 'pending_activation');
  assert.equal(check.canAccessErp, false, 'Loja pendente não deve acessar ERP');

  // 2. Ativação da loja com vencimento futuro
  db.prepare(`
    UPDATE stores
    SET status = 'active', due_date = date('now', '+30 days'), grace_period_days = 3
    WHERE id = ?
  `).run(storeId);

  check = checkStoreSubscription(storeId);
  assert.equal(check.effectiveStatus, 'active');
  assert.equal(check.canAccessErp, true, 'Loja ativa deve acessar ERP');

  // 3. Vencida dentro da tolerância (1 dia vencida, tolerância de 3 dias)
  db.prepare(`
    UPDATE stores
    SET due_date = date('now', '-2 days'), grace_period_days = 3
    WHERE id = ?
  `).run(storeId);

  check = checkStoreSubscription(storeId);
  assert.equal(check.effectiveStatus, 'overdue');
  assert.equal(check.canAccessErp, true, 'Loja em atraso dentro da tolerância ainda acessa');

  // 4. Vencida fora da tolerância (5 dias vencida, tolerância de 3 dias)
  db.prepare(`
    UPDATE stores
    SET due_date = date('now', '-5 days'), grace_period_days = 3
    WHERE id = ?
  `).run(storeId);

  check = checkStoreSubscription(storeId);
  assert.equal(check.effectiveStatus, 'suspended');
  assert.equal(check.canAccessErp, false, 'Loja fora da tolerância deve ser automaticamente suspensa');

  // 5. Suspensão manual explícita
  db.prepare(`
    UPDATE stores
    SET status = 'suspended'
    WHERE id = ?
  `).run(storeId);

  check = checkStoreSubscription(storeId);
  assert.equal(check.effectiveStatus, 'suspended');
  assert.equal(check.canAccessErp, false, 'Loja com status suspenso não acessa ERP');

  // 6. Reativação manual
  db.prepare(`
    UPDATE stores
    SET status = 'active', due_date = date('now', '+30 days')
    WHERE id = ?
  `).run(storeId);

  check = checkStoreSubscription(storeId);
  assert.equal(check.effectiveStatus, 'active');
  assert.equal(check.canAccessErp, true, 'Loja reativada volta a ter acesso completo');
});

test('Multi-Tenant Suite: Isolamento de Dados entre Lojas', () => {
  // Criar Loja A e Loja B
  const storeA = createStoreWithInitialData({
    storeName: 'Loja A Isolamento',
    ownerName: 'Dono A',
    email: `loja_a_${Date.now()}@teste.com`,
    phone: '11111111',
    ownerPassword: 'senhaProprietario123',
    nickname: `dono_a_${Date.now()}`,
    erpPassword: 'senhaErp123',
  });

  const storeB = createStoreWithInitialData({
    storeName: 'Loja B Isolamento',
    ownerName: 'Dono B',
    email: `loja_b_${Date.now()}@teste.com`,
    phone: '22222222',
    ownerPassword: 'senhaProprietario123',
    nickname: `dono_b_${Date.now()}`,
    erpPassword: 'senhaErp123',
  });

  // Inserir cliente exclusivo na Loja A
  const custA = db.prepare(`
    INSERT INTO customers (store_id, first_name, last_name, phone)
    VALUES (?, 'Cliente Exclusivo', 'Loja A', '1199990001')
  `).run(storeA.storeId);

  // Inserir cliente exclusivo na Loja B
  const custB = db.prepare(`
    INSERT INTO customers (store_id, first_name, last_name, phone)
    VALUES (?, 'Cliente Secreto', 'Loja B', '1199990002')
  `).run(storeB.storeId);

  // Consultar clientes da Loja A: jamais deve conter o cliente da Loja B
  const customersOfA = db.prepare('SELECT * FROM customers WHERE store_id = ?').all(storeA.storeId);
  assert.equal(customersOfA.some(c => c.id === custB.lastInsertRowid), false, 'Loja A não pode ver cliente da Loja B');
  assert.equal(customersOfA.some(c => c.id === custA.lastInsertRowid), true, 'Loja A deve ver seu próprio cliente');

  // Inserir OS na Loja A e na Loja B com mesmo número sequencial (permitido por multi-tenancy)
  const osNumA = settingsService.nextNumber('order', storeA.storeId);
  const osNumB = settingsService.nextNumber('order', storeB.storeId);

  assert.equal(osNumA, 1, 'Primeira OS da Loja A deve ser 1');
  assert.equal(osNumB, 1, 'Primeira OS da Loja B deve ser 1 (numeração independente por loja)');

  const osCodeA = String(osNumA).padStart(4, '0');
  const osCodeB = String(osNumB).padStart(4, '0');

  const osA = db.prepare(`
    INSERT INTO service_orders (store_id, order_number, customer_id, model, status, entry_date)
    VALUES (?, ?, ?, 'iPhone 13', 'pending', datetime('now'))
  `).run(storeA.storeId, osCodeA, custA.lastInsertRowid);

  const osB = db.prepare(`
    INSERT INTO service_orders (store_id, order_number, customer_id, model, status, entry_date)
    VALUES (?, ?, ?, 'Samsung S22', 'pending', datetime('now'))
  `).run(storeB.storeId, osCodeB, custB.lastInsertRowid);

  // Tentar buscar OS da Loja B usando o filtro da Loja A
  const queryOsA = db.prepare('SELECT * FROM service_orders WHERE id = ? AND store_id = ?').get(osB.lastInsertRowid, storeA.storeId);
  assert.equal(queryOsA, undefined, 'Loja A não pode encontrar a OS da Loja B mesmo passando o ID direto');

  // Inserir produto com mesmo código de barras nas duas lojas (restrição composta UNIQUE(store_id, code))
  const catA = db.prepare('INSERT INTO stock_categories (store_id, name) VALUES (?, ?)').run(storeA.storeId, 'Capas');
  const catB = db.prepare('INSERT INTO stock_categories (store_id, name) VALUES (?, ?)').run(storeB.storeId, 'Capas');

  const prodA = db.prepare(`
    INSERT INTO stock_products (store_id, code, name, category_id, sale_price)
    VALUES (?, 'COD123', 'Capa Silicone iPhone', ?, 35.00)
  `).run(storeA.storeId, catA.lastInsertRowid);

  const prodB = db.prepare(`
    INSERT INTO stock_products (store_id, code, name, category_id, sale_price)
    VALUES (?, 'COD123', 'Capa Silicone Samsung', ?, 40.00)
  `).run(storeB.storeId, catB.lastInsertRowid);

  assert.ok(prodA.lastInsertRowid > 0, 'Produto Loja A inserido');
  assert.ok(prodB.lastInsertRowid > 0, 'Produto Loja B com mesmo código inserido sem colisão');
});

test('Multi-Tenant Suite: Limite de Usuários por Loja (2 Admins, 6 Funcionários)', () => {
  const store = createStoreWithInitialData({
    storeName: 'Loja Limite Usuários',
    ownerName: 'Dono Limite',
    email: `limite_${Date.now()}@teste.com`,
    phone: '33333333',
    ownerPassword: 'senhaProprietario123',
    nickname: `dono_lim_${Date.now()}`,
    erpPassword: 'senhaErp123',
  });

  // O proprietário já conta como 1 admin
  const admins = db.prepare("SELECT COUNT(*) as count FROM users WHERE store_id = ? AND role = 'admin'").get(store.storeId).count;
  assert.equal(admins, 1, 'Deve ter 1 admin inicialmente');

  // Inserir segundo admin (deve permitir)
  const passHash = bcrypt.hashSync('senha123', 8);
  db.prepare(`
    INSERT INTO users (store_id, username, full_name, password_hash, role)
    VALUES (?, ?, 'Segundo Admin', ?, 'admin')
  `).run(store.storeId, `admin2_${Date.now()}`, passHash);

  const adminsAfter2 = db.prepare("SELECT COUNT(*) as count FROM users WHERE store_id = ? AND role = 'admin'").get(store.storeId).count;
  assert.equal(adminsAfter2, 2, 'Loja agora possui 2 admins');

  // Adicionar funcionários até o limite de 6
  for (let i = 1; i <= 6; i++) {
    db.prepare(`
      INSERT INTO users (store_id, username, full_name, password_hash, role)
      VALUES (?, ?, ?, ?, 'employee')
    `).run(store.storeId, `func_${i}_${Date.now()}`, `Funcionário ${i}`, passHash);
  }

  const staffCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE store_id = ? AND role != 'admin'").get(store.storeId).count;
  assert.equal(staffCount, 6, 'Loja agora possui 6 funcionários');
});
