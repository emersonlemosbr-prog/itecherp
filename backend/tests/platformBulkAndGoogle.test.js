const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { createStoreWithInitialData } = require('../services/multiTenantService');
const googleAuthService = require('../services/googleAuthService');
const express = require('express');
const request = require('http');

function makeRequest(app, method, url, body, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const payload = body ? JSON.stringify(body) : '';
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...customHeaders
      };

      const options = {
        hostname: '127.0.0.1',
        port: port,
        path: url,
        method: method,
        headers: headers
      };

      const req = request.request(options, (res) => {
        let resData = '';
        res.on('data', chunk => { resData += chunk; });
        res.on('end', () => {
          server.close(() => {
            let json = null;
            try {
              json = JSON.parse(resData);
            } catch (e) {
              json = resData;
            }
            resolve({ status: res.statusCode, body: json, headers: res.headers });
          });
        });
      });

      req.on('error', (err) => {
        server.close(() => reject(err));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  });
}

test('Google Auth Service: Validação e Configuração de Token', async () => {
  // 1. Token vazio deve lançar erro
  await assert.rejects(
    async () => {
      await googleAuthService.verifyGoogleIdToken('');
    },
    /não fornecida ou inválida/
  );

  // 2. Token inválido deve lançar erro com prefixo
  await assert.rejects(
    async () => {
      await googleAuthService.verifyGoogleIdToken('invalid_token_xyz', 'test_client_id');
    },
    /Token do Google inválido/
  );
});

test('Google Auth Route: Proteção, Validação e Vinculação Segura de Contas', async () => {
  const app = express();
  app.use(express.json());

  const authRoutes = require('../routes/auth');
  app.use('/api/auth', authRoutes);

  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalViteClientId = process.env.VITE_GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.VITE_GOOGLE_CLIENT_ID;

  // 1. Se GOOGLE_CLIENT_ID não estiver configurado no servidor, deve retornar 501 informativo
  const resNoConfig = await makeRequest(app, 'POST', '/api/auth/google', { idToken: 'some_token' });
  assert.equal(resNoConfig.status, 501);
  assert.equal(resNoConfig.body.code, 'GOOGLE_AUTH_NOT_CONFIGURED');

  // Configurar clientId para os testes subsequentes
  process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

  // 2. Requisição com Client ID configurado mas sem idToken deve retornar 400
  const resNoToken = await makeRequest(app, 'POST', '/api/auth/google', {});
  assert.equal(resNoToken.status, 400);
  assert.equal(resNoToken.body.success, false);

  // 3. Mockar o serviço para validar fluxos de vinculação segura e preenchimento de loja
  const origVerify = googleAuthService.verifyGoogleIdToken;
  try {
    const testGoogleSub = `sub_google_${Date.now()}`;
    const testEmail = `google_user_${Date.now()}@teste.com`;

    googleAuthService.verifyGoogleIdToken = async (token) => {
      if (token === 'valid_new_user_token') {
        return {
          sub: testGoogleSub,
          email: testEmail,
          name: 'Nome Google Teste',
          picture: 'https://example.com/photo.jpg',
          email_verified: true
        };
      }
      if (token === 'unverified_email_token') {
        const error = new Error('O e-mail da conta Google informada não está verificado.');
        error.code = 'EMAIL_NOT_VERIFIED';
        throw error;
      }
      throw new Error('Token inválido');
    };

    // Caso A: Novo usuário Google -> deve retornar status 'new_store' com dados verificados
    const resNew = await makeRequest(app, 'POST', '/api/auth/google', { idToken: 'valid_new_user_token' });
    assert.equal(resNew.status, 200);
    assert.equal(resNew.body.status, 'new_store');
    assert.equal(resNew.body.googleData.email, testEmail);
    assert.equal(resNew.body.googleData.googleId, testGoogleSub);

    // Caso B: Usuário já cadastrado por e-mail e senha tradicionais
    const store = createStoreWithInitialData({
      storeName: 'Loja Existente Senha',
      ownerName: 'Dono Tradicional',
      email: testEmail,
      phone: '11999990000',
      ownerPassword: 'senhaTradicional123',
      nickname: `trad_${Date.now()}`,
      erpPassword: 'senhaErp123'
    });

    // Tentar autenticar com Google SEM fornecer a senha existente:
    // DEVE RECUSAR vinculação automática (regra de segurança 2.4.6)
    const resLinkingNoPass = await makeRequest(app, 'POST', '/api/auth/google', { idToken: 'valid_new_user_token' });
    assert.equal(resLinkingNoPass.status, 200);
    assert.equal(resLinkingNoPass.body.status, 'needs_link_confirmation');

    // Tentar com senha incorreta -> 401
    const resLinkingWrongPass = await makeRequest(app, 'POST', '/api/auth/google', {
      idToken: 'valid_new_user_token',
      linkPassword: 'senhaErrada'
    });
    assert.equal(resLinkingWrongPass.status, 401);

    // Fornecer a senha correta -> deve vincular com sucesso e autenticar a loja
    const resLinkingOk = await makeRequest(app, 'POST', '/api/auth/google', {
      idToken: 'valid_new_user_token',
      linkPassword: 'senhaTradicional123'
    });
    assert.equal(resLinkingOk.status, 200);
    assert.equal(resLinkingOk.body.status, 'authenticated');
    assert.equal(resLinkingOk.body.store.id, store.storeId);

    // Verificar no banco que o google_id foi persistido na loja
    const updatedStore = db.prepare('SELECT google_id FROM stores WHERE id = ?').get(store.storeId);
    assert.equal(updatedStore.google_id, testGoogleSub);

    // Próximo login com esse mesmo Google Token já entra diretamente sem pedir senha
    const resDirectLogin = await makeRequest(app, 'POST', '/api/auth/google', { idToken: 'valid_new_user_token' });
    assert.equal(resDirectLogin.status, 200);
    assert.equal(resDirectLogin.body.status, 'authenticated');
    assert.equal(resDirectLogin.body.store.id, store.storeId);

    // Prevenção de duplicação: tentar criar outra loja com mesmo googleId deve ser bloqueado
    assert.throws(
      () => {
        createStoreWithInitialData({
          storeName: 'Segunda Loja Clone',
          ownerName: 'Outro Dono',
          email: `outro_${Date.now()}@teste.com`,
          phone: '11999990001',
          ownerPassword: 'senha123',
          nickname: `clone_${Date.now()}`,
          erpPassword: 'senha123',
          googleId: testGoogleSub
        });
      },
      /Esta conta Google já está vinculada/
    );

  } finally {
    googleAuthService.verifyGoogleIdToken = origVerify;
    if (originalClientId) process.env.GOOGLE_CLIENT_ID = originalClientId;
    else delete process.env.GOOGLE_CLIENT_ID;
    if (originalViteClientId) process.env.VITE_GOOGLE_CLIENT_ID = originalViteClientId;
    else delete process.env.VITE_GOOGLE_CLIENT_ID;
  }
});

