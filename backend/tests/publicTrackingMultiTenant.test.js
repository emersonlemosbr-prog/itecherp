const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db/database');
const { createStoreWithInitialData } = require('../services/multiTenantService');
const { generateTracking, getPublicOrder } = require('../services/publicTracking');
const { createPublicApp } = require('../publicTrackingServer');
const { nextOrderNumber } = require('../utils/orderNumber');

test('Acompanhamento público: dados da empresa no rodapé com isolamento multi-tenant', async (t) => {
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // 1. Criar Empresa A e Empresa B isoladas
  const storeA = await createStoreWithInitialData({
    storeName: 'Oficina do João',
    ownerName: 'João Teste',
    ownerEmail: `joao_${suffix}@teste.com`,
    phone: '11999991111',
    ownerPassword: 'SenhaForteA123',
    nickname: `joao_${suffix}`,
    erpPassword: 'SenhaErpA123',
  });

  const storeB = await createStoreWithInitialData({
    storeName: 'Assistência Técnica Silva',
    ownerName: 'Silva Teste',
    ownerEmail: `silva_${suffix}@teste.com`,
    phone: '11999992222',
    ownerPassword: 'SenhaForteB123',
    nickname: `silva_${suffix}`,
    erpPassword: 'SenhaErpB123',
  });

  const storeC = await createStoreWithInitialData({
    storeName: 'Sem CNPJ Express',
    ownerName: 'Carlos Teste',
    ownerEmail: `carlos_${suffix}@teste.com`,
    phone: '11999993333',
    ownerPassword: 'SenhaForteC123',
    nickname: `carlos_${suffix}`,
    erpPassword: 'SenhaErpC123',
  });

  const createdStoreIds = [storeA.storeId, storeB.storeId, storeC.storeId];

  // Criar clientes e OS em cada loja
  const custA = await db.queryOne(
    `INSERT INTO customers (store_id, first_name, last_name, phone) VALUES ($1, 'Ana', 'Paula', '11911110001') RETURNING id`,
    [storeA.storeId]
  );
  const custB = await db.queryOne(
    `INSERT INTO customers (store_id, first_name, last_name, phone) VALUES ($1, 'Bruno', 'Costa', '11911110002') RETURNING id`,
    [storeB.storeId]
  );
  const custC = await db.queryOne(
    `INSERT INTO customers (store_id, first_name, last_name, phone) VALUES ($1, 'Clara', 'Dias', '11911110003') RETURNING id`,
    [storeC.storeId]
  );

  const numA = await nextOrderNumber(storeA.storeId);
  const numB = await nextOrderNumber(storeB.storeId);
  const numC = await nextOrderNumber(storeC.storeId);

  const osA = await db.queryOne(
    `INSERT INTO service_orders (store_id, order_number, customer_id, brand, model, status, entry_date, notes, profit)
     VALUES ($1, $2, $3, 'Apple', 'iPhone 13', 'received', CURRENT_TIMESTAMP, 'Nota secreta A', 500)
     RETURNING id`,
    [storeA.storeId, numA, custA.id]
  );
  const osB = await db.queryOne(
    `INSERT INTO service_orders (store_id, order_number, customer_id, brand, model, status, entry_date, notes, profit)
     VALUES ($1, $2, $3, 'Samsung', 'Galaxy S23', 'diagnosis', CURRENT_TIMESTAMP, 'Nota secreta B', 750)
     RETURNING id`,
    [storeB.storeId, numB, custB.id]
  );
  const osC = await db.queryOne(
    `INSERT INTO service_orders (store_id, order_number, customer_id, brand, model, status, entry_date)
     VALUES ($1, $2, $3, 'Motorola', 'Edge 40', 'received', CURRENT_TIMESTAMP)
     RETURNING id`,
    [storeC.storeId, numC, custC.id]
  );

  // Configurar nome e CNPJ em system_settings (Configurações -> Dados da Loja)
  async function updateStoreSettings(storeId, storePatch) {
    const current = await db.queryOne('SELECT value FROM system_settings WHERE store_id = $1', [storeId]);
    const parsed = current?.value ? JSON.parse(current.value) : {};
    const next = {
      ...parsed,
      store: {
        ...(parsed.store || {}),
        ...storePatch,
      },
    };
    await db.execute(
      'UPDATE system_settings SET value = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE store_id = $2',
      [JSON.stringify(next), storeId]
    );
  }

  await updateStoreSettings(storeA.storeId, {
    name: 'Oficina do João',
    cnpj: '12.345.678/0001-90',
    logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  });
  await updateStoreSettings(storeB.storeId, {
    name: 'Assistência Técnica Silva',
    cnpj: '98.765.432/0001-10',
    logo: 'https://cdn.exemplo.com/logos/silva.png',
  });
  await updateStoreSettings(storeC.storeId, {
    name: 'Sem CNPJ Express',
    cnpj: '',
    logo: '',
  });

  // Gerar tokens públicos (sem alterar geração existente)
  const trackA = await generateTracking(db, osA.id);
  const trackB = await generateTracking(db, osB.id);
  const trackC = await generateTracking(db, osC.id);
  const tokenA = new URL(trackA.url).pathname.split('/')[2];
  const tokenB = new URL(trackB.url).pathname.split('/')[2];
  const tokenC = new URL(trackC.url).pathname.split('/')[2];

  const app = createPublicApp(db, { pollMs: 30, limit: 1000 });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    app.locals.close();
    server.close();
    server.closeAllConnections();
    await db.execute('DELETE FROM service_orders WHERE store_id = ANY($1::int[])', [createdStoreIds]);
    await db.execute('DELETE FROM customers WHERE store_id = ANY($1::int[])', [createdStoreIds]);
    await db.execute('DELETE FROM stores WHERE id = ANY($1::int[])', [createdStoreIds]);
  });

  await t.test('1 e 2. Empresa A e Empresa B exibem apenas seus próprios dados e logos (HTML e API)', async () => {
    const orderA = await getPublicOrder(db, tokenA);
    assert.equal(orderA.company_name, 'Oficina do João');
    assert.equal(orderA.company_cnpj, '12.345.678/0001-90');
    assert.equal(orderA.company_logo, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    assert.equal(orderA.store_settings_raw, undefined);
    assert.equal(orderA.profit, undefined);
    assert.equal(orderA.notes, undefined);

    const htmlA = await (await fetch(`${base}/acompanhamento/${tokenA}`)).text();
    assert.ok(htmlA.includes('<footer id="company-name">Oficina do João</footer>'));
    assert.ok(htmlA.includes('<footer id="company-cnpj">CNPJ: 12.345.678/0001-90</footer>'));
    assert.ok(htmlA.includes('src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="'));
    assert.ok(htmlA.includes('alt="Oficina do João"'));
    assert.ok(!htmlA.includes('Assistência Técnica Silva'));
    assert.ok(!htmlA.includes('98.765.432/0001-10'));
    assert.ok(!htmlA.includes('https://cdn.exemplo.com/logos/silva.png'));
    assert.ok(!htmlA.includes('/assets/logo.png'));
    assert.ok(!htmlA.includes('alt="iTech Celular e Informática"'));
    assert.ok(!htmlA.includes('58.710.025/0001-69'));
    assert.ok(!htmlA.includes('Nota secreta A'));

    const orderB = await getPublicOrder(db, tokenB);
    assert.equal(orderB.company_name, 'Assistência Técnica Silva');
    assert.equal(orderB.company_cnpj, '98.765.432/0001-10');
    assert.equal(orderB.company_logo, 'https://cdn.exemplo.com/logos/silva.png');

    const htmlB = await (await fetch(`${base}/acompanhamento/${tokenB}`)).text();
    assert.ok(htmlB.includes('<footer id="company-name">Assistência Técnica Silva</footer>'));
    assert.ok(htmlB.includes('<footer id="company-cnpj">CNPJ: 98.765.432/0001-10</footer>'));
    assert.ok(htmlB.includes('src="https://cdn.exemplo.com/logos/silva.png"'));
    assert.ok(htmlB.includes('alt="Assistência Técnica Silva"'));
    assert.ok(!htmlA.includes('https://cdn.exemplo.com/logos/silva.png'));
    assert.ok(!htmlB.includes('Oficina do João'));
    assert.ok(!htmlB.includes('12.345.678/0001-90'));
    assert.ok(!htmlB.includes('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='));
    assert.ok(!htmlB.includes('/assets/logo.png'));
    assert.ok(!htmlB.includes('alt="iTech Celular e Informática"'));
    assert.ok(!htmlB.includes('58.710.025/0001-69'));
    assert.ok(!htmlB.includes('Nota secreta B'));
  });

  await t.test('3. Alterar logo, nome e CNPJ nas configurações atualiza acompanhamento HTML e SSE ao vivo sem afetar outra empresa', async () => {
    const controller = new AbortController();
    t.after(() => controller.abort());

    const sseResponse = await fetch(`${base}/api/public/service-order/${tokenA}/events`, {
      signal: controller.signal,
    });
    assert.equal(sseResponse.status, 200);
    const reader = sseResponse.body.getReader();
    const decoder = new TextDecoder();

    async function readUntil(needle) {
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        let buffer = '';
        while (!buffer.includes(needle)) {
          const chunk = await reader.read();
          assert.equal(chunk.done, false);
          buffer += decoder.decode(chunk.value);
        }
        return buffer;
      } finally {
        clearTimeout(timeout);
      }
    }

    const firstEvent = await readUntil('Oficina do João');
    assert.ok(firstEvent.includes('12.345.678/0001-90'));

    await updateStoreSettings(storeA.storeId, {
      name: 'Oficina do João & Filhos',
      cnpj: '11.222.333/0001-44',
      logo: 'https://cdn.exemplo.com/logos/nova-logo-joao.png',
    });

    const updatedEvent = await readUntil('Oficina do João & Filhos');
    assert.ok(updatedEvent.includes('11.222.333/0001-44'));
    assert.ok(updatedEvent.includes('https://cdn.exemplo.com/logos/nova-logo-joao.png'));

    const htmlAUpdated = await (await fetch(`${base}/acompanhamento/${tokenA}`)).text();
    assert.ok(htmlAUpdated.includes('<footer id="company-name">Oficina do João &amp; Filhos</footer>'));
    assert.ok(htmlAUpdated.includes('<footer id="company-cnpj">CNPJ: 11.222.333/0001-44</footer>'));
    assert.ok(htmlAUpdated.includes('src="https://cdn.exemplo.com/logos/nova-logo-joao.png"'));
    assert.ok(htmlAUpdated.includes('alt="Oficina do João &amp; Filhos"'));

    // Empresa B permanece intacta
    const htmlB = await (await fetch(`${base}/acompanhamento/${tokenB}`)).text();
    assert.ok(htmlB.includes('<footer id="company-name">Assistência Técnica Silva</footer>'));
    assert.ok(htmlB.includes('<footer id="company-cnpj">CNPJ: 98.765.432/0001-10</footer>'));
    assert.ok(htmlB.includes('src="https://cdn.exemplo.com/logos/silva.png"'));
  });

  await t.test('4. Empresa sem CNPJ e sem logo oculta CNPJ e logo sem exibir logo da iTech nem imagem quebrada', async () => {
    const orderC = await getPublicOrder(db, tokenC);
    assert.equal(orderC.company_name, 'Sem CNPJ Express');
    assert.equal(orderC.company_cnpj, null);
    assert.equal(orderC.company_logo, null);

    const htmlC = await (await fetch(`${base}/acompanhamento/${tokenC}`)).text();
    assert.ok(htmlC.includes('<footer id="company-name">Sem CNPJ Express</footer>'));
    assert.ok(htmlC.includes('<footer id="company-cnpj" hidden></footer>'));
    assert.ok(htmlC.includes('<img id="company-logo" class="logo" src="" alt="Logo da empresa" width="220" height="98" hidden>'));
    assert.ok(!htmlC.includes('src="/assets/logo.png"'));
    assert.ok(!htmlC.includes('alt="iTech Celular e Informática"'));
    assert.ok(!htmlC.includes('CNPJ:'));
    assert.ok(!htmlC.includes('null'));
    assert.ok(!htmlC.includes('undefined'));
  });

  await t.test('5. Empresa sem nome, sem CNPJ e sem logo não exibe dados residuais nem fallback da iTech', async () => {
    await updateStoreSettings(storeC.storeId, {
      name: '   ',
      cnpj: null,
      logo: '   ',
    });

    const orderC = await getPublicOrder(db, tokenC);
    assert.equal(orderC.company_name, null);
    assert.equal(orderC.company_cnpj, null);
    assert.equal(orderC.company_logo, null);

    const htmlC = await (await fetch(`${base}/acompanhamento/${tokenC}`)).text();
    assert.ok(htmlC.includes('<footer id="company-name" hidden></footer>'));
    assert.ok(htmlC.includes('<footer id="company-cnpj" hidden></footer>'));
    assert.ok(htmlC.includes('<img id="company-logo" class="logo" src="" alt="Logo da empresa" width="220" height="98" hidden>'));
    assert.ok(!htmlC.includes('/assets/logo.png'));
    assert.ok(!htmlC.includes('iTech Celular e Informática'));
    assert.ok(!htmlC.includes('58.710.025/0001-69'));
    assert.ok(!htmlC.includes('null'));
    assert.ok(!htmlC.includes('undefined'));

    // Verifica que tracking.js também trata atualização dinâmica de branding no navegador
    const trackingJs = fs.readFileSync(path.join(__dirname, '../tracking/tracking.js'), 'utf8');
    assert.ok(trackingJs.includes('updateCompanyBranding'));
    assert.ok(!trackingJs.includes('iTech Celular e Informática'));
    assert.ok(!trackingJs.includes('58.710.025'));
  });
});

