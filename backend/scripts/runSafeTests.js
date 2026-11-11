// backend/scripts/runSafeTests.js
// Executor Central de Testes do iTech ERP com Garantia Anti-Produção

const { spawn } = require('child_process');
const path = require('path');
const guard = require('../db/guard');

// 1. Força NODE_ENV=test
process.env.NODE_ENV = 'test';

// 2. Valida o ambiente antes de invocar o test runner
try {
  guard.assertSafeTestEnvironment({
    url: process.env.TEST_DATABASE_URL,
    isTestProcess: true,
  });
} catch (err) {
  console.error(`\n🛑 [TEST RUNNER ABORTADO] ${err.message}\n`);
  process.exit(1);
}

// 3. Monta os argumentos para node --test
const rawArgs = process.argv.slice(2);
const testArgs = [
  '--test',
  '--test-concurrency=1',
  ...(rawArgs.length > 0 ? rawArgs : ['tests/*.test.js']),
];

console.log('🛡️ [TEST SUITE] Modo isolado ativo. Executando testes com segurança...');

const child = spawn(process.execPath, testArgs, {
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    NODE_ENV: 'test',
  },
  stdio: 'inherit',
});

child.on('close', (code) => {
  process.exit(code || 0);
});
