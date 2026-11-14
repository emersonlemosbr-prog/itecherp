#!/usr/bin/env node
/**
 * iTech ERP - Script de Aplicação e Auditoria da Migração de Suspensão de Lojas
 * 
 * Verifica e aplica de forma segura e idempotente os campos de suspensão na tabela 'stores'.
 * 
 * Uso:
 *   node backend/scripts/applySuspensionMigration.js           (Modo Auditoria / Somente Leitura)
 *   node backend/scripts/applySuspensionMigration.js --apply   (Aplica a migration no PostgreSQL)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../db/database');

async function run() {
  console.log('================================================================');
  console.log('   iTech ERP — Auditoria de Migração: Campos de Suspensão       ');
  console.log('================================================================\n');

  const args = process.argv.slice(2);
  const shouldApply = args.includes('--apply');

  const migrationPath = path.join(__dirname, '../db/migrations/20261113_add_store_suspension_fields.sql');
  if (!fs.existsSync(migrationPath)) {
    console.error('❌ ERRO: Arquivo de migração não encontrado em:', migrationPath);
    process.exit(1);
  }

  try {
    if (shouldApply) {
      console.log('🔒 Aplicando migração no PostgreSQL...');
      const sql = fs.readFileSync(migrationPath, 'utf8');
      if (db.exec) {
        await db.exec(sql);
      } else {
        await db.query('ALTER TABLE stores ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ');
        await db.query('ALTER TABLE stores ADD COLUMN IF NOT EXISTS suspension_reason TEXT');
        await db.query('ALTER TABLE stores ADD COLUMN IF NOT EXISTS suspended_by_name VARCHAR(255)');
      }
      console.log('✅ Instruções DDL executadas com sucesso!\n');
    } else {
      console.log('ℹ️ Modo Auditoria (Somente Leitura). Para aplicar as alterações, execute com: --apply\n');
    }

    // Consulta de verificação
    const cols = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'stores'
      ORDER BY ordinal_position ASC
    `);

    const targetCols = ['suspended_at', 'suspension_reason', 'suspended_by_name'];
    const present = cols.filter(c => targetCols.includes(c.column_name));
    const missing = targetCols.filter(name => !cols.some(c => c.column_name === name));

    console.log('Status das Colunas de Suspensão na Tabela stores:');
    console.log('------------------------------------------------');
    targetCols.forEach(colName => {
      const found = cols.find(c => c.column_name === colName);
      if (found) {
        console.log(` ✅ ${colName.padEnd(20)} [${found.data_type}] (Presente)`);
      } else {
        console.log(` ❌ ${colName.padEnd(20)} [PENDENTE - Não encontrada]`);
      }
    });

    console.log('\n------------------------------------------------');
    if (missing.length === 0) {
      console.log('🎉 Todas as colunas de suspensão estão presentes e prontas para uso!');
    } else {
      console.log(`⚠️ ${missing.length} coluna(s) pendente(s): ${missing.join(', ')}`);
      console.log('Para aplicar com segurança, execute:');
      console.log('  node backend/scripts/applySuspensionMigration.js --apply');
      console.log('Ou execute manualmente no Supabase SQL Editor:');
      console.log(`  ALTER TABLE stores ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
  ALTER TABLE stores ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
  ALTER TABLE stores ADD COLUMN IF NOT EXISTS suspended_by_name VARCHAR(255);`);
    }
  } catch (err) {
    console.error('❌ Erro durante a verificação:', err.message);
  } finally {
    db.close();
  }
}

run();
