module.exports = function migrateUserMaster(db) {
  const hasColumn = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some(item => item.name === column);
  db.transaction(() => {
    if (!hasColumn('users', 'is_master')) db.exec('ALTER TABLE users ADD COLUMN is_master INTEGER NOT NULL DEFAULT 0');
    const snapshotColumns = [
      ['service_orders', 'created_by_name_snapshot'], ['cash_withdrawals', 'created_by_name_snapshot'],
      ['device_sales', 'created_by_name_snapshot'], ['stock_products', 'created_by_name_snapshot'],
      ['store_sales', 'created_by_name_snapshot'], ['store_sales', 'canceled_by_name_snapshot'],
      ['service_order_photos', 'created_by_name_snapshot'], ['screen_protector_groups', 'created_by_name_snapshot'],
    ];
    for (const [table, column] of snapshotColumns) if (!hasColumn(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`);
    if (!db.prepare('SELECT id FROM users WHERE is_master=1').get()) {
      const activeAdmin = db.prepare(`SELECT id FROM users WHERE role='admin'${hasColumn('users','active') ? ' AND active=1' : ''} ORDER BY id LIMIT 1`).get();
      if (activeAdmin) db.prepare('UPDATE users SET is_master=1 WHERE id=?').run(activeAdmin.id);
    }
    db.exec('DROP INDEX IF EXISTS idx_users_single_master');
    if (hasColumn('users', 'store_id')) {
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_master ON users(store_id, is_master) WHERE is_master=1');
    } else {
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_master ON users(is_master) WHERE is_master=1');
    }
    db.exec(`
      UPDATE service_orders SET created_by_name_snapshot=(SELECT full_name FROM users WHERE id=service_orders.created_by) WHERE created_by IS NOT NULL AND created_by_name_snapshot IS NULL;
      UPDATE cash_withdrawals SET created_by_name_snapshot=(SELECT full_name FROM users WHERE id=cash_withdrawals.created_by) WHERE created_by IS NOT NULL AND created_by_name_snapshot IS NULL;
      UPDATE device_sales SET created_by_name_snapshot=(SELECT full_name FROM users WHERE id=device_sales.created_by) WHERE created_by IS NOT NULL AND created_by_name_snapshot IS NULL;
      UPDATE stock_products SET created_by_name_snapshot=(SELECT full_name FROM users WHERE id=stock_products.created_by) WHERE created_by IS NOT NULL AND created_by_name_snapshot IS NULL;
      UPDATE store_sales SET created_by_name_snapshot=(SELECT full_name FROM users WHERE id=store_sales.created_by) WHERE created_by IS NOT NULL AND created_by_name_snapshot IS NULL;
      UPDATE store_sales SET canceled_by_name_snapshot=(SELECT full_name FROM users WHERE id=store_sales.canceled_by) WHERE canceled_by IS NOT NULL AND canceled_by_name_snapshot IS NULL;
      UPDATE service_order_photos SET created_by_name_snapshot=(SELECT full_name FROM users WHERE id=service_order_photos.created_by) WHERE created_by IS NOT NULL AND created_by_name_snapshot IS NULL;
      UPDATE screen_protector_groups SET created_by_name_snapshot=(SELECT full_name FROM users WHERE id=screen_protector_groups.created_by) WHERE created_by IS NOT NULL AND created_by_name_snapshot IS NULL;
    `);
  })();
};
