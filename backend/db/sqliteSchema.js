// backend/db/sqliteSchema.js
// Gera o schema completo SQLite para testes locais isolados sem tocar no banco de produção.

const migrateMultiTenant = require('./multiTenantSchema');
const migrateConstraints = require('./multiTenantConstraints');
const migratePartsCatalog = require('./partsCatalogSchema');
const migrateScreenProtectors = require('./screenProtectorsSchema');
const migrateChecklist = require('./serviceOrderChecklistSchema');
const migrateTracking = require('./trackingSchema');
const migrateCustomerDeletion = require('./customerDeletionSchema');
const migrateCustomers2 = require('./customersMigration2');

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
      email TEXT,
      last_access TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique_lower ON users(LOWER(TRIM(email))) WHERE email IS NOT NULL AND TRIM(email) <> '';

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
      original_name TEXT,
      mime_type TEXT,
      file_size INTEGER,
      public_id TEXT,
      photo_type TEXT DEFAULT 'entry',
      description TEXT,
      caption TEXT,
      created_by INTEGER REFERENCES users(id),
      created_by_name_snapshot TEXT,
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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_withdrawals_so_part ON cash_withdrawals(service_order_id) WHERE source_type = 'service_order_part';

    CREATE TABLE IF NOT EXISTS stock_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER DEFAULT 1,
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
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
      min_quantity INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
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
      reference_type TEXT,
      reference_id INTEGER,
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

    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id) ON DELETE CASCADE,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      storage TEXT,
      color TEXT,
      category TEXT NOT NULL DEFAULT 'Smartphone',
      imei1 TEXT,
      imei2 TEXT,
      serial_number TEXT,
      condition TEXT NOT NULL DEFAULT 'Seminovo',
      battery_health INTEGER,
      cost_price REAL NOT NULL DEFAULT 0,
      sell_price REAL NOT NULL DEFAULT 0,
      supplier_id INTEGER REFERENCES stock_suppliers(id) ON DELETE SET NULL,
      supplier_name TEXT,
      entry_date TEXT NOT NULL DEFAULT (date('now')),
      status TEXT NOT NULL DEFAULT 'in_stock',
      reservation_notes TEXT,
      reserved_at TEXT,
      sold_at TEXT,
      sale_id INTEGER REFERENCES device_sales(id) ON DELETE SET NULL,
      sale_order_number TEXT,
      sale_customer_name TEXT,
      sale_price_sold REAL,
      notes TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_devices_store_status ON devices(store_id, status);
    CREATE INDEX IF NOT EXISTS idx_devices_store_brand_model ON devices(store_id, brand, model);
    CREATE INDEX IF NOT EXISTS idx_devices_store_imei1 ON devices(store_id, imei1);
    CREATE INDEX IF NOT EXISTS idx_devices_store_serial ON devices(store_id, serial_number);
    CREATE INDEX IF NOT EXISTS idx_devices_store_entry_date ON devices(store_id, entry_date);

    CREATE TABLE IF NOT EXISTS device_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      store_id INTEGER NOT NULL DEFAULT 1 REFERENCES stores(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name TEXT,
      action_type TEXT NOT NULL,
      description TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_device_history_device ON device_history(device_id);
    CREATE INDEX IF NOT EXISTS idx_device_history_store ON device_history(store_id);

    CREATE TABLE IF NOT EXISTS user_notification_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL DEFAULT 1,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL DEFAULT 'custom' CHECK(mode IN ('all', 'none', 'custom')),
      preferences TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(store_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_notif_pref_user ON user_notification_preferences(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_notif_pref_store ON user_notification_preferences(store_id);

    CREATE TABLE IF NOT EXISTS frontals_calculator (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL DEFAULT 1,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      base_value REAL NOT NULL DEFAULT 0,
      brand TEXT DEFAULT 'Apple',
      model TEXT,
      version TEXT DEFAULT 'primeira linha',
      entries TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS piece_calculator (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL DEFAULT 1,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      base_value REAL NOT NULL DEFAULT 0,
      entries TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pagbank_calculator (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL DEFAULT 1,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      value REAL NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL DEFAULT 1,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT,
      content TEXT,
      color_id INTEGER DEFAULT 1,
      archived INTEGER NOT NULL DEFAULT 0,
      trashed INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notes_store ON notes(store_id);

    CREATE TABLE IF NOT EXISTS labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL DEFAULT 1,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(store_id, user_id, name)
    );

    CREATE TABLE IF NOT EXISTS favorite_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL UNIQUE REFERENCES notes(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pinned_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL UNIQUE REFERENCES notes(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pinned_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS platform_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform_user_id INTEGER REFERENCES platform_users(id) ON DELETE SET NULL,
      platform_user_name TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      target_name TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_platform_audit_action ON platform_audit_logs(action);

    CREATE TABLE IF NOT EXISTS virus_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL DEFAULT 1,
      device_name TEXT,
      status TEXT DEFAULT 'completed',
      total_files INTEGER DEFAULT 0,
      threats_found INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS virus_scan_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER NOT NULL REFERENCES virus_scans(id) ON DELETE CASCADE,
      file_path TEXT,
      threat_name TEXT,
      severity TEXT,
      status TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL DEFAULT 1,
      purchase_number TEXT NOT NULL,
      origin_type TEXT NOT NULL CHECK (origin_type IN ('supplier', 'customer_trade')),
      supplier_id INTEGER REFERENCES stock_suppliers(id) ON DELETE SET NULL,
      supplier_name TEXT,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT,
      invoice_number TEXT,
      purchase_date TEXT NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      freight REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      payment_condition TEXT NOT NULL CHECK (payment_condition IN ('cash', 'installments')),
      payment_method TEXT,
      down_payment REAL NOT NULL DEFAULT 0,
      installments_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'canceled')),
      notes TEXT,
      idempotency_key TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by_name_snapshot TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(store_id, purchase_number)
    );
    CREATE INDEX IF NOT EXISTS idx_purchases_store_date ON purchases(store_id, purchase_date DESC, id DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_idempotency ON purchases(store_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL DEFAULT 1,
      purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL CHECK (item_type IN ('device', 'existing_accessory', 'new_accessory')),
      product_id INTEGER REFERENCES stock_products(id) ON DELETE SET NULL,
      device_id INTEGER,
      description TEXT NOT NULL,
      identifier TEXT,
      brand TEXT,
      model TEXT,
      storage TEXT,
      color TEXT,
      condition TEXT,
      category_id INTEGER,
      category_name TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_cost REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      sale_price REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_store ON purchase_items(store_id);

    CREATE TABLE IF NOT EXISTS accounts_payable (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL DEFAULT 1,
      purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
      supplier_id INTEGER REFERENCES stock_suppliers(id) ON DELETE SET NULL,
      supplier_name TEXT,
      origin_type TEXT NOT NULL DEFAULT 'manual' CHECK (origin_type IN ('purchase', 'manual')),
      category TEXT,
      description TEXT NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'canceled')),
      due_date TEXT NOT NULL,
      notes TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_payable_store_status ON accounts_payable(store_id, status, due_date);
    CREATE INDEX IF NOT EXISTS idx_accounts_payable_purchase ON accounts_payable(purchase_id);

    CREATE TABLE IF NOT EXISTS payable_installments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL DEFAULT 1,
      payable_id INTEGER NOT NULL REFERENCES accounts_payable(id) ON DELETE CASCADE,
      installment_number INTEGER NOT NULL DEFAULT 1,
      total_installments INTEGER NOT NULL DEFAULT 1,
      amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      due_date TEXT NOT NULL,
      paid_at TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'canceled')),
      payment_method TEXT,
      cash_withdrawal_id INTEGER REFERENCES cash_withdrawals(id) ON DELETE SET NULL,
      notified_due_soon_at TEXT,
      notified_overdue_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_payable_installments_store_due ON payable_installments(store_id, status, due_date);
    CREATE INDEX IF NOT EXISTS idx_payable_installments_payable ON payable_installments(payable_id);

    CREATE TABLE IF NOT EXISTS payable_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL DEFAULT 1,
      payable_id INTEGER NOT NULL REFERENCES accounts_payable(id) ON DELETE CASCADE,
      installment_id INTEGER NOT NULL REFERENCES payable_installments(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      cash_withdrawal_id INTEGER REFERENCES cash_withdrawals(id) ON DELETE SET NULL,
      idempotency_key TEXT,
      notes TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by_name_snapshot TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_payable_payments_store ON payable_payments(store_id, payment_date DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payable_payments_idempotency ON payable_payments(store_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
  `);

  // Garantir colunas ausentes em bancos SQLite pré-existentes sem recriar tabelas
  const hasCol = (table, column) => {
    try {
      return db.prepare(`PRAGMA table_info(${table})`).all().some(item => item.name === column);
    } catch {
      return false;
    }
  };
  const ensureColumn = (table, column, definition) => {
    if (!hasCol(table, column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  ensureColumn('stock_categories', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('stock_levels', 'updated_at', 'TEXT');
  ensureColumn('service_order_photos', 'original_name', 'TEXT');
  ensureColumn('service_order_photos', 'mime_type', 'TEXT');
  ensureColumn('service_order_photos', 'file_size', 'INTEGER');
  ensureColumn('service_order_photos', 'description', 'TEXT');
  ensureColumn('service_order_photos', 'created_by_name_snapshot', 'TEXT');

  // 2. Aplica migrações multi-tenant
  migrateMultiTenant(db);
  migrateConstraints(db);
  migrateCustomerDeletion(db);
  migrateCustomers2(db);
  migratePartsCatalog(db);
  migrateScreenProtectors(db);
  migrateChecklist(db);
  migrateTracking(db);
}

module.exports = { initSqliteTestSchema };
