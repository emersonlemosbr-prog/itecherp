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

let pool = null;
let sqliteDb = null;
const isSqliteMode = isTestEnvironment && !connectionString;

if (isSqliteMode) {
  // Modo SQLite isolado para testes rápidos e seguros sem tocar na nuvem
  const Database = require('better-sqlite3');
  const dbPath = process.env.ITECH_DB_PATH || ':memory:';
  if (dbPath !== ':memory:') {
    try { fs.mkdirSync(path.dirname(dbPath), { recursive: true }); } catch (_) {}
  }
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');

  // Inicializa o schema SQLite compatível e completo para testes isolados
  try {
    const { initSqliteTestSchema } = require('./sqliteSchema');
    initSqliteTestSchema(sqliteDb);
  } catch (err) {
    console.warn('[DATABASE] Erro ao carregar schema de teste SQLite:', err.message);
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

/**
 * Executa uma consulta e retorna todas as linhas encontradas.
 */
async function query(sql, ...args) {
  const params = normalizeParams(args);
  if (isSqliteMode) {
    let sqliteSql = sql.replace(/\$\d+/g, '?');
    const hasReturning = /\bRETURNING\b/i.test(sqliteSql);
    const cleanSql = sqliteSql.replace(/\s+RETURNING\s+[\w*,\s]+/i, '');
    const isMutation = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i.test(cleanSql);
    const stmt = sqliteDb.prepare(cleanSql);
    if (isMutation) {
      const info = stmt.run(...params);
      const rows = [];
      rows.rowCount = info.changes || 0;
      rows.lastInsertRowid = info.lastInsertRowid || null;
      if (hasReturning) {
        rows.push({
          id: info.lastInsertRowid,
          lastInsertRowid: info.lastInsertRowid,
        });
      }
      return rows;
    }
    const rows = stmt.all(...params);
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
    const sqliteSql = sql.replace(/\$\d+/g, '?');
    const stmt = sqliteDb.prepare(sqliteSql);
    const info = stmt.run(...params);
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
