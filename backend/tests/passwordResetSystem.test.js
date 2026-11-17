const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Mock em memória do banco de dados para os testes da suíte de recuperação de senha
function createMockDb(options = {}) {
  const stores = [
    {
      id: 1,
      name: 'iTech Celular Loja 1',
      owner_name: 'Emerson Lemos',
      owner_email: 'emerson@itech.com.br',
      owner_password_hash: bcrypt.hashSync('senhaOwner123', 8),
    },
    {
      id: 2,
      name: 'Loja Secundária 2',
      owner_name: 'Outro Dono',
      owner_email: 'dono.loja2@outrodominio.com.br',
      owner_password_hash: bcrypt.hashSync('senhaLoja2_999', 8),
    }
  ];

  const users = [
    {
      id: 1,
      store_id: 1,
      full_name: 'Emerson Lemos (Master)',
      username: 'master1',
      email: null,
      password_hash: stores[0].owner_password_hash,
      role: 'admin',
      active: 1,
      is_master: 1,
      session_version: 1
    },
    {
      id: 2,
      store_id: 1,
      full_name: 'Carlos Administrador',
      username: 'carlos_admin',
      email: 'carlos.admin@itech.com.br',
      password_hash: bcrypt.hashSync('senhaCarlos123', 8),
      role: 'admin',
      active: 1,
      is_master: 0,
      session_version: 1
    },
    {
      id: 3,
      store_id: 1,
      full_name: 'Ana Funcionária Balcão',
      username: 'ana_balcao',
      email: 'ana.balcao@itech.com.br',
      password_hash: bcrypt.hashSync('senhaAna123', 8),
      role: 'employee',
      active: 1,
      is_master: 0,
      session_version: 1
    },
    {
      id: 4,
      store_id: 1,
      full_name: 'Roberto Sem Email',
      username: 'roberto_antigo',
      email: null,
      password_hash: bcrypt.hashSync('senhaRoberto123', 8),
      role: 'employee',
      active: 1,
      is_master: 0,
      session_version: 1
    },
    {
      id: 5,
      store_id: 2,
      full_name: 'Admin Loja 2',
      username: 'admin_l2',
      email: 'admin@loja2.com.br',
      password_hash: stores[1].owner_password_hash,
      role: 'admin',
      active: 1,
      is_master: 1,
      session_version: 1
    },
    {
      id: 6,
      store_id: 2,
      full_name: 'Funcionario Loja 2',
      username: 'func_l2',
      email: 'func@loja2.com.br',
      password_hash: bcrypt.hashSync('senhaFuncLoja2', 8),
      role: 'employee',
      active: 1,
      is_master: 0,
      session_version: 1
    }
  ];

  const tokens = [];
  let txQueue = Promise.resolve();

  const mock = {
    stores,
    users,
    tokens,
    simulateMissingUserEmailColumn: !!options.simulateMissingUserEmailColumn,

    async query(sql, params) {
      const lower = sql.toLowerCase();
      if (lower.includes('from users where lower(email) = $1')) {
        if (this.simulateMissingUserEmailColumn) {
          const err = new Error('column "email" does not exist');
          err.code = '42703';
          throw err;
        }
        const search = (params[0] || '').toLowerCase();
        return users.filter(u => u.active === 1 && u.email && u.email.toLowerCase() === search);
      }
      return [];
    },

    async queryOne(sql, params) {
      const lower = sql.toLowerCase();
      if (lower.includes('from stores where lower(owner_email) = $1')) {
        const search = (params[0] || '').toLowerCase();
        return stores.find(s => s.owner_email.toLowerCase() === search) || null;
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
        const search = (params[0] || '').toLowerCase();
        tokens.filter(t => t.email.toLowerCase() === search && !t.used_at).forEach(t => {
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
      if (lower.includes('update users set password_hash = $1, session_version = session_version + 1') && lower.includes('is_master = 1')) {
        const [hash, storeId] = params;
        const u = users.find(user => user.store_id === storeId && user.is_master === 1);
        if (u) {
          u.password_hash = hash;
          u.session_version += 1;
        }
        return;
      }
      if (lower.includes('update users set password_hash = $1, session_version = session_version + 1') && lower.includes('where id = $2')) {
        const [hash, userId] = params;
        const u = users.find(user => user.id === userId);
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
      let release;
      const nextLock = new Promise((resolve) => { release = resolve; });
      const currentLock = txQueue;
      txQueue = currentLock.then(() => nextLock);
      await currentLock;
      try {
        return await callback(this);
      } finally {
        release();
      }
    }
  };

  return mock;
}

// Emulador da lógica central de busca de contas
async function findAccounts(mockDb, cleanEmail) {
  const accounts = [];
  try {
    const store = await mockDb.queryOne(
      'SELECT id, name, owner_name, owner_email FROM stores WHERE LOWER(owner_email) = $1',
      [cleanEmail]
    );
    if (store) {
      accounts.push({
        type: 'owner',
        id: store.id,
        storeId: store.id,
        email: store.owner_email,
        name: store.owner_name || store.name
      });
    }
  } catch (_) {}

  try {
    const users = await mockDb.query(
      'SELECT id, store_id, full_name, username, email FROM users WHERE LOWER(email) = $1 AND active = 1',
      [cleanEmail]
    );
    if (Array.isArray(users)) {
      for (const u of users) {
        accounts.push({
          type: 'user',
          id: u.id,
          storeId: u.store_id,
          email: u.email,
          name: u.full_name || u.username
        });
      }
    }
  } catch (err) {
    const msg = String(err?.message || '').toLowerCase();
    const isMissing = err?.code === '42703' || msg.includes('no such column') || msg.includes('does not exist');
    if (!isMissing) throw err;
  }

  return accounts;
}

// Emulador da requisição POST /api/auth/forgot-password
async function handleForgotPassword(mockDb, rawEmail, options = {}) {
  if (!rawEmail || !rawEmail.trim()) {
    return { status: 400, body: { error: 'Informe seu e-mail cadastrado.' } };
  }

  const cleanEmail = rawEmail.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return {
      status: 200,
      body: {
        success: true,
        message: 'Se o e-mail informado estiver cadastrado, as instruções para redefinição foram enviadas.'
      }
    };
  }

  const accounts = await findAccounts(mockDb, cleanEmail);

  if (accounts.length === 0) {
    return {
      status: 200,
      body: {
        success: true,
        message: 'Se o e-mail informado estiver cadastrado, as instruções para redefinição foram enviadas.'
      }
    };
  }

  if (accounts.length > 1) {
    // Ambiguidade detectada
    return {
      status: 200,
      body: {
        success: true,
        message: 'Se o e-mail informado estiver cadastrado, as instruções para redefinição foram enviadas.'
      },
      ambiguityRejected: true
    };
  }

  const targetAccount = accounts[0];
  const resetToken = options.overrideToken || crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  await mockDb.execute('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE LOWER(email) = $1 AND used_at IS NULL', [cleanEmail]);
  await mockDb.execute('INSERT INTO password_reset_tokens', [cleanEmail, tokenHash, targetAccount.type, targetAccount.id, expiresAt]);

  const emailService = require('../services/emailService');
  const { renderPasswordResetEmail } = require('../templates/passwordResetEmail');

  const { html, text } = renderPasswordResetEmail({
    userName: targetAccount.name,
    resetUrl: `https://itechcloud.app/redefinir-senha?token=${resetToken}&email=${encodeURIComponent(cleanEmail)}`,
    systemName: 'iTech ERP',
    validityText: '30 minutos'
  });

  const sendResult = await emailService.sendEmail({
    to: cleanEmail,
    subject: 'Redefinição de senha — iTech ERP',
    html,
    text
  });

  return {
    status: 200,
    body: {
      success: true,
      message: 'Se o e-mail informado estiver cadastrado, as instruções para redefinição foram enviadas.'
    },
    generatedToken: resetToken,
    tokenHash,
    targetAccount,
    sendResult
  };
}

// Emulador da requisição POST /api/auth/reset-password
async function handleResetPassword(mockDb, { token, newPassword, confirmPassword }) {
  if (!token || !newPassword) {
    return { status: 400, body: { error: 'Dados incompletos para redefinição.' } };
  }
  if (newPassword.length < 8) {
    return { status: 400, body: { error: 'A nova senha deve ter no mínimo 8 caracteres.' } };
  }
  if (confirmPassword && newPassword !== confirmPassword) {
    return { status: 400, body: { error: 'A confirmação de senha não confere.' } };
  }

  const cleanToken = String(token).trim();
  const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');

  const resetRecord = await mockDb.queryOne('SELECT * FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
  if (!resetRecord) {
    return { status: 400, body: { error: 'Link de redefinição expirado ou inválido.' } };
  }

  const hash = bcrypt.hashSync(newPassword, 8);

  try {
    await mockDb.transaction(async (tx) => {
      const checkAtomic = await tx.queryOne('SELECT * FROM password_reset_tokens WHERE id = $1', [resetRecord.id]);
      if (!checkAtomic) {
        throw new Error('TOKEN_ALREADY_USED');
      }

      if (checkAtomic.target_type === 'owner') {
        await tx.execute('UPDATE stores SET owner_password_hash = $1 WHERE id = $2', [hash, checkAtomic.target_id]);
        await tx.execute('UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE store_id = $2 AND is_master = 1', [hash, checkAtomic.target_id]);
      } else if (checkAtomic.target_type === 'user') {
        await tx.execute('UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2', [hash, checkAtomic.target_id]);
      }

      await tx.execute('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [checkAtomic.id]);
    });

    return {
      status: 200,
      body: {
        success: true,
        message: 'Senha redefinida com sucesso! Você já pode acessar o sistema.'
      }
    };
  } catch (err) {
    if (err.message === 'TOKEN_ALREADY_USED') {
      return { status: 400, body: { error: 'Este link de redefinição já foi utilizado ou expirou.' } };
    }
    return { status: 400, body: { error: 'Erro ao redefinir senha.' } };
  }
}

test('Suíte Completa: Recuperação de Senha Individual por E-mail (Resend + Multi-tenancy)', async (t) => {

  await t.test('1. Recuperação do proprietário: gera token target_type=owner, envia e-mail e atualiza senha da loja e master', async () => {
    const mockDb = createMockDb();
    const res = await handleForgotPassword(mockDb, 'emerson@itech.com.br');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.targetAccount.type, 'owner');
    assert.equal(res.targetAccount.id, 1);

    const saved = mockDb.tokens.find(tok => tok.email === 'emerson@itech.com.br');
    assert.ok(saved);
    assert.equal(saved.target_type, 'owner');
    assert.equal(saved.target_id, 1);

    // Redefinir senha com o token do proprietário
    const reset = await handleResetPassword(mockDb, {
      token: res.generatedToken,
      newPassword: 'NovaSenhaOwner@123',
      confirmPassword: 'NovaSenhaOwner@123'
    });

    assert.equal(reset.status, 200);
    const store = mockDb.stores.find(s => s.id === 1);
    const masterUser = mockDb.users.find(u => u.store_id === 1 && u.is_master === 1);
    const employee = mockDb.users.find(u => u.id === 3);

    assert.equal(bcrypt.compareSync('NovaSenhaOwner@123', store.owner_password_hash), true);
    assert.equal(bcrypt.compareSync('NovaSenhaOwner@123', masterUser.password_hash), true);
    assert.equal(masterUser.session_version, 2, 'Session_version do master deve ser incrementada');
    // Garante que o funcionário não master não teve a senha alterada
    assert.equal(bcrypt.compareSync('NovaSenhaOwner@123', employee.password_hash), false);
  });

  await t.test('2. Recuperação de administrador por e-mail individual: gera target_type=user e atualiza apenas sua senha', async () => {
    const mockDb = createMockDb();
    const res = await handleForgotPassword(mockDb, 'carlos.admin@itech.com.br');

    assert.equal(res.status, 200);
    assert.equal(res.targetAccount.type, 'user');
    assert.equal(res.targetAccount.id, 2);

    const saved = mockDb.tokens.find(tok => tok.email === 'carlos.admin@itech.com.br');
    assert.equal(saved.target_type, 'user');
    assert.equal(saved.target_id, 2);

    // Redefinição
    const reset = await handleResetPassword(mockDb, {
      token: res.generatedToken,
      newPassword: 'SenhaCarlosNova@456',
      confirmPassword: 'SenhaCarlosNova@456'
    });

    assert.equal(reset.status, 200);
    const adminUser = mockDb.users.find(u => u.id === 2);
    const store = mockDb.stores.find(s => s.id === 1);

    assert.equal(bcrypt.compareSync('SenhaCarlosNova@456', adminUser.password_hash), true);
    assert.equal(adminUser.session_version, 2, 'Session_version do administrador deve ser incrementada');
    // Proprietário da loja permanece com senha anterior
    assert.equal(bcrypt.compareSync('SenhaCarlosNova@456', store.owner_password_hash), false);
  });

  await t.test('3. Recuperação de funcionário por e-mail individual: atualiza exclusivamente seu password_hash', async () => {
    const mockDb = createMockDb();
    const res = await handleForgotPassword(mockDb, 'ana.balcao@itech.com.br');

    assert.equal(res.status, 200);
    assert.equal(res.targetAccount.type, 'user');
    assert.equal(res.targetAccount.id, 3);

    const reset = await handleResetPassword(mockDb, {
      token: res.generatedToken,
      newPassword: 'SenhaAnaNova@789',
      confirmPassword: 'SenhaAnaNova@789'
    });

    assert.equal(reset.status, 200);
    const ana = mockDb.users.find(u => u.id === 3);
    const carlos = mockDb.users.find(u => u.id === 2);
    const store = mockDb.stores.find(s => s.id === 1);

    assert.equal(bcrypt.compareSync('SenhaAnaNova@789', ana.password_hash), true);
    assert.equal(ana.session_version, 2);
    // Demais contas e loja permanecem inalteradas
    assert.equal(bcrypt.compareSync('SenhaAnaNova@789', carlos.password_hash), false);
    assert.equal(bcrypt.compareSync('SenhaAnaNova@789', store.owner_password_hash), false);
  });

  await t.test('4. Endereço inexistente: retorna resposta genérica idêntica sem gerar nenhum token', async () => {
    const mockDb = createMockDb();
    const res = await handleForgotPassword(mockDb, 'fantasma@inexistente.com.br');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, 'Se o e-mail informado estiver cadastrado, as instruções para redefinição foram enviadas.');
    assert.equal(mockDb.tokens.length, 0, 'Nenhum token pode ser gerado');
  });

  await t.test('5. Usuário sem e-mail cadastrado (null/vazio): não gera token e retorna mensagem genérica', async () => {
    const mockDb = createMockDb();
    // Roberto existe na tabela users mas com email = null
    const res = await handleForgotPassword(mockDb, 'roberto_antigo@itech.com.br');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(mockDb.tokens.length, 0);
  });

  await t.test('6. E-mail com letras maiúsculas e espaços: normalização trim().toLowerCase() localiza conta corretamente', async () => {
    const mockDb = createMockDb();
    const res = await handleForgotPassword(mockDb, '   ANA.BALCAO@itech.COM.br   ');

    assert.equal(res.status, 200);
    assert.ok(res.generatedToken);
    assert.equal(res.targetAccount.id, 3);
    assert.equal(mockDb.tokens[0].email, 'ana.balcao@itech.com.br');
  });

  await t.test('7. Conflito ou ambiguidade entre contas: rejeita geração silenciosamente sem expor detalhes', async () => {
    const mockDb = createMockDb();
    // Injeta inconsistência proposital: mesmo e-mail no store 1 e no user 3
    mockDb.stores[0].owner_email = 'conflito@teste.com';
    mockDb.users[2].email = 'conflito@teste.com';

    const res = await handleForgotPassword(mockDb, 'conflito@teste.com');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.ambiguityRejected, true, 'Deve rejeitar a ambiguidade internamente');
    assert.equal(mockDb.tokens.length, 0, 'Nenhum token deve ser emitido quando houver ambiguidade');
  });

  await t.test('8. Token de funcionário não altera proprietário', async () => {
    const mockDb = createMockDb();
    const res = await handleForgotPassword(mockDb, 'ana.balcao@itech.com.br');

    const storeBefore = mockDb.stores.find(s => s.id === 1).owner_password_hash;

    await handleResetPassword(mockDb, {
      token: res.generatedToken,
      newPassword: 'NovaSenhaDeFuncionario@1',
      confirmPassword: 'NovaSenhaDeFuncionario@1'
    });

    const storeAfter = mockDb.stores.find(s => s.id === 1).owner_password_hash;
    assert.equal(storeBefore, storeAfter, 'Senha do proprietário não pode sofrer alteração');
  });

  await t.test('9. Token de proprietário não altera senha de funcionários', async () => {
    const mockDb = createMockDb();
    const res = await handleForgotPassword(mockDb, 'emerson@itech.com.br');

    const funcBefore = mockDb.users.find(u => u.id === 3).password_hash;

    await handleResetPassword(mockDb, {
      token: res.generatedToken,
      newPassword: 'NovaSenhaDonoExclusiva@1',
      confirmPassword: 'NovaSenhaDonoExclusiva@1'
    });

    const funcAfter = mockDb.users.find(u => u.id === 3).password_hash;
    assert.equal(funcBefore, funcAfter, 'Senha de funcionários não master deve permanecer intocada');
  });

  await t.test('10. Multi-tenancy: Token de Loja 1 não altera nenhum dado da Loja 2', async () => {
    const mockDb = createMockDb();
    const res = await handleForgotPassword(mockDb, 'emerson@itech.com.br');

    const loja2StoreBefore = mockDb.stores.find(s => s.id === 2).owner_password_hash;
    const loja2UserBefore = mockDb.users.find(u => u.id === 5).password_hash;

    await handleResetPassword(mockDb, {
      token: res.generatedToken,
      newPassword: 'SenhaParaLoja1Apenas@1',
      confirmPassword: 'SenhaParaLoja1Apenas@1'
    });

    const loja2StoreAfter = mockDb.stores.find(s => s.id === 2).owner_password_hash;
    const loja2UserAfter = mockDb.users.find(u => u.id === 5).password_hash;

    assert.equal(loja2StoreBefore, loja2StoreAfter, 'Loja 2 deve permanecer 100% inalterada');
    assert.equal(loja2UserBefore, loja2UserAfter, 'Usuário da Loja 2 deve permanecer 100% inalterado');
  });

  await t.test('11. Token expirado: rejeita redefinição e mantém senhas anteriores', async () => {
    const mockDb = createMockDb();
    const res = await handleForgotPassword(mockDb, 'carlos.admin@itech.com.br');

    // Forçar token a expirar
    mockDb.tokens[0].expires_at = new Date(Date.now() - 1000).toISOString();

    const reset = await handleResetPassword(mockDb, {
      token: res.generatedToken,
      newPassword: 'TentativaExpirada@123',
      confirmPassword: 'TentativaExpirada@123'
    });

    assert.equal(reset.status, 400);
    assert.ok(reset.body.error.includes('expirado ou inválido'));

    const admin = mockDb.users.find(u => u.id === 2);
    assert.equal(bcrypt.compareSync('TentativaExpirada@123', admin.password_hash), false);
  });

  await t.test('12. Token reutilizado: segunda tentativa é rejeitada', async () => {
    const mockDb = createMockDb();
    const res = await handleForgotPassword(mockDb, 'carlos.admin@itech.com.br');

    // Primeiro uso: Sucesso
    const reset1 = await handleResetPassword(mockDb, {
      token: res.generatedToken,
      newPassword: 'PrimeiroUsoValido@1',
      confirmPassword: 'PrimeiroUsoValido@1'
    });
    assert.equal(reset1.status, 200);

    // Segundo uso com o mesmo token: Rejeição imediata
    const reset2 = await handleResetPassword(mockDb, {
      token: res.generatedToken,
      newPassword: 'SegundoUsoInvalido@2',
      confirmPassword: 'SegundoUsoInvalido@2'
    });
    assert.equal(reset2.status, 400);
    assert.ok(reset2.body.error.includes('expirado') || reset2.body.error.includes('utilizado'));
  });

  await t.test('13. Consumo simultâneo do mesmo token: proteção atômica em transação', async () => {
    const mockDb = createMockDb();
    const res = await handleForgotPassword(mockDb, 'ana.balcao@itech.com.br');

    const token = res.generatedToken;
    const p1 = handleResetPassword(mockDb, { token, newPassword: 'Concorrente1@123', confirmPassword: 'Concorrente1@123' });
    const p2 = handleResetPassword(mockDb, { token, newPassword: 'Concorrente2@456', confirmPassword: 'Concorrente2@456' });

    const [r1, r2] = await Promise.all([p1, p2]);
    const successes = [r1, r2].filter(r => r.status === 200);
    const fails = [r1, r2].filter(r => r.status === 400);

    assert.equal(successes.length, 1, 'Exatamente uma requisição concorrente deve vencer');
    assert.equal(fails.length, 1, 'A segunda requisição concorrente deve ser bloqueada atomicamente');
  });

  await t.test('14. Falha do Resend: tratamento seguro sem quebrar o fluxo com erro 500', async () => {
    const mockDb = createMockDb();
    const emailService = require('../services/emailService');

    // Sobrescreve temporariamente sendEmail para simular erro da API externa
    const originalSendEmail = emailService.sendEmail;
    try {
      emailService.sendEmail = async () => ({
        success: false,
        error: 'Resend API rate limit exceeded (HTTP 429)'
      });

      const res = await handleForgotPassword(mockDb, 'emerson@itech.com.br');
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.sendResult.success, false);
      assert.ok(res.sendResult.error.includes('rate limit'));
    } finally {
      emailService.sendEmail = originalSendEmail;
    }
  });

  await t.test('15. Envio aceito pelo Resend: gera envio simulado ou id de entrega', async () => {
    const mockDb = createMockDb();
    const res = await handleForgotPassword(mockDb, 'emerson@itech.com.br');

    assert.equal(res.status, 200);
    assert.equal(res.sendResult.success, true);
    assert.ok(res.sendResult.id);
  });

  await t.test('16. Invalidação de sessões anteriores: session_version incrementado para invalidar JWTs legados', async () => {
    const mockDb = createMockDb();
    const res = await handleForgotPassword(mockDb, 'carlos.admin@itech.com.br');

    const userBefore = mockDb.users.find(u => u.id === 2);
    assert.equal(userBefore.session_version, 1);

    await handleResetPassword(mockDb, {
      token: res.generatedToken,
      newPassword: 'NovaSenhaComSessaoRevogada@1',
      confirmPassword: 'NovaSenhaComSessaoRevogada@1'
    });

    const userAfter = mockDb.users.find(u => u.id === 2);
    assert.equal(userAfter.session_version, 2, 'session_version incrementado força expiração de sessões abertas');
  });

  await t.test('17. Resiliência antes da migration: ausência da coluna users.email não quebra a recuperação de proprietário', async () => {
    // Simula ambiente de produção onde a migration ainda não foi executada
    const mockDb = createMockDb({ simulateMissingUserEmailColumn: true });

    // Proprietário continua recuperando normalmente
    const res = await handleForgotPassword(mockDb, 'emerson@itech.com.br');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.targetAccount.type, 'owner');

    // Para e-mail inexistente ou de funcionário antes da migration, retorna resposta genérica sem quebrar com erro 500
    const resFunc = await handleForgotPassword(mockDb, 'ana.balcao@itech.com.br');
    assert.equal(resFunc.status, 200);
    assert.equal(resFunc.body.success, true);
  });
});
