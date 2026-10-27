/**
 * Script de Migração Automatizada e Reproduzível: SQLite -> PostgreSQL
 * iTech ERP Multi-Tenant SaaS
 * 
 * Uso:
 *   node backend/scripts/migrateToPostgres.js
 * 
 * Variáveis de ambiente suportadas:
 *   DATABASE_URL / POSTGRES_URL=postgresql://user:pass@host:5432/dbname
 *   ou PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('better-sqlite3');

async function main() {
  console.log('====================================================');
  console.log('   MIGRAÇÃO DE BANCO DE DADOS: SQLite -> PostgreSQL  ');
  console.log('====================================================\n');

  let pg;
  try {
    pg = require('pg');
  } catch (err) {
    console.error('❌ O pacote "pg" não está instalado no backend.');
    console.error('Para executar a migração quando o PostgreSQL estiver disponível, execute:');
    console.error('  cd backend && npm install pg\n');
    process.exit(1);
  }

  const { Pool } = pg;
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const poolConfig = connectionString
    ? { connectionString }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT) || 5432,
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'itecherp',
      };

  console.log(`🔌 Conectando ao PostgreSQL (${poolConfig.host || 'via URL'})...`);
  const pool = new Pool(poolConfig);

  let client;
  try {
    client = await pool.connect();
    console.log('✅ Conexão com PostgreSQL estabelecida com sucesso!');
  } catch (err) {
    console.error('❌ Falha ao conectar ao PostgreSQL:', err.message);
    console.log('\nCertifique-se de configurar as variáveis de conexão PostgreSQL no seu arquivo .env:');
    console.log('  POSTGRES_URL=postgresql://postgres:senha@localhost:5432/itecherp\n');
    process.exit(1);
  }

  const sqlitePath = path.join(__dirname, '..', 'db', 'itech.db');
  console.log(`📂 Lendo banco SQLite de: ${sqlitePath}`);
  if (!fs.existsSync(sqlitePath)) {
    console.error(`❌ Banco SQLite não encontrado em ${sqlitePath}`);
    process.exit(1);
  }

  const sqlite = sqlite3(sqlitePath, { readonly: true });

  try {
    console.log('\n🔨 Executando schema DDL no PostgreSQL...');
    const ddlPath = path.join(__dirname, '..', 'db', 'postgresSchema.sql');
    const ddlSql = fs.readFileSync(ddlPath, 'utf-8');
    await client.query(ddlSql);
    console.log('✅ Tabelas e índices do PostgreSQL criados/atualizados!');

    // Lista ordenada de tabelas a migrar para respeitar foreign keys
    const tablesToMigrate = [
      'stores',
      'platform_users',
      'store_subscription_history',
      'password_reset_tokens',
      'users',
      'settings',
      'document_sequences',
      'customers',
      'service_orders',
      'service_order_status_history',
      'service_order_photos',
      'warranties',
      'credit_accounts',
      'credit_account_payments',
      'cash_withdrawals',
      'stock_categories',
      'stock_suppliers',
      'stock_products',
      'stock_levels',
      'stock_movements',
      'store_sales',
      'store_sale_items',
      'device_sales',
      'screen_protector_groups',
      'screen_protector_models',
      'notes',
      'virus_scans',
      'virus_scan_results',
      'financial_history',
      'audit_logs',
    ];

    console.log('\n🚀 Iniciando transferência e conferência dos dados:\n');
    console.log('-------------------------------------------------------------');
    console.log(String('Tabela').padEnd(30) + String('SQLite').padStart(10) + String('PostgreSQL').padStart(12) + String('Status').padStart(10));
    console.log('-------------------------------------------------------------');

    for (const table of tablesToMigrate) {
      // Verificar se a tabela existe no SQLite
      const tableExists = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if (!tableExists) {
        console.log(`${table.padEnd(30)} ${'(n/a)'.padStart(10)} ${'0'.padStart(12)} ${'PULADA'.padStart(10)}`);
        continue;
      }

      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      const sqliteCount = rows.length;

      if (sqliteCount > 0) {
        // Desativar temporariamente constraints se necessário ou limpar tabela para migração limpa
        await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);

        const columns = Object.keys(rows[0]);
        const colNames = columns.map(c => `"${c}"`).join(', ');

        for (const row of rows) {
          const values = columns.map((col) => {
            const val = row[col];
            if (val === null || val === undefined) return null;
            return val;
          });
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
          const insertQuery = `INSERT INTO "${table}" (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
          await client.query(insertQuery, values);
        }

        // Se a tabela tem coluna 'id', atualiza a sequence
        try {
          await client.query(`
            SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1), true)
          `);
        } catch (_seqErr) {
          // Tabela não usa serial em 'id', ignora
        }
      }

      const pgCountRes = await client.query(`SELECT COUNT(*) as count FROM "${table}"`);
      const pgCount = Number(pgCountRes.rows[0].count);

      const status = (sqliteCount === pgCount) ? '✅ OK' : '⚠️ DIVERGÊNCIA';
      console.log(`${table.padEnd(30)} ${String(sqliteCount).padStart(10)} ${String(pgCount).padStart(12)} ${status.padStart(10)}`);
    }

    console.log('-------------------------------------------------------------');
    console.log('\n🎉 Migração e conferência concluídas com sucesso!');
  } catch (error) {
    console.error('\n❌ Erro durante o processo de migração:', error);
  } finally {
    sqlite.close();
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
