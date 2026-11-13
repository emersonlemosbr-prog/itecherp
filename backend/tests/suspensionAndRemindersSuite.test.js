// backend/tests/suspensionAndRemindersSuite.test.js
// Suíte de Testes Automatizados para Modo de Suspensão com Acesso Restrito e Lembretes de Pagamento
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

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

test('Suíte Completa: Modo de Suspensão com Acesso Restrito e Lembretes de Pagamento', async (t) => {
  const JWT_SECRET = 'test-secret-suspension-suite-key-12345!';
  process.env.JWT_SECRET = JWT_SECRET;

  // Banco de dados em memória isolado para os testes da suíte
  const mockDb = {
    stores: [
      {
        id: 1,
        name: 'Loja Alfa Celulares',
        status: 'active',
        due_date: '2026-11-20',
        suspended_at: null,
        suspension_reason: null,
        suspended_by_name: null
      },
      {
        id: 2,
        name: 'Loja Beta Informática',
        status: 'suspended',
        due_date: '2026-11-10',
        suspended_at: '2026-11-12T10:00:00.000Z',
        suspension_reason: 'Mensalidade não paga',
        suspended_by_name: 'Admin Suporte'
      },
      {
        id: 3,
        name: 'Loja Gamma Tech (Lembretes)',
        status: 'active',
        due_date: '2026-11-25',
        suspended_at: null,
        suspension_reason: null,
        suspended_by_name: null
      }
    ],
    users: [
      {
        id: 101,
        store_id: 1,
        username: 'user_alfa',
        full_name: 'Proprietário Alfa',
        role: 'admin',
        is_master: 1,
        active: 1,
        session_version: 1,
        password_hash: bcrypt.hashSync('senha123', 8),
        permissions: '{}'
      },
      {
        id: 201,
        store_id: 2,
        username: 'user_beta',
        full_name: 'Proprietário Beta',
        role: 'admin',
        is_master: 1,
        active: 1,
        session_version: 1,
        password_hash: bcrypt.hashSync('senha123', 8),
        permissions: '{}'
      },
      {
        id: 301,
        store_id: 3,
        username: 'user_gamma',
        full_name: 'Proprietário Gamma',
        role: 'admin',
        is_master: 1,
        active: 1,
        session_version: 1,
        password_hash: bcrypt.hashSync('senha123', 8),
        permissions: '{}'
      }
    ],
    customers: [
      { id: 1, store_id: 1, name: 'Cliente Alfa 1' },
      { id: 2, store_id: 2, name: 'Cliente Beta 1' }
    ],
    service_orders: [
      {
        id: 10,
        store_id: 2,
        order_number: 'OS-0010',
        status: 'in_progress',
        created_at: '2026-11-11T09:00:00.000Z', // Aberta ANTES da suspensão (12/11)
        total_amount: 150.00
      },
      {
        id: 11,
        store_id: 2,
        order_number: 'OS-0011',
        status: 'delivered', // Já finalizada antes da suspensão
        created_at: '2026-11-10T14:00:00.000Z',
        total_amount: 200.00
      },
      {
        id: 12,
        store_id: 2,
        order_number: 'OS-0012',
        status: 'in_progress',
        created_at: '2026-11-13T08:00:00.000Z', // Aberta DEPOIS da suspensão (12/11)
        total_amount: 300.00
      }
    ],
    store_subscription_history: [],
    user_notifications: []
  };

  // Funções mock que simulam a lógica do multiTenantService e suspension middleware
  function checkStoreSub(store) {
    if (!store) return { isAccessible: false, status: 'not_found' };
    const now = new Date();
    const todayStr = extractDateOnlyString(now);
    const dueDateStr = extractDateOnlyString(store.due_date);

    if (store.status === 'suspended') {
      return {
        isAccessible: true,
        isSuspended: true,
        status: 'suspended',
        suspended_at: store.suspended_at,
        suspension_reason: store.suspension_reason,
        reason: store.suspension_reason || 'Loja suspensa pela administração da plataforma.'
      };
    }

    if (store.status === 'active' && dueDateStr && dueDateStr < todayStr) {
      return {
        isAccessible: true,
        isOverdue: true,
        status: 'overdue',
        daysOverdue: 1
      };
    }

    return {
      isAccessible: true,
      status: store.status
    };
  }

  // Configuração do Express com Auth e Middleware de Suspensão
  const app = express();
  app.use(express.json());

  // Middleware de Autenticação simulado
  function authMiddleware(req, res, next) {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }
    const token = header.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = mockDb.users.find(u => u.id === decoded.id);
      if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
      const store = mockDb.stores.find(s => s.id === user.store_id);
      req.user = user;
      req.store = store;
      next();
    } catch {
      return res.status(401).json({ error: 'Token inválido.' });
    }
  }

  // Middleware de Suspensão conforme backend/middleware/suspension.js
  async function suspensionMiddleware(req, res, next) {
    if (!req.store || req.store.status !== 'suspended') {
      return next();
    }

    // 1. Leituras permitidas
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    const path = req.originalUrl || req.url || '';

    // 2. Notificações
    if (path.includes('/notifications')) {
      if (req.method === 'PATCH' || req.method === 'POST') return next();
    }

    // 3. Logout
    if (path.includes('/auth/logout')) return next();

    // 4. Ordens de Serviço
    const isServiceOrders = path.startsWith('/api/service-orders') || path.startsWith('/service-orders');
    if (isServiceOrders) {
      // 4.1. Bloqueia abertura de nova OS
      const isNewOs = req.method === 'POST' && (path === '/api/service-orders' || path === '/api/service-orders/');
      if (isNewOs) {
        return res.status(403).json({
          error: 'Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa. Abertura de novas ordens de serviço bloqueada.',
          code: 'STORE_SUSPENDED',
          reason: req.store.suspension_reason,
          suspended: true
        });
      }

      // 4.2. Bloqueia exclusão física de OS
      if (req.method === 'DELETE' && !path.includes('/photos/')) {
        return res.status(403).json({
          error: 'Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa. Exclusão de ordens de serviço bloqueada.',
          code: 'STORE_SUSPENDED',
          reason: req.store.suspension_reason,
          suspended: true
        });
      }

      // 4.3. Modificações em OS existente
      const match = path.match(/\/service-orders\/(\d+)/);
      if (match) {
        const orderId = Number(match[1]);
        const order = mockDb.service_orders.find(o => o.id === orderId && o.store_id === req.store.id);
        if (!order) {
          return res.status(404).json({ error: 'Ordem de serviço não encontrada nesta loja.' });
        }

        // Deve ter sido aberta antes da data de suspensão
        if (req.store.suspended_at) {
          const orderDate = new Date(order.created_at);
          const suspendedDate = new Date(req.store.suspended_at);
          if (orderDate > suspendedDate) {
            return res.status(403).json({
              error: 'Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa. Esta ordem de serviço foi aberta após a suspensão e não pode ser modificada.',
              code: 'STORE_SUSPENDED',
              reason: req.store.suspension_reason,
              suspended: true
            });
          }
        }

        // Não pode reabrir OS já finalizada
        const FINISHED_STATUSES = ['delivered', 'not_performed'];
        if (FINISHED_STATUSES.includes(order.status)) {
          return res.status(403).json({
            error: 'Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa. Ordens de serviço finalizadas não podem ser reabertas.',
            code: 'STORE_SUSPENDED',
            reason: req.store.suspension_reason,
            suspended: true
          });
        }

        return next();
      }
    }

    // 5. Bloqueio padrão para todas as outras operações de escrita
    return res.status(403).json({
      error: 'Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.',
      code: 'STORE_SUSPENDED',
      reason: req.store.suspension_reason,
      suspended: true
    });
  }

  // Rotas da Plataforma (Admin)
  app.post('/api/platform/stores/:id/suspend', (req, res) => {
    const storeId = Number(req.params.id);
    const store = mockDb.stores.find(s => s.id === storeId);
    if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });

    const reason = req.body.reason || 'Mensalidade pendente';
    const notes = req.body.notes || '';
    const suspendedAt = new Date().toISOString();
    const adminName = req.body.admin_name || 'Admin Plataforma';

    store.status = 'suspended';
    store.suspended_at = suspendedAt;
    store.suspension_reason = reason;
    store.suspended_by_name = adminName;

    mockDb.store_subscription_history.push({
      store_id: storeId,
      action: 'suspend',
      notes: `${reason} - ${notes}`.trim(),
      created_at: suspendedAt
    });

    res.json({ success: true, store });
  });

  app.post('/api/platform/stores/:id/reactivate', (req, res) => {
    const storeId = Number(req.params.id);
    const store = mockDb.stores.find(s => s.id === storeId);
    if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });

    store.status = 'active';
    store.suspended_at = null;
    store.suspension_reason = null;
    store.suspended_by_name = null;

    mockDb.store_subscription_history.push({
      store_id: storeId,
      action: 'reactivate',
      notes: 'Loja reativada pelo administrador',
      created_at: new Date().toISOString()
    });

    res.json({ success: true, store });
  });

  // Rotas de Autenticação
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = mockDb.users.find(u => u.username === username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const store = mockDb.stores.find(s => s.id === user.store_id);
    const subCheck = checkStoreSub(store);

    // Na nova regra: loja suspensa NÃO bloqueia o login
    const token = jwt.sign(
      { id: user.id, store_id: user.store_id, role: user.role, session_version: user.session_version },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        is_suspended: subCheck.isSuspended || false
      },
      store: {
        id: store.id,
        name: store.name,
        status: store.status,
        is_suspended: subCheck.isSuspended || false,
        suspended_at: store.suspended_at || null,
        suspension_reason: store.suspension_reason || null
      }
    });
  });

  app.get('/api/auth/me', authMiddleware, (req, res) => {
    const subCheck = checkStoreSub(req.store);
    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        is_suspended: subCheck.isSuspended || false
      },
      store: {
        id: req.store.id,
        name: req.store.name,
        status: req.store.status,
        is_suspended: subCheck.isSuspended || false,
        suspended_at: req.store.suspended_at,
        suspension_reason: req.store.suspension_reason
      }
    });
  });

  // Endpoints do ERP com middleware de suspensão aplicado
  app.use('/api', authMiddleware, suspensionMiddleware);

  // Consultas de leitura (Dashboard, Clientes, OS, Estoque, Vendas, Notificações)
  app.get('/api/dashboard', (req, res) => {
    res.json({ totalRevenue: 1000, activeOrders: 3, store_id: req.store.id });
  });

  app.get('/api/customers', (req, res) => {
    const list = mockDb.customers.filter(c => c.store_id === req.store.id);
    res.json(list);
  });

  app.get('/api/service-orders', (req, res) => {
    const list = mockDb.service_orders.filter(o => o.store_id === req.store.id);
    res.json(list);
  });

  app.get('/api/service-orders/:id', (req, res) => {
    const order = mockDb.service_orders.find(o => o.id === Number(req.params.id) && o.store_id === req.store.id);
    if (!order) return res.status(404).json({ error: 'OS não encontrada.' });
    res.json(order);
  });

  app.get('/api/inventory', (req, res) => {
    res.json([{ id: 1, name: 'Tela iPhone 11', stock: 5 }]);
  });

  app.get('/api/sales', (req, res) => {
    res.json([{ id: 1, total: 250 }]);
  });

  app.get('/api/notifications', (req, res) => {
    const list = mockDb.user_notifications.filter(n => n.store_id === req.store.id);
    res.json(list);
  });

  // Operações de Escrita Bloqueadas
  app.post('/api/customers', (req, res) => {
    const newCust = { id: mockDb.customers.length + 1, store_id: req.store.id, name: req.body.name };
    mockDb.customers.push(newCust);
    res.status(201).json(newCust);
  });

  app.put('/api/customers/:id', (req, res) => {
    res.json({ success: true, updated: req.params.id });
  });

  app.delete('/api/customers/:id', (req, res) => {
    res.json({ success: true, deleted: req.params.id });
  });

  app.post('/api/service-orders', (req, res) => {
    const newOrder = {
      id: mockDb.service_orders.length + 1,
      store_id: req.store.id,
      order_number: 'OS-NOVA',
      status: 'pending',
      created_at: new Date().toISOString()
    };
    mockDb.service_orders.push(newOrder);
    res.status(201).json(newOrder);
  });

  app.put('/api/service-orders/:id', (req, res) => {
    const order = mockDb.service_orders.find(o => o.id === Number(req.params.id) && o.store_id === req.store.id);
    if (!order) return res.status(404).json({ error: 'OS não encontrada.' });
    if (req.body.status) order.status = req.body.status;
    if (req.body.total_amount) order.total_amount = req.body.total_amount;
    res.json({ success: true, order });
  });

  app.delete('/api/service-orders/:id', (req, res) => {
    res.json({ success: true, deleted: req.params.id });
  });

  app.post('/api/inventory', (req, res) => {
    res.status(201).json({ id: 99, name: req.body.name });
  });

  app.post('/api/sales', (req, res) => {
    res.status(201).json({ id: 88, total: req.body.total });
  });

  app.post('/api/cash-withdrawals', (req, res) => {
    res.status(201).json({ id: 77, amount: req.body.amount });
  });

  app.put('/api/settings', (req, res) => {
    res.json({ success: true });
  });

  app.post('/api/users', (req, res) => {
    res.status(201).json({ id: 66, username: req.body.username });
  });

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));

  try {
    // -------------------------------------------------------------
    // CENÁRIO 1: Loja ativa tem acesso pleno irrestrito
    // -------------------------------------------------------------
    await t.test('1. Loja ativa: Login e operações de escrita normais funcionam', async () => {
      const loginRes = await requestHttp(server, 'POST', '/api/auth/login', { 'Content-Type': 'application/json' }, {
        username: 'user_alfa',
        password: 'senha123'
      });
      assert.equal(loginRes.status, 200);
      assert.equal(loginRes.body.user.is_suspended, false);
      assert.equal(loginRes.body.store.is_suspended, false);

      const token = loginRes.body.token;

      // Criação de cliente liberada
      const custRes = await requestHttp(server, 'POST', '/api/customers', {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }, { name: 'Cliente Alfa Novo' });
      assert.equal(custRes.status, 201);

      // Abertura de nova OS liberada
      const osRes = await requestHttp(server, 'POST', '/api/service-orders', {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }, { device: 'Motorola G20' });
      assert.equal(osRes.status, 201);
    });

    // -------------------------------------------------------------
    // CENÁRIO 2: Suspensão pelo painel administrativo salva dados no banco
    // -------------------------------------------------------------
    await t.test('2. Painel Admin: Suspender loja salva status, data, motivo e histórico', async () => {
      const suspendRes = await requestHttp(server, 'POST', '/api/platform/stores/1/suspend', { 'Content-Type': 'application/json' }, {
        reason: 'Pagamento em atraso',
        notes: 'Atrasado há mais de 10 dias',
        admin_name: 'Suporte Master'
      });
      assert.equal(suspendRes.status, 200);
      assert.equal(suspendRes.body.store.status, 'suspended');
      assert.equal(suspendRes.body.store.suspension_reason, 'Pagamento em atraso');
      assert.equal(suspendRes.body.store.suspended_by_name, 'Suporte Master');
      assert.ok(suspendRes.body.store.suspended_at);

      // Verifica histórico
      const historyEntry = mockDb.store_subscription_history.find(h => h.store_id === 1 && h.action === 'suspend');
      assert.ok(historyEntry);
      assert.match(historyEntry.notes, /Pagamento em atraso/);
    });

    // -------------------------------------------------------------
    // CENÁRIO 3: Login de loja suspensa NÃO é bloqueado
    // -------------------------------------------------------------
    let suspendedToken = null;
    await t.test('3. Loja suspensa: Login é permitido com indicador de suspensão e motivo', async () => {
      const loginRes = await requestHttp(server, 'POST', '/api/auth/login', { 'Content-Type': 'application/json' }, {
        username: 'user_beta',
        password: 'senha123'
      });
      assert.equal(loginRes.status, 200, 'Login não pode ser bloqueado com 403');
      assert.equal(loginRes.body.user.is_suspended, true);
      assert.equal(loginRes.body.store.is_suspended, true);
      assert.equal(loginRes.body.store.status, 'suspended');
      assert.equal(loginRes.body.store.suspension_reason, 'Mensalidade não paga');
      assert.ok(loginRes.body.token);

      suspendedToken = loginRes.body.token;

      // GET /api/auth/me também retorna status de suspensão
      const meRes = await requestHttp(server, 'GET', '/api/auth/me', {
        'Authorization': `Bearer ${suspendedToken}`
      });
      assert.equal(meRes.status, 200);
      assert.equal(meRes.body.user.is_suspended, true);
      assert.equal(meRes.body.store.is_suspended, true);
      assert.equal(meRes.body.store.suspension_reason, 'Mensalidade não paga');
    });

    // -------------------------------------------------------------
    // CENÁRIO 4: Modo restrito permite todas as consultas de leitura
    // -------------------------------------------------------------
    await t.test('4. Modo Restrito: Todas as leituras (GET) são permitidas', async () => {
      const authHeader = { 'Authorization': `Bearer ${suspendedToken}` };

      const dash = await requestHttp(server, 'GET', '/api/dashboard', authHeader);
      assert.equal(dash.status, 200);

      const cust = await requestHttp(server, 'GET', '/api/customers', authHeader);
      assert.equal(cust.status, 200);

      const orders = await requestHttp(server, 'GET', '/api/service-orders', authHeader);
      assert.equal(orders.status, 200);

      const stock = await requestHttp(server, 'GET', '/api/inventory', authHeader);
      assert.equal(stock.status, 200);

      const sales = await requestHttp(server, 'GET', '/api/sales', authHeader);
      assert.equal(sales.status, 200);

      const notifs = await requestHttp(server, 'GET', '/api/notifications', authHeader);
      assert.equal(notifs.status, 200);
    });

    // -------------------------------------------------------------
    // CENÁRIO 5: Modo restrito bloqueia operações comerciais de escrita
    // -------------------------------------------------------------
    await t.test('5. Modo Restrito: Bloqueia escrita comercial com 403 STORE_SUSPENDED', async () => {
      const authHeader = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${suspendedToken}`
      };

      // 5.1. Criar cliente
      const c1 = await requestHttp(server, 'POST', '/api/customers', authHeader, { name: 'Cliente Bloqueado' });
      assert.equal(c1.status, 403);
      assert.equal(c1.body.code, 'STORE_SUSPENDED');
      assert.match(c1.body.error, /Esta funcionalidade está temporariamente indisponível/);

      // 5.2. Editar cliente
      const c2 = await requestHttp(server, 'PUT', '/api/customers/2', authHeader, { name: 'Cliente Alterado' });
      assert.equal(c2.status, 403);
      assert.equal(c2.body.code, 'STORE_SUSPENDED');

      // 5.3. Excluir cliente
      const c3 = await requestHttp(server, 'DELETE', '/api/customers/2', authHeader);
      assert.equal(c3.status, 403);
      assert.equal(c3.body.code, 'STORE_SUSPENDED');

      // 5.4. Criar nova OS
      const os1 = await requestHttp(server, 'POST', '/api/service-orders', authHeader, { device: 'Galaxy S21' });
      assert.equal(os1.status, 403);
      assert.equal(os1.body.code, 'STORE_SUSPENDED');
      assert.match(os1.body.error, /Abertura de novas ordens de serviço bloqueada/);

      // 5.5. Excluir OS
      const os2 = await requestHttp(server, 'DELETE', '/api/service-orders/10', authHeader);
      assert.equal(os2.status, 403);
      assert.equal(os2.body.code, 'STORE_SUSPENDED');
      assert.match(os2.body.error, /Exclusão de ordens de serviço bloqueada/);

      // 5.6. Criar produto no estoque
      const st1 = await requestHttp(server, 'POST', '/api/inventory', authHeader, { name: 'Bateria' });
      assert.equal(st1.status, 403);
      assert.equal(st1.body.code, 'STORE_SUSPENDED');

      // 5.7. Realizar venda
      const sl1 = await requestHttp(server, 'POST', '/api/sales', authHeader, { total: 100 });
      assert.equal(sl1.status, 403);
      assert.equal(sl1.body.code, 'STORE_SUSPENDED');

      // 5.8. Retirada de caixa
      const cw1 = await requestHttp(server, 'POST', '/api/cash-withdrawals', authHeader, { amount: 50 });
      assert.equal(cw1.status, 403);
      assert.equal(cw1.body.code, 'STORE_SUSPENDED');

      // 5.9. Alterar configurações
      const cfg1 = await requestHttp(server, 'PUT', '/api/settings', authHeader, { name: 'Nova Loja' });
      assert.equal(cfg1.status, 403);
      assert.equal(cfg1.body.code, 'STORE_SUSPENDED');

      // 5.10. Criar usuário
      const usr1 = await requestHttp(server, 'POST', '/api/users', authHeader, { username: 'novo_func' });
      assert.equal(usr1.status, 403);
      assert.equal(usr1.body.code, 'STORE_SUSPENDED');
    });

    // -------------------------------------------------------------
    // CENÁRIO 6: Exceção especial para OS abertas antes da suspensão
    // -------------------------------------------------------------
    await t.test('6. Exceção de OS Pré-existente: Edição, peças e finalização permitidas', async () => {
      const authHeader = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${suspendedToken}`
      };

      // OS 10 foi criada em 11/11 (antes da suspensão em 12/11) e está 'in_progress'
      // Permite atualizar valor e peças
      const updateRes = await requestHttp(server, 'PUT', '/api/service-orders/10', authHeader, {
        total_amount: 190.00
      });
      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.body.order.total_amount, 190.00);

      // Permite finalizar e entregar a OS pré-existente
      const deliverRes = await requestHttp(server, 'PUT', '/api/service-orders/10', authHeader, {
        status: 'delivered'
      });
      assert.equal(deliverRes.status, 200);
      assert.equal(deliverRes.body.order.status, 'delivered');

      // Tentar reabrir a OS 10 que agora está 'delivered' deve ser BLOQUEADO
      const reopenRes = await requestHttp(server, 'PUT', '/api/service-orders/10', authHeader, {
        status: 'in_progress'
      });
      assert.equal(reopenRes.status, 403);
      assert.equal(reopenRes.body.code, 'STORE_SUSPENDED');
      assert.match(reopenRes.body.error, /Ordens de serviço finalizadas não podem ser reabertas/);

      // OS 11 já estava 'delivered' antes da suspensão: tentativa de modificação deve ser BLOQUEADA
      const modClosedRes = await requestHttp(server, 'PUT', '/api/service-orders/11', authHeader, {
        total_amount: 250.00
      });
      assert.equal(modClosedRes.status, 403);
      assert.equal(modClosedRes.body.code, 'STORE_SUSPENDED');
      assert.match(modClosedRes.body.error, /Ordens de serviço finalizadas não podem ser reabertas/);

      // OS 12 foi criada em 13/11 (depois da suspensão em 12/11): tentativa de modificação deve ser BLOQUEADA
      const modAfterRes = await requestHttp(server, 'PUT', '/api/service-orders/12', authHeader, {
        total_amount: 350.00
      });
      assert.equal(modAfterRes.status, 403);
      assert.equal(modAfterRes.body.code, 'STORE_SUSPENDED');
      assert.match(modAfterRes.body.error, /aberta após a suspensão e não pode ser modificada/);
    });

    // -------------------------------------------------------------
    // CENÁRIO 7: Reativação da loja restaura operações plenamente
    // -------------------------------------------------------------
    await t.test('7. Reativação: Loja reativada recupera acesso total e permissões', async () => {
      const reactivateRes = await requestHttp(server, 'POST', '/api/platform/stores/2/reactivate', { 'Content-Type': 'application/json' });
      assert.equal(reactivateRes.status, 200);
      assert.equal(reactivateRes.body.store.status, 'active');
      assert.equal(reactivateRes.body.store.suspended_at, null);
      assert.equal(reactivateRes.body.store.suspension_reason, null);

      // Login reflete loja ativa
      const loginRes = await requestHttp(server, 'POST', '/api/auth/login', { 'Content-Type': 'application/json' }, {
        username: 'user_beta',
        password: 'senha123'
      });
      assert.equal(loginRes.status, 200);
      assert.equal(loginRes.body.user.is_suspended, false);
      assert.equal(loginRes.body.store.is_suspended, false);

      const activeToken = loginRes.body.token;
      const authHeader = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeToken}`
      };

      // Criar cliente agora tem sucesso
      const newCust = await requestHttp(server, 'POST', '/api/customers', authHeader, { name: 'Cliente Liberado' });
      assert.equal(newCust.status, 201);

      // Criar OS agora tem sucesso
      const newOs = await requestHttp(server, 'POST', '/api/service-orders', authHeader, { device: 'iPhone 13' });
      assert.equal(newOs.status, 201);
    });

  } finally {
    server.close();
  }
});

// -----------------------------------------------------------------
// CENÁRIO 8 & 9: Teste dos Lembretes de Pagamento e Desduplicação
// -----------------------------------------------------------------
test('Lembretes de Pagamento: Estágios (-7d, -3d, -1d, 0d, +1d, +3d), Desduplicação e Extensão de Ciclo', async (t) => {
  const reminderService = require('../services/subscriptionReminderService');
  const db = require('../db/database');

  // Verifica as funções exportadas
  assert.ok(Array.isArray(reminderService.REMINDER_STAGES));
  assert.equal(reminderService.REMINDER_STAGES.length, 6);

  const stagesKeys = reminderService.REMINDER_STAGES.map(s => s.key);
  assert.deepEqual(stagesKeys, [
    'due_minus_7',
    'due_minus_3',
    'due_minus_1',
    'due_today',
    'due_plus_1',
    'due_plus_3'
  ]);

  // Teste de cálculo de diferença de dias
  assert.equal(reminderService.calculateDayDiff('2026-11-20', '2026-11-13'), 7); // -7 dias (vence em 7 dias)
  assert.equal(reminderService.calculateDayDiff('2026-11-16', '2026-11-13'), 3); // -3 dias (vence em 3 dias)
  assert.equal(reminderService.calculateDayDiff('2026-11-14', '2026-11-13'), 1); // -1 dia (vence amanhã)
  assert.equal(reminderService.calculateDayDiff('2026-11-13', '2026-11-13'), 0); // Vence hoje
  assert.equal(reminderService.calculateDayDiff('2026-11-12', '2026-11-13'), -1); // +1 dia de atraso
  assert.equal(reminderService.calculateDayDiff('2026-11-10', '2026-11-13'), -3); // +3 dias de atraso

  // Simulação de processamento de lembretes em ambiente isolado de teste
  await t.test('8. Processamento e emissão de lembretes com desduplicação rigorosa', async () => {
    // Mock temporário dos métodos de consulta do db para testar o serviço de forma determinística
    const originalQuery = db.query;
    const originalQueryOne = db.queryOne;
    const originalExecute = db.execute;

    const mockNotifications = [];

    db.query = async (sql, params) => {
      if (sql.includes('FROM stores')) {
        return [
          { id: 91, name: 'Loja 7 Dias', status: 'active', due_date: '2026-11-20' },
          { id: 92, name: 'Loja Hoje', status: 'active', due_date: '2026-11-13' },
          { id: 93, name: 'Loja Vencida 1d', status: 'overdue', due_date: '2026-11-12' },
          { id: 94, name: 'Loja Suspensa 3d', status: 'suspended', due_date: '2026-11-10' },
          { id: 95, name: 'Loja Longe', status: 'active', due_date: '2026-11-30' }
        ];
      }
      if (sql.includes('FROM users')) {
        return [{ id: 1001, store_id: params[0], active: 1 }];
      }
      return [];
    };

    db.queryOne = async (sql, params) => {
      if (sql.includes('FROM user_notifications')) {
        const storeId = params[0];
        const searchPattern = params[1].replace(/%/g, '');
        const exists = mockNotifications.find(n => n.store_id === storeId && n.metadata.includes(searchPattern));
        return exists ? { id: exists.id } : null;
      }
      return null;
    };

    db.execute = async (sql, params) => {
      if (sql.includes('INSERT INTO user_notifications')) {
        mockNotifications.push({
          id: mockNotifications.length + 1,
          store_id: params[0],
          user_id: params[1],
          event_key: 'subscription_reminder',
          title: params[2],
          description: params[3],
          metadata: params[4]
        });
        return { changes: 1 };
      }
    };

    try {
      // Executa lembretes para o dia "2026-11-13"
      const result1 = await reminderService.processSubscriptionReminders('2026-11-13');
      // Deve enviar para 4 lojas (91, 92, 93, 94); a loja 95 tem vencimento em 30/11 (+17 dias, nenhum estágio)
      assert.equal(result1.sentReminders, 4);
      assert.equal(mockNotifications.length, 4);

      // Verifica os títulos e reminder_keys gerados
      const rem7 = mockNotifications.find(n => n.store_id === 91);
      assert.match(rem7.title, /vence em 7 dias/);
      assert.match(rem7.metadata, /due_minus_7_2026-11-20/);

      const remHoje = mockNotifications.find(n => n.store_id === 92);
      assert.match(remHoje.title, /vence hoje/);
      assert.match(remHoje.metadata, /due_today_2026-11-13/);

      const rem1d = mockNotifications.find(n => n.store_id === 93);
      assert.match(rem1d.title, /em atraso/);
      assert.match(rem1d.metadata, /due_plus_1_2026-11-12/);

      const rem3d = mockNotifications.find(n => n.store_id === 94);
      assert.match(rem3d.title, /continua pendente/);
      assert.match(rem3d.metadata, /due_plus_3_2026-11-10/);

      // DESDUPLICAÇÃO: Executar novamente para o mesmo dia "2026-11-13" NÃO pode criar novos registros
      const result2 = await reminderService.processSubscriptionReminders('2026-11-13');
      assert.equal(result2.sentReminders, 0, 'Execuções repetidas devem respeitar a desduplicação');
      assert.equal(mockNotifications.length, 4, 'Não podem existir notificações duplicadas');

      // EXTENSÃO DE CICLO: Loja 92 renovou pagamento (due_date alterada de 2026-11-13 para 2026-12-13)
      // No dia seguinte (2026-11-14), ela não deve disparar aviso de atraso do ciclo antigo
      db.query = async (sql, params) => {
        if (sql.includes('FROM stores')) {
          return [
            { id: 92, name: 'Loja Renovada', status: 'active', due_date: '2026-12-13' }
          ];
        }
        return [];
      };

      const resultNextDay = await reminderService.processSubscriptionReminders('2026-11-14');
      assert.equal(resultNextDay.sentReminders, 0, 'Loja com vencimento prorrogado não recebe cobrança do ciclo anterior');
    } finally {
      db.query = originalQuery;
      db.queryOne = originalQueryOne;
      db.execute = originalExecute;
    }
  });
});

