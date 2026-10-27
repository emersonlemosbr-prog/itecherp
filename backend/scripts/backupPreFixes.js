const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '../db/itech.db');
const backupDir = path.join(__dirname, '../db/backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const backupPath = path.join(backupDir, 'itech-pre-platform-fixes.db');

try {
  const db = new Database(dbPath);
  db.prepare('VACUUM INTO ?').run(backupPath);
  db.close();
  console.log(`[BACKUP_SUCCESS] Banco de dados salvo com sucesso em: ${backupPath}`);
} catch (err) {
  console.error(`[BACKUP_ERROR] Falha ao fazer backup: ${err.message}`);
  // Fallback para cópia direta caso VACUUM INTO falhe
  fs.copyFileSync(dbPath, backupPath);
  console.log(`[BACKUP_FALLBACK] Cópia direta criada em: ${backupPath}`);
}
