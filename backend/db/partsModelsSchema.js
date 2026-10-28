// db/partsModelsSchema.js
// Utilitários de modelos de peças compatíveis com PostgreSQL
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
        "INSERT INTO parts_options(user_id, kind, name, name_key) VALUES($1, 'brand', $2, $3) ON CONFLICT DO NOTHING",
        [row.user_id, row.brand.trim(), key(row.brand)]
      );
      const brand = await db.queryOne(
        "SELECT id FROM parts_options WHERE user_id = $1 AND kind = 'brand' AND name_key = $2",
        [row.user_id, key(row.brand)]
      );
      if (brand) {
        await db.execute(
          "INSERT INTO parts_models(user_id, brand_id, name, name_key) VALUES($1, $2, $3, $4) ON CONFLICT DO NOTHING",
          [row.user_id, brand.id, row.model.trim(), key(row.model)]
        );
      }
    }
  } catch (err) {
    console.warn('⚠️ [PARTS_MODELS] Aviso na importação de modelos:', err.message);
  }
}

module.exports = async function migratePartsModels(db) {
  // No PostgreSQL o esquema completo já é criado em postgresSchema.sql
  return Promise.resolve();
};
module.exports.importModels = importModels;
module.exports.key = key;
