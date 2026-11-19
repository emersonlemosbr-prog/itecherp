// db/partsModelsSchema.js
// Utilitários de modelos de peças compatíveis com PostgreSQL e SQLite
const key = value => String(value || '').trim().toLocaleLowerCase('pt-BR');

// Importa apenas modelos reais salvos. Não reescreve os registros originais.
async function importModels(db, userId) {
  try {
    const rows = userId == null
      ? await db.query('SELECT user_id, brand, model FROM frontals_price_list ORDER BY id')
      : await db.query('SELECT user_id, brand, model FROM frontals_price_list WHERE user_id = $1 ORDER BY id', [userId]);

    for (const row of rows) {
      if (row.user_id == null || !key(row.brand) || !key(row.model)) continue;
      await db.execute(
        "INSERT INTO parts_options(store_id, user_id, kind, name, name_key) VALUES(1, $1, 'brand', $2, $3) ON CONFLICT DO NOTHING",
        [row.user_id, row.brand.trim(), key(row.brand)]
      );
      const brand = await db.queryOne(
        "SELECT id FROM parts_options WHERE user_id = $1 AND kind = 'brand' AND name_key = $2",
        [row.user_id, key(row.brand)]
      );
      if (brand) {
        await db.execute(
          "INSERT INTO parts_models(store_id, user_id, brand_id, name, name_key) VALUES(1, $1, $2, $3, $4) ON CONFLICT DO NOTHING",
          [row.user_id, brand.id, row.model.trim(), key(row.model)]
        );
      }
    }
  } catch (err) {
    console.warn('⚠️ [PARTS_MODELS] Aviso na importação de modelos:', err.message);
  }
}

function migratePartsModels(db) {
  // Se for better-sqlite3 diretamente síncrono (ex: testes de unidade legados)
  if (db && typeof db.prepare === 'function') {
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='parts_models'").get()) return;
    db.exec(`CREATE TABLE IF NOT EXISTS parts_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      brand_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL,
      FOREIGN KEY(brand_id, user_id) REFERENCES parts_options(id, user_id) ON DELETE CASCADE,
      UNIQUE(user_id, brand_id, name_key)
    );`);
    const rows = db.prepare('SELECT user_id, brand, model FROM frontals_price_list ORDER BY id').all();
    const addBrand = db.prepare("INSERT OR IGNORE INTO parts_options(user_id, kind, name, name_key) VALUES(?, 'brand', ?, ?)");
    const getBrand = db.prepare("SELECT id FROM parts_options WHERE user_id = ? AND kind = 'brand' AND name_key = ?");
    const addModel = db.prepare("INSERT OR IGNORE INTO parts_models(user_id, brand_id, name, name_key) VALUES(?, ?, ?, ?)");
    for (const r of rows) {
      if (r.user_id == null || !key(r.brand) || !key(r.model)) continue;
      addBrand.run(r.user_id, r.brand.trim(), key(r.brand));
      const b = getBrand.get(r.user_id, key(r.brand));
      if (b) addModel.run(r.user_id, b.id, r.model.trim(), key(r.model));
    }
    return;
  }
  return Promise.resolve();
}

module.exports = migratePartsModels;
module.exports.importModels = importModels;
module.exports.key = key;
