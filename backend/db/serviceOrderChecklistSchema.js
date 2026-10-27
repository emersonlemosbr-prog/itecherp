// db/serviceOrderChecklistSchema.js
// Migração segura para adicionar suporte a Senha do Aparelho e Checklist de Entrada do Aparelho

const fs = require('fs');
const path = require('path');

let backupExecuted = false;

function performSafeBackup(db) {
  if (backupExecuted) return;
  backupExecuted = true;

  try {
    const dbDir = path.join(__dirname);
    const backupDir = path.join(dbDir, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const mainDb = path.join(dbDir, 'itech.db');
    if (fs.existsSync(mainDb)) {
      const destMain = path.join(backupDir, `backup-before-checklist-${timestamp}.db`);
      fs.copyFileSync(mainDb, destMain);
      console.log(`[DATABASE] Backup de segurança criado com sucesso: ${path.basename(destMain)}`);
    }

    const walDb = path.join(dbDir, 'itech.db-wal');
    if (fs.existsSync(walDb)) {
      fs.copyFileSync(walDb, path.join(backupDir, `backup-before-checklist-${timestamp}.db-wal`));
    }
  } catch (error) {
    console.warn(`[DATABASE] Aviso: Não foi possível criar cópia de backup do banco: ${error.message}`);
  }
}

module.exports = function migrateServiceOrderChecklist(db) {
  performSafeBackup(db);

  const hasColumn = (table, column) => {
    try {
      return db.prepare(`PRAGMA table_info(${table})`).all().some(item => item.name === column);
    } catch {
      return false;
    }
  };

  db.transaction(() => {
    // 1. Campos de Senha e Desbloqueio do Aparelho
    if (!hasColumn('service_orders', 'unlock_type')) {
      db.exec("ALTER TABLE service_orders ADD COLUMN unlock_type TEXT DEFAULT 'none'");
    }
    if (!hasColumn('service_orders', 'unlock_password')) {
      db.exec('ALTER TABLE service_orders ADD COLUMN unlock_password TEXT');
    }
    if (!hasColumn('service_orders', 'unlock_pattern')) {
      db.exec('ALTER TABLE service_orders ADD COLUMN unlock_pattern TEXT');
    }

    // 2. Campos de Checklist e Condições do Aparelho
    if (!hasColumn('service_orders', 'device_condition')) {
      db.exec('ALTER TABLE service_orders ADD COLUMN device_condition TEXT');
    }
    if (!hasColumn('service_orders', 'battery_health')) {
      db.exec('ALTER TABLE service_orders ADD COLUMN battery_health INTEGER');
    }
    if (!hasColumn('service_orders', 'checklist_notes')) {
      db.exec('ALTER TABLE service_orders ADD COLUMN checklist_notes TEXT');
    }
    if (!hasColumn('service_orders', 'checklist_json')) {
      db.exec('ALTER TABLE service_orders ADD COLUMN checklist_json TEXT');
    }
    if (!hasColumn('service_orders', 'accessories_json')) {
      db.exec('ALTER TABLE service_orders ADD COLUMN accessories_json TEXT');
    }
  })();
};
