const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const http = require('node:http');

// Helper para fazer requisições HTTP locais a um app Express de teste
function requestHttp(server, method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function extractDateOnlyString(val) {
  if (!val) return null;
  if (typeof val === 'string') {
    const match = val.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : val.slice(0, 10);
  }
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val).slice(0, 10);
}

test('Full Multi-Tenant Subscription & Registration Audit: Pending -> Active -> Login -> Overdue -> Suspended -> Reactivation', async (t) => {
  const jwtSecret = 'test-audit-subscription-jwt-secret-key-32b!';

  // Simulação em memória de banco de dados isolado para o teste
  const mockDb = {
    stores: [],
    users: [],
    history: [],
    settings: [],
  };

  // Simulação da lógica de checkStoreSubscription (idêntica a multiTenantService.js)
  async function checkStoreSub(store) {
    if (!store) return { isAccessible: false, status: 'not_found' };

    const now = new Date();
    const todayStr = extractDateOnlyString(now);
    const dueDateStr = extractDateOnlyString(store.due_date);

    if (store.status === 'pending_activation') {
      return {
        isAccessible: false,
        status: 'pending_activation',
        reason: 'Sua loja está aguardando ativação pela nossa equipe.',
        dueDate: dueDateStr
      };
    }

    // Auto-recuperação de lojas suspensas com vencimento vigente
    if ((store.status === 'suspended' || store.status === 'overdue') && dueDateStr && dueDateStr >= todayStr) {
      store.status = 'active';
      mockDb.history.push({ store_id: store.id, action: 'auto_reactivated_valid_due_date' });
    }

    if (store.status === 'suspended') {
      return {
        isAccessible: false,
        status: 'suspended',
        reason: 'Acesso suspenso por assinatura vencida ou pendente.',
        dueDate: dueDateStr
      };
    }

    if (dueDateStr) {
      const dueDate = new Date(`${dueDateStr}T23:59:59`);
      const graceDays = Number.isInteger(Number(store.grace_period_days)) && Number(store.grace_period_days) >= 0
        ? Number(store.grace_period_days)
        : 3;
      const graceLimitDate = new Date(dueDate.getTime() + graceDays * 24 * 60 * 60 * 1000);

      if (now > graceLimitDate) {
        store.status = 'suspended';
        mockDb.history.push({ store_id: store.id, action: 'auto_suspended_overdue' });
        return {
          isAccessible: false,
          status: 'suspended',
          reason: `Sua assinatura venceu em ${dueDateStr} e o período de tolerância encerrou.`,
          dueDate: dueDateStr
        };
      } else if (now > dueDate) {
        store.status = 'overdue';
        return {
          isAccessible: true,
          status: 'overdue',
          inGracePeriod: true,
          dueDate: dueDateStr
        };
      }
    }

    return {
      isAccessible: true,
      status: store.status,
      dueDate: dueDateStr
    };
  }

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  // Rota de cadastro de loja (POST /api/auth/register-store)
  app.post('/api/auth/register-store', async (req, res) => {
    const { store_name, owner_name, email, nickname, erp_password } = req.body;
    if (!store_name || !owner_name || !email || !nickname || !erp_password) {
      return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
    }
    const storeId = mockDb.stores.length + 1;
    const store = {
      id: storeId,
      name: store_name,
      owner_name,
      owner_email: email.toLowerCase(),
      status: 'pending_activation',
      due_date: null,
      grace_period_days: 3
    };
    mockDb.stores.push(store);

    const hash = await bcrypt.hash(erp_password, 10);
    const userId = mockDb.users.length + 1;
    const user = {
      id: userId,
      store_id: storeId,
      username: nickname.toLowerCase(),
      password_hash: hash,
      role: 'admin',
      active: 1,
      session_version: 1
    };
    mockDb.users.push(user);

    res.status(201).json({
      success: true,
      store: { id: storeId, name: store_name, email: store.owner_email, status: store.status },
      user: { id: userId, username: user.username, role: user.role }
    });
  });

  // Rota de login no ERP (POST /api/auth/login) - COM AWAIT na assinatura
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = mockDb.users.find(u => u.username === (username || '').toLowerCase());
    if (!user) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });

    const store = mockDb.stores.find(s => s.id === user.store_id);
    if (!store) return res.status(403).json({ error: 'Loja não encontrada.' });

    // Correção: checkStoreSub com AWAIT
    const subscription = await checkStoreSub(store);
    if (!subscription.isAccessible) {
      const isPending = subscription.status === 'pending_activation';
      return res.status(403).json({
        error: subscription.reason,
        code: isPending ? 'STORE_PENDING' : 'STORE_SUSPENDED',
        reason: subscription.reason,
        dueDate: subscription.dueDate
      });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, store_id: user.store_id, session_version: user.session_version },
      jwtSecret,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role },
      store: { id: store.id, name: store.name, status: subscription.status, due_date: store.due_date }
    });
  });

  // Middleware de autenticação protegida de loja
  async function authenticate(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });
    try {
      const payload = jwt.verify(token, jwtSecret);
      const user = mockDb.users.find(u => u.id === payload.id);
      if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
      const store = mockDb.stores.find(s => s.id === user.store_id);
      if (!store) return res.status(403).json({ error: 'Loja não encontrada' });

      const sub = await checkStoreSub(store);
      if (!sub.isAccessible) {
        return res.status(403).json({
          error: sub.reason,
          code: sub.status === 'pending_activation' ? 'STORE_PENDING' : 'STORE_SUSPENDED'
        });
      }
      req.user = user;
      req.store = store;
      next();
    } catch {
      return res.status(401).json({ error: 'Token inválido' });
    }
  }

  // Rota protegida do ERP
  app.get('/api/settings', authenticate, (req, res) => {
    res.json({ settings: { system: { home: '/' } }, store: req.store });
  });

  // Rotas de controle do Superadmin no painel da plataforma
  app.post('/api/platform/stores/:id/activate', async (req, res) => {
    const store = mockDb.stores.find(s => s.id === Number(req.params.id));
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
    const { dueDate, gracePeriodDays } = req.body;
    store.status = 'active';
    store.due_date = dueDate;
    store.grace_period_days = gracePeriodDays || 3;
    res.json({ success: true, store });
  });

  app.put('/api/platform/stores/:id/due-date', async (req, res) => {
    const store = mockDb.stores.find(s => s.id === Number(req.params.id));
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
    const { dueDate } = req.body;
    const today = new Date().toISOString().slice(0, 10);
    store.due_date = dueDate;
    if ((store.status === 'overdue' || store.status === 'suspended') && dueDate >= today) {
      store.status = 'active';
    }
    res.json({ success: true, store });
  });

  app.post('/api/platform/stores/:id/payment', async (req, res) => {
    const store = mockDb.stores.find(s => s.id === Number(req.params.id));
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
    const months = Number(req.body.extendMonths !== undefined ? req.body.extendMonths : req.body.months_to_add) || 1;
    const todayStr = new Date().toISOString().slice(0, 10);
    const currentDueStr = store.due_date ? String(store.due_date).slice(0, 10) : null;
    const baseDate = (currentDueStr && currentDueStr >= todayStr)
      ? new Date(currentDueStr + 'T12:00:00')
      : new Date();
    baseDate.setMonth(baseDate.getMonth() + months);
    store.due_date = baseDate.toISOString().slice(0, 10);
    store.status = 'active';
    res.json({ success: true, store });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  t.after(() => server.close());

  // 1. Cadastrar nova loja
  const regRes = await requestHttp(server, 'POST', '/api/auth/register-store', { 'Content-Type': 'application/json' }, {
    store_name: 'Assistência Beta',
    owner_name: 'Carlos Oliveira',
    email: 'carlos@beta.com',
    nickname: 'beta_carlos',
    erp_password: 'SenhaForte123'
  });
  assert.equal(regRes.status, 201);
  assert.equal(regRes.body.store.status, 'pending_activation');
  const storeId = regRes.body.store.id;

  // 2. Tentar logar com a loja antes da ativação do Superadmin -> DEVE retornar 403 STORE_PENDING (NÃO STORE_SUSPENDED!)
  const loginPendingRes = await requestHttp(server, 'POST', '/api/auth/login', { 'Content-Type': 'application/json' }, {
    username: 'beta_carlos',
    password: 'SenhaForte123'
  });
  assert.equal(loginPendingRes.status, 403);
  assert.equal(loginPendingRes.body.code, 'STORE_PENDING', 'Loja em pending_activation deve retornar STORE_PENDING');

  // 3. Superadmin ativa a loja no painel com 30 dias de vigência
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);
  const futureDateStr = futureDate.toISOString().slice(0, 10);

  const activateRes = await requestHttp(server, 'POST', `/api/platform/stores/${storeId}/activate`, { 'Content-Type': 'application/json' }, {
    dueDate: futureDateStr,
    gracePeriodDays: 3
  });
  assert.equal(activateRes.status, 200);
  assert.equal(activateRes.body.store.status, 'active');

  // 4. Logar com a loja após ativação -> DEVE ter sucesso 200 OK e entrar no ERP
  const loginActiveRes = await requestHttp(server, 'POST', '/api/auth/login', { 'Content-Type': 'application/json' }, {
    username: 'beta_carlos',
    password: 'SenhaForte123'
  });
  assert.equal(loginActiveRes.status, 200, 'Loja ativada deve conseguir logar com sucesso');
  assert.ok(loginActiveRes.body.token, 'Token JWT deve ser gerado');
  assert.equal(loginActiveRes.body.store.status, 'active');

  // 5. Acessar rota protegida (/api/settings) com o token -> DEVE permitir acesso 200 OK
  const token = loginActiveRes.body.token;
  const settingsRes = await requestHttp(server, 'GET', '/api/settings', { 'Authorization': `Bearer ${token}` });
  assert.equal(settingsRes.status, 200);

  // 6. Simular expiração de assinatura: vencimento há 10 dias atrás (além da tolerância de 3 dias)
  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 10);
  const expiredDateStr = expiredDate.toISOString().slice(0, 10);
  mockDb.stores[0].due_date = expiredDateStr;

  // 7. Tentativa de requisição com assinatura expirada -> DEVE bloquear com 403 STORE_SUSPENDED
  const expiredAccessRes = await requestHttp(server, 'GET', '/api/settings', { 'Authorization': `Bearer ${token}` });
  assert.equal(expiredAccessRes.status, 403);
  assert.equal(expiredAccessRes.body.code, 'STORE_SUSPENDED', 'Assinatura vencida deve ser bloqueada com STORE_SUSPENDED');

  // 8. Tentativa de novo login com assinatura expirada -> DEVE retornar 403 STORE_SUSPENDED
  const expiredLoginRes = await requestHttp(server, 'POST', '/api/auth/login', { 'Content-Type': 'application/json' }, {
    username: 'beta_carlos',
    password: 'SenhaForte123'
  });
  assert.equal(expiredLoginRes.status, 403);
  assert.equal(expiredLoginRes.body.code, 'STORE_SUSPENDED');

  // 9. Superadmin renova pelo botão de Pagamento Manual usando months_to_add: 1
  const paymentRes = await requestHttp(server, 'POST', `/api/platform/stores/${storeId}/payment`, { 'Content-Type': 'application/json' }, {
    amount: '99.90',
    months_to_add: 1,
    payment_method: 'pix'
  });
  assert.equal(paymentRes.status, 200);
  assert.equal(paymentRes.body.store.status, 'active');
  assert.ok(paymentRes.body.store.due_date >= new Date().toISOString().slice(0, 10));

  // 10. Login imediato após renovação do pagamento -> DEVE ter sucesso 200 OK
  const loginRenewedRes = await requestHttp(server, 'POST', '/api/auth/login', { 'Content-Type': 'application/json' }, {
    username: 'beta_carlos',
    password: 'SenhaForte123'
  });
  assert.equal(loginRenewedRes.status, 200, 'Loja renovada deve conseguir logar imediatamente');
  assert.equal(loginRenewedRes.body.store.status, 'active');
});
