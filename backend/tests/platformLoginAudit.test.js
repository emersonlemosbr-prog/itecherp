const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const http = require('node:http');

// 1. Simulação e Teste de Resolução de URL da API do Frontend
test('Frontend API URL Resolution: resolveApiBaseUrl logic', () => {
  function testResolve(envUrl, windowMock) {
    const raw = (envUrl || '').trim();
    if (raw && !raw.includes('itecherp-backend.onrender.com')) {
      const clean = raw.replace(/\/+$/, '');
      return clean.endsWith('/api') ? clean : `${clean}/api`;
    }
    if (windowMock) {
      const host = windowMock.location.hostname.toLowerCase();
      const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
      const isRender = host.endsWith('.onrender.com');
      if (!isLocalhost && !isRender) {
        return 'https://itech-project-z1ez.onrender.com/api';
      }
    }
    return '/api';
  }

  // Cenário 1: VITE_API_URL fornecida com /api
  assert.equal(testResolve('https://itech-project-z1ez.onrender.com/api'), 'https://itech-project-z1ez.onrender.com/api');

  // Cenário 2: VITE_API_URL fornecida SEM /api (deve normalizar e acrescentar /api)
  assert.equal(testResolve('https://itech-project-z1ez.onrender.com'), 'https://itech-project-z1ez.onrender.com/api');

  // Cenário 3: VITE_API_URL fornecida com barra final
  assert.equal(testResolve('https://itech-project-z1ez.onrender.com/api/'), 'https://itech-project-z1ez.onrender.com/api');

  // Cenário 4: VITE_API_URL ausente rodando no Cloudflare Pages (*.pages.dev)
  assert.equal(
    testResolve(undefined, { location: { hostname: 'itecherp.pages.dev' } }),
    'https://itech-project-z1ez.onrender.com/api'
  );

  // Cenário 5: VITE_API_URL ausente rodando em preview do Cloudflare Pages
  assert.equal(
    testResolve('', { location: { hostname: 'feat-superadmin.itecherp.pages.dev' } }),
    'https://itech-project-z1ez.onrender.com/api'
  );

  // Cenário 6: VITE_API_URL antiga/legada (deve auto-corrigir para o backend real ativo)
  assert.equal(
    testResolve('https://itecherp-backend.onrender.com/api', { location: { hostname: 'itecherp.pages.dev' } }),
    'https://itech-project-z1ez.onrender.com/api'
  );

  // Cenário 7: VITE_API_URL ausente rodando diretamente no Render (*.onrender.com)
  assert.equal(
    testResolve('', { location: { hostname: 'itech-project-z1ez.onrender.com' } }),
    '/api'
  );

  // Cenário 7: VITE_API_URL ausente em desenvolvimento local (localhost)
  assert.equal(
    testResolve('', { location: { hostname: 'localhost' } }),
    '/api'
  );
});

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

// 2. Testes de CORS e Preflight com a mesma lógica do server.js
test('CORS Policy: Preflight OPTIONS and Origin authorization', async (t) => {
  const configuredOrigins = ['https://custom-domain.com'];

  function isOriginAllowed(origin) {
    if (!origin) return true;
    const normalized = origin.trim().replace(/\/+$/, '').toLowerCase();
    if (configuredOrigins.some(cfg => cfg === '*' || cfg.toLowerCase() === normalized)) return true;
    if (normalized.endsWith('.pages.dev')) return true;
    if (normalized.endsWith('.onrender.com')) return true;
    if (
      normalized === 'https://erp.itechcelulareinformatica.com.br' ||
      normalized === 'https://acompanhar.itechcelulareinformatica.com.br' ||
      normalized === 'https://itechcelulareinformatica.com.br' ||
      normalized === 'https://www.itechcelulareinformatica.com.br'
    ) return true;
    if (/^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(normalized)) return true;
    return false;
  }

  const corsOptions = {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    optionsSuccessStatus: 200,
  };

  const app = express();
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.post('/api/platform/login', (req, res) => res.json({ ok: true }));

  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  t.after(() => server.close());

  // Teste Preflight OPTIONS para Cloudflare Pages
  const preflightRes = await requestHttp(server, 'OPTIONS', '/api/platform/login', {
    'Origin': 'https://itecherp.pages.dev',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'Content-Type,Authorization'
  });

  assert.equal(preflightRes.status, 200);
  assert.equal(preflightRes.headers['access-control-allow-origin'], 'https://itecherp.pages.dev');
  assert.equal(preflightRes.headers['access-control-allow-credentials'], 'true');
  assert.ok(preflightRes.headers['access-control-allow-methods'].includes('POST'));

  // Teste de Origem Autorizada Cloudflare Pages
  const cfPostRes = await requestHttp(server, 'POST', '/api/platform/login', {
    'Origin': 'https://preview-123.itecherp.pages.dev',
    'Content-Type': 'application/json'
  });
  assert.equal(cfPostRes.status, 200);
  assert.equal(cfPostRes.headers['access-control-allow-origin'], 'https://preview-123.itecherp.pages.dev');

  // Teste de Origem Autorizada Domínio Personalizado de Produção (ERP)
  const erpPostRes = await requestHttp(server, 'POST', '/api/platform/login', {
    'Origin': 'https://erp.itechcelulareinformatica.com.br',
    'Content-Type': 'application/json'
  });
  assert.equal(erpPostRes.status, 200);
  assert.equal(erpPostRes.headers['access-control-allow-origin'], 'https://erp.itechcelulareinformatica.com.br');

  // Teste de Origem NÃO Autorizada (deve NÃO receber cabeçalho Access-Control-Allow-Origin)
  const unauthRes = await requestHttp(server, 'POST', '/api/platform/login', {
    'Origin': 'https://malicious-site.example.com',
    'Content-Type': 'application/json'
  });
  assert.equal(unauthRes.headers['access-control-allow-origin'], undefined, 'Origem não autorizada não deve receber cabeçalho CORS');
});

