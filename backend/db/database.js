// db/database.js
// Camada de Acesso a Dados 100% PostgreSQL (Supabase / Render) para iTech ERP
// Conexão via Pool (pg), suporte a SSL, transações assíncronas e tradução de dialeto

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

/**
 * Analisa e extrai com segurança os parâmetros de conexão a partir de uma DATABASE_URL,
 * suportando senhas com caracteres especiais (como #, ?, @, +, $) e prevenindo erros de
 * parser causados por delimitadores não escapados.
 * NUNCA exibe ou registra a senha nos logs.
 */
function parseDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Alerta preventivo caso a URL tenha sido cortada no .env por um # sem aspas
  if (trimmed.startsWith('postgres') && !trimmed.includes('@') && trimmed.includes(':')) {
    console.warn('\n⚠️ [DATABASE] ATENÇÃO: A variável DATABASE_URL parece incompleta (falta o "@" separador de host).');
    console.warn('Se a sua senha contiver "#", certifique-se de envolver toda a URL entre aspas duplas no arquivo .env:');
    console.warn('Exemplo: DATABASE_URL="postgresql://postgres.xxx:senha#123@aws-0-us-east-1.pooler.supabase.com:6543/postgres"\n');
  }

  // Regex para separar protocolo, credenciais (até o último @), host:porta, database e query params
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
  } catch {
    // Mantém raw se falhar o decode
  }

  let password = rawPassword !== undefined ? rawPassword : '';
  try {
    password = decodeURIComponent(password);
  } catch {
    // Mantém raw se falhar o decode
  }

  const database = (rawDatabase ? rawDatabase.trim() : '') || 'postgres';

  // Diagnóstico seguro para o Supabase (sem expor credenciais)
  if (host.includes('pooler.supabase.com') && !user.includes('.')) {
    console.warn('⚠️ [DATABASE] Dica Supabase: Ao conectar via Pooler (pooler.supabase.com), o usuário normalmente requer o prefixo do projeto (ex: postgres.seu-ref).');
  } else if (host.startsWith('db.') && host.includes('.supabase.co') && user.includes('.')) {
    console.warn('⚠️ [DATABASE] Dica Supabase: Na conexão direta (db.<ref>.supabase.co:5432), o usuário deve ser apenas "postgres" (sem sufixo de tenant).');
  }

  return {
    host,
    port,
    user,
    password,
    database,
    rawQuery: rawQuery || '',
  };
}

function createPool() {
  if (!connectionString) {
    console.warn('\n⚠️ [DATABASE] ATENÇÃO: Nenhuma variável DATABASE_URL ou POSTGRES_URL encontrada.');
    console.warn('Configure a DATABASE_URL no seu arquivo .env ou no painel do Render/Supabase.');
    console.warn('Exemplo: DATABASE_URL="postgresql://postgres.xxx:senha@aws-0-us-east-1.pooler.supabase.com:6543/postgres"\n');
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

const pool = createPool();

/**
 * Normaliza e traduz consultas SQL do dialeto SQLite para PostgreSQL
 */
function normalizeSql(sql) {
  if (!sql || typeof sql !== 'string') return sql;

  // Substitui datetime('now') por CURRENT_TIMESTAMP e date('now') por CURRENT_DATE
  let translated = sql
    .replace(/\bdatetime\s*\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bdate\s*\(\s*'now'\s*\)/gi, 'CURRENT_DATE');

  // Traduz ? para $1, $2, ...
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

/**
 * Normaliza parâmetros: se forem passados como argumentos soltos (val1, val2) ou array ([val1, val2])
 */
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
 * Executa bloco dentro de uma transação PostgreSQL (BEGIN / COMMIT / ROLLBACK).
 */
async function transaction(callback) {
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
}

/**
 * Executa o arquivo postgresSchema.sql no banco de dados.
 */
async function initSchema() {
  const schemaPath = path.join(__dirname, 'postgresSchema.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Arquivo de esquema não encontrado em: ${schemaPath}`);
  }
  const ddl = fs.readFileSync(schemaPath, 'utf8');
  console.log('⚡ [DATABASE] Inicializando/validando esquema PostgreSQL...');
  await pool.query(ddl);
  console.log('✅ [DATABASE] Esquema PostgreSQL pronto e atualizado com sucesso.');
}

/**
 * Objeto de compatibilidade e acesso universal ao PostgreSQL
 */
const db = {
  pool,
  query,
  queryOne,
  execute,
  run: execute,
  transaction,
  initSchema,
  normalizeSql,
  translatePlaceholders: normalizeSql,
  parseDatabaseUrl,

  // Wrapper compatível com prepared statements assíncronos
  prepare: (sql) => ({
    all: async (...args) => query(sql, ...args),
    get: async (...args) => queryOne(sql, ...args),
    run: async (...args) => execute(sql, ...args),
  }),

  // Execução direta de múltiplos comandos SQL
  exec: async (sql) => pool.query(sql),
};

module.exports = db;
