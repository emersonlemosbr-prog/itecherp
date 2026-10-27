const db = require('../db/database');
for (const t of ['stock_products', 'stock_categories', 'stock_suppliers', 'service_orders', 'store_sales', 'device_sales']) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(t);
  console.log(`=== ${t} ===\n${row?.sql}\n`);
}
