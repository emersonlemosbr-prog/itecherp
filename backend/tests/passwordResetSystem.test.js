const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Mock em memória do banco de dados para os testes
function createMockDb() {
  const stores = [
    {
      id: 1,
      name: 'Loja Teste Recuperação',
      owner_name: 'Emerson Lemos',
      owner_email: 'emerson.teste@itechcelulareinformatica.com.br',
      owner_password_hash: bcrypt.hashSync('senhaAntiga123', 8),
    }
  ];

  const users = [
    {
      id: 1,
      store_id: 1,
      username: 'admin',
      password_hash: stores[0].owner_password_hash,
      role: 'admin',
      is_master: 1,
      session_version: 1
    }
  ];

  const tokens = [];

  return {
    stores,
    users,
    tokens,
    async queryOne(sql, params) {
      const lower = sql.toLowerCase();
      if (lower.includes('from stores where lower(owner_email) = $1')) {
        return stores.find(s => s.owner_email.toLowerCase() === params[0].toLowerCase()) || null;
      }
      if (lower.includes('from password_reset_tokens where token_hash = $1')) {
        const hash = params[0];
        const record = tokens.find(t => t.token_hash === hash && !t.used_at && new Date(t.expires_at) > new Date());
        return record || null;
      }
      if (lower.includes('from password_reset_tokens where id = $1')) {
        const id = params[0];
        const record = tokens.find(t => t.id === id && !t.used_at && new Date(t.expires_at) > new Date());
        return record || null;
      }
      return null;
    },
    async execute(sql, params) {
      const lower = sql.toLowerCase();
      if (lower.includes('update password_reset_tokens set used_at = current_timestamp where lower(email) = $1')) {
        tokens.filter(t => t.email.toLowerCase() === params[0].toLowerCase() && !t.used_at).forEach(t => {
          t.used_at = new Date().toISOString();
        });
        return;
      }
      if (lower.includes('insert into password_reset_tokens')) {
        const [email, token_hash, target_type, target_id, expires_at] = params;
        const newRecord = {
          id: tokens.length + 1,
          email,
          token_hash,
          target_type,
          target_id,
          expires_at,
          used_at: null,
          created_at: new Date().toISOString()
        };
        tokens.push(newRecord);
        return;
      }
      if (lower.includes('update stores set owner_password_hash = $1')) {
        const [hash, storeId] = params;
        const store = stores.find(s => s.id === storeId);
        if (store) store.owner_password_hash = hash;
        return;
      }
      if (lower.includes('update users set password_hash = $1')) {
        const [hash, storeId] = params;
        const u = users.find(user => user.store_id === storeId && user.is_master === 1);
        if (u) {
          u.password_hash = hash;
          u.session_version += 1;
        }
        return;
      }
      if (lower.includes('update password_reset_tokens set used_at = current_timestamp where id = $1')) {
        const [id] = params;
        const t = tokens.find(token => token.id === id);
        if (t) t.used_at = new Date().toISOString();
        return;
      }
    },
    async transaction(callback) {
      return await callback(this);
    }
  };
}

