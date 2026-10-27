module.exports = function migrateTracking(db) {
  db.transaction(() => {
    if (!db.prepare('PRAGMA table_info(service_orders)').all().some(c => c.name === 'public_token_hash')) {
      db.exec('ALTER TABLE service_orders ADD COLUMN public_token_hash TEXT');
    }
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_so_public_token ON service_orders(public_token_hash);
      CREATE TABLE IF NOT EXISTS service_order_status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_order_id INTEGER NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_so_history ON service_order_status_history(service_order_id, id);
      INSERT INTO service_order_status_history(service_order_id, status, created_at)
        SELECT id, status, COALESCE(updated_at, created_at, datetime('now')) FROM service_orders so
        WHERE NOT EXISTS (SELECT 1 FROM service_order_status_history h WHERE h.service_order_id = so.id);
      CREATE TRIGGER IF NOT EXISTS so_tracking_insert AFTER INSERT ON service_orders BEGIN
        INSERT INTO service_order_status_history(service_order_id, status, created_at)
        VALUES (NEW.id, NEW.status, COALESCE(NEW.created_at, datetime('now')));
      END;
      CREATE TRIGGER IF NOT EXISTS so_tracking_status AFTER UPDATE OF status ON service_orders
      WHEN OLD.status IS NOT NEW.status BEGIN
        INSERT INTO service_order_status_history(service_order_id, status, created_at)
        VALUES (NEW.id, NEW.status, CASE WHEN NEW.updated_at IS NOT OLD.updated_at THEN NEW.updated_at ELSE datetime('now') END);
      END;
    `);
  })();
};
