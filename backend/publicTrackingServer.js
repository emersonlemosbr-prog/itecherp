require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');
const { getPublicOrder } = require('./services/publicTracking');
const push = require('./services/trackingPush');

const { getListenConfig } = require('./config/publicTracking');

function createPublicApp(db, { limit = 60, windowMs = 60000, pollMs = 1000, trustProxy = process.env.PUBLIC_TRUST_PROXY } = {}) {
  const app = express();
  push.migrate(db);
  app.disable('x-powered-by');
  // Liveness must not share a rate-limit bucket with visitors or monitors.
  app.get('/health', (_req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.set('Cache-Control', 'no-store').json({ status: 'ok', service: 'itech-public-tracking' });
    } catch (error) {
      console.error('[PUBLIC_TRACKING] Health database failure:', error.code || error.message);
      res.status(503).json({ status: 'error', service: 'itech-public-tracking' });
    }
  });
  // Do not trust arbitrary X-Forwarded-For headers. Loopback proxy only, when explicitly configured.
  if (trustProxy === 'loopback') app.set('trust proxy', 'loopback');
  const requests = new Map();
  const streams = new Set();
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; script-src 'self'; worker-src 'self'; manifest-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" });
    const now = Date.now();
    for (const [key, value] of requests) if (value.reset <= now) requests.delete(key);
    let bucket = requests.get(req.ip);
    if (!bucket) {
      if (requests.size >= 10000) return res.status(503).end();
      bucket = { count: 0, reset: now + windowMs };
      requests.set(req.ip, bucket);
    }
    if (++bucket.count > limit) {
      res.set('Retry-After', String(Math.ceil((bucket.reset - now) / 1000)));
      return res.status(429).json({ error: 'Muitas solicitações. Tente novamente em instantes.' });
    }
    next();
  });
  const find = (req, res, next) => {
    const order = getPublicOrder(db, req.params.token);
    if (!order) return res.status(404).json({ error: 'Acompanhamento não encontrado.' });
    res.locals.order = order;
    next();
  };
  app.get('/', (_req, res) => res.json({ status: 'online' }));
  push.mount(app, db, find);
  app.get('/sw.js', (_req, res) => res.sendFile(path.join(__dirname, 'tracking/sw.js')));
  app.get('/acompanhamento/:token/manifest.webmanifest', find, (req, res) => res.type('application/manifest+json').json({
    id: `/acompanhamento/${req.params.token}`, name: 'iTech — Acompanhamento da OS', short_name: 'Minha OS',
    start_url: `/acompanhamento/${req.params.token}`, scope: '/acompanhamento/', display: 'standalone',
    background_color: '#ffffff', theme_color: '#155e75',
    icons: [{ src: '/assets/logo.png', sizes: 'any', type: 'image/png' }],
  }));
  app.get('/assets/logo.png', (_req, res) => res.sendFile(path.join(__dirname, 'tracking/logo.png')));
  app.get('/acompanhamento/:token', find, (_req, res) => res.sendFile(path.join(__dirname, 'tracking/index.html')));
  for (const asset of ['tracking.js', 'tracking.css', 'push.js']) {
    app.get(`/assets/${asset}`, (_req, res) => res.sendFile(path.join(__dirname, 'tracking', asset)));
  }
  app.get('/api/public/service-order/:token/events', find, (req, res) => {
    if (streams.size >= 500 || [...streams].filter(s => s.ip === req.ip).length >= 5) {
      res.set('Retry-After', '60');
      return res.status(429).json({ error: 'Limite de conexões atingido.' });
    }
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const stream = { ip: req.ip, req, res, token: req.params.token, previous: JSON.stringify(res.locals.order), closed: false };
    const closeStream = (reason, error) => {
      if (stream.closed) return;
      stream.closed = true;
      streams.delete(stream);
      if (error) console.warn(`[PUBLIC_TRACKING] SSE ${reason}:`, error.code || error.message || error);
    };
    streams.add(stream);
    // ECONNRESET/EPIPE de clientes que fecham a aba são eventos assíncronos.
    // Sem listeners, um EventEmitter pode encerrar todo o processo Node.
    req.on('aborted', () => closeStream('request aborted'));
    req.on('error', error => closeStream('request error', error));
    res.on('error', error => closeStream('response error', error));
    res.on('close', () => closeStream('closed'));
    try { res.write(`retry: 5000\nevent: order\ndata: ${stream.previous}\n\n`); }
    catch (error) { closeStream('initial write failed', error); }
  });
  // SQLite WAL is the cross-process bridge: committed changes are broadcast within one second.
  const timer = setInterval(() => {
    for (const stream of streams) {
      try {
        if (stream.closed || stream.res.destroyed || stream.res.writableEnded) {
          stream.closed = true;
          streams.delete(stream);
          continue;
        }
        // Bound memory for stalled clients. A disconnected client can reconnect
        // and receive a complete snapshot, without accumulating writes forever.
        if (stream.res.writableLength > 256 * 1024) {
          stream.res.destroy();
          streams.delete(stream);
          continue;
        }
        if (stream.res.writableNeedDrain) continue;
        const order = getPublicOrder(db, stream.token);
        if (!order) {
          stream.res.write('event: unavailable\ndata: {}\n\n');
          stream.res.end();
          streams.delete(stream);
          continue;
        }
        const current = JSON.stringify(order);
        const message = current !== stream.previous ? `event: order\ndata: ${current}\n\n` : ': heartbeat\n\n';
        stream.previous = current;
        // false significa backpressure; os dados já entraram no buffer.
        // Encerrar aqui fazia clientes lentos reconectarem desnecessariamente.
        stream.res.write(message);
      } catch (error) {
        console.warn('[PUBLIC_TRACKING] SSE poll/write failed:', error.code || error.message || error);
        stream.closed = true;
        streams.delete(stream);
        if (!stream.res.destroyed) stream.res.destroy();
      }
    }
  }, pollMs);
  timer.unref();
  const pushWorker = push.startWorker(db);
  app.locals.close = () => { pushWorker.stop(); clearInterval(timer); for (const s of streams) s.res.end(); streams.clear(); };
  app.use((_req, res) => res.status(404).json({ error: 'Não encontrado.' }));
  app.use((err, req, res, _next) => {
    console.error('[PUBLIC_TRACKING] Request failed:', req.method, req.route?.path || 'unknown', err.stack || err);
    if (!res.headersSent) return res.status(500).json({ error: 'Não foi possível carregar o acompanhamento.' });
    res.destroy(err);
  });
  return app;
}

