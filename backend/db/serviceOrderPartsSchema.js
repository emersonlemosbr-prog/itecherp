module.exports = function migrateServiceOrderParts(db) {
  const hasColumn = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some(item => item.name === column);

  db.transaction(() => {
    if (!hasColumn('stock_suppliers', 'notes')) {
      db.exec('ALTER TABLE stock_suppliers ADD COLUMN notes TEXT');
    }
    if (!hasColumn('service_orders', 'supplier_id')) {
      db.exec('ALTER TABLE service_orders ADD COLUMN supplier_id INTEGER REFERENCES stock_suppliers(id) ON DELETE SET NULL');
    }
    if (!hasColumn('cash_withdrawals', 'source_type')) {
      db.exec("ALTER TABLE cash_withdrawals ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual' CHECK(source_type IN ('manual', 'service_order_part'))");
    }
    if (!hasColumn('cash_withdrawals', 'service_order_id')) {
      db.exec('ALTER TABLE cash_withdrawals ADD COLUMN service_order_id INTEGER REFERENCES service_orders(id) ON DELETE RESTRICT');
    }
    if (!hasColumn('cash_withdrawals', 'supplier_id')) {
      db.exec('ALTER TABLE cash_withdrawals ADD COLUMN supplier_id INTEGER REFERENCES stock_suppliers(id) ON DELETE SET NULL');
    }
    if (!hasColumn('cash_withdrawals', 'supplier_name')) {
      db.exec('ALTER TABLE cash_withdrawals ADD COLUMN supplier_name TEXT');
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_service_orders_supplier ON service_orders(supplier_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_withdrawals_service_order_part
        ON cash_withdrawals(service_order_id) WHERE source_type = 'service_order_part';
    `);
  })();
};
