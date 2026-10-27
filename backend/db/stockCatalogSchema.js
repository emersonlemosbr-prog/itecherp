module.exports = function migrateStockCatalog(db) {
  const hasColumn = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some(item => item.name === column);
  db.transaction(() => {
    if (!hasColumn('stock_suppliers', 'is_active')) db.exec('ALTER TABLE stock_suppliers ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
    if (!hasColumn('stock_categories', 'is_active')) db.exec('ALTER TABLE stock_categories ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
    if (!hasColumn('stock_products', 'image_url')) db.exec('ALTER TABLE stock_products ADD COLUMN image_url TEXT');
    if (!hasColumn('stock_products', 'image_public_id')) db.exec('ALTER TABLE stock_products ADD COLUMN image_public_id TEXT');
    if (!hasColumn('service_orders', 'supplier_name_snapshot')) db.exec('ALTER TABLE service_orders ADD COLUMN supplier_name_snapshot TEXT');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_stock_suppliers_active ON stock_suppliers(is_active, name);
      CREATE INDEX IF NOT EXISTS idx_stock_categories_active ON stock_categories(is_active, name);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_products_image_public_id
        ON stock_products(image_public_id) WHERE image_public_id IS NOT NULL;
      UPDATE service_orders SET supplier_name_snapshot =
        (SELECT name FROM stock_suppliers WHERE id = service_orders.supplier_id)
        WHERE supplier_id IS NOT NULL AND supplier_name_snapshot IS NULL;
    `);
  })();
};