if (require.main === module) {
  const logFatal = (kind, error) => console.error(`[PUBLIC_TRACKING] ${kind}:`, error?.stack || error);
  process.on('uncaughtException', error => { logFatal('uncaughtException', error); process.exit(1); });
  process.on('unhandledRejection', error => { logFatal('unhandledRejection', error); process.exit(1); });
  const { port, host } = getListenConfig();
  // Escrita necessária somente para inscrições e cursores de entrega push.
  let db;
  try {
    db = new Database(process.env.ITECH_DB_PATH || path.join(__dirname, 'db/itech.db'), { fileMustExist: true });
  } catch (err) {
    const fallbackDb = path.join(__dirname, 'db/itech.db');
    console.warn(`[PUBLIC_TRACKING] Falha ao abrir banco principal: ${err.message}. Usando fallback: ${fallbackDb}`);
    db = new Database(fallbackDb, { fileMustExist: true });
  }
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.prepare('SELECT public_token_hash FROM service_orders LIMIT 1').get();
  const app = createPublicApp(db);
  const server = app.listen(port, host, () => console.log(`Acompanhamento público HTTP: ${host}:${port} | Health: http://127.0.0.1:${port}/health`));
  server.on('error', error => {
    console.error(`[PUBLIC_TRACKING] Falha ao iniciar ${host}:${port}: ${error.code}. Verifique a porta e mantenha o administrativo separado.`);
    app.locals.close();
    db.close();
    process.exit(1);
  });
  server.on('clientError', (error, socket) => {
    console.warn('[PUBLIC_TRACKING] HTTP client error:', error.code || error.message);
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    else socket.destroy();
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    console.log(`[PUBLIC_TRACKING] Encerramento solicitado: ${signal}`);
    app.locals.close();
    server.close(() => { db.close(); process.exit(0); });
  });
}
module.exports = { createPublicApp, getListenConfig };