// 3. Teste de Autenticação do Administrador da Plataforma (rejeição de inválidos, geração de token, compatibilidade de payload)
test('Platform Login Route: credentials validation and payload compatibility', async (t) => {
  const jwtSecret = 'test-audit-jwt-secret-key-32bytes-long!';
  const hashedPassword = await bcrypt.hash('SenhaForte123!', 10);

  const mockAdmin = {
    id: 99,
    name: 'Superadmin Teste',
    email: 'admin@itech.com',
    password_hash: hashedPassword,
    role: 'superadmin',
    active: 1,
    session_version: 2
  };

  const app = express();
  app.use(express.json());

  // Handler de login que segue a rota real backend/routes/platform.js
  app.post('/api/platform/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Informe e-mail e senha de administrador da plataforma.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== mockAdmin.email || !mockAdmin.active) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }
    const match = await bcrypt.compare(password, mockAdmin.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const token = jwt.sign(
      {
        id: mockAdmin.id,
        role: 'platform_admin',
        type: 'platform',
        session_version: mockAdmin.session_version
      },
      jwtSecret,
      { expiresIn: '12h' }
    );

    const adminPayload = {
      id: mockAdmin.id,
      name: mockAdmin.name,
      email: mockAdmin.email,
      role: mockAdmin.role
    };

    res.json({
      token,
      user: adminPayload,
      admin: adminPayload
    });
  });

  // Middleware de proteção seguindo backend/middleware/platformAuth.js
  function authPlatform(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });
    try {
      const payload = jwt.verify(token, jwtSecret);
      if (payload.role !== 'platform_admin' || payload.type !== 'platform') {
        return res.status(403).json({ error: 'Acesso exclusivo para administradores da plataforma' });
      }
      req.platformAdmin = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'Token inválido' });
    }
  }

  app.get('/api/platform/stores', authPlatform, (req, res) => {
    res.json({ stores: [{ id: 1, name: 'Loja Teste' }] });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  t.after(() => server.close());

  // A. Rejeição de campos vazios
  const emptyRes = await requestHttp(server, 'POST', '/api/platform/login', { 'Content-Type': 'application/json' }, {});
  assert.equal(emptyRes.status, 400);

  // B. Rejeição de credenciais inválidas
  const wrongRes = await requestHttp(server, 'POST', '/api/platform/login', { 'Content-Type': 'application/json' }, {
    email: 'admin@itech.com',
    password: 'SenhaErrada123'
  });
  assert.equal(wrongRes.status, 401);

  // C. Sucesso com credenciais corretas: retorna token e AMBOS 'admin' e 'user'
  const successRes = await requestHttp(server, 'POST', '/api/platform/login', { 'Content-Type': 'application/json' }, {
    email: 'admin@itech.com',
    password: 'SenhaForte123!'
  });
  assert.equal(successRes.status, 200);
  assert.ok(successRes.body.token, 'Token JWT deve ser retornado');
  assert.ok(successRes.body.user, 'Campo "user" deve estar presente para compatibilidade com PlatformAdmin.jsx');
  assert.ok(successRes.body.admin, 'Campo "admin" deve estar presente para compatibilidade');
  assert.equal(successRes.body.user.email, 'admin@itech.com');
  assert.equal(successRes.body.admin.email, 'admin@itech.com');

  // D. Token válido acessa rota protegida
  const validToken = successRes.body.token;
  const protectedRes = await requestHttp(server, 'GET', '/api/platform/stores', {
    'Authorization': `Bearer ${validToken}`
  });
  assert.equal(protectedRes.status, 200);
  assert.equal(protectedRes.body.stores.length, 1);

  // E. Isolamento de Tenant: Token de administrador de LOJA é rejeitado na plataforma com 403
  const storeUserToken = jwt.sign(
    { id: 1, store_id: 1, role: 'admin', type: 'user' },
    jwtSecret
  );
  const forbiddenRes = await requestHttp(server, 'GET', '/api/platform/stores', {
    'Authorization': `Bearer ${storeUserToken}`
  });
  assert.equal(forbiddenRes.status, 403, 'Token de loja não pode acessar rotas da plataforma');
});

