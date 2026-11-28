const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itech-login-rl-'));
process.env.ITECH_DB_PATH = path.join(tempDir, 'test.db');
process.env.JWT_SECRET = 'test-jwt-secret-login-rl';

const db = require('../db/database');
const loginRateLimitService = require('../services/loginRateLimitService');

test.after(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

test('Proteção contra força bruta no login (IP + conta normalizada + persistência)', async () => {
  loginRateLimitService.resetSchemaCache();

  // 1. Normalização de conta (espaços e maiúsculas/minúsculas)
  assert.equal(loginRateLimitService.normalizeAccount('  Admin@Loja.COM  '), 'admin@loja.com');

  // 2. Ataque distribuído: 5 falhas para a mesma conta vindas de 5 IPs diferentes bloqueiam a conta
  for (let i = 1; i <= 5; i++) {
    const req = { ip: `10.0.0.${i}` };
    const pre = await loginRateLimitService.checkBlocked(req, i % 2 === 0 ? '  Alvo@Test.com ' : 'alvo@test.com');
    assert.equal(pre.blocked, false);
    await loginRateLimitService.recordFailure(req, i % 2 === 0 ? '  Alvo@Test.com ' : 'alvo@test.com');
  }

  // 6ª tentativa de um 6º IP deve ser bloqueada
  const blockedAcct = await loginRateLimitService.checkBlocked({ ip: '10.0.0.99' }, 'ALVO@TEST.COM');
  assert.equal(blockedAcct.blocked, true);
  assert.ok(blockedAcct.retrySec > 0);

  // 3. Conta diferente no mesmo IP novo não é afetada
  const otherAcct = await loginRateLimitService.checkBlocked({ ip: '10.0.0.99' }, 'outra@test.com');
  assert.equal(otherAcct.blocked, false);

  // 4. Mesmo IP com 10 falhas em contas diferentes bloqueia o IP
  const attackerIp = { ip: '192.168.1.50' };
  for (let i = 1; i <= 10; i++) {
    await loginRateLimitService.recordFailure(attackerIp, `user${i}@test.com`);
  }
  const blockedIp = await loginRateLimitService.checkBlocked(attackerIp, 'novaconta@test.com');
  assert.equal(blockedIp.blocked, true);

  // 5. Limpeza após login bem-sucedido
  await loginRateLimitService.clearFailures(attackerIp, 'novaconta@test.com');
  const afterClear = await loginRateLimitService.checkBlocked(attackerIp, 'novaconta@test.com');
  assert.equal(afterClear.blocked, false);

  // 6. Persistência no banco (tabela login_attempts existe e não armazena texto puro)
  const rows = await db.query('SELECT key_hash, scope, fail_count FROM login_attempts');
  assert.ok(rows.length >= 1);
  for (const r of rows) {
    assert.equal(r.key_hash.length, 64); // SHA-256 hex
  }
});
