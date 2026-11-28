const crypto = require('crypto');
const db = require('../db/database');

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const BASE_BLOCK_MS = 15 * 60 * 1000; // 15 minutos
const MAX_BLOCK_MS = 60 * 60 * 1000; // 60 minutos máximo
const IP_MAX_FAILS = 10;
const ACCOUNT_MAX_FAILS = 5;

let schemaReady = false;

function hashKey(scope, value) {
  return crypto.createHash('sha256').update(`${scope}:${String(value || '')}`).digest('hex');
}

function normalizeAccount(username) {
  return String(username || '').trim().toLowerCase();
}

function getClientIp(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

async function ensureTable() {
  if (schemaReady) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      key_hash TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      fail_count INTEGER NOT NULL DEFAULT 0,
      first_attempt_at BIGINT NOT NULL,
      last_attempt_at BIGINT NOT NULL,
      blocked_until BIGINT DEFAULT NULL
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_login_attempts_last ON login_attempts(last_attempt_at)');
  schemaReady = true;
}

function resetSchemaCache() {
  schemaReady = false;
}

async function checkBlocked(req, username) {
  await ensureTable();
  const now = Date.now();
  const ipHash = hashKey('ip', getClientIp(req));
  const acctNorm = normalizeAccount(username);
  const hashes = acctNorm ? [ipHash, hashKey('acct', acctNorm)] : [ipHash];

  for (const h of hashes) {
    const row = await db.queryOne('SELECT blocked_until FROM login_attempts WHERE key_hash = $1', [h]);
    if (row && row.blocked_until && Number(row.blocked_until) > now) {
      const retrySec = Math.max(1, Math.ceil((Number(row.blocked_until) - now) / 1000));
      return { blocked: true, retrySec };
    }
  }
  return { blocked: false, retrySec: 0 };
}

async function recordFailureForScope(scope, rawValue, maxFails, now) {
  const keyHash = hashKey(scope, rawValue);
  const existing = await db.queryOne(
    'SELECT fail_count, first_attempt_at, blocked_until FROM login_attempts WHERE key_hash = $1',
    [keyHash]
  );

  let nextCount = 1;
  let firstAt = now;
  let blockedUntil = null;

  if (existing) {
    const withinWindow = (now - Number(existing.first_attempt_at)) <= WINDOW_MS;
    nextCount = withinWindow ? Number(existing.fail_count) + 1 : 1;
    firstAt = withinWindow ? Number(existing.first_attempt_at) : now;

    if (nextCount >= maxFails) {
      const over = nextCount - maxFails;
      const multiplier = Math.min(4, Math.pow(2, Math.floor(over / maxFails)));
      const blockMs = Math.min(MAX_BLOCK_MS, BASE_BLOCK_MS * multiplier);
      blockedUntil = now + blockMs;
    }
  }

  await db.execute(
    `INSERT INTO login_attempts (key_hash, scope, fail_count, first_attempt_at, last_attempt_at, blocked_until)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (key_hash) DO UPDATE SET
       fail_count = CASE
         WHEN ($5 - login_attempts.first_attempt_at) > ${WINDOW_MS} THEN 1
         ELSE login_attempts.fail_count + 1
       END,
       first_attempt_at = CASE
         WHEN ($5 - login_attempts.first_attempt_at) > ${WINDOW_MS} THEN $4
         ELSE login_attempts.first_attempt_at
       END,
       last_attempt_at = $5,
       blocked_until = COALESCE($6, login_attempts.blocked_until)`,
    [keyHash, scope, nextCount, firstAt, now, blockedUntil]
  );

  return { count: nextCount, blockedUntil };
}

async function recordFailure(req, username) {
  await ensureTable();
  const now = Date.now();
  const ip = getClientIp(req);
  await recordFailureForScope('ip', ip, IP_MAX_FAILS, now);

  const acctNorm = normalizeAccount(username);
  if (acctNorm) {
    await recordFailureForScope('acct', acctNorm, ACCOUNT_MAX_FAILS, now);
  }

  // Limpeza oportunista de registros antigos (> 24h)
  if (Math.random() < 0.05) {
    const cutoff = now - 24 * 60 * 60 * 1000;
    await db.execute(
      'DELETE FROM login_attempts WHERE last_attempt_at < $1 AND (blocked_until IS NULL OR blocked_until < $2)',
      [cutoff, now]
    );
  }
}

async function clearFailures(req, username) {
  await ensureTable();
  const ipHash = hashKey('ip', getClientIp(req));
  await db.execute('DELETE FROM login_attempts WHERE key_hash = $1', [ipHash]);
  const acctNorm = normalizeAccount(username);
  if (acctNorm) {
    const acctHash = hashKey('acct', acctNorm);
    await db.execute('DELETE FROM login_attempts WHERE key_hash = $1', [acctHash]);
  }
}

module.exports = {
  checkBlocked,
  recordFailure,
  clearFailures,
  resetSchemaCache,
  normalizeAccount,
  IP_MAX_FAILS,
  ACCOUNT_MAX_FAILS,
};
