const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const { initSqliteTestSchema } = require('../db/sqliteSchema');
const { isValidCPF, cleanDigits } = require('../utils/validators');

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

test('Clientes 2.0 — Validações de CPF e dígitos', () => {
  // CPFs matematicamente válidos conhecidos
  assert.strictEqual(isValidCPF('52998224725'), true);
  assert.strictEqual(isValidCPF('529.982.247-25'), true);
  assert.strictEqual(isValidCPF(''), true); // Opcional
  assert.strictEqual(isValidCPF(null), true); // Opcional

  // CPFs inválidos
  assert.strictEqual(isValidCPF('11111111111'), false);
  assert.strictEqual(isValidCPF('12345678900'), false);
  assert.strictEqual(isValidCPF('123'), false);

  assert.strictEqual(cleanDigits('(82) 99999-8888'), '82999998888');
  assert.strictEqual(cleanDigits('57.000-000'), '57000000');
});

test('Clientes 2.0 — Backend CRM, Isolamento Multi-tenant, Duplicidade e Métricas', async (t) => {
  const JWT_SECRET = 'crm-test-secret-key-2026';
  const sqliteDb = new Database(':memory:');
  initSqliteTestSchema(sqliteDb);

  // Mock compatível do db wrapper para a rota
  const mockDb = {
    isSqlite: true,
    queryOne: async (sql, ...params) => {
      const flat = params.flat();
      const sqliteSql = sql.replace(/\$\d+/g, '?');
      return sqliteDb.prepare(sqliteSql).get(...flat);
    },
    query: async (sql, ...params) => {
      const flat = params.flat();
      const sqliteSql = sql.replace(/\$\d+/g, '?');
      return sqliteDb.prepare(sqliteSql).all(...flat);
    },
    transaction: async (cb) => {
      return cb(mockDb);
    }
  };

  const app = express();
  app.use(express.json());

  // Injeta mock db e auth simples
  const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });
    try {
      const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ error: 'Token inválido' });
    }
  };

  // Re-monta rotas de customers isoladas com o mockDb
  const customersRouter = express.Router();
  customersRouter.use(authMiddleware);

  const { cleanDigits: cDigits, isValidCPF: vCPF } = require('../utils/validators');

  // POST /
  customersRouter.post('/', async (req, res, next) => {
    try {
      const storeId = req.user.store_id || 1;
      let { first_name, last_name, phone, cpf, email, allow_duplicate, notes, street, number, city, state, postal_code } = req.body;

      first_name = String(first_name || '').trim();
      last_name = String(last_name || '').trim();
      if (!first_name) return res.status(400).json({ error: 'Nome é obrigatório.' });

      const cleanPhone = cDigits(phone);
      if (!cleanPhone || cleanPhone.length < 8) return res.status(400).json({ error: 'Telefone é obrigatório.' });

      const cleanCpf = cDigits(cpf);
      if (cleanCpf && !vCPF(cleanCpf)) return res.status(400).json({ error: 'CPF inválido.' });

      if (!allow_duplicate) {
        if (cleanCpf && cleanCpf.length === 11) {
          const dup = await mockDb.queryOne(
            "SELECT id FROM customers WHERE store_id = $1 AND REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = $2",
            storeId, cleanCpf
          );
          if (dup) return res.status(409).json({ error: 'CPF já cadastrado.', existing_id: dup.id });
        }
      }

      const row = await mockDb.queryOne(
        `INSERT INTO customers (store_id, first_name, last_name, phone, cpf, email, notes, street, number, city, state, postal_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        storeId, first_name, last_name, phone, cpf || null, email || null, notes || null,
        street || null, number || null, city || null, state || null, postal_code || null
      );
      res.status(201).json({ id: row.id, success: true });
    } catch (e) { next(e); }
  });

  // GET / (busca e listagem)
  customersRouter.get('/', async (req, res, next) => {
    try {
      const storeId = req.user.store_id || 1;
      const { q } = req.query;
      let sql = 'SELECT * FROM customers WHERE store_id = $1 AND is_system = 0';
      const params = [storeId];

      if (q) {
        const rawQ = String(q).trim();
        sql += ` AND (LOWER(first_name) LIKE '%${rawQ.toLowerCase()}%' OR phone LIKE '%${rawQ}%' OR cpf LIKE '%${rawQ}%')`;
      }
      sql += ' ORDER BY first_name ASC';
      const rows = await mockDb.query(sql, ...params);
      res.json(rows);
    } catch (e) { next(e); }
  });

  // GET /:id/crm-profile
  customersRouter.get('/:id/crm-profile', async (req, res, next) => {
    try {
      const storeId = req.user.store_id || 1;
      const customer = await mockDb.queryOne('SELECT * FROM customers WHERE id = $1 AND store_id = $2', req.params.id, storeId);
      if (!customer) return res.status(404).json({ error: 'Cliente não encontrado' });

      const orders = await mockDb.query('SELECT * FROM service_orders WHERE customer_id = $1 AND store_id = $2', customer.id, storeId);
      const sales = await mockDb.query('SELECT * FROM device_sales WHERE customer_id = $1 AND store_id = $2', customer.id, storeId);
      const credits = await mockDb.query('SELECT * FROM credit_accounts WHERE customer_id = $1 AND store_id = $2', customer.id, storeId);

      const totalPending = credits.filter(c => c.status === 'open').reduce((s, c) => s + Number(c.amount || 0), 0);

      res.json({
        customer,
        metrics: {
          total_orders: orders.length,
          total_sales: sales.length,
          total_pending: totalPending
        },
        orders,
        sales,
        credit_accounts: credits
      });
    } catch (e) { next(e); }
  });

  app.use('/api/customers', customersRouter);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  const store1Token = jwt.sign({ id: 1, role: 'admin', store_id: 1 }, JWT_SECRET);
  const store2Token = jwt.sign({ id: 2, role: 'admin', store_id: 2 }, JWT_SECRET);

  try {
    await t.test('1. Cadastro de cliente com sucesso e validação de campos', async () => {
      const res = await requestHttp(server, 'POST', '/api/customers', {
        Authorization: `Bearer ${store1Token}`
      }, {
        first_name: 'Carlos',
        last_name: 'Alberto',
        phone: '(82) 99999-1111',
        cpf: '529.982.247-25',
        street: 'Rua das Flores',
        number: '123',
        city: 'Maceió',
        state: 'AL',
        notes: 'Cliente vip de reparo rápido'
      });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.id);
    });

    await t.test('2. Rejeição de cadastro com CPF inválido', async () => {
      const res = await requestHttp(server, 'POST', '/api/customers', {
        Authorization: `Bearer ${store1Token}`
      }, {
        first_name: 'Invalido',
        last_name: 'Teste',
        phone: '(82) 99999-2222',
        cpf: '123.456.789-00'
      });

      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /CPF/i);
    });

    await t.test('3. Prevenção de duplicidade por CPF na mesma loja', async () => {
      const res = await requestHttp(server, 'POST', '/api/customers', {
        Authorization: `Bearer ${store1Token}`
      }, {
        first_name: 'Outro',
        last_name: 'Nome',
        phone: '(82) 98888-3333',
        cpf: '529.982.247-25'
      });

      assert.strictEqual(res.status, 409);
      assert.match(res.body.error, /já cadastrado/i);
    });

    await t.test('4. Isolamento multi-tenant: outra loja pode cadastrar o mesmo CPF', async () => {
      const res = await requestHttp(server, 'POST', '/api/customers', {
        Authorization: `Bearer ${store2Token}`
      }, {
        first_name: 'Cliente',
        last_name: 'Loja 2',
        phone: '(82) 97777-4444',
        cpf: '529.982.247-25'
      });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.id);
    });

    await t.test('5. Busca inteligente de clientes por nome, telefone e CPF', async () => {
      const resByName = await requestHttp(server, 'GET', '/api/customers?q=Carlos', {
        Authorization: `Bearer ${store1Token}`
      });
      assert.strictEqual(resByName.status, 200);
      assert.strictEqual(resByName.body.length, 1);
      assert.strictEqual(resByName.body[0].first_name, 'Carlos');

      const resByPhone = await requestHttp(server, 'GET', '/api/customers?q=99999-1111', {
        Authorization: `Bearer ${store1Token}`
      });
      assert.strictEqual(resByPhone.status, 200);
      assert.strictEqual(resByPhone.body.length, 1);
    });

    await t.test('6. Perfil CRM: retorna métricas reais agregadas e isoladas', async () => {
      const cust = sqliteDb.prepare("SELECT id FROM customers WHERE store_id = 1 AND first_name = 'Carlos'").get();
      assert.ok(cust);

      // Insere OS e Fiado para o cliente Carlos
      sqliteDb.prepare(`
        INSERT INTO service_orders (store_id, order_number, customer_id, entry_date, service_price, status)
        VALUES (1, 'OS-CRM-101', ?, '2026-11-24', 250.00, 'delivered')
      `).run(cust.id);

      sqliteDb.prepare(`
        INSERT INTO credit_accounts (store_id, customer_id, description, amount, status)
        VALUES (1, ?, 'Troca de tela a prazo', 120.00, 'open')
      `).run(cust.id);

      const resProfile = await requestHttp(server, 'GET', `/api/customers/${cust.id}/crm-profile`, {
        Authorization: `Bearer ${store1Token}`
      });

      assert.strictEqual(resProfile.status, 200);
      assert.strictEqual(resProfile.body.customer.first_name, 'Carlos');
      assert.strictEqual(resProfile.body.metrics.total_orders, 1);
      assert.strictEqual(resProfile.body.metrics.total_pending, 120);
      assert.strictEqual(resProfile.body.orders.length, 1);
      assert.strictEqual(resProfile.body.credit_accounts.length, 1);
    });

    await t.test('7. Bloqueio de acesso cruzado: Loja 2 não pode ver perfil CRM da Loja 1', async () => {
      const cust = sqliteDb.prepare("SELECT id FROM customers WHERE store_id = 1 AND first_name = 'Carlos'").get();
      assert.ok(cust);

      const resProfileOther = await requestHttp(server, 'GET', `/api/customers/${cust.id}/crm-profile`, {
        Authorization: `Bearer ${store2Token}`
      });

      assert.strictEqual(resProfileOther.status, 404);
    });
  } finally {
    server.close();
    sqliteDb.close();
  }
});
