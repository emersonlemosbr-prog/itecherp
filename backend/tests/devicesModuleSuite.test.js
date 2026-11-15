// backend/tests/devicesModuleSuite.test.js
// Suíte de Testes Automatizados Completa para o Módulo Aparelhos (Controle individual por IMEI/Série)

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Força ambiente seguro de teste
process.env.NODE_ENV = 'test';
delete process.env.TEST_DATABASE_URL;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

const db = require('../db/database');
const devicesRouter = require('../routes/devices');
const deviceSalesRouter = require('../routes/deviceSales');

// Helper simulador de requisição Express
function createReqRes({ method = 'GET', url = '/', user = { id: 1, name: 'Admin', role: 'admin', store_id: 1 }, body = {}, query = {}, params = {} }) {
  const req = {
    method,
    url,
    user,
    body,
    query,
    params,
    headers: {}
  };

  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    send(payload) {
      this.data = payload;
      return this;
    }
  };

  return { req, res };
}

test('Suíte Completa: Módulo Aparelhos e Controle Individual de Estoque', async (t) => {
  // Garante lojas de teste
  await db.execute("INSERT OR IGNORE INTO stores (id, name, slug, owner_name, owner_email, status) VALUES (1, 'Loja 1', 'loja1', 'Dono 1', 'dono1@teste.com', 'active')");
  await db.execute("INSERT OR IGNORE INTO stores (id, name, slug, owner_name, owner_email, status) VALUES (2, 'Loja 2', 'loja2', 'Dono 2', 'dono2@teste.com', 'active')");

  // Garante usuário para created_by
  await db.execute("INSERT OR IGNORE INTO users (id, store_id, full_name, username, password_hash, role) VALUES (1, 1, 'Admin', 'admin', 'hash', 'admin')");

  // Garante sequência de documentos
  await db.execute("CREATE TABLE IF NOT EXISTS document_sequences (store_id INTEGER DEFAULT 1, kind TEXT, next_value INTEGER, PRIMARY KEY (store_id, kind))");
  await db.execute("INSERT OR IGNORE INTO document_sequences (store_id, kind, next_value) VALUES (1, 'device', 1), (1, 'sale', 1)");

  // Garante fornecedor
  const supInfo = await db.execute("INSERT INTO stock_suppliers (store_id, name) VALUES (1, 'Fornecedor Distribuidor SP') RETURNING id");
  const supplierId = supInfo.id;

  let createdDeviceId1 = null;
  let createdDeviceId2 = null;

  await t.test('1. Cadastro de aparelho com todos os campos preenchidos', async () => {
    const { req, res } = createReqRes({
      method: 'POST',
      body: {
        brand: 'Apple',
        model: 'iPhone 17 Pro',
        storage: '256GB',
        color: 'Titânio Natural',
        category: 'Smartphone',
        imei1: '356872109876543',
        imei2: '356872109876544',
        serial_number: 'F17XYZ89ABCD',
        condition: 'Seminovo',
        battery_health: 92,
        cost_price: '3800.00',
        sell_price: '4500.00',
        supplier_id: supplierId,
        entry_date: '2026-11-01',
        notes: 'Impecável sem marcas'
      }
    });

    // Encontra o handler de POST /
    const route = devicesRouter.stack.find(r => r.route && r.route.path === '/' && r.route.methods.post);
    assert.ok(route, 'Rota POST / deve existir');
    const handler = route.route.stack[route.route.stack.length - 1].handle;

    await handler(req, res, () => {});

    assert.equal(res.statusCode, 201);
    assert.ok(res.data.id);
    assert.equal(res.data.brand, 'Apple');
    assert.equal(res.data.model, 'iPhone 17 Pro');
    assert.equal(res.data.imei1, '356872109876543');
    assert.equal(res.data.status, 'in_stock');
    createdDeviceId1 = res.data.id;

    // Verificar se registrou no histórico
    const hist = await db.query('SELECT * FROM device_history WHERE device_id = $1', [createdDeviceId1]);
    assert.equal(hist.length, 1);
    assert.equal(hist[0].action_type, 'created');
  });

  await t.test('2. Prevenção de duplicidade de IMEI 1 ativo na mesma loja (HTTP 409)', async () => {
    const { req, res } = createReqRes({
      method: 'POST',
      body: {
        brand: 'Apple',
        model: 'iPhone 17 Outro',
        imei1: '356872109876543', // mesmo IMEI 1 do teste 1
        cost_price: 3500,
        sell_price: 4200
      }
    });

    const route = devicesRouter.stack.find(r => r.route && r.route.path === '/' && r.route.methods.post);
    const handler = route.route.stack[route.route.stack.length - 1].handle;

    await handler(req, res, () => {});

    assert.equal(res.statusCode, 409);
    assert.match(res.data.error, /Já existe um aparelho ativo/);
  });

  await t.test('3. Cadastro de aparelho apenas com Número de Série (sem IMEI)', async () => {
    const { req, res } = createReqRes({
      method: 'POST',
      body: {
        brand: 'Apple',
        model: 'iPad Air M2',
        category: 'Tablet',
        serial_number: 'DMPX789ABCD',
        cost_price: 2500,
        sell_price: 3200
      }
    });

    const route = devicesRouter.stack.find(r => r.route && r.route.path === '/' && r.route.methods.post);
    const handler = route.route.stack[route.route.stack.length - 1].handle;

    await handler(req, res, () => {});

    assert.equal(res.statusCode, 201);
    assert.ok(res.data.id);
    assert.equal(res.data.serial_number, 'DMPX789ABCD');
    assert.equal(res.data.imei1, null);
    createdDeviceId2 = res.data.id;
  });

  await t.test('4. Atualização de aparelho e registro no histórico', async () => {
    const { req, res } = createReqRes({
      method: 'PUT',
      params: { id: createdDeviceId1 },
      body: {
        battery_health: 89,
        sell_price: 4600.00
      }
    });

    const route = devicesRouter.stack.find(r => r.route && r.route.path === '/:id' && r.route.methods.put);
    const handler = route.route.stack[route.route.stack.length - 1].handle;

    await handler(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.battery_health, 89);
    assert.equal(Number(res.data.sell_price), 4600);

    const hist = await db.query('SELECT * FROM device_history WHERE device_id = $1 AND action_type = $2', [createdDeviceId1, 'updated']);
    assert.ok(hist.length >= 1);
  });

  await t.test('5. Consulta e filtros de listagem e contadores de abas', async () => {
    const { req, res } = createReqRes({
      method: 'GET',
      query: { tab: 'in_stock' }
    });

    const route = devicesRouter.stack.find(r => r.route && r.route.path === '/' && r.route.methods.get);
    const handler = route.route.stack[route.route.stack.length - 1].handle;

    await handler(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.ok(res.data.items.length >= 2);
    assert.ok(res.data.counts.in_stock >= 2);
    assert.equal(res.data.counts.reserved, 0);
  });

  await t.test('6. Reserva de aparelho', async () => {
    const { req, res } = createReqRes({
      method: 'POST',
      params: { id: createdDeviceId1 },
      body: { reservation_notes: 'Reservado para o cliente João até amanhã' }
    });

    const route = devicesRouter.stack.find(r => r.route && r.route.path === '/:id/reserve' && r.route.methods.post);
    const handler = route.route.stack[route.route.stack.length - 1].handle;

    await handler(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.status, 'reserved');
    assert.match(res.data.reservation_notes, /João/);

    const dev = await db.queryOne('SELECT status FROM devices WHERE id = $1', [createdDeviceId1]);
    assert.equal(dev.status, 'reserved');
  });

  await t.test('7. Cancelamento de reserva retornando ao estoque disponível', async () => {
    const { req, res } = createReqRes({
      method: 'POST',
      params: { id: createdDeviceId1 }
    });

    const route = devicesRouter.stack.find(r => r.route && r.route.path === '/:id/cancel-reservation' && r.route.methods.post);
    const handler = route.route.stack[route.route.stack.length - 1].handle;

    await handler(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.status, 'in_stock');
    assert.equal(res.data.reservation_notes, null);
  });

  await t.test('8. Alteração de status para indisponível e retorno ao estoque', async () => {
    const { req: req1, res: res1 } = createReqRes({
      method: 'POST',
      params: { id: createdDeviceId2 },
      body: { status: 'unavailable', reason: 'Em manutenção na bancada' }
    });

    const route = devicesRouter.stack.find(r => r.route && r.route.path === '/:id/status' && r.route.methods.post);
    const handler = route.route.stack[route.route.stack.length - 1].handle;

    await handler(req1, res1, () => {});
    assert.equal(res1.statusCode, 200);
    assert.equal(res1.data.status, 'unavailable');

    // Retorna ao estoque
    const { req: req2, res: res2 } = createReqRes({
      method: 'POST',
      params: { id: createdDeviceId2 },
      body: { status: 'in_stock' }
    });
    await handler(req2, res2, () => {});
    assert.equal(res2.statusCode, 200);
    assert.equal(res2.data.status, 'in_stock');
  });

  await t.test('9. Arquivamento e restauração de aparelho', async () => {
    const { req: req1, res: res1 } = createReqRes({
      method: 'POST',
      params: { id: createdDeviceId2 }
    });

    const routeArchive = devicesRouter.stack.find(r => r.route && r.route.path === '/:id/archive' && r.route.methods.post);
    await routeArchive.route.stack[routeArchive.route.stack.length - 1].handle(req1, res1, () => {});
    assert.equal(res1.statusCode, 200);
    assert.equal(res1.data.status, 'archived');

    // Restaurar
    const { req: req2, res: res2 } = createReqRes({
      method: 'POST',
      params: { id: createdDeviceId2 }
    });
    const routeRestore = devicesRouter.stack.find(r => r.route && r.route.path === '/:id/restore' && r.route.methods.post);
    await routeRestore.route.stack[routeRestore.route.stack.length - 1].handle(req2, res2, () => {});
    assert.equal(res2.statusCode, 200);
    assert.equal(res2.data.status, 'in_stock');
  });

  let savedSaleId = null;

  await t.test('10. Venda de aparelho via DeviceSale vinculando o ID físico', async () => {
    const salePayload = {
      customer_name: 'Carlos Cliente Teste',
      phone: '11999998888',
      seller_name: 'Vendedor 1',
      payment_method: 'pix',
      items: [
        {
          item: '1',
          product: 'iPhone 17 Pro 256GB - IMEI: 356872109876543',
          quantity: 1,
          unit_price: 4500,
          subtotal: 4500,
          device_id: createdDeviceId1
        }
      ],
      total_amount: 4500
    };

    const saved = await deviceSalesRouter.persistDeviceSale({
      user: { id: 1, name: 'Admin', role: 'admin', store_id: 1 },
      payload: salePayload
    });

    assert.ok(saved.id);
    savedSaleId = saved.id;

    // Verificar se o aparelho agora tem status = 'sold'
    const soldDevice = await db.queryOne('SELECT * FROM devices WHERE id = $1', [createdDeviceId1]);
    assert.equal(soldDevice.status, 'sold');
    assert.equal(soldDevice.sale_id, saved.id);
    assert.equal(soldDevice.sale_customer_name, 'Carlos Cliente Teste');
    assert.equal(Number(soldDevice.sale_price_sold), 4500);

    // Verificar se registrou no histórico
    const hist = await db.query('SELECT * FROM device_history WHERE device_id = $1 AND action_type = $2', [createdDeviceId1, 'sold']);
    assert.equal(hist.length, 1);
  });

  await t.test('11. Prevenção de venda dupla de aparelho que já foi vendido', async () => {
    await assert.rejects(async () => {
      await deviceSalesRouter.persistDeviceSale({
        user: { id: 1, name: 'Admin', role: 'admin', store_id: 1 },
        payload: {
          customer_name: 'Outro Cliente',
          items: [
            {
              item: '1',
              product: 'Tentativa Venda Dupla',
              quantity: 1,
              unit_price: 4500,
              subtotal: 4500,
              device_id: createdDeviceId1 // já está vendido
            }
          ],
          total_amount: 4500
        }
      });
    }, /já foi vendido/);
  });

  await t.test('12. Exclusão da venda reverte status do aparelho para in_stock', async () => {
    // Simula a exclusão via DELETE /:id
    const { req, res } = createReqRes({
      method: 'DELETE',
      params: { id: savedSaleId },
      user: { id: 1, name: 'Admin', role: 'admin', store_id: 1 }
    });

    const route = deviceSalesRouter.stack.find(r => r.route && r.route.path === '/:id' && r.route.methods.delete);
    const handler = route.route.stack[route.route.stack.length - 1].handle;

    await handler(req, res, () => {});

    assert.equal(res.statusCode, 200);

    // Conferir se o aparelho retornou a 'in_stock' e campos de venda foram limpos
    const revertedDevice = await db.queryOne('SELECT * FROM devices WHERE id = $1', [createdDeviceId1]);
    assert.equal(revertedDevice.status, 'in_stock');
    assert.equal(revertedDevice.sale_id, null);
    assert.equal(revertedDevice.sale_order_number, null);

    // Conferir registro de estorno no histórico
    const hist = await db.query('SELECT * FROM device_history WHERE device_id = $1 AND action_type = $2', [createdDeviceId1, 'sale_cancelled']);
    assert.equal(hist.length, 1);
  });

  await t.test('13. Isolamento multi-tenant: Loja 2 não enxerga nem altera aparelhos da Loja 1', async () => {
    const { req, res } = createReqRes({
      method: 'GET',
      user: { id: 2, name: 'User Loja 2', role: 'admin', store_id: 2 }
    });

    const route = devicesRouter.stack.find(r => r.route && r.route.path === '/' && r.route.methods.get);
    const handler = route.route.stack[route.route.stack.length - 1].handle;

    await handler(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.items.length, 0);
    assert.equal(res.data.counts.all, 0);
  });

  await t.test('14. Ocultação de custos e margens de lucro para funcionários sem permissão financeira', async () => {
    const { req, res } = createReqRes({
      method: 'GET',
      user: { id: 3, name: 'Funcionario', role: 'employee', store_id: 1, permissions: { devices: true } }
    });

    const route = devicesRouter.stack.find(r => r.route && r.route.path === '/' && r.route.methods.get);
    const handler = route.route.stack[route.route.stack.length - 1].handle;

    await handler(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.isFinancialAllowed, false);
    assert.equal(res.data.metrics.stock_cost_total, null);
    assert.equal(res.data.metrics.potential_profit_total, null);
    assert.equal(res.data.items[0].cost_price, 0);
    assert.equal(res.data.items[0].potential_profit, 0);
  });
});
