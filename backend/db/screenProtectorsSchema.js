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
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS screen_protector_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        brand TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS screen_protector_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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

