const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { ensureFinancialHistoryUpToDate } = require('./utils/financialHistory');

require('./db/database'); // garante que o schema seja criado ao iniciar
require('./db/virusSchema');

const app = express();

app.disable('x-powered-by');

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.use(morgan('dev'));

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

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', require('./routes/notesAliases'));

// Serve o frontend (build de produção) se ele existir, para rodar tudo com um único processo
const frontendDist = path.join(__dirname, 'public');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Tratamento de erros genérico seguro
app.use((err, req, res, next) => {
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
  console.log('  iTech Celular e Informática — Painel');
  console.log(`  Acesse em: http://localhost:${PORT}`);
  console.log(`  Rede local: http://<IPv4 deste computador>:${PORT} (0.0.0.0)`);
  console.log('==============================================');

  ensureFinancialHistoryUpToDate()
    .then(({ createdMonths }) => {
      if (createdMonths.length > 0) {
        console.log(`[FINANCIAL_HISTORY] ${createdMonths.length} fechamento(s) mensal(is) criado(s).`);
      }
    })
    .catch((error) => {
      console.error('[FINANCIAL_HISTORY] Falha ao processar fechamento mensal:', error.message);
    });
});
