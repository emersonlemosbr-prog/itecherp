const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const http = require('node:http');

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

test('Store Admin Authentication & Production Domain Suite', async (t) => {
  const JWT_SECRET = 'test-secret-key-32-bytes-long-super!';
  
  // Mock data representing Supabase PostgreSQL state
  const mockStore = {
    id: 1,
    name: 'iTech Celular e Informática',
    status: 'active',
    due_date: '2099-12-31'
  };

  const passwordHash = bcrypt.hashSync('senhaCorreta123', 10);
  const mockUsers = [
    {
      id: 1,
      store_id: 1,
      full_name: 'Emerson Lemos',
      username: 'itechcelular',
      password_hash: passwordHash,
      role: 'admin',
      active: 1,
      is_master: 1
    },
    {
      id: 2,
      store_id: 1,
      full_name: 'Funcionario Teste',
      username: 'tecnico',
      password_hash: passwordHash,
      role: 'employee',
      active: 1,
      is_master: 0
    }
  ];

  const app = express();
  
  // Configuração CORS igual a backend/server.js
  const allowedOrigins = [
    'https://erp.itechcelulareinformatica.com.br',
    'https://acompanhar.itechcelulareinformatica.com.br',
    'https://itechcelulareinformatica.com.br',
    'https://www.itechcelulareinformatica.com.br'
  ];

  function isOriginAllowed(origin) {
    if (!origin) return true;
    const normalized = origin.trim().replace(/\/+$/, '').toLowerCase();
    if (normalized.endsWith('.pages.dev')) return true;
    if (normalized.endsWith('.onrender.com')) return true;
    if (allowedOrigins.includes(normalized)) return true;
    if (/^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(normalized)) return true;
    return false;
  }

  app.use(cors({
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    credentials: true
  }));
  app.use(express.json());

  // Rota de Login (equivalente a backend/routes/auth.js POST /login)
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Informe usuário e senha.' });
    }

    const clean = username.trim().toLowerCase();
    const user = mockUsers.find(u => u.username.toLowerCase() === clean);
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }

    const match = bcrypt.compareSync(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, store_id: user.store_id },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        store_id: user.store_id,
        is_master: user.is_master
      },
      store: {
        id: mockStore.id,
        name: mockStore.name,
        status: mockStore.status
      }
    });
  });

  // Middleware de autenticação
  function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    try {
      req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
      next();
    } catch {
      return res.status(401).json({ error: 'Token inválido' });
    }
  }

  // Rota restrita administrativa (ex: configurações da loja)
  app.get('/api/settings', authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado: exclusivo para administradores.' });
    }
    res.json({ success: true, settings: { system: { home: '/painel' } } });
  });

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());

  // 1. CORS Preflight & Domínio Personalizado de Produção
  const preflightRes = await requestHttp(server, 'OPTIONS', '/api/auth/login', {
    'Origin': 'https://erp.itechcelulareinformatica.com.br',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'Content-Type'
  });
  assert.equal(preflightRes.status, 204);
  assert.equal(preflightRes.headers['access-control-allow-origin'], 'https://erp.itechcelulareinformatica.com.br');

  // 2. Login com credenciais válidas do administrador
  const validLogin = await requestHttp(server, 'POST', '/api/auth/login', {
    'Origin': 'https://erp.itechcelulareinformatica.com.br',
    'Content-Type': 'application/json'
  }, {
    username: 'itechcelular',
    password: 'senhaCorreta123'
  });
  assert.equal(validLogin.status, 200);
  assert.equal(validLogin.headers['access-control-allow-origin'], 'https://erp.itechcelulareinformatica.com.br');
  assert.ok(validLogin.body.token);
  assert.equal(validLogin.body.user.role, 'admin');
  assert.equal(validLogin.body.user.username, 'itechcelular');

  const adminToken = validLogin.body.token;

  // 3. Rejeição com senha incorreta
  const badPass = await requestHttp(server, 'POST', '/api/auth/login', {
    'Origin': 'https://erp.itechcelulareinformatica.com.br',
    'Content-Type': 'application/json'
  }, {
    username: 'itechcelular',
    password: 'senhaErrada123'
  });
  assert.equal(badPass.status, 401);
  assert.equal(badPass.body.error, 'Usuário ou senha inválidos.');

  // 4. Rejeição com usuário inexistente
  const badUser = await requestHttp(server, 'POST', '/api/auth/login', {
    'Origin': 'https://erp.itechcelulareinformatica.com.br',
    'Content-Type': 'application/json'
  }, {
    username: 'usuario_que_nao_existe',
    password: 'senhaQualquer123'
  });
  assert.equal(badUser.status, 401);

  // 5. Acesso ao endpoint administrativo com token do administrador (deve permitir 200)
  const adminAccess = await requestHttp(server, 'GET', '/api/settings', {
    'Authorization': `Bearer ${adminToken}`
  });
  assert.equal(adminAccess.status, 200);
  assert.equal(adminAccess.body.success, true);

  // 6. Bloqueio de endpoint administrativo para usuário comum (role: employee)
  const empLogin = await requestHttp(server, 'POST', '/api/auth/login', {
    'Origin': 'https://erp.itechcelulareinformatica.com.br',
    'Content-Type': 'application/json'
  }, {
    username: 'tecnico',
    password: 'senhaCorreta123'
  });
  const empToken = empLogin.body.token;

  const empAccess = await requestHttp(server, 'GET', '/api/settings', {
    'Authorization': `Bearer ${empToken}`
  });
  assert.equal(empAccess.status, 403);
  assert.match(empAccess.body.error, /exclusivo para administradores/i);
});

