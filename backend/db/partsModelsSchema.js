const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const key = value => String(value || '').trim().toLocaleLowerCase('pt-BR');

// Import only real saved models. Never rewrite the original part records.
function importModels(db, userId) {
  const rows = userId == null
    ? db.prepare('SELECT user_id,brand,model FROM frontals_price_list ORDER BY id').all()
    : db.prepare('SELECT user_id,brand,model FROM frontals_price_list WHERE user_id=? ORDER BY id').all(userId);
  const addBrand = db.prepare("INSERT OR IGNORE INTO parts_options(user_id,kind,name,name_key) VALUES(?,'brand',?,?)");
  const brand = db.prepare("SELECT id FROM parts_options WHERE user_id=? AND kind='brand' AND name_key=?");
  const addModel = db.prepare('INSERT OR IGNORE INTO parts_models(user_id,brand_id,name,name_key) VALUES(?,?,?,?)');
  for (const row of rows) {
    if (row.user_id == null || !key(row.brand) || !key(row.model)) continue;
    addBrand.run(row.user_id, row.brand.trim(), key(row.brand));
    addModel.run(row.user_id, brand.get(row.user_id, key(row.brand)).id, row.model.trim(), key(row.model));
  }
}

function getUniqueBackupPath(dir, prefix) {
  let count = 0;
  while (true) {
    count += 1;
    const candidate = path.join(dir, `${prefix}-${Date.now()}-${process.pid}-${count}.db`);
    if (!fs.existsSync(candidate)) return candidate;
  }
}

module.exports = function migratePartsModels(db) {
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='parts_models'").get()) return;
  if (db.name && db.name !== ':memory:') {
    const dir = path.join(path.dirname(db.name), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const backupPath = getUniqueBackupPath(dir, 'before-parts-models');
    db.prepare('VACUUM INTO ?').run(backupPath);
    const backup = new Database(backupPath, { readonly: true });
    try {
      if (backup.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Falha ao verificar backup de modelos.');
    } finally { backup.close(); }
  }
  db.transaction(() => {
    db.exec(`CREATE TABLE parts_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      brand_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL,
      FOREIGN KEY(brand_id,user_id) REFERENCES parts_options(id,user_id) ON DELETE CASCADE,
      UNIQUE(user_id,brand_id,name_key)
    );`);
    importModels(db);
  })();
};
module.exports.importModels = importModels;
module.exports.key = key;
