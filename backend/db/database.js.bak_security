// db/database.js
// Cria/abre o banco SQLite e garante que o schema exista.
// Trocar para MySQL no futuro exige apenas reescrever esta camada de acesso
// (os módulos de rotas usam apenas os métodos db.prepare/db.exec padrão).

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let DB_PATH = process.env.ITECH_DB_PATH || path.join(__dirname, 'itech.db');
if (DB_PATH && DB_PATH !== ':memory:') {
  try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); } catch (_) {}
}
let db;
try {
  db = new Database(DB_PATH);
} catch (err) {
  const fallback = path.join(__dirname, 'itech.db');
  console.warn(`[DATABASE] Falha ao abrir ${DB_PATH}: ${err.message}. Usando fallback: ${fallback}`);
  db = new Database(fallback);
}

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','employee')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date TEXT,
  address TEXT,
  phone TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
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
  additional_costs REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'pending' CHECK(payment_method IN ('pix','cash','credit_card','debit_card','credit_account','not_performed','pending')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('paid','pending','credit_account','not_performed')),
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','diagnosis','waiting_parts','repairing','ready','delivered','not_performed')),
  warranty_days INTEGER DEFAULT 90,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_order_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_order_id INTEGER NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  photo_type TEXT DEFAULT 'Sem classificação',
  description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS warranties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_order_id INTEGER NOT NULL REFERENCES service_orders(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  pickup_date TEXT,
  warranty_start TEXT NOT NULL,
  warranty_end TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  amount_paid REAL DEFAULT 0,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS credit_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  service_order_id INTEGER REFERENCES service_orders(id),
  description TEXT,
  amount REAL NOT NULL,
  pickup_date TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','paid')),
  paid_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cash_withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount REAL NOT NULL,
  reason TEXT NOT NULL,
  withdrawal_date TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS financial_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  revenue REAL NOT NULL DEFAULT 0,
  received REAL NOT NULL DEFAULT 0,
  pending REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL DEFAULT 0,
  net_profit REAL NOT NULL DEFAULT 0,
  total_services INTEGER NOT NULL DEFAULT 0,
  total_sales INTEGER NOT NULL DEFAULT 0,
  average_ticket REAL NOT NULL DEFAULT 0,
  cash_total REAL NOT NULL DEFAULT 0,
  pix_total REAL NOT NULL DEFAULT 0,
  card_total REAL NOT NULL DEFAULT 0,
  other_total REAL NOT NULL DEFAULT 0,
  expenses REAL NOT NULL DEFAULT 0,
  opened_at TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(year, month)
);

