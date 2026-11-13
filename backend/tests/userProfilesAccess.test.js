const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

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

test('Perfis de Usuário: Login, Identificação de Loja, Dashboard e Permissões', async (t) => {
  const JWT_SECRET = 'test-secret-suite-key-1234567890!';
  process.env.JWT_SECRET = JWT_SECRET;

  const mockStore = {
    id: 1,
    name: 'iTech Celular e Informática',
    status: 'active',
    due_date: '2099-12-31'
  };

  const passwordHash = bcrypt.hashSync('senhaValida123', 8);

  const mockUsers = [
    {
      id: 1,
      store_id: 1,
      username: 'proprietario',
      full_name: 'Proprietário Master',
      role: 'admin',
      is_master: 1,
      active: 1,
      session_version: 1,
      password_hash: passwordHash,
      permissions: '{}'
    },
    {
      id: 2,
      store_id: 1,
      username: 'funcionario_completo',
      full_name: 'Funcionário Completo',
      role: 'employee',
      is_master: 0,
      active: 1,
      session_version: 1,
      password_hash: passwordHash,
      permissions: JSON.stringify({
        customers: true,
        orders: true,
        warranties: true,
        inventory: true,
        store_sales: true,
        device_sales: true,
        credits: true,
        notes: true,
        printing: true
      })
    },
    {
      id: 3,
      store_id: 1,
      username: 'funcionario_limitado',
      full_name: 'Funcionário Limitado',
      role: 'employee',
      is_master: 0,
      active: 1,
      session_version: 1,
      password_hash: passwordHash,
      permissions: JSON.stringify({
        customers: true,
        orders: false,
        warranties: false,
        inventory: false,
        store_sales: false,
        device_sales: false,
        credits: false,
        notes: true,
        printing: false
      })
    }
  ];

  const app = express();
  app.use(express.json());

  // Middleware simulado de autenticação espelhando auth.js
  const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = mockUsers.find(u => u.id === decoded.id);
      if (!user || !user.active) {
        return res.status(401).json({ error: 'Usuário inválido ou inativo.' });
      }
      const rawPerms = JSON.parse(user.permissions || '{}');
      req.user = {
        ...user,
        permissions: user.role === 'admin'
          ? { customers: true, orders: true, warranties: true, inventory: true, store_sales: true, device_sales: true, credits: true, notes: true, printing: true }
          : rawPerms
      };
      req.store = mockStore;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido.' });
    }
  };

  // Endpoint de login
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = mockUsers.find(u => u.username.toLowerCase() === (username || '').toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }
    const token = jwt.sign(
      { id: user.id, role: user.role, store_id: user.store_id, session_version: user.session_version },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    const rawPerms = JSON.parse(user.permissions || '{}');
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        store_id: user.store_id,
        permissions: user.role === 'admin' ? { customers: true, orders: true } : rawPerms
      },
      store: {
        id: mockStore.id,
        name: mockStore.name,
        status: mockStore.status
      }
    });
  });

  // Endpoint /api/settings
  app.get('/api/settings', authMiddleware, (req, res) => {
    res.json({
      settings: {
        store: { name: req.store.name },
        system: { home: '/dashboard', theme: 'dark' }
      },
      sequences: { order: 100 }
    });
  });

  // Endpoint /api/dashboard/stats
  app.get('/api/dashboard/stats', authMiddleware, (req, res) => {
    res.json({
      total_sales: 1500,
      total_orders: 10,
      total_profit: req.user.role === 'admin' ? 800 : null,
      sales_profit: 300
    });
  });

  // Endpoint /api/service-orders (requer permissão de orders)
  app.get('/api/service-orders', authMiddleware, (req, res) => {
    if (req.user.role !== 'admin' && !req.user.permissions?.orders) {
      return res.status(403).json({ error: 'Você não tem permissão para esta área.' });
    }
    res.json([{ id: 101, customer_name: 'Cliente Teste', status: 'pendente' }]);
  });

  // Endpoint /api/customers (requer permissão de customers)
  app.get('/api/customers', authMiddleware, (req, res) => {
    if (req.user.role !== 'admin' && !req.user.permissions?.customers) {
      return res.status(403).json({ error: 'Você não tem permissão para esta área.' });
    }
    res.json([{ id: 1, name: 'Cliente A' }]);
  });

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));

  try {
    let adminToken, fullEmpToken, limitedEmpToken;

    await t.test('1. Login e identificação de loja para Administrador Master (Proprietário)', async () => {
      const res = await requestHttp(server, 'POST', '/api/auth/login', { 'Content-Type': 'application/json' }, {
        username: 'proprietario',
        password: 'senhaValida123'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.role, 'admin');
      assert.strictEqual(res.body.store.id, 1);
      assert.ok(res.body.token);
      adminToken = res.body.token;
    });

    await t.test('2. Login e identificação de loja para Funcionário com permissão completa', async () => {
      const res = await requestHttp(server, 'POST', '/api/auth/login', { 'Content-Type': 'application/json' }, {
        username: 'funcionario_completo',
        password: 'senhaValida123'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.role, 'employee');
      assert.strictEqual(res.body.store.id, 1);
      assert.ok(res.body.token);
      fullEmpToken = res.body.token;
    });

    await t.test('3. Login e identificação de loja para Funcionário com permissão limitada (sem OS)', async () => {
      const res = await requestHttp(server, 'POST', '/api/auth/login', { 'Content-Type': 'application/json' }, {
        username: 'funcionario_limitado',
        password: 'senhaValida123'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.role, 'employee');
      assert.strictEqual(res.body.store.id, 1);
      assert.ok(res.body.token);
      limitedEmpToken = res.body.token;
    });

    await t.test('4. Carregamento de configurações /api/settings para todos os perfis', async () => {
      for (const token of [adminToken, fullEmpToken, limitedEmpToken]) {
        const res = await requestHttp(server, 'GET', '/api/settings', { Authorization: `Bearer ${token}` });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.settings.store.name, 'iTech Celular e Informática');
      }
    });

    await t.test('5. Carregamento do Dashboard para todos os perfis', async () => {
      for (const token of [adminToken, fullEmpToken, limitedEmpToken]) {
        const res = await requestHttp(server, 'GET', '/api/dashboard/stats', { Authorization: `Bearer ${token}` });
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.total_sales !== undefined);
      }
    });

    await t.test('6. Validação de bloqueio de módulos não autorizados para perfil limitado', async () => {
      // Funcionário limitado não tem permissão para /service-orders
      const osRes = await requestHttp(server, 'GET', '/api/service-orders', { Authorization: `Bearer ${limitedEmpToken}` });
      assert.strictEqual(osRes.status, 403);

      // Mas tem permissão para /customers
      const custRes = await requestHttp(server, 'GET', '/api/customers', { Authorization: `Bearer ${limitedEmpToken}` });
      assert.strictEqual(custRes.status, 200);
    });

    await t.test('7. Validação de acesso liberado a módulos para perfil completo e admin', async () => {
      const adminOS = await requestHttp(server, 'GET', '/api/service-orders', { Authorization: `Bearer ${adminToken}` });
      assert.strictEqual(adminOS.status, 200);

      const empOS = await requestHttp(server, 'GET', '/api/service-orders', { Authorization: `Bearer ${fullEmpToken}` });
      assert.strictEqual(empOS.status, 200);
    });

  } finally {
    server.close();
  }
});
