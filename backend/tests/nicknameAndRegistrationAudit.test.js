const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
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

test('Nickname Verification & Registration Flow Audit', async (t) => {
  // In-memory mock DB representing users and stores
  const users = [
    { id: 1, store_id: 1, username: 'admin', role: 'admin' },
    { id: 2, store_id: 1, username: 'tech.master', role: 'admin' }
  ];
  const stores = [
    { id: 1, name: 'Loja Matriz', owner_email: 'matriz@itech.com', status: 'active' }
  ];

  async function mockIsNicknameAvailable(nickname) {
    if (!nickname || typeof nickname !== 'string') return false;
    const clean = nickname.trim().toLowerCase();
    if (!/^[\w.@-]{3,60}$/.test(clean)) return false;
    const existing = users.find(u => u.username.toLowerCase() === clean);
    return !existing;
  }

  const app = express();
  app.use(express.json());

  // Check-nickname endpoint (matching backend/routes/auth.js)
  app.get('/api/auth/check-nickname', async (req, res) => {
    try {
      const { nickname } = req.query;
      if (!nickname) {
        return res.status(200).json({ available: false, error: 'Informe um nickname.' });
      }
      const clean = String(nickname).trim();
      if (!/^[\w.@-]{3,60}$/.test(clean)) {
        return res.status(200).json({
          available: false,
          error: 'Nickname deve ter entre 3 e 60 caracteres (letras, números, ponto, hífen ou sublinhado).'
        });
      }
      const available = await mockIsNicknameAvailable(clean);
      return res.status(200).json({
        available,
        nickname: clean,
        message: available ? 'Nickname disponível!' : 'Este nickname já está em uso por outra conta.'
      });
    } catch (err) {
      return res.status(500).json({
        available: null,
        error: 'Não foi possível verificar a disponibilidade no momento. Tente novamente.'
      });
    }
  });

  // Register-store endpoint
  app.post('/api/auth/register-store', async (req, res) => {
    try {
      const { store_name, owner_name, email, nickname, erp_password } = req.body;
      if (!store_name || !owner_name || !email || !nickname || !erp_password) {
        return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
      }
      const cleanEmail = email.trim().toLowerCase();
      const cleanNick = nickname.trim().toLowerCase();

      if (stores.some(s => s.owner_email === cleanEmail)) {
        return res.status(409).json({ error: 'Já existe uma loja cadastrada com este e-mail de proprietário.' });
      }
      if (users.some(u => u.username.toLowerCase() === cleanNick)) {
        return res.status(409).json({ error: 'Este nickname já está em uso por outro usuário. Escolha outro.' });
      }

      const newStoreId = stores.length + 1;
      const newUserId = users.length + 1;
      stores.push({ id: newStoreId, name: store_name, owner_email: cleanEmail, status: 'pending_activation' });
      users.push({ id: newUserId, store_id: newStoreId, username: cleanNick, role: 'admin' });

      res.status(201).json({
        success: true,
        message: 'Cadastro realizado com sucesso! Sua loja está aguardando ativação pela nossa equipe.',
        store: { id: newStoreId, name: store_name, email: cleanEmail, status: 'pending_activation' },
        user: { id: newUserId, username: cleanNick, role: 'admin' }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));

  try {
    // 1. Nickname disponível
    const res1 = await requestHttp(server, 'GET', '/api/auth/check-nickname?nickname=loja.nova');
    assert.equal(res1.status, 200);
    assert.equal(res1.body.available, true);
    assert.equal(res1.body.nickname, 'loja.nova');
    assert.equal(res1.body.message, 'Nickname disponível!');

    // 2. Nickname já em uso (ex: 'admin')
    const res2 = await requestHttp(server, 'GET', '/api/auth/check-nickname?nickname=admin');
    assert.equal(res2.status, 200);
    assert.equal(res2.body.available, false);
    assert.match(res2.body.message, /já está em uso/i);

    // 3. Parâmetro ausente
    const res3 = await requestHttp(server, 'GET', '/api/auth/check-nickname');
    assert.equal(res3.status, 200);
    assert.equal(res3.body.available, false);

    // 4. Nickname com caracteres inválidos
    const res4 = await requestHttp(server, 'GET', '/api/auth/check-nickname?nickname=nome*com*espaco!');
    assert.equal(res4.status, 200);
    assert.equal(res4.body.available, false);

    // 5. Nickname muito curto (< 3 chars)
    const res5 = await requestHttp(server, 'GET', '/api/auth/check-nickname?nickname=ab');
    assert.equal(res5.status, 200);
    assert.equal(res5.body.available, false);

    // 6. Cadastro com sucesso de nova loja
    const res6 = await requestHttp(server, 'POST', '/api/auth/register-store', {
      'Content-Type': 'application/json'
    }, {
      store_name: 'Tech Fix Soluções',
      owner_name: 'Carlos Oliveira',
      email: 'carlos@techfix.com',
      nickname: 'carlos.techfix',
      erp_password: 'senhaSegura123'
    });
    assert.equal(res6.status, 201);
    assert.equal(res6.body.success, true);
    assert.equal(res6.body.store.status, 'pending_activation');
    assert.equal(res6.body.user.username, 'carlos.techfix');

    // 7. Agora verificar que 'carlos.techfix' acusa indisponível imediatamente
    const res7 = await requestHttp(server, 'GET', '/api/auth/check-nickname?nickname=carlos.techfix');
    assert.equal(res7.status, 200);
    assert.equal(res7.body.available, false);

    // 8. Tentativa de cadastro duplicado com mesmo nickname rejeitado com 409
    const res8 = await requestHttp(server, 'POST', '/api/auth/register-store', {
      'Content-Type': 'application/json'
    }, {
      store_name: 'Outra Loja',
      owner_name: 'Outro Nome',
      email: 'outro@email.com',
      nickname: 'carlos.techfix',
      erp_password: 'senhaSegura123'
    });
    assert.equal(res8.status, 409);
    assert.match(res8.body.error, /nickname já está em uso/i);

    // 9. Tentativa de cadastro duplicado com mesmo email rejeitado com 409
    const res9 = await requestHttp(server, 'POST', '/api/auth/register-store', {
      'Content-Type': 'application/json'
    }, {
      store_name: 'Mais Uma Loja',
      owner_name: 'Carlos O.',
      email: 'carlos@techfix.com',
      nickname: 'carlos.outro',
      erp_password: 'senhaSegura123'
    });
    assert.equal(res9.status, 409);
    assert.match(res9.body.error, /e-mail de proprietário/i);

  } finally {
    server.close();
  }
});

