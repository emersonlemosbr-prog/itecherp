const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { ensureFinancialHistoryUpToDate } = require('./utils/financialHistory');
const db = require('./db/database');

const app = express();

app.disable('x-powered-by');

// Trust reverse proxy (necessário no Render e atrás do Cloudflare)
app.set('trust proxy', 1);

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Suporte flexível a CORS para Cloudflare Pages e desenvolvimento
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim().replace(/\/$/, ''))
  : null;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (!corsOrigins || corsOrigins.includes('*')) return callback(null, true);
    const normalized = origin.replace(/\/$/, '');
    if (corsOrigins.includes(normalized)) return callback(null, true);
    // Permite subdomínios do pages.dev caso configurado
    if (normalized.endsWith('.pages.dev')) return callback(null, true);
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

app.use(express.json({ limit: '4mb' }));
app.use(morgan('dev'));

// Rotas da API Administrativa e Operacional
app.use('/api/auth', require('./routes/auth'));
app.use('/api/platform', require('./routes/platform'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/danger-zone', require('./routes/dangerZone'));
app.use('/api/backups', require('./routes/backups'));
app.use('/api/users', require('./routes/users'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/service-orders', require('./routes/serviceOrders'));
app.use('/api/track', (_req, res) => res.status(404).json({ error: 'Acompanhamento disponível somente pelo link seguro.' }));
app.use('/api/warranties', require('./routes/warranties'));
app.use('/api/credit-accounts', require('./routes/creditAccounts'));
app.use('/api/cash-withdrawals', require('./routes/cashWithdrawals'));
app.use('/api/calculators', require('./routes/calculators'));
app.use('/api/device-sales', require('./routes/deviceSales'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/financial-history', require('./routes/financialHistory'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/screen-protectors', require('./routes/screenProtectors'));
app.use('/api/store-sales', require('./routes/storeSales'));
app.use('/api/events', require('./routes/events'));
app.use('/api/virus-agent', require('./routes/virusAgent'));

app.get('/api/health', async (_req, res) => {
  try {
    if (process.env.DATABASE_URL) {
      await db.queryOne('SELECT 1');
    }
    res.json({ status: 'ok', database: process.env.DATABASE_URL ? 'postgresql' : 'offline' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: err.message });
  }
});

app.use('/api', require('./routes/notesAliases'));

// Serve o frontend estático se ele existir (hospedagem híbrida opcional)
const frontendDist = path.join(__dirname, 'public');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Tratamento central de erros
app.use((err, req, res, _next) => {
  const statusCode = err.statusCode || err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const message = (isProd && statusCode === 500) ? 'Erro interno do servidor.' : (err.message || 'Erro interno do servidor.');

  console.error('[SERVER_ERROR]', {
    method: req.method,
    path: req.originalUrl,
    params: req.params,
    query: req.query,
    stack: err.stack,
  });

  res.status(statusCode).json({
    error: message,
    type: err.name || 'Error',
  });
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('==============================================');
  console.log('  iTech Celular e Informática — Backend Online');
  console.log(`  Porta: ${PORT}`);
  console.log(`  Banco: ${process.env.DATABASE_URL ? 'PostgreSQL (Supabase/Cloud)' : 'Local'}`);
  console.log('==============================================');

  if (process.env.DATABASE_URL) {
    db.initSchema()
      .then(() => {
        console.log('[DATABASE] Esquema PostgreSQL pronto.');
      })
      .catch((err) => {
        console.error('[DATABASE] Falha ao verificar esquema PostgreSQL:', err.message);
      });
  }

  ensureFinancialHistoryUpToDate()
    .then(({ createdMonths }) => {
      if (createdMonths && createdMonths.length > 0) {
        console.log(`[FINANCIAL_HISTORY] ${createdMonths.length} fechamento(s) mensal(is) criado(s).`);
      }
    })
    .catch((error) => {
      console.error('[FINANCIAL_HISTORY] Falha ao processar fechamento mensal:', error.message);
    });
});
