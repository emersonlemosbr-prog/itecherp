const fs = require('fs');
const path = require('path');

function getUniqueBackupPath(dir, prefix) {
  let count = 0;
  while (true) {
    count += 1;
    const candidate = path.join(dir, `${prefix}-${Date.now()}-${process.pid}-${count}.db`);
    if (!fs.existsSync(candidate)) return candidate;
  }
}

module.exports = function migratePartsCatalog(db) {
  if (db.prepare('PRAGMA table_info(frontals_price_list)').all().some(c => c.name === 'category_id')) return;
  // VACUUM INTO includes committed WAL data and fails closed if the backup cannot be made.
  if (db.name && db.name !== ':memory:') {
    const dir = path.join(path.dirname(db.name), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const backupPath = getUniqueBackupPath(dir, 'before-parts');
    db.prepare('VACUUM INTO ?').run(backupPath);
  }
  db.transaction(() => {
    db.exec(`CREATE TABLE parts_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('category','brand','quality')),
      name TEXT NOT NULL, name_key TEXT NOT NULL,
      show_assembly INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id,kind,name_key), UNIQUE(id,user_id)
    );
    ALTER TABLE frontals_price_list ADD COLUMN category_id INTEGER REFERENCES parts_options(id);
    ALTER TABLE frontals_price_list ADD COLUMN quality_id INTEGER REFERENCES parts_options(id);
    ALTER TABLE frontals_price_list ADD COLUMN description TEXT NOT NULL DEFAULT '';
    ALTER TABLE frontals_price_list ADD COLUMN part_code TEXT NOT NULL DEFAULT '';
    ALTER TABLE frontals_price_list ADD COLUMN assembly_type TEXT NOT NULL DEFAULT '';
    ALTER TABLE frontals_price_list ADD COLUMN frame TEXT NOT NULL DEFAULT '';
    CREATE INDEX idx_parts_category ON frontals_price_list(user_id,category_id);`);
    const insert = db.prepare('INSERT OR IGNORE INTO parts_options(user_id,kind,name,name_key,show_assembly) VALUES(?,?,?,?,?)');
    for (const user of db.prepare('SELECT id FROM users').all()) {
      insert.run(user.id, 'category', 'Frontais', 'frontais', 1);
      const category = db.prepare("SELECT id FROM parts_options WHERE user_id=? AND kind='category'").get(user.id);
      db.prepare('UPDATE frontals_price_list SET category_id=? WHERE user_id=?').run(category.id,user.id);
      for (const {brand} of db.prepare('SELECT DISTINCT brand FROM frontals_price_list WHERE user_id=?').all(user.id)) {
        insert.run(user.id,'brand',brand,brand.trim().toLocaleLowerCase('pt-BR'),0);
      }
    }
  })();
};