CREATE TABLE IF NOT EXISTS financial_history_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_closed_year INTEGER,
  last_closed_month INTEGER CHECK(last_closed_month BETWEEN 1 AND 12),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  user_name TEXT,
  action TEXT NOT NULL,
  record_type TEXT,
  record_id TEXT,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pagbank_calculator (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  value REAL NOT NULL DEFAULT 100,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS piece_calculator (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  base_value REAL NOT NULL DEFAULT 0,
  entries TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS frontals_calculator (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  base_value REAL NOT NULL DEFAULT 0,
  brand TEXT DEFAULT 'Apple',
  model TEXT,
  version TEXT DEFAULT 'primeira linha',
  entries TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS frontals_price_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT 'primeira linha',
  cost_price REAL NOT NULL,
  sale_price REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS device_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
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
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  contact_info TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  model TEXT,
  code TEXT NOT NULL UNIQUE,
  barcode TEXT,
  category_id INTEGER REFERENCES stock_categories(id) ON DELETE SET NULL,
  supplier_id INTEGER REFERENCES stock_suppliers(id) ON DELETE SET NULL,
  cost_price REAL NOT NULL DEFAULT 0,
  sale_price REAL NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_levels (
  product_id INTEGER PRIMARY KEY REFERENCES stock_products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK(movement_type IN ('entry','exit','adjustment','sale')),
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
  sale_number TEXT NOT NULL UNIQUE,
  subtotal REAL NOT NULL DEFAULT 0,
  discount_type TEXT CHECK(discount_type IN ('value','percent')),
  discount_value REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','pix','debit_card','credit_card')),
  notes TEXT,
  is_canceled INTEGER NOT NULL DEFAULT 0,
  canceled_at TEXT,
  canceled_by INTEGER REFERENCES users(id),
  cancel_reason TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS store_sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES store_sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES stock_products(id),
  product_name TEXT NOT NULL,
  product_code TEXT,
  cost_price REAL NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  subtotal REAL NOT NULL,
  is_canceled INTEGER NOT NULL DEFAULT 0,
  canceled_at TEXT
);

CREATE TABLE IF NOT EXISTS note_colors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  bg_color TEXT NOT NULL,
  border_color TEXT NOT NULL,
  text_color TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT,
  content TEXT,
  color_id INTEGER REFERENCES note_colors(id),
  archived INTEGER NOT NULL DEFAULT 0,
  trashed INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS note_checklists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  is_checked INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS note_labels (
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (note_id, label_id)
);

CREATE TABLE IF NOT EXISTS note_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL CHECK(file_type IN ('image', 'file')),
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS note_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  remind_at TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  notified_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS favorite_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL UNIQUE REFERENCES notes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pinned_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL UNIQUE REFERENCES notes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  pinned_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO note_colors (id, name, bg_color, border_color, text_color) VALUES
  (1, 'Cinza escuro (Padrão)', '#1e1e1e', '#464646', '#ffffff'),
  (2, 'Branco', '#ffffff', '#d1d5db', '#111827'),
  (3, 'Preto', '#000000', '#333333', '#ffffff'),
  (4, 'Vermelho', '#b91c1c', '#ef4444', '#ffffff'),
  (5, 'Azul', '#1d4ed8', '#60a5fa', '#ffffff'),
  (6, 'Verde', '#15803d', '#4ade80', '#ffffff'),
  (7, 'Amarelo', '#facc15', '#f59e0b', '#111827'),
  (8, 'Laranja', '#ea580c', '#fb923c', '#ffffff')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  bg_color = excluded.bg_color,
  border_color = excluded.border_color,
  text_color = excluded.text_color;

UPDATE notes SET color_id = 1 WHERE color_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_so_customer ON service_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_so_status ON service_orders(status);
CREATE INDEX IF NOT EXISTS idx_so_number ON service_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_credit_status ON credit_accounts(status);
CREATE INDEX IF NOT EXISTS idx_warranty_end ON warranties(warranty_end);
CREATE INDEX IF NOT EXISTS idx_pagbank_user ON pagbank_calculator(user_id);
CREATE INDEX IF NOT EXISTS idx_piece_user ON piece_calculator(user_id);
CREATE INDEX IF NOT EXISTS idx_frontals_user ON frontals_calculator(user_id);
CREATE INDEX IF NOT EXISTS idx_frontals_price_list_user ON frontals_price_list(user_id);
CREATE INDEX IF NOT EXISTS idx_device_sales_order_number ON device_sales(order_number);
CREATE INDEX IF NOT EXISTS idx_device_sales_customer ON device_sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_device_sales_sale_date ON device_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_stock_products_name ON stock_products(name);
CREATE INDEX IF NOT EXISTS idx_stock_products_code ON stock_products(code);
CREATE INDEX IF NOT EXISTS idx_stock_products_category ON stock_products(category_id);
CREATE INDEX IF NOT EXISTS idx_stock_products_supplier ON stock_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_sales_date ON store_sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_sales_number ON store_sales(sale_number);
CREATE INDEX IF NOT EXISTS idx_store_sale_items_sale ON store_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_financial_history_period ON financial_history(year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_trashed ON notes(trashed, deleted_at);
CREATE INDEX IF NOT EXISTS idx_note_checklists_note ON note_checklists(note_id, position);
CREATE INDEX IF NOT EXISTS idx_labels_user_name ON labels(user_id, name);
CREATE INDEX IF NOT EXISTS idx_note_attachments_note ON note_attachments(note_id);
CREATE INDEX IF NOT EXISTS idx_note_reminders_due ON note_reminders(remind_at, done);
CREATE INDEX IF NOT EXISTS idx_favorite_notes_user ON favorite_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_pinned_notes_user_order ON pinned_notes(user_id, pinned_order);
`);

function hasColumn(table, column) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  return columns.some((c) => c.name === column);
}

if (!hasColumn('stock_products', 'is_active')) {
  db.exec('ALTER TABLE stock_products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
}

if (!hasColumn('stock_products', 'deleted_at')) {
  db.exec('ALTER TABLE stock_products ADD COLUMN deleted_at TEXT');
}

if (!hasColumn('store_sale_items', 'cost_price')) {
  db.exec('ALTER TABLE store_sale_items ADD COLUMN cost_price REAL NOT NULL DEFAULT 0');
}

if (!hasColumn('store_sales', 'is_canceled')) {
  db.exec('ALTER TABLE store_sales ADD COLUMN is_canceled INTEGER NOT NULL DEFAULT 0');
}

if (!hasColumn('store_sales', 'canceled_at')) {
  db.exec('ALTER TABLE store_sales ADD COLUMN canceled_at TEXT');
}

if (!hasColumn('store_sales', 'canceled_by')) {
  db.exec('ALTER TABLE store_sales ADD COLUMN canceled_by INTEGER REFERENCES users(id)');
}

if (!hasColumn('store_sales', 'cancel_reason')) {
  db.exec('ALTER TABLE store_sales ADD COLUMN cancel_reason TEXT');
}

if (!hasColumn('store_sale_items', 'is_canceled')) {
  db.exec('ALTER TABLE store_sale_items ADD COLUMN is_canceled INTEGER NOT NULL DEFAULT 0');
}

if (!hasColumn('store_sale_items', 'canceled_at')) {
  db.exec('ALTER TABLE store_sale_items ADD COLUMN canceled_at TEXT');
}

if (!hasColumn('financial_history', 'opened_at')) {
  db.exec("ALTER TABLE financial_history ADD COLUMN opened_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'");
}

if (!hasColumn('financial_history', 'closed_at')) {
  db.exec("ALTER TABLE financial_history ADD COLUMN closed_at TEXT NOT NULL DEFAULT '1970-01-01 23:59:59'");
}

db.exec('CREATE INDEX IF NOT EXISTS idx_store_sales_canceled ON store_sales(is_canceled, created_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_store_sale_items_canceled ON store_sale_items(is_canceled, sale_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_financial_history_period ON financial_history(year DESC, month DESC)');

require('./serviceOrderPhotoSchema')(db);
require('./trackingSchema')(db);
require('./serviceOrderPartsSchema')(db);
require('./stockCatalogSchema')(db);
require('./customerDeletionSchema')(db);
require('./screenProtectorsSchema')(db);
require('./userMasterSchema')(db);
require('./partsCatalogSchema')(db);
require('./partsModelsSchema')(db);
require('./multiTenantSchema')(db);
require('./multiTenantConstraints')(db);
require('./serviceOrderChecklistSchema')(db);
module.exports = db;


