if (process.env.NODE_ENV !== 'test') {
  require('dotenv').config({ path: require('path').join(__dirname, '.env') });
}
const fs = require('fs');
const path = require('path');
const express = require('express');
let defaultDb = null;
function getDefaultDb() {
  if (!defaultDb) defaultDb = require('./db/database');
  return defaultDb;
}
const { getPublicOrder } = require('./services/publicTracking');
const push = require('./services/trackingPush');
const { getListenConfig } = require('./config/publicTracking');

const trackingHtmlTemplate = fs.readFileSync(path.join(__dirname, 'tracking/index.html'), 'utf8');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function formatCnpjLine(cnpj) {
  const clean = typeof cnpj === 'string' ? cnpj.trim() : '';
  if (!clean) return '';
  return /^cnpj\s*:/i.test(clean) ? clean : `CNPJ: ${clean}`;
}

function stripNulls(obj) {
  if (Array.isArray(obj)) {
    return obj.map(stripNulls);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [k, stripNulls(v)])
    );
  }
  return obj;
}

function renderTrackingHtml(order) {
  const companyName = typeof order?.company_name === 'string' ? order.company_name.trim() : '';
  const companyCnpj = formatCnpjLine(order?.company_cnpj);
  const companyLogo = typeof order?.company_logo === 'string' ? order.company_logo.trim() : '';

  const logoMarkup = companyLogo
    ? `<img id="company-logo" class="logo" src="${escapeHtml(companyLogo)}" alt="${escapeHtml(companyName || 'Logo da empresa')}" width="220" height="98">`
    : '<img id="company-logo" class="logo" src="" alt="Logo da empresa" width="220" height="98" hidden>';

  const nameFooter = companyName
    ? `<footer id="company-name">${escapeHtml(companyName)}</footer>`
    : '<footer id="company-name" hidden></footer>';
  const cnpjFooter = companyCnpj
    ? `<footer id="company-cnpj">${escapeHtml(companyCnpj)}</footer>`
    : '<footer id="company-cnpj" hidden></footer>';

  const cleanOrder = stripNulls(order);
  const safeJson = JSON.stringify(cleanOrder).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  const initialDataScript = `<script id="initial-order-data" type="application/json">${safeJson}</script>`;

  return trackingHtmlTemplate
    .replace('<img id="company-logo" class="logo" src="" alt="Logo da empresa" width="220" height="98" hidden>', logoMarkup)
    .replace('<footer id="company-name" hidden></footer>', nameFooter)
    .replace('<footer id="company-cnpj" hidden></footer>', cnpjFooter)
    .replace('</head>', `${initialDataScript}</head>`);
}

/**
 * Conecta as rotas públicas de acompanhamento (/acompanhamento/:token, SSE e push)
 * a qualquer instância Express (seja o servidor principal ou o servidor independente).
 */
