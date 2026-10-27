const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('node:http');
const Database = require('better-sqlite3');
const { createPublicApp, getListenConfig } = require('../publicTrackingServer');
const { generateTracking, hashToken, getPublicOrder } = require('../services/publicTracking');

test('isolated public server, hashed tokens, durable history, SSE updates and revocation', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itech-tracking-'));
  const filename = path.join(dir, 'test.db');
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE customers(id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, address TEXT);
    CREATE TABLE service_orders(id INTEGER PRIMARY KEY, customer_id INTEGER, order_number TEXT, brand TEXT, model TEXT,
    status TEXT, entry_date TEXT, updated_at TEXT, created_at TEXT, expected_delivery_date TEXT, notes TEXT, profit REAL);
    INSERT INTO customers VALUES(1, 'Maria Clara', 'Segredo', 'Endereço secreto');
    INSERT INTO service_orders VALUES(1, 1, 'OS-001', 'Samsung', 'A13', 'received', '2026-09-01', '2026-09-01 12:00:00', '2026-09-01 12:00:00', NULL, 'Nota secreta', 900);`);
  require('../db/trackingSchema')(db);
  require('../db/trackingSchema')(db);
  const reader = new Database(filename); // O servidor público persiste inscrições push.
  const app = createPublicApp(reader, { pollMs: 20, limit: 1000 });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { app.locals.close(); server.close(); server.closeAllConnections(); reader.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const generated = generateTracking(db, 1);
  const token = new URL(generated.url).pathname.split('/')[2];
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(db.prepare('SELECT public_token_hash FROM service_orders').get().public_token_hash, hashToken(token));
  assert.equal(getPublicOrder(reader, token).history.length, 1);
  assert.equal(getPublicOrder(reader, token).first_name, 'Maria');
  assert.equal(getPublicOrder(reader, token).customer_name, 'Maria Clara Segredo');
  assert.deepEqual(Object.keys(getPublicOrder(reader, token)).sort(), ['order_number','first_name','customer_name','brand','model','status','entry_date','updated_at','expected_delivery_date','history'].sort());
  for (const route of ['/api/dashboard', '/api/customers', '/api/finance', '/api/fiados', '/api/inventory', '/api/admin', '/api/service-orders', '/api/service-orders/1', '/api/track/OS-001', '/clientes', '/assets/../server.js', '/acompanhamento/1', `/acompanhamento/${'a'.repeat(64)}`]) {
    assert.equal((await fetch(base + route)).status, 404, route);
  }
  const page = await fetch(`${base}/acompanhamento/${token}`);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(!(await page.text()).includes('Nota secreta'));
  const controller = new AbortController();
  t.after(() => controller.abort());
  const response = await fetch(`${base}/api/public/service-order/${token}/events`, { signal: controller.signal });
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  assert.match(response.headers.get('cache-control'), /no-cache/);
  assert.match(response.headers.get('cache-control'), /no-transform/);
  assert.equal(response.headers.get('x-accel-buffering'), 'no');
  const stream = response.body.getReader();
  const decoder = new TextDecoder();
  async function until(needle) {
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      let text = '';
      while (!text.includes(needle)) {
        const chunk = await stream.read();
        assert.equal(chunk.done, false);
        text += decoder.decode(chunk.value);
      }
      return text;
    } finally { clearTimeout(timeout); }
  }
  assert.ok((await until('event: order')).includes('received'));
  await until(': heartbeat');
  // Fechar muitas conexões SSE abruptamente não pode emitir um error sem
  // listener nem derrubar o servidor público inteiro.
  await Promise.all(Array.from({ length: 50 }, () => new Promise(resolve => {
    const request = http.get(`${base}/api/public/service-order/${token}/events`, incoming => {
      incoming.once('data', () => { incoming.destroy(); resolve(); });
    });
    request.on('error', resolve);
  })));
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal((await fetch(`${base}/health`)).status, 200);
  db.prepare("UPDATE service_orders SET status = 'repairing', updated_at = '2026-09-08 12:00:00' WHERE id = 1").run();
  assert.ok((await until('repairing')).includes('2026-09-08 12:00:00'));
  db.prepare("UPDATE service_orders SET status = 'repairing', notes = 'Outra nota' WHERE id = 1").run();
  assert.equal(getPublicOrder(reader, token).history.length, 2);
  const second = generateTracking(db, 1);
  assert.notEqual(second.url, generated.url);
  await until('event: unavailable');
  assert.equal((await fetch(`${base}/acompanhamento/${token}`)).status, 404);
  const nextToken = new URL(second.url).pathname.split('/')[2];
  db.prepare('DELETE FROM service_orders WHERE id = 1').run();
  assert.equal(getPublicOrder(reader, nextToken), null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM service_order_status_history').get().n, 0);
});

test('HTTP health, root and public assets work on the configured IPv4 bind', async t => {
  assert.deepEqual(getListenConfig({}), { port: 3002, host: '0.0.0.0' });
  assert.equal(getListenConfig({ PUBLIC_PORT: '3102' }).port, 3102);
  for (const port of ['0', '3001', '65536', 'abc', '1.5']) assert.throws(() => getListenConfig({ PUBLIC_PORT: port }));
  assert.throws(() => getListenConfig({ PUBLIC_PORT: '3101', PORT: '3101' }));
  const app = createPublicApp(testDatabase(t));
  const server = app.listen(0, '0.0.0.0');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { app.locals.close(); server.close(); server.closeAllConnections(); });
  for (const host of ['127.0.0.1', 'localhost']) {
    const base = `http://${host}:${server.address().port}`;
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok', service: 'itech-public-tracking' });
    assert.deepEqual(await (await fetch(base + '/')).json(), { status: 'online' });
    for (const asset of ['tracking.js', 'tracking.css']) assert.equal((await fetch(`${base}/assets/${asset}`)).status, 200);
    assert.equal(health.headers.get('access-control-allow-origin'), null);
  }
});

test('public rate limiting ignores spoofed forwarded headers', async t => {
  const app = createPublicApp(testDatabase(t), { limit: 2, trustProxy: false });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { app.locals.close(); server.close(); server.closeAllConnections(); });
  const url = `http://127.0.0.1:${server.address().port}/unknown`;
  assert.equal((await fetch(url)).status, 404);
  assert.equal((await fetch(url)).status, 404);
  const limited = await fetch(url, { headers: { 'X-Forwarded-For': '8.8.8.8' } });
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('retry-after'));
  for (let i = 0; i < 5; i++) {
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/health`)).status, 200);
  }
});

test('loopback tunnel proxy separates visitors and ignores prepended spoofed IPs', async t => {
  const app = createPublicApp(testDatabase(t), { limit: 1, trustProxy: 'loopback' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { app.locals.close(); server.close(); server.closeAllConnections(); });
  const url = `http://127.0.0.1:${server.address().port}/`;
  assert.equal((await fetch(url, { headers: { 'X-Forwarded-For': '203.0.113.1' } })).status, 200);
  assert.equal((await fetch(url, { headers: { 'X-Forwarded-For': '203.0.113.2' } })).status, 200);
  assert.equal((await fetch(url, { headers: { 'X-Forwarded-For': '198.51.100.1, 203.0.113.1' } })).status, 429);
});

function testDatabase(t) { const db = new Database(':memory:'); t.after(() => db.close()); return db; }
