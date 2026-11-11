// scripts/backupPostgresOnline.js
// Cria um backup estrutural e de dados (JSON seguro) de todas as tabelas antes da limpeza

const fs = require('fs');
const path = require('path');
const db = require('../db/database');

async function createOnlineBackup() {
  const backupDir = path.join(__dirname, '../backend/db/backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const backupFilePath = path.join(backupDir, `pre_cleanup_backup_${timestamp}.json`);

  console.log('📦 [BACKUP] Iniciando extração dos dados do PostgreSQL...');

  const tables = await db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
  );

  const backupData = {
    metadata: {
      timestamp: new Date().toISOString(),
      database: 'iTech ERP Production (Supabase)',
      tablesCount: tables.length,
    },
    tables: {},
  };

  let totalRows = 0;
  for (const t of tables) {
    const tableName = t.table_name;
    const rows = await db.query(`SELECT * FROM "${tableName}"`);
    backupData.tables[tableName] = rows;
    totalRows += rows.length;
    console.log(` - Tabela ${tableName.padEnd(30)}: ${rows.length} registros extraídos.`);
  }

  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf8');

  console.log(`\n✅ [BACKUP CONCLUÍDO COM SUCESSO]`);
  console.log(`Arquivo gerado: ${backupFilePath}`);
  console.log(`Total de registros preservados: ${totalRows} em ${tables.length} tabelas.\n`);

  return backupFilePath;
}

createOnlineBackup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ [BACKUP FALHOU]:', err);
    process.exit(1);
  });
