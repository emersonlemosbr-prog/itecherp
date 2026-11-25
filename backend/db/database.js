// db/database.js
// Camada de Acesso a Dados Híbrida e Segura para o iTech ERP
// - Produção / Dev: PostgreSQL (Supabase / Render) via pg Pool com RLS
// - Testes: Banco PostgreSQL Isolado Seguro (TEST_DATABASE_URL) OU SQLite Isolado (:memory: / temp)
// - PROTEÇÃO CENTRAL ATIVA: Bloqueia qualquer tentativa de conexão de testes contra Produção.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const guard = require('./guard');

const isTestEnvironment =
  process.env.NODE_ENV === 'test' ||
  process.argv.some(arg => arg.includes('test'));

// Em modo de teste, NUNCA carrega o .env padrão com DATABASE_URL de produção
if (!isTestEnvironment) {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    try {
      require('dotenv').config({ path: path.join(__dirname, '../.env') });
    } catch {}
  }
}

// Verifica e aplica a proteção permanente
let connectionString = null;
if (isTestEnvironment) {
  // Testes só usam TEST_DATABASE_URL (se fornecida e autorizada)
  const candidateUrl = process.env.TEST_DATABASE_URL;
  guard.assertSafeTestEnvironment({ url: candidateUrl, isTestProcess: true });
  connectionString = candidateUrl || null;
} else {
  connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
}

/**
 * Analisa e extrai com segurança os parâmetros de conexão a partir de uma DATABASE_URL
 */
function parseDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('postgres') && !trimmed.includes('@') && trimmed.includes(':')) {
    console.warn('\n⚠️ [DATABASE] ATENÇÃO: A variável DATABASE_URL parece incompleta (falta o "@" separador de host).');
  }

  const urlMatch = trimmed.match(/^(postgres(?:ql)?:\/\/)(?:([^:]+)(?::(.*))?@)?([^/?#]+)(?:\/([^?#]*))?(?:\?(.*))?$/);
  if (!urlMatch) {
    return { connectionString: trimmed };
  }

  const [, , rawUser, rawPassword, hostPort, rawDatabase, rawQuery] = urlMatch;
  let host = hostPort;
  let port = 5432;

  if (hostPort.includes(':')) {
    const parts = hostPort.split(':');
    host = parts[0];
    port = Number(parts[1]) || 5432;
  }

  let user = rawUser !== undefined ? rawUser : 'postgres';
  try {
    user = decodeURIComponent(user);
  } catch {}

  let password = rawPassword !== undefined ? rawPassword : '';
  try {
    password = decodeURIComponent(password);
  } catch {}

  const database = (rawDatabase ? rawDatabase.trim() : '') || 'postgres';

  return {
    host,
    port,
    user,
    password,
    database,
    rawQuery: rawQuery || '',
  };
}

const isProductionEnvironment = process.env.NODE_ENV === 'production';

// Trava Crítica de Segurança Anti-Fallback:
// Em produção (NODE_ENV=production), o PostgreSQL é obrigatório.
// Jamais permite fallback silencioso para SQLite nem aceita DB_CLIENT=sqlite.
if (isProductionEnvironment) {
  const candidateProdUrl = connectionString || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!candidateProdUrl || typeof candidateProdUrl !== 'string' || !candidateProdUrl.trim()) {
    console.error('\n🛑 [FATAL DATABASE ERROR] Em ambiente de produção (NODE_ENV=production), a variável DATABASE_URL ou POSTGRES_URL é estritamente obrigatória.');
    console.error('🛑 Fallback automático para SQLite e o uso de DB_CLIENT=sqlite são terminantemente proibidos em produção para evitar divergência ou perda de dados.\n');
    throw new Error('CONFIGURACAO_DATABASE_INVALIDA: DATABASE_URL ou POSTGRES_URL ausente em ambiente de producao.');
  }
}

let pool = null;
let sqliteDb = null;
const isSqliteMode = !isProductionEnvironment && (
  (isTestEnvironment && !connectionString) ||
  (!connectionString && !process.env.DATABASE_URL && !process.env.POSTGRES_URL) ||
  process.env.DB_CLIENT === 'sqlite'
);

if (isSqliteMode) {
  // Modo SQLite isolado para testes rápidos e desenvolvimento seguro sem tocar na nuvem
  const Database = require('better-sqlite3');
  const defaultLocalDb = path.join(__dirname, 'itech-local-dev.db');
  const dbPath = process.env.ITECH_DB_PATH || defaultLocalDb;
  if (dbPath !== ':memory:') {
    try { fs.mkdirSync(path.dirname(dbPath), { recursive: true }); } catch (_) {}
  }
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');

  // Inicializa o schema SQLite compatível e completo para desenvolvimento/testes isolados
  try {
    const { initSqliteTestSchema } = require('./sqliteSchema');
    initSqliteTestSchema(sqliteDb);
  } catch (err) {
    console.warn('[DATABASE] Erro ao carregar schema SQLite:', err.message);
  }
} else {
  // Modo PostgreSQL (Produção ou TEST_DATABASE_URL autorizada)
  function createPool() {
    if (!connectionString) {
      console.warn('\n⚠️ [DATABASE] ATENÇÃO: Nenhuma variável DATABASE_URL ou POSTGRES_URL encontrada.');
    }

    const parsed = parseDatabaseUrl(connectionString);
    const isLocal = parsed?.host
      ? (parsed.host.includes('localhost') || parsed.host.includes('127.0.0.1') || process.env.PGSSLMODE === 'disable')
      : (connectionString && (connectionString.includes('localhost') || connectionString.includes('127.0.0.1') || process.env.PGSSLMODE === 'disable'));

    const poolConfig = parsed && parsed.host
      ? {
          host: parsed.host,
          port: parsed.port,
          user: parsed.user,
          password: parsed.password,
          database: parsed.database,
          ssl: isLocal ? false : { rejectUnauthorized: false },
          max: Number(process.env.DB_POOL_MAX || 15),
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
        }
      : (connectionString
          ? {
              connectionString,
              ssl: isLocal ? false : { rejectUnauthorized: false },
              max: Number(process.env.DB_POOL_MAX || 15),
              idleTimeoutMillis: 30000,
              connectionTimeoutMillis: 10000,
            }
          : {
              host: process.env.PGHOST || 'localhost',
              port: Number(process.env.PGPORT) || 5432,
              user: process.env.PGUSER || 'postgres',
              password: process.env.PGPASSWORD || '',
              database: process.env.PGDATABASE || 'postgres',
              ssl: false,
            });

    const p = new Pool(poolConfig);
    p.on('error', (err) => {
      console.error('❌ [DATABASE] Erro inesperado no cliente do pool PostgreSQL:', err.message);
    });
    return p;
  }
  pool = createPool();
}

/**
 * Normaliza e traduz consultas SQL do dialeto SQLite para PostgreSQL
 */
function normalizeSql(sql) {
  if (!sql || typeof sql !== 'string') return sql;

  let translated = sql
    .replace(/\bdatetime\s*\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bdate\s*\(\s*'now'\s*\)/gi, 'CURRENT_DATE');

  if (!translated.includes('?')) return translated;

  let inString = false;
  let paramIndex = 1;
  let result = '';

  for (let i = 0; i < translated.length; i++) {
    const char = translated[i];
    if (char === "'") {
      if (inString && translated[i + 1] === "'") {
        result += "''";
        i++;
        continue;
      }
      inString = !inString;
      result += char;
    } else if (char === '?' && !inString) {
      result += `$${paramIndex++}`;
    } else {
      result += char;
    }
  }

  return result;
}

function normalizeParams(args) {
  if (!args || args.length === 0) return [];
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return Array.from(args);
}

function translateSqliteSqlAndParams(sql, params) {
  const orderedParams = [];
  const sqliteSql = sql.replace(/\$(\d+)/g, (_, numStr) => {
    const idx = parseInt(numStr, 10) - 1;
    if (idx >= 0 && idx < params.length) {
      orderedParams.push(params[idx]);
    } else {
      orderedParams.push(null);
    }
    return '?';
  }).replace(/\bFOR\s+UPDATE\b/gi, '');

  // Se a query original já usava ?, mantém os params originais
  const finalParams = sqliteSql.includes('?') && orderedParams.length > 0 ? orderedParams : params;
  return { sqliteSql, finalParams };
}

/**
 * Executa uma consulta e retorna todas as linhas encontradas.
 */
async function query(sql, ...args) {
  const params = normalizeParams(args);
  if (isSqliteMode) {
    const { sqliteSql, finalParams } = translateSqliteSqlAndParams(sql, params);
    const hasReturning = /\bRETURNING\b/i.test(sqliteSql);
    if (hasReturning) {
      const stmt = sqliteDb.prepare(sqliteSql);
      const returnedRows = stmt.all(...finalParams);
      const rows = returnedRows.map((row) => ({
        ...row,
        ...(row && row.id !== undefined ? { lastInsertRowid: row.id } : {}),
      }));
      rows.rowCount = rows.length;
      rows.lastInsertRowid = rows[0]?.id ?? null;
      return rows;
    }
    const isMutation = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i.test(sqliteSql);
    const stmt = sqliteDb.prepare(sqliteSql);
    if (isMutation) {
      const info = stmt.run(...finalParams);
      const rows = [];
      rows.rowCount = info.changes || 0;
      rows.lastInsertRowid = info.lastInsertRowid || null;
      return rows;
    }
    const rows = stmt.all(...finalParams);
    rows.rowCount = rows.length;
    return rows;
  }
  const formattedSql = normalizeSql(sql);
  const result = await pool.query(formattedSql, params);
  const rows = result.rows || [];
  rows.rowCount = result.rowCount;
  return rows;
}

/**
 * Executa uma consulta e retorna a primeira linha ou null.
 */
async function queryOne(sql, ...args) {
  const rows = await query(sql, ...args);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Executa comando INSERT / UPDATE / DELETE e retorna info de linhas afetadas e ID gerado.
 */
async function execute(sql, ...args) {
  const params = normalizeParams(args);
  if (isSqliteMode) {
    const { sqliteSql, finalParams } = translateSqliteSqlAndParams(sql, params);
    const stmt = sqliteDb.prepare(sqliteSql);
    const info = stmt.run(...finalParams);
    return {
      rowCount: info.changes || 0,
      changes: info.changes || 0,
      rows: [],
      id: info.lastInsertRowid || null,
      lastInsertRowid: info.lastInsertRowid || null,
    };
  }
  const formattedSql = normalizeSql(sql);
  const result = await pool.query(formattedSql, params);
  return {
    rowCount: result.rowCount || 0,
    changes: result.rowCount || 0,
    rows: result.rows || [],
    id: result.rows?.[0]?.id || null,
    lastInsertRowid: result.rows?.[0]?.id || null,
  };
}

/**
 * Executa bloco dentro de uma transação (PostgreSQL ou SQLite).
 */
function transaction(callback) {
  if (isSqliteMode) {
    const isAsync = callback.constructor.name === 'AsyncFunction';
    if (isAsync) {
      sqliteDb.exec('BEGIN TRANSACTION');
      return (async () => {
        try {
          const res = await callback({
            query,
            queryOne,
            execute,
            run: execute,
          });
          sqliteDb.exec('COMMIT');
          return res;
        } catch (err) {
          try { sqliteDb.exec('ROLLBACK'); } catch (_) {}
          throw err;
        }
      })();
    }
    const runTx = sqliteDb.transaction((...args) => callback(...args));
    return (...args) => runTx(...args);
  }

  return (async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tx = {
        query: async (sql, ...args) => {
          const params = normalizeParams(args);
          const res = await client.query(normalizeSql(sql), params);
          const rows = res.rows || [];
          rows.rowCount = res.rowCount;
          return rows;
        },
        queryOne: async (sql, ...args) => {
          const params = normalizeParams(args);
          const res = await client.query(normalizeSql(sql), params);
          return res.rows?.[0] || null;
        },
        execute: async (sql, ...args) => {
          const params = normalizeParams(args);
          const res = await client.query(normalizeSql(sql), params);
          return {
            rowCount: res.rowCount || 0,
            changes: res.rowCount || 0,
            rows: res.rows || [],
            id: res.rows?.[0]?.id || null,
            lastInsertRowid: res.rows?.[0]?.id || null,
          };
        },
        run: async (sql, ...args) => {
          const params = normalizeParams(args);
          const res = await client.query(normalizeSql(sql), params);
          return {
            rowCount: res.rowCount || 0,
            changes: res.rowCount || 0,
            rows: res.rows || [],
            id: res.rows?.[0]?.id || null,
            lastInsertRowid: res.rows?.[0]?.id || null,
          };
        },
      };
      const result = await callback(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })();
}

/**
 * Executa o arquivo postgresSchema.sql no banco de dados.
 */
async function initSchema() {
  if (isSqliteMode) return;
  const schemaPath = path.join(__dirname, 'postgresSchema.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Arquivo de esquema não encontrado em: ${schemaPath}`);
  }
  const ddl = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(ddl);
}

/**
 * Fecha a conexão de forma segura
 */
function close() {
  if (sqliteDb) {
    try { sqliteDb.close(); } catch (_) {}
  }
  if (pool) {
    try { pool.end(); } catch (_) {}
  }
}

/**
 * Objeto de compatibilidade universal
 */
const db = {
  pool,
  sqliteDb,
  isSqlite: isSqliteMode,
  query,
  queryOne,
  execute,
  run: execute,
  transaction,
  initSchema,
  normalizeSql,
  translatePlaceholders: normalizeSql,
  parseDatabaseUrl,
  close,

  // Wrapper compatível síncrono/assíncrono para prepared statements
  prepare: (sql) => {
    if (isSqliteMode) {
      const sqliteSql = sql.replace(/\$\d+/g, '?');
      const stmt = sqliteDb.prepare(sqliteSql);
      return {
        all: (...args) => stmt.all(...normalizeParams(args)),
        get: (...args) => stmt.get(...normalizeParams(args)),
        run: (...args) => stmt.run(...normalizeParams(args)),
      };
    }
    return {
      all: async (...args) => query(sql, ...args),
      get: async (...args) => queryOne(sql, ...args),
      run: async (...args) => execute(sql, ...args),
    };
  },

  exec: async (sql) => {
    if (isSqliteMode) {
      return sqliteDb.exec(sql);
    }
    return pool.query(sql);
  },
};

module.exports = db;
