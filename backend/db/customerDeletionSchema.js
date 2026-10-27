module.exports = function migrateCustomerDeletion(db) {
  const hasColumn = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some(item => item.name === column);
  db.transaction(() => {
    if (!hasColumn('customers', 'is_system')) db.exec('ALTER TABLE customers ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0');
    for (const table of ['service_orders', 'credit_accounts', 'warranties']) {
      if (!hasColumn(table, 'customer_name_snapshot')) db.exec(`ALTER TABLE ${table} ADD COLUMN customer_name_snapshot TEXT`);
    }
    if (!hasColumn('service_orders', 'customer_phone_snapshot')) db.exec('ALTER TABLE service_orders ADD COLUMN customer_phone_snapshot TEXT');
    if (!hasColumn('service_orders', 'customer_address_snapshot')) db.exec('ALTER TABLE service_orders ADD COLUMN customer_address_snapshot TEXT');
    db.exec(`
      UPDATE service_orders SET
        customer_name_snapshot=(SELECT trim(first_name || ' ' || last_name) FROM customers WHERE id=service_orders.customer_id),
        customer_phone_snapshot=(SELECT phone FROM customers WHERE id=service_orders.customer_id),
        customer_address_snapshot=(SELECT address FROM customers WHERE id=service_orders.customer_id)
      WHERE customer_name_snapshot IS NULL;
      UPDATE credit_accounts SET customer_name_snapshot=(SELECT trim(first_name || ' ' || last_name) FROM customers WHERE id=credit_accounts.customer_id)
      WHERE customer_name_snapshot IS NULL;
      UPDATE warranties SET customer_name_snapshot=(SELECT trim(first_name || ' ' || last_name) FROM customers WHERE id=warranties.customer_id)
      WHERE customer_name_snapshot IS NULL;
      INSERT INTO customers(first_name,last_name,is_system)
      SELECT 'Cadastro excluído','(histórico)',1
      WHERE NOT EXISTS(SELECT 1 FROM customers WHERE is_system=1);
    `);
  })();
};