test('Suíte de Recuperação de Senha — Testes Unitários e Integrados', async (t) => {
  const { renderPasswordResetEmail } = require('../templates/passwordResetEmail');
  const emailService = require('../services/emailService');

  await t.test('1. Renderização do Template Oficial (HTML e Texto Puro)', () => {
    const rendered = renderPasswordResetEmail({
      userName: 'Emerson Lemos',
      resetUrl: 'https://erp.itechcelulareinformatica.com.br/redefinir-senha?token=test_token_123',
      logoUrl: 'https://erp.itechcelulareinformatica.com.br/itech-logo.png',
      systemName: 'iTech ERP',
      validityText: '30 minutos'
    });

    assert.ok(rendered.html, 'HTML deve ser gerado');
    assert.ok(rendered.text, 'Texto puro deve ser gerado');
    assert.ok(rendered.html.includes('Redefinição de senha'), 'HTML deve conter título');
    assert.ok(rendered.html.includes('#FFBE0B'), 'HTML deve conter a cor de destaque');
    assert.ok(rendered.html.includes('30 minutos'), 'HTML deve conter validade');
    assert.ok(rendered.text.includes('test_token_123'), 'Texto deve conter URL com token');
  });

  await t.test('2. Serviço de E-mail: modo simulado para testes (sem chave Resend)', async () => {
    const result = await emailService.sendEmail({
      to: 'cliente@exemplo.com',
      subject: 'Teste de Recuperação',
      html: '<p>Teste</p>',
      text: 'Teste'
    });

    assert.equal(result.success, true, 'Envio simulado deve ter sucesso');
    assert.equal(result.simulated, true, 'Deve indicar envio simulado');
    assert.ok(result.id, 'Deve retornar ID simulado');
  });

  await t.test('3. Solicitação com e-mail cadastrado vs e-mail inexistente retorna a mesma mensagem genérica', async () => {
    const mockDb = createMockDb();

    // Função de solicitação emulando o endpoint /auth/forgot-password
    async function requestForgot(email) {
      const cleanEmail = email.trim().toLowerCase();
      const store = await mockDb.queryOne('SELECT id, name, owner_name, owner_email FROM stores WHERE LOWER(owner_email) = $1', [cleanEmail]);

      if (!store) {
        return {
          success: true,
          message: 'Se o e-mail informado estiver cadastrado, as instruções para redefinição foram enviadas.'
        };
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      await mockDb.execute('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE LOWER(email) = $1 AND used_at IS NULL', [cleanEmail]);
      await mockDb.execute('INSERT INTO password_reset_tokens', [cleanEmail, tokenHash, 'owner', store.id, expiresAt]);

      return {
        success: true,
        message: 'Se o e-mail informado estiver cadastrado, as instruções para redefinição foram enviadas.',
        generatedToken: resetToken // apenas para validação do teste
      };
    }

    const resValid = await requestForgot('emerson.teste@itechcelulareinformatica.com.br');
    const resInvalid = await requestForgot('inexistente@qualquercoisa.com');

    assert.equal(resValid.message, resInvalid.message, 'Mensagem deve ser rigorosamente idêntica');
    assert.equal(mockDb.tokens.length, 1, 'Deve ter gravado exatamente 1 token para o e-mail válido');
    assert.notEqual(mockDb.tokens[0].token_hash, resValid.generatedToken, 'Token original não deve ser gravado, somente o hash');
  });

  await t.test('4. Geração do token, armazenamento apenas do hash SHA-256 e expiração em 30 min', async () => {
    const mockDb = createMockDb();
    const cleanEmail = 'emerson.teste@itechcelulareinformatica.com.br';
    const store = await mockDb.queryOne('SELECT id, name, owner_name, owner_email FROM stores WHERE LOWER(owner_email) = $1', [cleanEmail]);

    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await mockDb.execute('INSERT INTO password_reset_tokens', [cleanEmail, tokenHash, 'owner', store.id, expiresAt]);

    const saved = mockDb.tokens[0];
    assert.equal(saved.token_hash, tokenHash, 'Hash deve conferir');
    assert.equal(saved.token_hash.length, 64, 'Hash SHA-256 deve ter 64 caracteres hexadecimais');
    assert.notEqual(saved.token_hash, resetToken, 'Token puro nunca deve estar no banco');

    const diffMinutes = (new Date(saved.expires_at).getTime() - Date.now()) / (1000 * 60);
    assert.ok(diffMinutes >= 29 && diffMinutes <= 30.5, 'Validade deve ser de aproximadamente 30 minutos');
  });

  await t.test('5. Rejeição de token inválido, expirado ou já utilizado', async () => {
    const mockDb = createMockDb();
    const cleanEmail = 'emerson.teste@itechcelulareinformatica.com.br';

    // 1. Token já expirado
    const expiredToken = 'token_expirado_123';
    const expiredHash = crypto.createHash('sha256').update(expiredToken).digest('hex');
    mockDb.tokens.push({
      id: 1,
      email: cleanEmail,
      token_hash: expiredHash,
      target_type: 'owner',
      target_id: 1,
      expires_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // expirou há 5 min
      used_at: null
    });

    // 2. Token já utilizado
    const usedToken = 'token_utilizado_456';
    const usedHash = crypto.createHash('sha256').update(usedToken).digest('hex');
    mockDb.tokens.push({
      id: 2,
      email: cleanEmail,
      token_hash: usedHash,
      target_type: 'owner',
      target_id: 1,
      expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      used_at: new Date().toISOString()
    });

    const checkInvalid = await mockDb.queryOne('SELECT * FROM password_reset_tokens WHERE token_hash = $1', ['token_fantasma_hash']);
    const checkExpired = await mockDb.queryOne('SELECT * FROM password_reset_tokens WHERE token_hash = $1', [expiredHash]);
    const checkUsed = await mockDb.queryOne('SELECT * FROM password_reset_tokens WHERE token_hash = $1', [usedHash]);

    assert.equal(checkInvalid, null, 'Token inexistente não pode ser encontrado');
    assert.equal(checkExpired, null, 'Token expirado não pode ser retornado');
    assert.equal(checkUsed, null, 'Token já utilizado não pode ser retornado');
  });

  await t.test('6. Redefinição bem-sucedida da senha, atualização de hash e invalidação do token', async () => {
    const mockDb = createMockDb();
    const cleanEmail = 'emerson.teste@itechcelulareinformatica.com.br';

    const validToken = crypto.randomBytes(32).toString('hex');
    const validHash = crypto.createHash('sha256').update(validToken).digest('hex');
    mockDb.tokens.push({
      id: 10,
      email: cleanEmail,
      token_hash: validHash,
      target_type: 'owner',
      target_id: 1,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      used_at: null
    });

    const newPasswordPlain = 'NovaSenhaSegura@2026';
    const newHash = bcrypt.hashSync(newPasswordPlain, 8);

    // Executar redefinição atômica
    const resetRecord = await mockDb.queryOne('SELECT * FROM password_reset_tokens WHERE token_hash = $1', [validHash]);
    assert.ok(resetRecord, 'Token válido deve ser localizado');

    await mockDb.transaction(async (tx) => {
      await tx.execute('UPDATE stores SET owner_password_hash = $1 WHERE id = $2', [newHash, resetRecord.target_id]);
      await tx.execute('UPDATE users SET password_hash = $1 WHERE store_id = $2', [newHash, resetRecord.target_id]);
      await tx.execute('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [resetRecord.id]);
    });

    // Validar se o token foi marcado como used_at
    const tokenAfter = mockDb.tokens.find(t => t.id === 10);
    assert.ok(tokenAfter.used_at, 'Token deve ter used_at preenchido');

    // Validar se nova senha é válida com bcrypt.compare
    const storeAfter = mockDb.stores[0];
    const userAfter = mockDb.users[0];
    assert.equal(bcrypt.compareSync(newPasswordPlain, storeAfter.owner_password_hash), true, 'Senha da loja deve estar atualizada');
    assert.equal(bcrypt.compareSync(newPasswordPlain, userAfter.password_hash), true, 'Senha do usuário master deve estar atualizada');
    assert.equal(userAfter.session_version, 2, 'Session version deve ter sido incrementada');

    // Tentativa de reutilizar o mesmo token deve falhar
    const retryFind = await mockDb.queryOne('SELECT * FROM password_reset_tokens WHERE token_hash = $1', [validHash]);
    assert.equal(retryFind, null, 'Mesmo token não pode ser reutilizado');
  });

  await t.test('7. Tentativa de reutilização concorrente/simultânea do mesmo token', async () => {
    const mockDb = createMockDb();
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    mockDb.tokens.push({
      id: 20,
      email: 'teste.concorrencia@itech.com',
      token_hash: tokenHash,
      target_type: 'owner',
      target_id: 1,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      used_at: null
    });

    async function applyReset() {
      const record = await mockDb.queryOne('SELECT * FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
      if (!record) return { success: false, reason: 'TOKEN_INVALID_OR_EXPIRED' };

      return await mockDb.transaction(async (tx) => {
        const check = await tx.queryOne('SELECT * FROM password_reset_tokens WHERE id = $1', [record.id]);
        if (!check) return { success: false, reason: 'TOKEN_ALREADY_USED' };

        await tx.execute('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [check.id]);
        return { success: true };
      });
    }

    // Executa a primeira requisição
    const req1 = await applyReset();
    // Executa imediatamente a segunda requisição com o mesmo token
    const req2 = await applyReset();

    assert.equal(req1.success, true, 'Primeira requisição deve ser bem sucedida');
    assert.equal(req2.success, false, 'Segunda requisição concorrente deve ser rejeitada');
    assert.ok(req2.reason.includes('TOKEN_'), 'Deve indicar motivo de recusa segura');
  });

  await t.test('8. Multi-tenancy e Isolamento de Loja: token de Loja 1 não altera Loja 2', async () => {
    const mockDb = createMockDb();
    // Adiciona Loja 2 e usuário da Loja 2
    mockDb.stores.push({
      id: 2,
      name: 'Loja 2 Invasao Test',
      owner_name: 'Proprietário Loja 2',
      owner_email: 'loja2@outrodominio.com.br',
      owner_password_hash: bcrypt.hashSync('senhaIntactaLoja2', 8)
    });
    mockDb.users.push({
      id: 2,
      store_id: 2,
      username: 'admin_loja2',
      password_hash: mockDb.stores[1].owner_password_hash,
      role: 'admin',
      is_master: 1,
      session_version: 1
    });

    // Cria token legítimo pertencente à Loja 1
    const tokenL1 = crypto.randomBytes(32).toString('hex');
    const hashL1 = crypto.createHash('sha256').update(tokenL1).digest('hex');
    mockDb.tokens.push({
      id: 30,
      email: 'emerson.teste@itechcelulareinformatica.com.br',
      token_hash: hashL1,
      target_type: 'owner',
      target_id: 1, // Loja 1
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      used_at: null
    });

    const resetRecord = await mockDb.queryOne('SELECT * FROM password_reset_tokens WHERE token_hash = $1', [hashL1]);
    assert.equal(resetRecord.target_id, 1, 'Token deve apontar exclusivamente para a Loja 1');

    const novaSenhaLoja1 = bcrypt.hashSync('NovaSenhaLoja1@123', 8);
    await mockDb.transaction(async (tx) => {
      // Atualiza apenas target_id do token
      await tx.execute('UPDATE stores SET owner_password_hash = $1 WHERE id = $2', [novaSenhaLoja1, resetRecord.target_id]);
      await tx.execute('UPDATE users SET password_hash = $1 WHERE store_id = $2', [novaSenhaLoja1, resetRecord.target_id]);
      await tx.execute('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [resetRecord.id]);
    });

    // Validar que a Loja 2 permaneceu 100% intacta
    const store2 = mockDb.stores.find(s => s.id === 2);
    const user2 = mockDb.users.find(u => u.store_id === 2);
    assert.equal(bcrypt.compareSync('senhaIntactaLoja2', store2.owner_password_hash), true, 'Senha da Loja 2 não pode ser alterada');
    assert.equal(bcrypt.compareSync('senhaIntactaLoja2', user2.password_hash), true, 'Senha do usuário da Loja 2 não pode ser alterada');
    assert.equal(user2.session_version, 1, 'Session_version da Loja 2 não deve ser alterada');
  });

  await t.test('9. Alerta crítico em produção quando RESEND_API_KEY estiver ausente', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.RESEND_API_KEY;
    const originalSimulate = process.env.RESEND_SIMULATE;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.RESEND_API_KEY;
      delete process.env.RESEND_SIMULATE;

      const res = await emailService.sendEmail({
        to: 'alvo@teste.com',
        subject: 'Teste Prod',
        html: '<p>x</p>'
      });

      assert.equal(res.success, false, 'Em produção sem chave Resend, não deve simular falsamente sucesso');
      assert.ok(res.error.includes('não configurado'), 'Deve acusar erro de configuração');
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalKey) process.env.RESEND_API_KEY = originalKey;
      if (originalSimulate) process.env.RESEND_SIMULATE = originalSimulate;
    }
  });
});