test('Superadmin: Atualização de Vencimento e Recuperação de Status em Atraso', async () => {
  const app = express();
  app.use(express.json());

  const platformRoutes = require('../routes/platform');
  app.use('/api/platform', platformRoutes);

  // Obter admin real da plataforma
  const admin = db.prepare('SELECT * FROM platform_users WHERE active = 1 LIMIT 1').get();
  assert.ok(admin, 'Deve haver pelo menos um administrador da plataforma ativo');

  const validAdminToken = jwt.sign(
    { id: admin.id, role: 'platform_admin', type: 'platform', session_version: admin.session_version },
    process.env.JWT_SECRET || 'itech-secret-key-default',
    { expiresIn: '1h' }
  );

  const fakeUserToken = jwt.sign(
    { id: 999, role: 'user', type: 'store' },
    process.env.JWT_SECRET || 'itech-secret-key-default',
    { expiresIn: '1h' }
  );

  // Criar loja de teste
  const store = createStoreWithInitialData({
    storeName: 'Loja Vencimento Teste',
    ownerName: 'Dono Vencimento',
    email: `venc_${Date.now()}@teste.com`,
    phone: '11999991234',
    ownerPassword: 'senha123',
    nickname: `venc_${Date.now()}`,
    erpPassword: 'senha123'
  });

  // Simular que a loja está em atraso
  db.prepare(`
    UPDATE stores
    SET status = 'overdue', due_date = '2026-01-01', grace_period_days = 3
    WHERE id = ?
  `).run(store.storeId);

  // 1. Tentar alterar vencimento sem token -> 401
  const resNoAuth = await makeRequest(
    app,
    'PUT',
    `/api/platform/stores/${store.storeId}/due-date`,
    { dueDate: '2026-12-31' }
  );
  assert.equal(resNoAuth.status, 401);

  // 2. Tentar alterar vencimento com token de usuário comum -> 403
  const resForbidden = await makeRequest(
    app,
    'PUT',
    `/api/platform/stores/${store.storeId}/due-date`,
    { dueDate: '2026-12-31' },
    { Authorization: `Bearer ${fakeUserToken}` }
  );
  assert.equal(resForbidden.status, 403);

  // 3. Atualizar como superadmin com formato ISO completo (ex: vindo de datepicker)
  const resSuccess = await makeRequest(
    app,
    'PUT',
    `/api/platform/stores/${store.storeId}/due-date`,
    { dueDate: '2027-06-15T00:00:00.000Z', notes: 'Prazo estendido pelo superadmin' },
    { Authorization: `Bearer ${validAdminToken}` }
  );
  assert.equal(resSuccess.status, 200);
  assert.equal(resSuccess.body.success, true);
  assert.equal(resSuccess.body.store.due_date, '2027-06-15');
  assert.equal(resSuccess.body.store.status, 'active', 'Loja em atraso com nova data no futuro deve voltar a ser ativa');

  // 4. Verificar que histórico de assinatura foi gravado
  const history = db.prepare('SELECT * FROM store_subscription_history WHERE store_id = ? ORDER BY id DESC LIMIT 1').get(store.storeId);
  assert.ok(history, 'Histórico de assinatura deve ser registrado');
  assert.equal(history.action, 'due_date_update');
  assert.equal(history.new_due_date, '2027-06-15');
});

