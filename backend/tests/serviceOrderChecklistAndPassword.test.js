const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itech-checklist-test-'));
process.env.ITECH_DB_PATH = path.join(tempDir, 'test.db');
process.env.DEVICE_PASSWORD_SECRET = 'test-secret-key-for-devices-1234567890';

const db = require('../db/database');
const { encryptDevicePassword, decryptDevicePassword } = require('../utils/deviceCrypto');
const serviceOrdersRoute = require('../routes/serviceOrders');
const { getPublicOrder, generateTracking } = require('../services/publicTracking');

function getHandler(method, routePath) {
  const layer = serviceOrdersRoute.stack.find(
    (item) => item.route?.path === routePath && item.route.methods[method.toLowerCase()]
  );
  if (!layer) throw new Error(`Route handler not found for ${method} ${routePath}`);
  return layer.route.stack.at(-1).handle;
}

async function executeRoute(fn, { params = {}, body = {}, query = {}, user = { id: 1, role: 'admin', store_id: 1 } }) {
  const out = { statusCode: 200 };
  const res = {
    status(n) {
      out.statusCode = n;
      return this;
    },
    json(b) {
      out.body = b;
      return this;
    },
  };
  await fn({ params, body, query, user }, res, (error) => {
    if (error) throw error;
  });
  return out;
}

