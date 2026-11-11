// backend/db/sqliteSchema.js
// Gera o schema completo SQLite para testes locais isolados sem tocar no banco de produção.

const migrateMultiTenant = require('./multiTenantSchema');
const migrateConstraints = require('./multiTenantConstraints');
const migratePartsCatalog = require('./partsCatalogSchema');
const migrateScreenProtectors = require('./screenProtectorsSchema');
const migrateChecklist = require('./serviceOrderChecklistSchema');
const migrateTracking = require('./trackingSchema');
const migrateCustomerDeletion = require('./customerDeletionSchema');

function initSqliteTestSchema(db) {
  // 1. Tabelas Base
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      full_name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','employee')),
      active INTEGER DEFAULT 1,
      is_master INTEGER DEFAULT 0,
      job_title TEXT,
      permissions TEXT,
      session_version INTEGER DEFAULT 0,
      last_access TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS frontals_price_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      user_id INTEGER REFERENCES users(id),
      brand TEXT,
      model TEXT,
      version TEXT,
      cost_price REAL DEFAULT 0,
      sale_price REAL DEFAULT 0,
      category_id INTEGER,
      quality_id INTEGER,
      description TEXT,
      part_code TEXT,
      assembly_type TEXT,
      frame TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      birth_date TEXT,
      address TEXT,
      phone TEXT,
      is_system INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS service_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
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
      device_brand TEXT,
      device_model TEXT,
      device_color TEXT,
      device_serial TEXT,
      reported_defect TEXT,
      budget_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      service_price REAL NOT NULL DEFAULT 0,
      parts_cost REAL NOT NULL DEFAULT 0,
      additional_costs REAL NOT NULL DEFAULT 0,
      profit REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'pending',
      payment_status TEXT NOT NULL DEFAULT 'pending',
      status TEXT DEFAULT 'pending',
      warranty_days INTEGER DEFAULT 90,
      public_token_hash TEXT,
      created_by INTEGER REFERENCES users(id),
      created_by_name_snapshot TEXT,
      customer_name_snapshot TEXT,
      customer_phone_snapshot TEXT,
      customer_address_snapshot TEXT,
      supplier_id INTEGER,
      supplier_name_snapshot TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(store_id, order_number)
    );

    CREATE TABLE IF NOT EXISTS service_order_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_order_id INTEGER NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
      photo_url TEXT,
      url TEXT,
      storage_key TEXT,
      public_id TEXT,
      photo_type TEXT DEFAULT 'entry',
      caption TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS financial_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      revenue REAL DEFAULT 0,
      received REAL DEFAULT 0,
      pending REAL DEFAULT 0,
      profit REAL DEFAULT 0,
      net_profit REAL DEFAULT 0,
      total_services INTEGER DEFAULT 0,
      total_sales INTEGER DEFAULT 0,
      average_ticket REAL DEFAULT 0,
      cash_total REAL DEFAULT 0,
      pix_total REAL DEFAULT 0,
      card_total REAL DEFAULT 0,
      other_total REAL DEFAULT 0,
      expenses REAL DEFAULT 0,
      opened_at TEXT NOT NULL,
      closed_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS financial_history_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      last_closed_year INTEGER,
      last_closed_month INTEGER,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS warranties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      service_order_id INTEGER REFERENCES service_orders(id),
      customer_id INTEGER REFERENCES customers(id),
      pickup_date TEXT,
      warranty_start TEXT,
      warranty_end TEXT,
      brand TEXT,
      model TEXT,
      amount_paid REAL DEFAULT 0,
      description TEXT,
      customer_name_snapshot TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS credit_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      customer_id INTEGER REFERENCES customers(id),
      service_order_id INTEGER REFERENCES service_orders(id),
      description TEXT,
      amount REAL DEFAULT 0,
      pickup_date TEXT,
      status TEXT DEFAULT 'pending',
      paid_at TEXT,
      customer_name_snapshot TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cash_withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      withdrawal_date TEXT DEFAULT (datetime('now')),
      notes TEXT,
      source_type TEXT DEFAULT 'manual',
      service_order_id INTEGER REFERENCES service_orders(id),
      supplier_id INTEGER,
      supplier_name TEXT,
      created_by INTEGER REFERENCES users(id),
      created_by_name_snapshot TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      name TEXT NOT NULL,
      contact_info TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      name TEXT NOT NULL,
      model TEXT,
      code TEXT,
      barcode TEXT,
      category_id INTEGER REFERENCES stock_categories(id),
      supplier_id INTEGER REFERENCES stock_suppliers(id),
      cost_price REAL DEFAULT 0,
      sale_price REAL DEFAULT 0,
      min_stock INTEGER DEFAULT 0,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      deleted_at TEXT,
      image_url TEXT,
      image_public_id TEXT,
      created_by INTEGER REFERENCES users(id),
      created_by_name_snapshot TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_levels (
      product_id INTEGER PRIMARY KEY REFERENCES stock_products(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 0,
      min_quantity INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      product_id INTEGER NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
      movement_type TEXT NOT NULL,
      quantity_delta INTEGER NOT NULL,
      previous_quantity INTEGER NOT NULL,
      new_quantity INTEGER NOT NULL,
      reason TEXT,
      user_id INTEGER REFERENCES users(id),
      user_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS store_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      sale_number TEXT NOT NULL,
      subtotal REAL DEFAULT 0,
      discount_type TEXT,
      discount_value REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      payment_method TEXT,
      notes TEXT,
      is_canceled INTEGER DEFAULT 0,
      canceled_at TEXT,
      canceled_by INTEGER REFERENCES users(id),
      canceled_by_name_snapshot TEXT,
      cancel_reason TEXT,
      created_by INTEGER REFERENCES users(id),
      created_by_name_snapshot TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS store_sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      sale_id INTEGER NOT NULL REFERENCES store_sales(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES stock_products(id),
      product_name TEXT NOT NULL,
      product_code TEXT,
      cost_price REAL DEFAULT 0,
      unit_price REAL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 1,
      subtotal REAL DEFAULT 0,
      is_canceled INTEGER DEFAULT 0,
      canceled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS device_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      order_number TEXT NOT NULL,
      customer_id INTEGER REFERENCES customers(id),
      sale_date TEXT DEFAULT (datetime('now')),
      seller_name TEXT,
      customer_name TEXT,
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
      items_json TEXT,
      total_amount REAL DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      created_by_name_snapshot TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      user_id INTEGER REFERENCES users(id),
      user_name TEXT,
      action TEXT NOT NULL,
      record_type TEXT NOT NULL,
      record_id TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      user_id INTEGER REFERENCES users(id),
      event_key TEXT,
      category TEXT,
      title TEXT NOT NULL,
      description TEXT,
      link TEXT,
      metadata TEXT,
      is_read INTEGER DEFAULT 0,
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 2. Aplica migrações multi-tenant
  migrateMultiTenant(db);
  migrateConstraints(db);
  migrateCustomerDeletion(db);
  migratePartsCatalog(db);
  migrateScreenProtectors(db);
  migrateChecklist(db);
  migrateTracking(db);
}

module.exports = { initSqliteTestSchema };