test('Superadmin: Ações em Massa (Ativar, Suspender, Excluir e Proteções)', async () => {
  const app = express();
  app.use(express.json());

  const platformRoutes = require('../routes/platform');
  app.use('/api/platform', platformRoutes);

  const admin = db.prepare('SELECT * FROM platform_users WHERE active = 1 LIMIT 1').get();
  const validAdminToken = jwt.sign(
    { id: admin.id, role: 'platform_admin', type: 'platform', session_version: admin.session_version },
    process.env.JWT_SECRET || 'itech-secret-key-default',
    { expiresIn: '1h' }
  );

  const fakeUserToken = jwt.sign(
    { id: 999, role: 'user', type: 'store' },
    process.env.JWT_SECRET || 'itech-secret-key-default',
    { expiresIn: '1h' }
  );

  // Criar 3 lojas para o teste em massa
  const storeA = createStoreWithInitialData({
    storeName: 'Loja Massa A',
    ownerName: 'Dono Massa A',
    email: `massa_a_${Date.now()}@teste.com`,
    phone: '11999990001',
    ownerPassword: 'senha123',
    nickname: `massa_a_${Date.now()}`,
    erpPassword: 'senha123'
  });

  const storeB = createStoreWithInitialData({
    storeName: 'Loja Massa B',
    ownerName: 'Dono Massa B',
    email: `massa_b_${Date.now()}@teste.com`,
    phone: '11999990002',
    ownerPassword: 'senha123',
    nickname: `massa_b_${Date.now()}`,
    erpPassword: 'senha123'
  });

  const storeC = createStoreWithInitialData({
    storeName: 'Loja Massa C',
    ownerName: 'Dono Massa C',
    email: `massa_c_${Date.now()}@teste.com`,
    phone: '11999990003',
    ownerPassword: 'senha123',
    nickname: `massa_c_${Date.now()}`,
    erpPassword: 'senha123'
  });

  // 1. Bloqueio para usuário não superadmin (403)
  const resAuth = await makeRequest(
    app,
    'POST',
    '/api/platform/stores/bulk-action',
    { action: 'activate', storeIds: [storeA.storeId] },
    { Authorization: `Bearer ${fakeUserToken}` }
  );
  assert.equal(resAuth.status, 403);

  // 2. Ação em massa: ATIVAR
  const resBulkActivate = await makeRequest(
    app,
    'POST',
    '/api/platform/stores/bulk-action',
    {
      action: 'activate',
      storeIds: [storeA.storeId, storeB.storeId, 1], // Incluindo 1 para testar proteção
      dueDate: '2027-12-31',
      notes: 'Ativação em massa de boas vindas'
    },
    { Authorization: `Bearer ${validAdminToken}` }
  );
  assert.equal(resBulkActivate.status, 200);
  assert.equal(resBulkActivate.body.success, true);
  assert.equal(resBulkActivate.body.processed_count, 3, 'Deve processar as três lojas');

  const checkA = db.prepare('SELECT status, due_date FROM stores WHERE id = ?').get(storeA.storeId);
  assert.equal(checkA.status, 'active');
  assert.equal(checkA.due_date, '2027-12-31');

  // 3. Ação em massa: SUSPENDER
  const resBulkSuspend = await makeRequest(
    app,
    'POST',
    '/api/platform/stores/bulk-action',
    {
      action: 'suspend',
      storeIds: [storeA.storeId, storeB.storeId, 1], // Loja 1 protegida contra suspensão
      notes: 'Suspensão temporária para auditoria'
    },
    { Authorization: `Bearer ${validAdminToken}` }
  );
  assert.equal(resBulkSuspend.status, 200);
  assert.equal(resBulkSuspend.body.processed_count, 2);
  assert.ok(resBulkSuspend.body.skipped_ids.some(s => s.id === 1), 'Loja 1 deve ser protegida de suspensão');

  const checkASuspended = db.prepare('SELECT status FROM stores WHERE id = ?').get(storeA.storeId);
  assert.equal(checkASuspended.status, 'suspended');

  // 4. Ação em massa: EXCLUIR sem confirmar com texto 'EXCLUIR' -> deve ser bloqueado com 400
  const resBulkDelNoConfirm = await makeRequest(
    app,
    'POST',
    '/api/platform/stores/bulk-action',
    {
      action: 'delete',
      storeIds: [storeA.storeId, storeB.storeId],
      confirmation: 'excluir' // minúsculo não pode passar
    },
    { Authorization: `Bearer ${validAdminToken}` }
  );
  assert.equal(resBulkDelNoConfirm.status, 400);

  // 5. Ação em massa: EXCLUIR com texto correto 'EXCLUIR'
  // Inserir dados filhos na loja C para certificar exclusão em cascata completa e atômica
  const catC = db.prepare('INSERT INTO stock_categories (store_id, name) VALUES (?, ?)').run(storeC.storeId, 'Capas C');
  db.prepare('INSERT INTO stock_products (store_id, code, name, category_id, sale_price) VALUES (?, ?, ?, ?, ?)').run(
    storeC.storeId, 'COD_C', 'Produto C', catC.lastInsertRowid, 50.0
  );

  const resBulkDelOk = await makeRequest(
    app,
    'POST',
    '/api/platform/stores/bulk-action',
    {
      action: 'delete',
      storeIds: [storeA.storeId, storeB.storeId, storeC.storeId, 1], // Loja 1 nunca pode ser excluída
      confirmation: 'EXCLUIR'
    },
    { Authorization: `Bearer ${validAdminToken}` }
  );
  assert.equal(resBulkDelOk.status, 200);
  assert.equal(resBulkDelOk.body.success, true);
  assert.equal(resBulkDelOk.body.processed_count, 3);
  assert.ok(resBulkDelOk.body.skipped_ids.some(s => s.id === 1), 'Loja 1 nunca deve ser excluída');

  // Verificar que as lojas foram apagadas
  const checkDeletedA = db.prepare('SELECT id FROM stores WHERE id = ?').get(storeA.storeId);
  const checkDeletedB = db.prepare('SELECT id FROM stores WHERE id = ?').get(storeB.storeId);
  const checkDeletedC = db.prepare('SELECT id FROM stores WHERE id = ?').get(storeC.storeId);
  assert.equal(checkDeletedA, undefined);
  assert.equal(checkDeletedB, undefined);
  assert.equal(checkDeletedC, undefined);

  // Verificar que tabelas filhas da loja C foram removidas
  const checkProdC = db.prepare('SELECT id FROM stock_products WHERE store_id = ?').get(storeC.storeId);
  assert.equal(checkProdC, undefined);

  // Loja 1 continua viva e intacta
  const checkStore1 = db.prepare('SELECT id, status FROM stores WHERE id = 1').get();
  assert.ok(checkStore1, 'Loja 1 deve permanecer intacta');

  // 6. Verificar que a ação foi registrada em platform_audit_logs
  const auditLog = db.prepare(`
    SELECT * FROM platform_audit_logs
    WHERE action = 'BULK_DELETE'
    ORDER BY id DESC LIMIT 1
  `).get();
  assert.ok(auditLog, 'Auditoria de ação em massa deve ser registrada');
  assert.equal(auditLog.platform_user_name, admin.name);
  const details = JSON.parse(auditLog.details || '{}');
  assert.equal(details.processed_ids.length, 3);
});