test('Suíte de testes: Senha do Aparelho, Criptografia Reversível e Checklist de Entrada', async (t) => {
  t.after(() => {
    try {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  });

  // Setup de usuário e cliente
  db.prepare("INSERT INTO users(id, full_name, username, password_hash, role) VALUES(1, 'Admin Test', 'admin_test', 'hash', 'admin')").run();
  const customerId = db.prepare("INSERT INTO customers(first_name, last_name, phone, address) VALUES('Carlos', 'Silva', '11987654321', 'Rua Teste')").run().lastInsertRowid;

  await t.test('1. Utilitário de Criptografia AES-256-GCM', () => {
    // PIN numérico
    const pin = '2580';
    const encryptedPin = encryptDevicePassword(pin);
    assert.ok(encryptedPin.startsWith('enc:gcm:'), 'Formato deve iniciar com enc:gcm:');
    assert.notEqual(encryptedPin, pin, 'Senha não deve ser armazenada em texto puro');
    assert.equal(decryptDevicePassword(encryptedPin), pin, 'Descriptografia do PIN deve recuperar o valor exato');

    // Senha alfanumérica complexa
    const complexPass = 'Casa@2026!#$';
    const encryptedPass = encryptDevicePassword(complexPass);
    assert.ok(encryptedPass.startsWith('enc:gcm:'));
    assert.notEqual(encryptedPass, complexPass);
    assert.equal(decryptDevicePassword(encryptedPass), complexPass, 'Descriptografia deve recuperar caracteres especiais');

    // Casos vazios e legado
    assert.equal(encryptDevicePassword(''), null);
    assert.equal(encryptDevicePassword(null), null);
    assert.equal(decryptDevicePassword(null), '');
    assert.equal(decryptDevicePassword('senha_legada_sem_criptografia'), 'senha_legada_sem_criptografia', 'Texto legado sem prefixo deve retornar como está');
  });

  await t.test('2. Verificação das colunas da migração segura no SQLite', () => {
    const columns = db.prepare('PRAGMA table_info(service_orders)').all().map((c) => c.name);
    const expected = [
      'unlock_type',
      'unlock_password',
      'unlock_pattern',
      'device_condition',
      'battery_health',
      'checklist_notes',
      'checklist_json',
      'accessories_json',
    ];
    for (const col of expected) {
      assert.ok(columns.includes(col), `Coluna esperada ${col} não encontrada em service_orders`);
    }
  });

  let orderPinId;
  let orderPatternId;

  await t.test('3. Criar OS com PIN numérico e Checklist completo', async () => {
    const createHandler = getHandler('post', '/');
    const reqBody = {
      customer_id: customerId,
      brand: 'Samsung',
      model: 'Galaxy S23',
      entry_date: '2026-10-08',
      description: 'Troca de frontal',
      unlock_type: 'pin',
      unlock_password: '2580',
      device_condition: 'regular',
      battery_health: 85,
      checklist_notes: 'Aparelho com trincado forte no canto superior direito',
      checklist_json: {
        tela_trincada: true,
        camera_traseira: 'funcionando',
        camera_frontal: 'defeito',
      },
      accessories_json: {
        items: ['capa', 'outro'],
        other: 'Caneta Stylus',
      },
    };

    const result = await executeRoute(createHandler, { body: reqBody });
    assert.equal(result.statusCode, 201);
    assert.ok(result.body.id);
    orderPinId = result.body.id;

    // Verificar se no banco a senha foi salva criptografada
    const rawDbRow = db.prepare('SELECT * FROM service_orders WHERE id = ?').get(orderPinId);
    assert.equal(rawDbRow.unlock_type, 'pin');
    assert.ok(rawDbRow.unlock_password.startsWith('enc:gcm:'), 'No banco deve estar criptografado');
    assert.notEqual(rawDbRow.unlock_password, '2580');
    assert.equal(rawDbRow.device_condition, 'regular');
    assert.equal(rawDbRow.battery_health, 85);

    // Na resposta da API autenticada, a senha é descriptografada para o frontend
    assert.equal(result.body.unlock_password, '2580');
  });

  await t.test('4. Obter OS por ID (GET /:id) e validar recuperação completa de checklist e senha', async () => {
    const getByIdHandler = getHandler('get', '/:id');
    const result = await executeRoute(getByIdHandler, { params: { id: orderPinId } });
    assert.equal(result.statusCode, 200);

    const order = result.body;
    assert.equal(order.unlock_type, 'pin');
    assert.equal(order.unlock_password, '2580');
    assert.equal(order.device_condition, 'regular');
    assert.equal(order.battery_health, 85);
    assert.equal(order.checklist_notes, 'Aparelho com trincado forte no canto superior direito');

    const parsedChecklist = JSON.parse(order.checklist_json);
    assert.equal(parsedChecklist.tela_trincada, true);
    assert.equal(parsedChecklist.camera_traseira, 'funcionando');
    assert.equal(parsedChecklist.camera_frontal, 'defeito');

    const parsedAccessories = JSON.parse(order.accessories_json);
    assert.deepEqual(parsedAccessories.items, ['capa', 'outro']);
    assert.equal(parsedAccessories.other, 'Caneta Stylus');
  });

  await t.test('5. Criar OS com Padrão de Desenho Android', async () => {
    const createHandler = getHandler('post', '/');
    const reqBody = {
      customer_id: customerId,
      brand: 'Xiaomi',
      model: 'Redmi Note 13',
      entry_date: '2026-10-08',
      description: 'Limpeza e desoxidação',
      unlock_type: 'pattern',
      unlock_pattern: '1-2-5-8-9',
      device_condition: 'ruim',
      checklist_json: {
        sem_sinais_liquido: false,
        marcas_liquido: true,
        oxidacao_grau: 'moderada',
      },
      accessories_json: {
        items: ['somente_aparelho'],
      },
    };

    const result = await executeRoute(createHandler, { body: reqBody });
    assert.equal(result.statusCode, 201);
    orderPatternId = result.body.id;

    const rawDbRow = db.prepare('SELECT * FROM service_orders WHERE id = ?').get(orderPatternId);
    assert.equal(rawDbRow.unlock_type, 'pattern');
    assert.equal(rawDbRow.unlock_pattern, '1-2-5-8-9');
    assert.equal(rawDbRow.unlock_password, null);
  });

  await t.test('6. Edição de OS (PUT /:id): alterar senha, limpar padrão, alterar checklist', async () => {
    const putHandler = getHandler('put', '/:id');

    // Alterar ordem 1 para senha alfanumérica
    const updateBody = {
      unlock_type: 'password',
      unlock_password: 'NovaSenha@2026',
      device_condition: 'bom',
      battery_health: 92,
      checklist_json: {
        tela_sem_defeito: true,
        camera_traseira: 'funcionando',
        camera_frontal: 'funcionando',
      },
    };

    const result = await executeRoute(putHandler, { params: { id: orderPinId }, body: updateBody });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.unlock_type, 'password');
    assert.equal(result.body.unlock_password, 'NovaSenha@2026');
    assert.equal(result.body.device_condition, 'bom');
    assert.equal(result.body.battery_health, 92);

    // Alterar ordem de padrão para 'none' (limpar padrão)
    const updatePatternBody = {
      unlock_type: 'none',
      unlock_pattern: '',
    };
    const resPattern = await executeRoute(putHandler, { params: { id: orderPatternId }, body: updatePatternBody });
    assert.equal(resPattern.statusCode, 200);
    assert.equal(resPattern.body.unlock_type, 'none');
    assert.equal(resPattern.body.unlock_pattern, null);
  });

  await t.test('7. Compatibilidade com OS antiga sem novos campos', async () => {
    // Inserir registro estilo versão antiga diretamente no SQLite
    const legacyOrderId = db.prepare(`
      INSERT INTO service_orders (
        store_id, order_number, customer_id, brand, model, entry_date, description, status, created_by
      ) VALUES (1, 'LEGACY-001', ?, 'Motorola', 'Moto G8', '2026-01-01', 'Troca de bateria', 'received', 1)
    `).run(customerId).lastInsertRowid;

    const getByIdHandler = getHandler('get', '/:id');
    const result = await executeRoute(getByIdHandler, { params: { id: legacyOrderId } });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.brand, 'Motorola');
    assert.equal(result.body.unlock_type, 'none');
    assert.equal(result.body.unlock_password, '');
    assert.equal(result.body.unlock_pattern, null);
    assert.equal(result.body.checklist_json, null);
  });

  await t.test('8. Segurança: listagem (GET /) não expõe a senha dos aparelhos', async () => {
    const listHandler = getHandler('get', '/');
    const result = await executeRoute(listHandler, {});
    assert.equal(result.statusCode, 200);
    assert.ok(Array.isArray(result.body));
    for (const order of result.body) {
      assert.strictEqual(order.unlock_password, undefined, 'unlock_password não deve constar na listagem geral');
    }
  });

  await t.test('9. Segurança estrita do Acompanhamento Público: NUNCA expor senha, PIN ou padrão', () => {
    // Gerar token público para a OS
    const tracking = generateTracking(db, orderPinId);
    assert.ok(tracking && tracking.url);
    const token = tracking.url.split('/').pop();

    const publicOrder = getPublicOrder(db, token);
    assert.ok(publicOrder);
    assert.equal(publicOrder.brand, 'Samsung');
    assert.strictEqual(publicOrder.unlock_password, undefined, 'Acompanhamento público não pode conter senha');
    assert.strictEqual(publicOrder.unlock_pattern, undefined, 'Acompanhamento público não pode conter padrão');
    assert.strictEqual(publicOrder.unlock_type, undefined, 'Acompanhamento público não pode conter tipo de desbloqueio');
    assert.strictEqual(publicOrder.checklist_json, undefined, 'Acompanhamento público não pode conter checklist bruto');
  });
});
