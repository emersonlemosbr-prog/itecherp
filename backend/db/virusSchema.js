const db = require('./database');

function ensureColumn(tableName, columnName, definition) {
  const existing = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!existing.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS virus_threat_signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_name TEXT,
  sha256 TEXT,
  app_name TEXT,
  threat_type TEXT,
  severity TEXT,
  reason TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS virus_scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_order_id INTEGER REFERENCES service_orders(id),
  device_serial TEXT,
  manufacturer TEXT,
  model TEXT,
  android_version TEXT,
  started_at TEXT,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  apps_analyzed INTEGER DEFAULT 0,
  threats_found INTEGER DEFAULT 0,
  threats_removed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS virus_scan_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL REFERENCES virus_scans(id) ON DELETE CASCADE,
  package_name TEXT,
  app_name TEXT,
  version_name TEXT,
  version_code TEXT,
  apk_path TEXT,
  sha256 TEXT,
  risk_score INTEGER DEFAULT 0,
  risk_level TEXT,
  threat_type TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'detected',
  protected INTEGER DEFAULT 0,
  removable INTEGER DEFAULT 1,
  removal_status TEXT DEFAULT 'pending',
  error_message TEXT,
  removed_by TEXT,
  removed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_virus_scans_service_order ON virus_scans(service_order_id);
CREATE INDEX IF NOT EXISTS idx_virus_scan_results_scan ON virus_scan_results(scan_id, risk_level);
CREATE INDEX IF NOT EXISTS idx_virus_signatures_package ON virus_threat_signatures(package_name);
`);

ensureColumn('virus_scan_results', 'protected', 'INTEGER DEFAULT 0');
ensureColumn('virus_scan_results', 'removable', 'INTEGER DEFAULT 1');
ensureColumn('virus_scan_results', 'removal_status', "TEXT DEFAULT 'pending'");
ensureColumn('virus_scan_results', 'error_message', 'TEXT');
ensureColumn('virus_scan_results', 'removed_by', 'TEXT');

module.exports = db;
