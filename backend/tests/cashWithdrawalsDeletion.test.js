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
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      req.setHeader('Content-Type', 'application/json');
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }
    req.end();
  });
}

test('Cash Withdrawals deletion security and owner password validation', async (t) => {
  const JWT_SECRET = 'test-secret-key-cash-withdrawals-2026';
  const ownerPassword = 'OwnerPass123!';
  const hashedPassword = bcrypt.hashSync(ownerPassword, 8);

  const mockUsers = [
    {
      id: 1,
      store_id: 1,
      name: 'Proprietário Loja 1',
      role: 'admin',
      is_master: 1,
      password_hash: hashedPassword
    },
    {
      id: 2,
      store_id: 1,
      name: 'Funcionário Loja 1',
      role: 'employee',
      is_master: 0,
      password_hash: hashedPassword
    },
    {
      id: 3,
      store_id: 2,
      name: 'Proprietário Loja 2',
      role: 'admin',
      is_master: 1,
      password_hash: hashedPassword
    }
  ];

  let mockWithdrawals = [
    {
      id: 101,
      store_id: 1,
      amount: 150.00,
      reason: 'Retirada manual 1',
      source_type: 'manual',
      created_by: 1
    },
    {
      id: 102,
      store_id: 1,
      amount: 250.00,
      reason: 'Retirada manual 2 (deve permanecer)',
      source_type: 'manual',
      created_by: 1
    },
    {
      id: 103,
      store_id: 1,
      amount: 80.00,
      reason: 'Peca OS #100',
      source_type: 'service_order_part',
      created_by: 1
    },
    {
      id: 201,
      store_id: 2,
      amount: 300.00,
      reason: 'Retirada da loja 2',
      source_type: 'manual',
      created_by: 3
    }
  ];

  const auditLogs = [];

  // Mock DB layer
  const mockDb = {
    async queryOne(sql, params) {
      if (sql.includes('FROM cash_withdrawals WHERE id = $1 AND store_id = $2')) {
        const [id, storeId] = params;
        return mockWithdrawals.find(w => w.id === Number(id) && w.store_id === Number(storeId)) || null;
      }
      if (sql.includes('FROM users WHERE id = $1')) {
        const [id] = params;
        const u = mockUsers.find(x => x.id === Number(id));
        return u ? { password_hash: u.password_hash } : null;
      }
      if (sql.includes('FROM stores WHERE id = $1')) {
        return { owner_password_hash: null };
      }
      return null;
    },
    async query(sql, params) {
      if (sql.includes('DELETE FROM cash_withdrawals WHERE id = $1 AND store_id = $2')) {
        const [id, storeId] = params;
        const idx = mockWithdrawals.findIndex(w => w.id === Number(id) && w.store_id === Number(storeId));
        if (idx !== -1) {
          mockWithdrawals.splice(idx, 1);
        }
        return [];
      }
      return [];
    }
  };

  const app = express();
  app.use(express.json());

  // Simulação do router e controllers
  const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = mockUsers.find(u => u.id === decoded.id);
      if (!user) return res.status(401).json({ error: 'Usuário inválido.' });
      req.user = user;
      next();
    } catch {
      return res.status(401).json({ error: 'Token inválido.' });
    }
  };

  const requireRole = (role) => (req, res, next) => {
    if (req.user && req.user.role === role) return next();
    return res.status(403).json({ error: 'Acesso negado.' });
  };

  // Montagem da rota exatamente com a lógica implementada em backend/routes/cashWithdrawals.js
  app.delete('/api/cash-withdrawals/:id', authMiddleware, requireRole('admin'), async (req, res, next) => {
    try {
      const storeId = req.user.store_id || 1;
      const { id } = req.params;
      const { password } = req.body || {};

      // 1. Exclusivo para proprietário (is_master === 1)
      const isOwner = Boolean(req.user.is_master);
      if (!isOwner) {
        return res.status(403).json({
          error: 'Apenas o proprietário tem permissão para excluir retiradas de caixa.'
        });
      }

      // 2. Senha de confirmação obrigatória
      if (!password || typeof password !== 'string') {
        return res.status(400).json({
          error: 'Senha de acesso do proprietário é obrigatória para autorizar a exclusão.'
        });
      }

      // 3. Obter hash de senha do proprietário
      let passwordHash = req.user.password_hash;
      if (!passwordHash) {
        const userRow = await mockDb.queryOne(
          `SELECT password_hash FROM users WHERE id = $1`,
          [req.user.id]
        );
        passwordHash = userRow?.password_hash;
      }

      if (!passwordHash) {
        return res.status(401).json({ error: 'Credenciais do proprietário não encontradas.' });
      }

      const isPasswordValid = await bcrypt.compare(password, passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({
          error: 'Senha incorreta. A exclusão da retirada não foi autorizada.'
        });
      }

      const withdrawal = await mockDb.queryOne(
        `SELECT * FROM cash_withdrawals WHERE id = $1 AND store_id = $2`,
        [id, storeId]
      );

      if (!withdrawal) {
        return res.status(404).json({ error: 'Retirada de caixa não encontrada.' });
      }

      if (withdrawal.source_type === 'service_order_part') {
        return res.status(409).json({
          error: 'Não é possível excluir uma retirada automática vinculada a peça de ordem de serviço diretamente pelo caixa.'
        });
      }

      await mockDb.query(
        `DELETE FROM cash_withdrawals WHERE id = $1 AND store_id = $2`,
        [id, storeId]
      );

      auditLogs.push({
        action: 'delete_cash_withdrawal',
        recordType: 'cash_withdrawal',
        recordId: id,
        storeId,
        details: { amount: withdrawal.amount, reason: withdrawal.reason }
      });

      res.json({ success: true, message: 'Retirada de caixa excluída com sucesso.' });
    } catch (err) {
      next(err);
    }
  });

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  const ownerToken = jwt.sign({ id: 1 }, JWT_SECRET);
  const employeeToken = jwt.sign({ id: 2 }, JWT_SECRET);
  const otherOwnerToken = jwt.sign({ id: 3 }, JWT_SECRET);

  try {
    await t.test('1. Unauthenticated request must return 401', async () => {
      const res = await requestHttp(server, 'DELETE', '/api/cash-withdrawals/101');
      assert.strictEqual(res.status, 401);
      assert.strictEqual(mockWithdrawals.find(w => w.id === 101) !== undefined, true);
    });

    await t.test('2. Employee without is_master must return 403 Forbidden', async () => {
      const res = await requestHttp(server, 'DELETE', '/api/cash-withdrawals/101', {
        authorization: `Bearer ${employeeToken}`
      }, { password: ownerPassword });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(mockWithdrawals.find(w => w.id === 101) !== undefined, true);
    });

    await t.test('3. Owner request without password must return 400 Bad Request', async () => {
      const res = await requestHttp(server, 'DELETE', '/api/cash-withdrawals/101', {
        authorization: `Bearer ${ownerToken}`
      }, {});
      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /Senha de acesso do proprietário é obrigatória/i);
      assert.strictEqual(mockWithdrawals.find(w => w.id === 101) !== undefined, true);
    });

    await t.test('4. Owner request with wrong password must return 401 Unauthorized', async () => {
      const res = await requestHttp(server, 'DELETE', '/api/cash-withdrawals/101', {
        authorization: `Bearer ${ownerToken}`
      }, { password: 'WrongPassword999' });
      assert.strictEqual(res.status, 401);
      assert.match(res.body.error, /Senha incorreta/i);
      assert.strictEqual(mockWithdrawals.find(w => w.id === 101) !== undefined, true);
    });

    await t.test('5. Multi-tenant isolation: Owner of store 1 cannot delete store 2 withdrawal (returns 404)', async () => {
      const res = await requestHttp(server, 'DELETE', '/api/cash-withdrawals/201', {
        authorization: `Bearer ${ownerToken}`
      }, { password: ownerPassword });
      assert.strictEqual(res.status, 404);
      assert.strictEqual(mockWithdrawals.find(w => w.id === 201) !== undefined, true);
    });

    await t.test('6. Cannot delete service_order_part automatic withdrawal (returns 409 Conflict)', async () => {
      const res = await requestHttp(server, 'DELETE', '/api/cash-withdrawals/103', {
        authorization: `Bearer ${ownerToken}`
      }, { password: ownerPassword });
      assert.strictEqual(res.status, 409);
      assert.match(res.body.error, /automática vinculada a peça/i);
      assert.strictEqual(mockWithdrawals.find(w => w.id === 103) !== undefined, true);
    });

    await t.test('7. Owner with valid password successfully deletes target withdrawal and preserves other records', async () => {
      const res = await requestHttp(server, 'DELETE', '/api/cash-withdrawals/101', {
        authorization: `Bearer ${ownerToken}`
      }, { password: ownerPassword });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);

      // Target withdrawal is deleted
      assert.strictEqual(mockWithdrawals.find(w => w.id === 101), undefined);

      // Other withdrawals are preserved
      assert.ok(mockWithdrawals.find(w => w.id === 102), 'Withdrawal 102 must remain');
      assert.ok(mockWithdrawals.find(w => w.id === 103), 'Withdrawal 103 must remain');
      assert.ok(mockWithdrawals.find(w => w.id === 201), 'Withdrawal 201 must remain');

      // Audit log was recorded
      const log = auditLogs.find(l => l.recordId === '101');
      assert.ok(log, 'Audit log should be recorded');
      assert.strictEqual(log.details.amount, 150);
    });
  } finally {
    server.close();
  }
});
