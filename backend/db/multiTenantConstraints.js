// db/multiTenantConstraints.js
// Ajusta as constraints de unicidade para serem compostas por (store_id, ...)
// garantindo que lojas diferentes possam ter seus próprios números de OS, vendas e códigos sem colisão.

module.exports = function migrateMultiTenantConstraints(db) {
  const getTableSql = (name) => db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name)?.sql || '';

  // Verificar se alguma das tabelas precisa de ajuste
  const soSql = getTableSql('service_orders');
  const ssSql = getTableSql('store_sales');
  const dsSql = getTableSql('device_sales');
  const spSql = getTableSql('stock_products');
  const scSql = getTableSql('stock_categories');
  const supSql = getTableSql('stock_suppliers');

  const settingsSql = getTableSql('system_settings');

  const needsMigration = (
    (soSql && soSql.includes('order_number TEXT NOT NULL UNIQUE')) ||
    (ssSql && ssSql.includes('sale_number TEXT NOT NULL UNIQUE')) ||
    (dsSql && dsSql.includes('order_number TEXT NOT NULL UNIQUE')) ||
    (spSql && spSql.includes('code TEXT NOT NULL UNIQUE')) ||
    (scSql && scSql.includes('name TEXT NOT NULL UNIQUE')) ||
    (supSql && supSql.includes('name TEXT NOT NULL UNIQUE')) ||
    (settingsSql && settingsSql.includes('CHECK(id=1)'))
  );

  // Ajustar índice de is_master para ser por loja (store_id, is_master)
  db.exec(`
    DROP INDEX IF EXISTS idx_users_single_master;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_master ON users(store_id, is_master) WHERE is_master = 1;
  `);

  if (!needsMigration) return;

  // Desativar foreign_keys FORA da transação
  db.pragma('foreign_keys = OFF');

  try {
    db.transaction(() => {
      // 1. service_orders
      if (soSql && soSql.includes('order_number TEXT NOT NULL UNIQUE')) {
        db.exec(`
          CREATE TABLE service_orders_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id),
            order_number TEXT NOT NULL,
            customer_id INTEGER NOT NULL REFERENCES customers(id),
            brand TEXT,
            model TEXT,
            imei1 TEXT,
            imei2 TEXT,
            entry_date TEXT NOT NULL,
            expected_delivery_date TEXT,
            delivery_date TEXT,
            description TEXT,
            notes TEXT,
            service_price REAL NOT NULL DEFAULT 0,
            parts_cost REAL NOT NULL DEFAULT 0,
            supplier_id INTEGER REFERENCES stock_suppliers(id) ON DELETE SET NULL,
            supplier_name_snapshot TEXT,
            additional_costs REAL NOT NULL DEFAULT 0,
            profit REAL NOT NULL DEFAULT 0,
            payment_method TEXT NOT NULL DEFAULT 'pending',
            payment_status TEXT NOT NULL DEFAULT 'pending',
            status TEXT NOT NULL DEFAULT 'received',
            warranty_days INTEGER DEFAULT 90,
            public_token_hash TEXT,
            customer_name_snapshot TEXT,
            customer_phone_snapshot TEXT,
            customer_address_snapshot TEXT,
            created_by_name_snapshot TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(store_id, order_number)
          );

          INSERT INTO service_orders_new (
            id, store_id, order_number, customer_id, brand, model, imei1, imei2,
            entry_date, expected_delivery_date, delivery_date, description, notes,
            service_price, parts_cost, supplier_id, supplier_name_snapshot, additional_costs,
            profit, payment_method, payment_status, status, warranty_days, public_token_hash,
            customer_name_snapshot, customer_phone_snapshot, customer_address_snapshot,
            created_by_name_snapshot, created_by, created_at, updated_at
          )
          SELECT
            id, COALESCE(store_id, 1), order_number, customer_id, brand, model, imei1, imei2,
            entry_date, expected_delivery_date, delivery_date, description, notes,
            service_price, parts_cost, supplier_id, supplier_name_snapshot, additional_costs,
            profit, payment_method, payment_status, status, warranty_days, public_token_hash,
            customer_name_snapshot, customer_phone_snapshot, customer_address_snapshot,
            created_by_name_snapshot, created_by, created_at, updated_at
          FROM service_orders;

          DROP TABLE service_orders;
          ALTER TABLE service_orders_new RENAME TO service_orders;

          CREATE INDEX IF NOT EXISTS idx_so_store ON service_orders(store_id);
          CREATE INDEX IF NOT EXISTS idx_so_customer ON service_orders(customer_id);
          CREATE INDEX IF NOT EXISTS idx_so_status ON service_orders(status);
          CREATE INDEX IF NOT EXISTS idx_so_number ON service_orders(store_id, order_number);
        `);
      }

      // 2. store_sales
      if (ssSql && ssSql.includes('sale_number TEXT NOT NULL UNIQUE')) {
        db.exec(`
          CREATE TABLE store_sales_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id),
            sale_number TEXT NOT NULL,
            subtotal REAL NOT NULL DEFAULT 0,
            discount_type TEXT,
            discount_value REAL NOT NULL DEFAULT 0,
            discount_amount REAL NOT NULL DEFAULT 0,
            total_amount REAL NOT NULL DEFAULT 0,
            payment_method TEXT NOT NULL,
            notes TEXT,
            is_canceled INTEGER NOT NULL DEFAULT 0,
            canceled_at TEXT,
            canceled_by INTEGER REFERENCES users(id),
            cancel_reason TEXT,
            created_by_name_snapshot TEXT,
            canceled_by_name_snapshot TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(store_id, sale_number)
          );

          INSERT INTO store_sales_new (
            id, store_id, sale_number, subtotal, discount_type, discount_value,
            discount_amount, total_amount, payment_method, notes, is_canceled,
            canceled_at, canceled_by, cancel_reason, created_by_name_snapshot,
            canceled_by_name_snapshot, created_by, created_at
          )
          SELECT
            id, COALESCE(store_id, 1), sale_number, subtotal, discount_type, discount_value,
            discount_amount, total_amount, payment_method, notes, is_canceled,
            canceled_at, canceled_by, cancel_reason, created_by_name_snapshot,
            canceled_by_name_snapshot, created_by, created_at
          FROM store_sales;

          DROP TABLE store_sales;
          ALTER TABLE store_sales_new RENAME TO store_sales;

          CREATE INDEX IF NOT EXISTS idx_store_sales_store ON store_sales(store_id);
          CREATE INDEX IF NOT EXISTS idx_store_sales_number ON store_sales(store_id, sale_number);
          CREATE INDEX IF NOT EXISTS idx_store_sales_canceled ON store_sales(is_canceled, created_at DESC);
        `);
      }

      // 3. device_sales
      if (dsSql && dsSql.includes('order_number TEXT NOT NULL UNIQUE')) {
        db.exec(`
          CREATE TABLE device_sales_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id),
            order_number TEXT NOT NULL,
            customer_id INTEGER REFERENCES customers(id),
            sale_date TEXT NOT NULL,
            seller_name TEXT,
            customer_name TEXT NOT NULL,
            customer_cpf_cnpj TEXT,
            address TEXT,
            city TEXT,
            state TEXT,
            cep TEXT,
            phone TEXT,
            email TEXT,
            horario TEXT,
            payment_method TEXT,
            notes TEXT,
            items_json TEXT NOT NULL DEFAULT '[]',
            total_amount REAL NOT NULL DEFAULT 0,
            created_by_name_snapshot TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(store_id, order_number)
          );

          INSERT INTO device_sales_new (
            id, store_id, order_number, customer_id, sale_date, seller_name,
            customer_name, customer_cpf_cnpj, address, city, state, cep,
            phone, email, horario, payment_method, notes, items_json,
            total_amount, created_by_name_snapshot, created_by, created_at, updated_at
          )
          SELECT
            id, COALESCE(store_id, 1), order_number, customer_id, sale_date, seller_name,
            customer_name, customer_cpf_cnpj, address, city, state, cep,
            phone, email, horario, payment_method, notes, items_json,
            total_amount, created_by_name_snapshot, created_by, created_at, updated_at
          FROM device_sales;

          DROP TABLE device_sales;
          ALTER TABLE device_sales_new RENAME TO device_sales;

          CREATE INDEX IF NOT EXISTS idx_device_sales_store ON device_sales(store_id);
          CREATE INDEX IF NOT EXISTS idx_device_sales_number ON device_sales(store_id, order_number);
        `);
      }

      // 4. stock_products
      if (spSql && spSql.includes('code TEXT NOT NULL UNIQUE')) {
        db.exec(`
          CREATE TABLE stock_products_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id),
            name TEXT NOT NULL,
            model TEXT,
            code TEXT NOT NULL,
            barcode TEXT,
            category_id INTEGER REFERENCES stock_categories(id) ON DELETE SET NULL,
            supplier_id INTEGER REFERENCES stock_suppliers(id) ON DELETE SET NULL,
            cost_price REAL NOT NULL DEFAULT 0,
            sale_price REAL NOT NULL DEFAULT 0,
            min_stock INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            deleted_at TEXT,
            image_url TEXT,
            image_public_id TEXT,
            created_by_name_snapshot TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(store_id, code)
          );

          INSERT INTO stock_products_new (
            id, store_id, name, model, code, barcode, category_id, supplier_id,
            cost_price, sale_price, min_stock, notes, is_active, deleted_at,
            image_url, image_public_id, created_by_name_snapshot, created_by,
            created_at, updated_at
          )
          SELECT
            id, COALESCE(store_id, 1), name, model, code, barcode, category_id, supplier_id,
            cost_price, sale_price, min_stock, notes, is_active, deleted_at,
            image_url, image_public_id, created_by_name_snapshot, created_by,
            created_at, updated_at
          FROM stock_products;

          DROP TABLE stock_products;
          ALTER TABLE stock_products_new RENAME TO stock_products;

          CREATE INDEX IF NOT EXISTS idx_stock_products_store ON stock_products(store_id);
          CREATE INDEX IF NOT EXISTS idx_stock_products_code ON stock_products(store_id, code);
        `);
      }

      // 5. stock_categories
      if (scSql && scSql.includes('name TEXT NOT NULL UNIQUE')) {
        db.exec(`
          CREATE TABLE stock_categories_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id),
            name TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(store_id, name)
          );

          INSERT INTO stock_categories_new (id, store_id, name, is_active, created_at)
          SELECT id, COALESCE(store_id, 1), name, is_active, created_at
          FROM stock_categories;

          DROP TABLE stock_categories;
          ALTER TABLE stock_categories_new RENAME TO stock_categories;

          CREATE INDEX IF NOT EXISTS idx_stock_categories_store ON stock_categories(store_id);
        `);
      }

      // 6. stock_suppliers
      if (supSql && supSql.includes('name TEXT NOT NULL UNIQUE')) {
        db.exec(`
          CREATE TABLE stock_suppliers_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id),
            name TEXT NOT NULL,
            contact_info TEXT,
            notes TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(store_id, name)
          );

          INSERT INTO stock_suppliers_new (id, store_id, name, contact_info, notes, is_active, created_at)
          SELECT id, COALESCE(store_id, 1), name, contact_info, notes, is_active, created_at
          FROM stock_suppliers;

          DROP TABLE stock_suppliers;
          ALTER TABLE stock_suppliers_new RENAME TO stock_suppliers;

          CREATE INDEX IF NOT EXISTS idx_stock_suppliers_store ON stock_suppliers(store_id);
        `);
      }

      // 7. system_settings
      if (settingsSql && settingsSql.includes('CHECK(id=1)')) {
        db.exec(`
          CREATE TABLE system_settings_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id),
            value TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            last_backup TEXT,
            UNIQUE(store_id)
          );

          INSERT INTO system_settings_new (id, store_id, value, version, last_backup)
          SELECT id, COALESCE(store_id, 1), value, version, last_backup
          FROM system_settings;

          DROP TABLE system_settings;
          ALTER TABLE system_settings_new RENAME TO system_settings;

          CREATE INDEX IF NOT EXISTS idx_system_settings_store ON system_settings(store_id);
        `);
      }
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
};
