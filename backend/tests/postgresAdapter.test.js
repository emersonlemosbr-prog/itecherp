const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');

test('PostgreSQL Adapter: normalizeSql parameter placeholder translation', () => {
  const input = 'SELECT * FROM users WHERE store_id = ? AND role = ? AND active = ?';
  const expected = 'SELECT * FROM users WHERE store_id = $1 AND role = $2 AND active = $3';
  assert.equal(db.normalizeSql(input), expected);
});

test('PostgreSQL Adapter: normalizeSql preserves string literals with question marks', () => {
  const input = "SELECT * FROM users WHERE note = 'O que é isso?' AND id = ?";
  const expected = "SELECT * FROM users WHERE note = 'O que é isso?' AND id = $1";
  assert.equal(db.normalizeSql(input), expected);
});

test('PostgreSQL Adapter: normalizeSql translates SQLite datetime functions', () => {
  const input = "INSERT INTO logs (created_at) VALUES (datetime('now'))";
  const expected = "INSERT INTO logs (created_at) VALUES (CURRENT_TIMESTAMP)";
  assert.equal(db.normalizeSql(input), expected);
});

test('PostgreSQL Schema: DDL file exists and contains all essential ERP tables', () => {
  const schemaPath = path.join(__dirname, '../db/postgresSchema.sql');
  assert.ok(fs.existsSync(schemaPath), 'postgresSchema.sql must exist');
  
  const ddl = fs.readFileSync(schemaPath, 'utf8');
  const essentialTables = [
    'stores',
    'users',
    'customers',
    'service_orders',
    'service_order_status_history',
    'service_order_photos',
    'warranties',
    'credit_accounts',
    'cash_withdrawals',
    'stock_products',
    'stock_levels',
    'stock_suppliers',
    'stock_categories',
    'stock_movements',
    'store_sales',
    'store_sale_items',
    'device_sales',
    'notes',
    'system_settings',
    'audit_log',
    'platform_users',
    'virus_scans',
    'tracking_push',
  ];

  for (const table of essentialTables) {
    assert.ok(
      ddl.includes(`CREATE TABLE IF NOT EXISTS ${table}`) || ddl.includes(`CREATE TABLE ${table}`),
      `DDL must contain table definition for ${table}`
    );
  }
});

test('PostgreSQL Adapter: interface methods are properly exported', () => {
  assert.equal(typeof db.query, 'function', 'db.query must be a function');
  assert.equal(typeof db.queryOne, 'function', 'db.queryOne must be a function');
  assert.equal(typeof db.execute, 'function', 'db.execute must be a function');
  assert.equal(typeof db.transaction, 'function', 'db.transaction must be a function');
  assert.equal(typeof db.initSchema, 'function', 'db.initSchema must be a function');
  assert.equal(typeof db.prepare, 'function', 'db.prepare must be a function');
});

test('PostgreSQL Adapter: prepare compatibility wrapper provides async all, get, run', () => {
  const stmt = db.prepare('SELECT 1');
  assert.equal(typeof stmt.all, 'function', 'stmt.all must be a function');
  assert.equal(typeof stmt.get, 'function', 'stmt.get must be a function');
  assert.equal(typeof stmt.run, 'function', 'stmt.run must be a function');
});

test('PostgreSQL Adapter: parseDatabaseUrl parses standard connection string', () => {
  const url = 'postgresql://postgres:mysecretpass@localhost:5432/mydb';
  const parsed = db.parseDatabaseUrl(url);
  assert.equal(parsed.host, 'localhost');
  assert.equal(parsed.port, 5432);
  assert.equal(parsed.user, 'postgres');
  assert.equal(parsed.password, 'mysecretpass');
  assert.equal(parsed.database, 'mydb');
});

test('PostgreSQL Adapter: parseDatabaseUrl preserves passwords with special characters (#, ?, @, +)', () => {
  const url = 'postgresql://postgres.myproject:P@ss#123?+extra@aws-0-sa-east-1.pooler.supabase.com:6543/postgres';
  const parsed = db.parseDatabaseUrl(url);
  assert.equal(parsed.host, 'aws-0-sa-east-1.pooler.supabase.com');
  assert.equal(parsed.port, 6543);
  assert.equal(parsed.user, 'postgres.myproject');
  assert.equal(parsed.password, 'P@ss#123?+extra');
  assert.equal(parsed.database, 'postgres');
});

test('PostgreSQL Adapter: parseDatabaseUrl safely handles null and empty inputs', () => {
  assert.equal(db.parseDatabaseUrl(null), null);
  assert.equal(db.parseDatabaseUrl(''), null);
  assert.equal(db.parseDatabaseUrl('   '), null);
});
