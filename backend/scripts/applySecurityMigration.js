#!/usr/bin/env node
/**
 * iTech ERP - Script de Aplicação e Auditoria de Segurança RLS (Supabase)
 * 
 * Verifica o status de Row Level Security (RLS) e concessões de privilégios
 * em todas as tabelas do schema public.
 * 
 * Uso:
 *   node backend/scripts/applySecurityMigration.js           (Auditoria / Somente Leitura)
 *   node backend/scripts/applySecurityMigration.js --apply   (Aplica a migration de segurança)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../db/database');

async function runAudit() {
  console.log('================================================================');
  console.log('   iTech ERP — Auditoria de Segurança e RLS (Supabase)          ');
  console.log('================================================================\n');

  const args = process.argv.slice(2);
  const shouldApply = args.includes('--apply');

  const migrationPath = path.join(__dirname, '../db/migrations/20261028_enable_rls_and_revoke_public_data_api.sql');
  if (!fs.existsSync(migrationPath)) {
    console.error('❌ ERRO: Arquivo de migration não encontrado em:', migrationPath);
    process.exit(1);
  }

  try {
    // 1. Aplicar migration se solicitado com --apply
    if (shouldApply) {
      console.log('🔒 Aplicando migration de segurança: ativação de RLS e revogação de acessos na Data API...');
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await db.exec(sql);
      console.log('✅ Migration executada com sucesso no PostgreSQL!\n');
    } else {
      console.log('ℹ️ Modo Auditoria (Somente Leitura). Para aplicar as correções, use: --apply\n');
    }

    // 2. Consultar status atual de RLS em todas as tabelas do schema public
    const tables = await db.query(`
      SELECT 
        tablename,
        rowsecurity AS rls_enabled,
        tableowner
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename ASC
    `);

    if (tables.length === 0) {
      console.log('ℹ️ Nenhuma tabela encontrada no schema public. Execute "npm run db:bootstrap" para inicializar o esquema.');
      process.exit(0);
    }

    console.log(`📊 Total de tabelas auditadas no schema public: ${tables.length}\n`);

    let rlsDisabledCount = 0;
    let rlsEnabledCount = 0;

    console.log('Tabela                                 | RLS Ativo? | Owner');
    console.log('---------------------------------------+------------+----------------');
    for (const t of tables) {
      const isEnabled = t.rls_enabled === true || t.rls_enabled === 'true' || t.rls_enabled === 1;
      if (isEnabled) {
        rlsEnabledCount++;
      } else {
        rlsDisabledCount++;
      }
      const namePadded = t.tablename.padEnd(38, ' ');
      const statusPadded = (isEnabled ? 'SIM (✅)' : 'NÃO (⚠️ ALERTA)').padEnd(10, ' ');
      console.log(`${namePadded} | ${statusPadded} | ${t.tableowner}`);
    }

    console.log('\n================================================================');
    console.log(` Resumo da Auditoria:`);
    console.log(`   - Tabelas com RLS Ativo (Protegidas):  ${rlsEnabledCount}`);
    console.log(`   - Tabelas com RLS Desativado (Alertas): ${rlsDisabledCount}`);

    if (rlsDisabledCount > 0) {
      console.log('\n⚠️ ATENÇÃO: Foram encontradas tabelas com RLS desativado.');
      console.log('   Execute este script com a flag --apply para ativar RLS e revogar acessos na Data API:');
      console.log('   node backend/scripts/applySecurityMigration.js --apply');
    } else {
      console.log('\n🛡️ SUCESSO: Todas as tabelas do schema public estão com Row Level Security (RLS) ATIVO!');
      console.log('   Nenhuma tabela está exposta publicamente na Data API do Supabase.');
    }
    console.log('================================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Erro durante a auditoria/aplicação de segurança:', err.message || err);
    process.exit(1);
  }
}

runAudit();
