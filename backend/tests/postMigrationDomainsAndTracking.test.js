const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');
const { getAppBaseUrl, getOfficialLogoUrl } = require('../services/emailService');
const { generateTracking, hashToken, getPublicOrder } = require('../services/publicTracking');
const { attachPublicTracking, createPublicApp } = require('../publicTrackingServer');
const { renderPasswordResetEmail } = require('../templates/passwordResetEmail');

test('Pós-Migração — Problema 1: Recuperação de Senha deve apontar exclusivamente para itechcloud.app', () => {
  const originalBase = process.env.APP_BASE_URL;
  const originalLogo = process.env.APP_LOGO_URL;

  try {
    // 1. Sem variável definida: deve usar o fallback definitivo itechcloud.app
    delete process.env.APP_BASE_URL;
    assert.equal(getAppBaseUrl(), 'https://itechcloud.app');
    assert.equal(getOfficialLogoUrl(), 'https://itechcloud.app/assets/itech-logo-DFKQ73Sa.png');

    // 2. Se a variável ainda contiver o domínio legado antigo descontinuado do ShardCloud:
    process.env.APP_BASE_URL = 'https://erp.itechcelulareinformatica.com.br';
    process.env.APP_LOGO_URL = 'https://erp.itechcelulareinformatica.com.br/assets/itech-logo-DFKQ73Sa.png';
    assert.equal(getAppBaseUrl(), 'https://itechcloud.app', 'Deve sanitizar o domínio legado para itechcloud.app');
    assert.equal(getOfficialLogoUrl(), 'https://itechcloud.app/assets/itech-logo-DFKQ73Sa.png');

    // 3. Com a variável corretamente apontada para itechcloud.app:
    process.env.APP_BASE_URL = 'https://itechcloud.app';
    delete process.env.APP_LOGO_URL;
    assert.equal(getAppBaseUrl(), 'https://itechcloud.app');
    assert.equal(getOfficialLogoUrl(), 'https://itechcloud.app/assets/itech-logo-DFKQ73Sa.png');

    // 4. Template de e-mail deve renderizar o link oficial com token e e-mail
    const testToken = 'abc123def45678901234567890123456';
    const testEmail = 'cliente@exemplo.com.br';
    const resetUrl = `${getAppBaseUrl()}/redefinir-senha?token=${testToken}&email=${encodeURIComponent(testEmail)}`;
    const { html, text } = renderPasswordResetEmail({
      userName: 'Emerson',
      resetUrl,
      logoUrl: getOfficialLogoUrl(),
      systemName: 'iTech ERP'
    });

    assert.ok(html.includes('https://itechcloud.app/redefinir-senha?token=abc123def45678901234567890123456&amp;email=cliente%40exemplo.com.br') ||
              html.includes('https://itechcloud.app/redefinir-senha?token=abc123def45678901234567890123456&email=cliente%40exemplo.com.br'));
    assert.ok(text.includes('https://itechcloud.app/redefinir-senha?token=abc123def45678901234567890123456&email=cliente%40exemplo.com.br'));
    assert.ok(!html.includes('erp.itechcelulareinformatica.com.br'));
    assert.ok(!text.includes('erp.itechcelulareinformatica.com.br'));
  } finally {
    if (originalBase !== undefined) process.env.APP_BASE_URL = originalBase;
    else delete process.env.APP_BASE_URL;
    if (originalLogo !== undefined) process.env.APP_LOGO_URL = originalLogo;
    else delete process.env.APP_LOGO_URL;
  }
});