function attachPublicTracking(app, db, { limit = 60, windowMs = 60000, pollMs = 1000, standalone = false } = {}) {
  const actualDb = db || getDefaultDb();
  push.migrate(actualDb);

  const requests = new Map();
  const streams = new Set();

  const trackingSecurityHeaders = (req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data: https: blob:; script-src 'self' 'unsafe-inline'; worker-src 'self'; manifest-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    });
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
  };

  if (standalone) {
    app.use(trackingSecurityHeaders);
  }

  const find = async (req, res, next) => {
    try {
      const order = await getPublicOrder(actualDb, req.params.token);
      if (!order) return res.status(404).json({ error: 'Acompanhamento não encontrado.' });
      res.locals.order = order;
      next();
    } catch (err) {
      next(err);
    }
  };

  // Rotas e assets estáticos do acompanhamento público
  app.get('/sw.js', (_req, res) => res.sendFile(path.join(__dirname, 'tracking/sw.js')));
  app.get('/assets/logo.png', (_req, res) => res.sendFile(path.join(__dirname, 'tracking/logo.png')));
  for (const asset of ['tracking.js', 'tracking.css', 'push.js']) {
    app.get(`/assets/${asset}`, (_req, res) => res.sendFile(path.join(__dirname, 'tracking', asset)));
  }

  app.get('/acompanhamento/:token/manifest.webmanifest', trackingSecurityHeaders, find, (req, res) => res.type('application/manifest+json').json({
    id: `/acompanhamento/${req.params.token}`,
    name: 'iTech — Acompanhamento da OS',
    short_name: 'Minha OS',
    start_url: `/acompanhamento/${req.params.token}`,
    scope: '/acompanhamento/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#155e75',
    icons: [{ src: '/assets/logo.png', sizes: 'any', type: 'image/png' }],
  }));

  app.get('/acompanhamento/:token', trackingSecurityHeaders, find, (_req, res) => {
    res.type('html').send(renderTrackingHtml(res.locals.order));
  });

  // Endpoint REST público para obter dados completos da OS (carga inicial e clientes de API)
  app.get('/api/public/service-order/:token', trackingSecurityHeaders, find, (_req, res) => {
    res.json(res.locals.order);
  });

  // Endpoints de SSE (Live Updates) e Push Notifications
  app.get('/api/public/service-order/:token/events', trackingSecurityHeaders, find, (req, res) => {
    if (streams.size >= 500 || [...streams].filter(s => s.ip === req.ip).length >= 5) {
      res.set('Retry-After', '60');
      return res.status(429).json({ error: 'Limite de conexões atingido.' });
    }
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();
    const stream = { ip: req.ip, req, res, token: req.params.token, previous: JSON.stringify(res.locals.order), closed: false };
    const closeStream = (reason, error) => {
      if (stream.closed) return;
      stream.closed = true;
      streams.delete(stream);
      if (error) console.warn(`[PUBLIC_TRACKING] SSE ${reason}:`, error.code || error.message || error);
    };
    streams.add(stream);

    req.on('aborted', () => closeStream('request aborted'));
    req.on('error', error => closeStream('request error', error));
    res.on('error', error => closeStream('response error', error));
    res.on('close', () => closeStream('closed'));
    try {
      // Padding inicial para forçar descarte imediato do buffer em proxies intermediários (Nginx, Cloudflare)
      res.write(`: ${' '.repeat(2048)}\n\n`);
      res.write(`retry: 5000\nevent: order\ndata: ${stream.previous}\n\n`);
    } catch (error) {
      closeStream('initial write failed', error);
    }
  });

  push.mount(app, actualDb, find);

  // Intervalo de transmissão periódica para streams SSE
  const timer = setInterval(async () => {
    for (const stream of streams) {
      try {
        if (stream.closed || stream.res.destroyed || stream.res.writableEnded) {
          stream.closed = true;
          streams.delete(stream);
          continue;
        }
        if (stream.res.writableLength > 256 * 1024) {
          stream.res.destroy();
          streams.delete(stream);
          continue;
        }
        if (stream.res.writableNeedDrain) continue;
        const order = await getPublicOrder(actualDb, stream.token);
        if (!order) {
          stream.res.write('event: unavailable\ndata: {}\n\n');
          stream.res.end();
          streams.delete(stream);
          continue;
        }
        const current = JSON.stringify(order);
        const message = current !== stream.previous ? `event: order\ndata: ${current}\n\n` : ': heartbeat\n\n';
        stream.previous = current;
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

  const pushWorker = push.startWorker(actualDb);

  return () => {
    pushWorker.stop();
    clearInterval(timer);
    for (const s of streams) s.res.end();
    streams.clear();
  };
}

function createPublicApp(db, { limit = 60, windowMs = 60000, pollMs = 1000, trustProxy = process.env.PUBLIC_TRUST_PROXY } = {}) {
  const actualDb = db || getDefaultDb();
  const app = express();
  app.disable('x-powered-by');

  // Liveness must not share a rate-limit bucket with visitors or monitors.
  app.get('/health', async (_req, res) => {
    try {
      if (typeof actualDb.queryOne === 'function') {
        await actualDb.queryOne('SELECT 1');
      } else if (typeof actualDb.prepare === 'function') {
        actualDb.prepare('SELECT 1').get();
      }
      res.set('Cache-Control', 'no-store').json({ status: 'ok', service: 'itech-public-tracking' });
    } catch (error) {
      console.error('[PUBLIC_TRACKING] Health database failure:', error.code || error.message);
      res.status(503).json({ status: 'error', service: 'itech-public-tracking' });
    }
  });

  // Do not trust arbitrary X-Forwarded-For headers. Loopback proxy only, when explicitly configured.
  if (trustProxy === 'loopback') app.set('trust proxy', 'loopback');

  const cleanup = attachPublicTracking(app, actualDb, { limit, windowMs, pollMs, standalone: true });
  app.locals.close = cleanup;

  app.get('/', (_req, res) => res.json({ status: 'online' }));

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

  const app = createPublicApp(getDefaultDb());
  const server = app.listen(port, host, () => {
    console.log(`Acompanhamento público HTTP: ${host}:${port} | Health: http://127.0.0.1:${port}/health`);
  });

  server.on('error', error => {
    console.error(`[PUBLIC_TRACKING] Falha ao iniciar ${host}:${port}: ${error.code}. Verifique a porta e mantenha o administrativo separado.`);
    app.locals.close();
    process.exit(1);
  });

  server.on('clientError', (error, socket) => {
    console.warn('[PUBLIC_TRACKING] HTTP client error:', error.code || error.message);
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    else socket.destroy();
  });

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      console.log(`[PUBLIC_TRACKING] Encerramento solicitado: ${signal}`);
      app.locals.close();
      server.close(() => process.exit(0));
    });
  }
}

module.exports = { createPublicApp, attachPublicTracking, getListenConfig, renderTrackingHtml };
