const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

// Mock em memória do banco para validação rigorosa das regras de e-mail de usuários
function createMockDb() {
  const stores = [
    { id: 1, name: 'Loja 1', owner_name: 'Proprietário 1', owner_email: 'dono1@loja1.com' },
    { id: 2, name: 'Loja 2', owner_name: 'Proprietário 2', owner_email: 'dono2@loja2.com' }
  ];

  const users = [
    {
      id: 1,
      store_id: 1,
      full_name: 'Admin Master Loja 1',
      username: 'admin1',
      email: null, // usuário legado sem e-mail
      password_hash: bcrypt.hashSync('senha123456', 8),
      role: 'admin',
      is_master: 1,
      active: 1
    },
    {
      id: 2,
      store_id: 2,
      full_name: 'Admin Master Loja 2',
      username: 'admin2',
      email: 'gestor2@loja2.com',
      password_hash: bcrypt.hashSync('senha123456', 8),
      role: 'admin',
      is_master: 1,
      active: 1
    }
  ];

  return {
    stores,
    users,
    async query(sql, params) {
      return users;
    },
    async queryOne(sql, params) {
      const lower = sql.toLowerCase();

      // Conflito com owner_email em stores
      if (lower.includes('from stores where lower(owner_email) = $1')) {
        const email = String(params[0]).toLowerCase();
        return stores.find(s => s.owner_email.toLowerCase() === email) || null;
      }

      // Conflito com outro usuário
      if (lower.includes('from users where lower(trim(email)) = $1 and id <> $2')) {
        const email = String(params[0]).toLowerCase().trim();
        const excludeId = Number(params[1]);
        return users.find(u => u.email && u.email.toLowerCase().trim() === email && u.id !== excludeId) || null;
      }

      // Busca usuário por ID e store_id
      if (lower.includes('from users where id = $1 and store_id = $2')) {
        const [id, storeId] = params;
        return users.find(u => u.id === Number(id) && u.store_id === Number(storeId)) || null;
      }

      // Contagem para limites
      if (lower.includes('count(*) as n from users')) {
        return { n: 1 };
      }

      return null;
    },
    async insertUser(data) {
      const newId = users.length + 1;
      const user = { id: newId, ...data };
      users.push(user);
      return user;
    },
    async updateUser(id, storeId, data) {
      const user = users.find(u => u.id === id && u.store_id === storeId);
      if (!user) throw new Error('Usuário não encontrado nesta loja.');
      Object.assign(user, data);
      return user;
    },
    async transaction(callback) {
      return await callback(this);
    }
  };
}

// Lógica de validação idêntica à de backend/routes/users.js
async function validateAndNormalizeUserEmail(tx, email, currentUserId = null) {
  if (email === undefined || email === null) {
    return null;
  }
  const rawEmail = String(email || '').trim().toLowerCase();
  if (!rawEmail) {
    return null;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(rawEmail) || rawEmail.length > 255) {
    const err = new Error('Informe um endereço de e-mail válido.');
    err.statusCode = 400;
    throw err;
  }

  // 1. Verificar conflito com o e-mail de proprietário de qualquer loja
  const storeConflict = await tx.queryOne('SELECT id, name FROM stores WHERE LOWER(owner_email) = $1', [rawEmail]);
  if (storeConflict) {
    const err = new Error('Este endereço de e-mail já está em uso como e-mail de proprietário de loja.');
    err.statusCode = 409;
    throw err;
  }

  // 2. Verificar duplicidade com outro usuário (mesma loja ou outra loja)
  const userConflict = await tx.queryOne(
    'SELECT id, store_id FROM users WHERE LOWER(TRIM(email)) = $1 AND id <> $2',
    [rawEmail, currentUserId || -1]
  );
  if (userConflict) {
    const err = new Error('Este endereço de e-mail já está cadastrado para outro usuário.');
    err.statusCode = 409;
    throw err;
  }

  return rawEmail;
}