test('Pós-Migração — Problema 2: Acompanhamento Público no servidor Express (itechcloud.app/acompanhamento/:token)', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itech-test-tracking-'));
  const filename = path.join(dir, 'test.db');
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE customers(id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, address TEXT);
    CREATE TABLE system_settings(store_id INTEGER PRIMARY KEY, value TEXT);
    CREATE TABLE service_orders(
      id INTEGER PRIMARY KEY, store_id INTEGER, customer_id INTEGER, order_number TEXT,
      brand TEXT, model TEXT, status TEXT, entry_date TEXT, updated_at TEXT, created_at TEXT,
      expected_delivery_date TEXT, notes TEXT, profit REAL, public_token_hash TEXT
    );
    INSERT INTO customers VALUES(1, 'Carlos', 'Santos', 'Rua das Flores, 100');
    INSERT INTO system_settings VALUES(1, '{"store":{"name":"iTech Oficial","cnpj":"58.710.025/0001-69"}}');
    INSERT INTO service_orders VALUES(
      1, 1, 1, 'OS-1042', 'Apple', 'iPhone 13', 'repairing',
      '2026-11-17', '2026-11-17 12:00:00', '2026-11-17 10:00:00', NULL, 'Nota confidencial', 400, NULL
    );
  `);
  require('../db/trackingSchema')(db);

  // 1. Gera link de acompanhamento com sanitização de URL
  const originalTrackingUrl = process.env.PUBLIC_TRACKING_URL;
  try {
    process.env.PUBLIC_TRACKING_URL = 'https://erp.itechcelulareinformatica.com.br';
    const genLegacy = await generateTracking(db, 1);
    assert.ok(genLegacy.url.startsWith('https://itechcloud.app/acompanhamento/'), 'Deve auto-corrigir domínio legado na geração do link');

    process.env.PUBLIC_TRACKING_URL = 'https://itechcloud.app';
    const genOfficial = await generateTracking(db, 1);
    assert.ok(genOfficial.url.startsWith('https://itechcloud.app/acompanhamento/'));
    const token = genOfficial.url.split('/')[4];
    assert.match(token, /^[a-f0-9]{64}$/);

    // 2. Monta servidor Express com attachPublicTracking (exatamente como em backend/server.js)
    const app = express();

    // Redirecionamento 301 do domínio legado
    app.use((req, res, next) => {
      const host = (req.headers.host || '').toLowerCase().split(':')[0];
      if (host === 'erp.itechcelulareinformatica.com.br') {
        return res.redirect(301, `https://itechcloud.app${req.originalUrl}`);
      }
      next();
    });

    const cleanup = attachPublicTracking(app, db, { pollMs: 20 });

    const server = app.listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;

    t.after(() => {
      cleanup();
      server.close();
      server.closeAllConnections();
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    // 3. Consulta com token VÁLIDO: deve responder 200 com HTML do acompanhamento e dados embutidos
    const validRes = await fetch(`${base}/acompanhamento/${token}`);
    assert.equal(validRes.status, 200);
    assert.equal(validRes.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(validRes.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(validRes.headers.get('x-frame-options'), 'DENY');
    const validHtml = await validRes.text();
    assert.ok(validHtml.includes('Acompanhe seu reparo'));
    assert.ok(validHtml.includes('iTech Oficial'), 'Deve exibir nome da loja no rodapé');
    assert.ok(validHtml.includes('58.710.025/0001-69'), 'Deve exibir CNPJ da loja no rodapé');
    assert.ok(validHtml.includes('<script id="initial-order-data" type="application/json">'), 'Deve embutir dados iniciais para carga instantânea');
    assert.ok(validHtml.includes('OS-1042'), 'Dados embutidos devem conter o número da OS');
    assert.ok(!validHtml.includes('Nota confidencial'), 'NÃO pode vazar notas internas da OS');

    // 3.1. Endpoint REST público para carga inicial sem autenticação
    const restRes = await fetch(`${base}/api/public/service-order/${token}`);
    assert.equal(restRes.status, 200);
    assert.equal(restRes.headers.get('content-type'), 'application/json; charset=utf-8');
    const restData = await restRes.json();
    assert.equal(restData.order_number, 'OS-1042');
    assert.equal(restData.brand, 'Apple');
    assert.equal(restData.model, 'iPhone 13');
    assert.equal(restData.status, 'repairing');
    assert.equal(restData.company_name, 'iTech Oficial');
    assert.equal(restData.company_cnpj, '58.710.025/0001-69');
    assert.equal(restData.profit, undefined, 'NÃO deve expor profit');
    assert.equal(restData.notes, undefined, 'NÃO deve expor notas confidenciais');
    assert.ok(Array.isArray(restData.history) && restData.history.length > 0);

    // 4. Consulta com token INVÁLIDO (inexistente): deve retornar 404 tanto na página quanto na API REST
    const invalidToken = '0'.repeat(64);
    const invalidRes = await fetch(`${base}/acompanhamento/${invalidToken}`);
    assert.equal(invalidRes.status, 404);
    const invalidRestRes = await fetch(`${base}/api/public/service-order/${invalidToken}`);
    assert.equal(invalidRestRes.status, 404);

    // 5. Consulta com token MALFORMADO (não hex 64 chars): deve retornar 404
    const malformedRes = await fetch(`${base}/acompanhamento/token-invalido-123`);
    assert.equal(malformedRes.status, 404);
    const malformedRestRes = await fetch(`${base}/api/public/service-order/token-invalido-123`);
    assert.equal(malformedRestRes.status, 404);

    // 5.1. Conexão SSE recebe evento inicial order imediatamente (com padding descarregado)
    const controller = new AbortController();
    const sseRes = await fetch(`${base}/api/public/service-order/${token}/events`, { signal: controller.signal });
    assert.equal(sseRes.status, 200);
    assert.match(sseRes.headers.get('content-type'), /text\/event-stream/);
    const streamReader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    const readTimeout = setTimeout(() => controller.abort(), 3000);
    try {
      while (!sseBuffer.includes('event: order')) {
        const { value, done } = await streamReader.read();
        if (done) break;
        sseBuffer += decoder.decode(value);
      }
    } finally {
      clearTimeout(readTimeout);
      controller.abort();
    }
    assert.ok(sseBuffer.includes('event: order'));
    assert.ok(sseBuffer.includes('OS-1042'));

    // 6. PWA manifest: deve retornar 200 com tipo application/manifest+json
    const manifestRes = await fetch(`${base}/acompanhamento/${token}/manifest.webmanifest`);
    assert.equal(manifestRes.status, 200);
    assert.equal(manifestRes.headers.get('content-type'), 'application/manifest+json; charset=utf-8');

    // 7. Redirecionamento 301 de requisição originada no domínio antigo
    const redirectRes = await new Promise((resolve, reject) => {
      const req = require('node:http').request(`${base}/acompanhamento/${token}`, {
        method: 'GET',
        headers: { host: 'erp.itechcelulareinformatica.com.br' }
      }, (res) => {
        resolve({
          status: res.statusCode,
          location: res.headers.location
        });
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(redirectRes.status, 301);
    assert.equal(redirectRes.location, `https://itechcloud.app/acompanhamento/${token}`);
  } finally {
    if (originalTrackingUrl !== undefined) process.env.PUBLIC_TRACKING_URL = originalTrackingUrl;
    else delete process.env.PUBLIC_TRACKING_URL;
  }
});
