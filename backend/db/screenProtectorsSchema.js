const path = require('path');

const seedGroups = require(path.join(__dirname, '../../data/compatibilidadePeliculas.json'));

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function inferBrand(models) {
  const value = normalize(models[0]);
  if (value.includes('samsung')) return 'Samsung';
  if (value.includes('motorola') || value.includes('moto')) return 'Motorola';
  if (value.includes('poco')) return 'POCO';
  if (value.includes('redmi') || value.includes('xiaomi') || /(^|\s)mi\s/.test(value)) return 'Xiaomi';
  if (value.includes('iphone') || value.includes('apple')) return 'Apple';
  if (value.includes('realme')) return 'Realme';
  if (value.includes('lg')) return 'LG';
  if (value.includes('nokia')) return 'Nokia';
  if (value.includes('itel')) return 'Itel';
  return 'Outra';
}

module.exports = function migrateScreenProtectors(db) {
  const hasColumn = (table, column) => {
    try {
      return db.prepare(`PRAGMA table_info(${table})`).all().some(item => item.name === column);
    } catch {
      return false;
    }
  };

  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS screen_protector_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        brand TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_by_name_snapshot TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS screen_protector_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL DEFAULT 1,
        group_id INTEGER NOT NULL REFERENCES screen_protector_groups(id) ON DELETE CASCADE,
        model_name TEXT NOT NULL COLLATE NOCASE,
        position INTEGER NOT NULL DEFAULT 0,
        UNIQUE(group_id, model_name)
      );

      CREATE INDEX IF NOT EXISTS idx_screen_protector_groups_brand
        ON screen_protector_groups(brand, name);
      CREATE INDEX IF NOT EXISTS idx_screen_protector_models_name
        ON screen_protector_models(model_name);
    `);

    if (!hasColumn('screen_protector_groups', 'store_id')) {
      db.exec('ALTER TABLE screen_protector_groups ADD COLUMN store_id INTEGER NOT NULL DEFAULT 1');
    }
    if (!hasColumn('screen_protector_groups', 'created_by_name_snapshot')) {
      db.exec('ALTER TABLE screen_protector_groups ADD COLUMN created_by_name_snapshot TEXT');
    }
    if (!hasColumn('screen_protector_models', 'store_id')) {
      db.exec('ALTER TABLE screen_protector_models ADD COLUMN store_id INTEGER NOT NULL DEFAULT 1');
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_screen_groups_store ON screen_protector_groups(store_id);
      CREATE INDEX IF NOT EXISTS idx_screen_models_store ON screen_protector_models(store_id);
    `);

    const count = db.prepare('SELECT COUNT(*) AS total FROM screen_protector_groups').get().total;
    if (count > 0) return;

    const insertGroup = db.prepare('INSERT INTO screen_protector_groups (name, brand) VALUES (?, ?)');
    const insertModel = db.prepare(
      'INSERT INTO screen_protector_models (group_id, model_name, position) VALUES (?, ?, ?)'
    );

    for (const [name, models] of Object.entries(seedGroups)) {
      const groupId = insertGroup.run(name, inferBrand(models)).lastInsertRowid;
      models.forEach((model, position) => insertModel.run(groupId, model, position));
    }
  })();
};