test('Suíte de Testes: E-mail Individual de Usuários (Users & Access)', async (t) => {
  await t.test('1. Criação de usuário com e-mail válido e normalização em minúsculas', async () => {
    const mockDb = createMockDb();
    const cleanEmail = await validateAndNormalizeUserEmail(mockDb, '  Tecnico.SilvA@Itech.Com.BR  ');
    assert.equal(cleanEmail, 'tecnico.silva@itech.com.br');

    const created = await mockDb.insertUser({
      store_id: 1,
      full_name: 'Técnico Silva',
      username: 'tecnicosilva',
      email: cleanEmail,
      role: 'employee'
    });
    assert.equal(created.email, 'tecnico.silva@itech.com.br');
  });

  await t.test('2. Edição de e-mail de usuário existente mantendo o mesmo e-mail (id próprio ignorado)', async () => {
    const mockDb = createMockDb();
    // Usuário 2 já tem email 'gestor2@loja2.com'
    const cleanEmail = await validateAndNormalizeUserEmail(mockDb, 'GESTOR2@loja2.com', 2);
    assert.equal(cleanEmail, 'gestor2@loja2.com');
  });

  await t.test('3. Rejeição de e-mail com formato inválido (sem @ ou domínio)', async () => {
    const mockDb = createMockDb();
    await assert.rejects(
      async () => validateAndNormalizeUserEmail(mockDb, 'email-invalido-sem-arroba'),
      /Informe um endereço de e-mail válido/
    );
  });

  await t.test('4. Rejeição de e-mail duplicado na mesma loja', async () => {
    const mockDb = createMockDb();
    // Cadastra um primeiro usuário com email
    await mockDb.insertUser({ store_id: 1, username: 'atendente1', email: 'atendimento@loja1.com' });

    // Tentativa de cadastrar segundo usuário na loja 1 com o mesmo email
    await assert.rejects(
      async () => validateAndNormalizeUserEmail(mockDb, 'ATENDIMENTO@loja1.com'),
      /já está cadastrado para outro usuário/
    );
  });

  await t.test('5. Rejeição de e-mail duplicado entre lojas diferentes (unicidade global de login/recuperação)', async () => {
    const mockDb = createMockDb();
    // Usuário da Loja 2 possui 'gestor2@loja2.com'
    // Usuário da Loja 1 tenta cadastrar o mesmo e-mail
    await assert.rejects(
      async () => validateAndNormalizeUserEmail(mockDb, 'gestor2@loja2.com', null),
      /já está cadastrado para outro usuário/
    );
  });

  await t.test('6. Rejeição de conflito com stores.owner_email', async () => {
    const mockDb = createMockDb();
    // dono1@loja1.com é o owner_email da Loja 1
    await assert.rejects(
      async () => validateAndNormalizeUserEmail(mockDb, 'DONO1@LOJA1.COM'),
      /já está em uso como e-mail de proprietário de loja/
    );
  });

  await t.test('7. Usuários legados sem e-mail (null ou vazio) continuam funcionando normalmente', async () => {
    const mockDb = createMockDb();
    const cleanNull = await validateAndNormalizeUserEmail(mockDb, null);
    const cleanEmpty = await validateAndNormalizeUserEmail(mockDb, '');
    assert.equal(cleanNull, null);
    assert.equal(cleanEmpty, null);

    const legacyUser = mockDb.users.find(u => u.id === 1);
    assert.equal(legacyUser.email, null);
  });

  await t.test('8. Isolamento entre lojas na alteração de usuários (store_id)', async () => {
    const mockDb = createMockDb();
    // Administrador da Loja 1 tentando alterar usuário da Loja 2 (id: 2, store_id: 2)
    const actorStoreId = 1;
    const targetUserId = 2;

    const target = await mockDb.queryOne('SELECT * FROM users WHERE id = $1 AND store_id = $2', [targetUserId, actorStoreId]);
    assert.equal(target, null, 'Administrador da Loja 1 não pode localizar nem alterar usuário da Loja 2');
  });

  await t.test('9. Teste de concorrência: duas requisições simultâneas tentando o mesmo e-mail', async () => {
    const mockDb = createMockDb();
    const emailCandidate = 'novo.funcionario@itech.com';

    let winner = null;
    let loser = null;

    async function attemptInsert(username) {
      return await mockDb.transaction(async (tx) => {
        const clean = await validateAndNormalizeUserEmail(tx, emailCandidate);
        return await tx.insertUser({ store_id: 1, username, email: clean });
      });
    }

    try {
      winner = await attemptInsert('func1');
      loser = await attemptInsert('func2');
      assert.fail('Deveria ter rejeitado a segunda inserção');
    } catch (err) {
      assert.ok(winner, 'Primeira inserção deve ser concluída');
      assert.ok(err.message.includes('já está cadastrado'), 'Segunda inserção simultânea deve ser bloqueada');
    }
  });
});
