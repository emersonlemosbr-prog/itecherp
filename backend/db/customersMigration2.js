// db/customersMigration2.js
// Migração incremental e segura para a evolução Clientes 2.0
// Adiciona campos de CRM: cpf, rg, gender, phone_secondary, email, postal_code, street, number, complement, neighborhood, city, state, notes
// Compatível com SQLite (testes/desenvolvimento) e PostgreSQL (produção).

async function migrateCustomers2(db) {
  if (!db) return;

  // Detecta explicitamente o dialeto
  const isSqlite =
    db.isSqlite === true ||
    Boolean(db.sqliteDb) ||
    (typeof db.name === 'string' && typeof db.pragma === 'function') ||
    (Boolean(db.prepare) && typeof db.pragma === 'function');

  // 1. Caso SQLite (better-sqlite3 nativo ou adapter sqlite)
  if (isSqlite) {
    try {
      const rawDb = db.sqliteDb || db;
      const tableInfo = rawDb.prepare(`PRAGMA table_info(customers)`).all();
      const existingCols = new Set(tableInfo.map(c => c.name.toLowerCase()));

      const columnsToAdd = [
        { name: 'cpf', type: 'TEXT' },
        { name: 'rg', type: 'TEXT' },
        { name: 'gender', type: 'TEXT' },
        { name: 'phone_secondary', type: 'TEXT' },
        { name: 'email', type: 'TEXT' },
        { name: 'postal_code', type: 'TEXT' },
        { name: 'street', type: 'TEXT' },
        { name: 'number', type: 'TEXT' },
        { name: 'complement', type: 'TEXT' },
        { name: 'neighborhood', type: 'TEXT' },
        { name: 'city', type: 'TEXT' },
        { name: 'state', type: 'TEXT' },
        { name: 'notes', type: 'TEXT' },
      ];

      for (const col of columnsToAdd) {
        if (!existingCols.has(col.name)) {
          rawDb.exec(`ALTER TABLE customers ADD COLUMN ${col.name} ${col.type}`);
        }
      }

      // Índices SQLite
      rawDb.exec(`
        CREATE INDEX IF NOT EXISTS idx_customers_cpf ON customers(store_id, cpf);
        CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(store_id, phone);
        CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(store_id, email);
      `);
    } catch (err) {
      console.warn('[CUSTOMERS_MIGRATION_SQLITE_WARN]', err.message);
    }
    return;
  }

  // 2. Caso PostgreSQL (via pool de conexão pg ou db wrapper)
  if (typeof db.query === 'function') {
    try {
      await db.query(`
        ALTER TABLE customers
          ADD COLUMN IF NOT EXISTS cpf VARCHAR(32),
          ADD COLUMN IF NOT EXISTS rg VARCHAR(32),
          ADD COLUMN IF NOT EXISTS gender VARCHAR(32),
          ADD COLUMN IF NOT EXISTS phone_secondary VARCHAR(32),
          ADD COLUMN IF NOT EXISTS email VARCHAR(255),
          ADD COLUMN IF NOT EXISTS postal_code VARCHAR(16),
          ADD COLUMN IF NOT EXISTS street VARCHAR(255),
          ADD COLUMN IF NOT EXISTS number VARCHAR(32),
          ADD COLUMN IF NOT EXISTS complement VARCHAR(120),
          ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(120),
          ADD COLUMN IF NOT EXISTS city VARCHAR(120),
          ADD COLUMN IF NOT EXISTS state VARCHAR(32),
          ADD COLUMN IF NOT EXISTS notes TEXT;

        CREATE INDEX IF NOT EXISTS idx_customers_cpf ON customers(store_id, cpf);
        CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(store_id, phone);
        CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(store_id, email);
      `);
    } catch (err) {
      console.warn('[CUSTOMERS_MIGRATION_PG_WARN]', err.message);
    }
  }
}

module.exports = migrateCustomers2;
