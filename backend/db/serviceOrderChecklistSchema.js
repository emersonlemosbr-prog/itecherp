// db/serviceOrderChecklistSchema.js
// Migração segura para adicionar suporte a Senha do Aparelho e Checklist de Entrada do Aparelho

const fs = require('fs');
const path = require('path');

let backupExecuted = false;

function performSafeBackup(db) {
  // Testes e banco em memória nunca devem copiar arquivos físicos.
  if (process.env.NODE_ENV === 'test') return;
  if (!db || !db.name || db.name === ':memory:') return;

  if (backupExecuted) return;
  backupExecuted = true;

  try {
    // Usa o caminho do banco realmente conectado, sem presumir itech.db.
    const mainDb = path.resolve(db.name);

    if (!fs.existsSync(mainDb)) return;

    const dbDir = path.dirname(mainDb);
    const backupDir = path.join(dbDir, 'backups');

    fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);

    const dbName = path.basename(mainDb, path.extname(mainDb));
    const backupPath = path.join(
      backupDir,
      `backup-before-checklist-${dbName}-${timestamp}.db`
    );

    fs.copyFileSync(mainDb, backupPath);

    const walDb = `${mainDb}-wal`;
    if (fs.existsSync(walDb)) {
      fs.copyFileSync(walDb, `${backupPath}-wal`);
    }

    console.log(
      `[DATABASE] Backup de segurança criado: ${path.basename(backupPath)}`
    );
  } catch (error) {
    console.warn(
      `[DATABASE] Aviso: não foi possível criar backup: ${error.message}`
    );
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
