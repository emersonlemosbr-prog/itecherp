const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Testes dos procedimentos seguros de configuração e redefinição da senha mestra do Superadmin
test('Superadmin Master Password: flow tests and validations', async (t) => {
  const secretKey = 'test-recovery-secret-for-platform-superadmin-long-enough-32bytes!';
  process.env.PLATFORM_RECOVERY_SECRET = secretKey;
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-unit-tests-123456!';

  // Simulação de banco de dados em memória
  const mockDb = {
    platformUsers: [],
    auditLogs: [],
    resetTokens: [],
    queryOne: async (sql, params = []) => {
      const lower = sql.toLowerCase();
      if (lower.includes('from password_reset_tokens')) {
        const tokenHash = params[0];
        return mockDb.resetTokens.find(t => t.token_hash === tokenHash && t.target_type === 'platform' && t.used_at) || null;
      }
      if (lower.includes('from platform_users') && lower.includes('lower(email) = $1')) {
        const email = String(params[0]).toLowerCase();
        return mockDb.platformUsers.find(u => u.email.toLowerCase() === email) || null;
      }
      if (lower.includes('from platform_users') && lower.includes('where id = $1')) {
        const id = params[0];
        return mockDb.platformUsers.find(u => u.id === id) || null;
      }
      if (lower.includes('count(*) as count from platform_users')) {
        return { count: mockDb.platformUsers.filter(u => u.role === 'superadmin').length };
      }
      return null;
    },
    execute: async (sql, params = []) => {
      const lower = sql.toLowerCase();
      if (lower.includes('insert into platform_users')) {
        const id = mockDb.platformUsers.length + 1;
        const [name, email, password_hash, role, active, session_version] = params;
        const user = { id, name, email, password_hash, role: role || 'superadmin', active: active || 1, session_version: session_version || 1 };
        mockDb.platformUsers.push(user);
        return { id, rowCount: 1 };
      }
      if (lower.includes('update platform_users')) {
        const [password_hash, session_version, id] = params;
        const user = mockDb.platformUsers.find(u => u.id === id);
        if (user) {
          user.password_hash = password_hash;
          user.session_version = session_version;
          user.active = 1;
        }
        return { rowCount: user ? 1 : 0 };
      }
      if (lower.includes('insert into password_reset_tokens')) {
        const [email, token_hash, target_type, target_id] = params;
        mockDb.resetTokens.push({ email, token_hash, target_type, target_id, used_at: new Date() });
        return { rowCount: 1 };
      }
      return { rowCount: 0 };
    },
    query: async (sql, params = []) => {
      const lower = sql.toLowerCase();
      if (lower.includes('insert into platform_audit_logs')) {
        const [platform_user_id, platform_user_name, action, target_type, target_id, target_name, details, ip_address] = params;
        mockDb.auditLogs.push({ platform_user_id, platform_user_name, action, target_type, target_id, target_name, details, ip_address });
        return [];
      }
      return [];
    },
    transaction: async (cb) => {
      return cb(mockDb);
    }
  };

  // Helper para simular a rota emergency-setup
  async function simulateEmergencySetup(body, ip = '127.0.0.1') {
    const expectedSecret = process.env.PLATFORM_RECOVERY_SECRET;
    if (!expectedSecret || expectedSecret.trim().length < 16) {
      return { status: 403, error: 'Procedimento não habilitado' };
    }

    const { recoverySecret, email, newPassword, name } = body;
    if (!recoverySecret || typeof recoverySecret !== 'string') {
      return { status: 400, error: 'Informe o segredo de recuperação' };
    }

    const hashReceived = crypto.createHash('sha256').update(recoverySecret.trim()).digest();
    const hashExpected = crypto.createHash('sha256').update(expectedSecret.trim()).digest();
    if (!crypto.timingSafeEqual(hashReceived, hashExpected)) {
      return { status: 401, error: 'Segredo inválido' };
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return { status: 400, error: 'E-mail inválido' };
    }

    if (!newPassword || newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return { status: 400, error: 'A senha deve conter no mínimo 8 caracteres, com letra e número' };
    }
    const weak = ['12345678', 'password', 'admin123'];
    if (weak.includes(newPassword.toLowerCase())) {
      return { status: 400, error: 'Senha fraca' };
    }

    const secretHash = hashReceived.toString('hex');
    const alreadyUsed = await mockDb.queryOne('SELECT id FROM password_reset_tokens WHERE token_hash = $1', [secretHash]);
    if (alreadyUsed) {
      return { status: 400, error: 'Segredo já utilizado' };
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name || 'Superadmin iTech').trim();
    const hash = await bcrypt.hash(newPassword, 10);

    let adminId = null;
    await mockDb.transaction(async (tx) => {
      const existing = await tx.queryOne('SELECT id, name, session_version FROM platform_users WHERE LOWER(email) = $1', [cleanEmail]);
      if (existing) {
        adminId = existing.id;
        const newVer = (existing.session_version || 0) + 1;
        await tx.execute('UPDATE platform_users SET password_hash = $1, session_version = $2 WHERE id = $3', [hash, newVer, existing.id]);
      } else {
        const countRes = await tx.queryOne('SELECT COUNT(*) as count FROM platform_users WHERE role = $1', ['superadmin']);
        if (countRes.count > 0) {
          throw new Error('E-mail não encontrado');
        }
        const ins = await tx.execute('INSERT INTO platform_users', [cleanName, cleanEmail, hash, 'superadmin', 1, 1]);
        adminId = ins.id;
      }

      await tx.execute('INSERT INTO password_reset_tokens', [cleanEmail, secretHash, 'platform', adminId]);
      await tx.query('INSERT INTO platform_audit_logs', [adminId, cleanName, 'superadmin_emergency_reset', 'platform_user', adminId, cleanEmail, 'Senha redefinida', ip]);
    });

    return { status: 200, success: true };
  }

  // 1. Cenário: Credencial mestra ausente no banco (configuração inicial autorizada)
  await t.test('1. Credencial ausente: configuração inicial bem-sucedida com segredo de recuperação', async () => {
    mockDb.platformUsers = [];
    mockDb.resetTokens = [];
    mockDb.auditLogs = [];

    const res = await simulateEmergencySetup({
      recoverySecret: secretKey,
      email: 'admin@itechcelulareinformatica.com.br',
      name: 'Superadmin iTech',
      newPassword: 'MinhaSenhaSegura2026!'
    });

    assert.equal(res.status, 200);
    assert.equal(res.success, true);
    assert.equal(mockDb.platformUsers.length, 1);
    assert.equal(mockDb.platformUsers[0].email, 'admin@itechcelulareinformatica.com.br');
    assert.ok(bcrypt.compareSync('MinhaSenhaSegura2026!', mockDb.platformUsers[0].password_hash));
    assert.equal(mockDb.auditLogs.length, 1);
    assert.equal(mockDb.auditLogs[0].action, 'superadmin_emergency_reset');
  });

  // 2. Cenário: Tentativas não autorizadas (segredo incorreto ou ausente)
  await t.test('2. Tentativas não autorizadas: rejeita segredo incorreto ou ausente com 401', async () => {
    const resBad = await simulateEmergencySetup({
      recoverySecret: 'segredo-completamente-incorreto-e-invalido-12345',
      email: 'admin@itechcelulareinformatica.com.br',
      newPassword: 'OutraSenhaSegura2026!'
    });
    assert.equal(resBad.status, 401);

    const resMissing = await simulateEmergencySetup({
      email: 'admin@itechcelulareinformatica.com.br',
      newPassword: 'OutraSenhaSegura2026!'
    });
    assert.equal(resMissing.status, 400);
  });

  // 3. Cenário: Segredo temporário de uso único (rejeita reutilização)
  await t.test('3. Uso único: impede reutilização do mesmo segredo após redefinição', async () => {
    // A primeira chamada no teste 1 já usou o secretKey e registrou em resetTokens
    const resReuse = await simulateEmergencySetup({
      recoverySecret: secretKey,
      email: 'admin@itechcelulareinformatica.com.br',
      newPassword: 'TerceiraSenhaSegura2026!'
    });
    assert.equal(resReuse.status, 400);
    assert.ok(resReuse.error.includes('já utilizado'));
  });

  // 4. Cenário: Validação de senha fraca ou inválida
  await t.test('4. Validação de senha: rejeita senhas curtas, sem números ou triviais', async () => {
    const freshSecret = 'fresh-secret-key-with-over-32-characters-token!';
    process.env.PLATFORM_RECOVERY_SECRET = freshSecret;

    const shortPwd = await simulateEmergencySetup({
      recoverySecret: freshSecret,
      email: 'admin@itechcelulareinformatica.com.br',
      newPassword: 'abc'
    });
    assert.equal(shortPwd.status, 400);

    const noNum = await simulateEmergencySetup({
      recoverySecret: freshSecret,
      email: 'admin@itechcelulareinformatica.com.br',
      newPassword: 'senhasemnumeros'
    });
    assert.equal(noNum.status, 400);

    const trivial = await simulateEmergencySetup({
      recoverySecret: freshSecret,
      email: 'admin@itechcelulareinformatica.com.br',
      newPassword: 'password'
    });
    assert.equal(trivial.status, 400);
  });

  // 5. Cenário: Redefinição autorizada de superadmin existente e invalidação de sessão
  await t.test('5. Redefinição de Superadmin existente: incrementa session_version e atualiza senha', async () => {
    const newSecret = 'another-new-recovery-secret-key-32-chars-long!';
    process.env.PLATFORM_RECOVERY_SECRET = newSecret;

    const currentVersion = mockDb.platformUsers[0].session_version;

    const res = await simulateEmergencySetup({
      recoverySecret: newSecret,
      email: 'admin@itechcelulareinformatica.com.br',
      newPassword: 'NovaSenhaDefinitiva2026!'
    });

    assert.equal(res.status, 200);
    assert.equal(mockDb.platformUsers[0].session_version, currentVersion + 1);
    assert.ok(bcrypt.compareSync('NovaSenhaDefinitiva2026!', mockDb.platformUsers[0].password_hash));
  });

  // 6. Cenário: Auditoria não armazena senhas nem segredos em texto puro
  await t.test('6. Auditoria de segurança: nenhum segredo ou senha vazado nos logs', () => {
    for (const log of mockDb.auditLogs) {
      assert.ok(!JSON.stringify(log).includes('MinhaSenhaSegura'));
      assert.ok(!JSON.stringify(log).includes('NovaSenhaDefinitiva'));
      assert.ok(!JSON.stringify(log).includes('test-recovery-secret'));
      assert.ok(!JSON.stringify(log).includes('another-new-recovery'));
    }
  });
});
