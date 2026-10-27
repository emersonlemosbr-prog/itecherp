const db = require('../db/database');

const defaultPermissions = Object.fromEntries(
  ['customers','create_customer','edit_customer','orders','create_order','edit_order','finish_order',
   'warranties','inventory','store_sales','device_sales','credits','android','notes','printing']
    .map(key => [key, false])
);

function userView(user) {
  let saved = {};
  try { saved = JSON.parse(user.permissions || '{}'); } catch {}
  const { password_hash, ...safe } = user;
  return {
    ...safe,
    store_id: user.store_id || 1,
    active: !!user.active,
    is_master: !!user.is_master,
    permissions: user.role === 'admin'
      ? Object.fromEntries(Object.keys(defaultPermissions).map(key => [key, true]))
      : { ...defaultPermissions, ...saved }
  };
}
function hasColumn(table, col) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
  } catch {
    return false;
  }
}

function row(storeId = 1) {
  if (hasColumn('system_settings', 'store_id')) {
    return db.prepare('SELECT * FROM system_settings WHERE store_id=?').get(storeId) ||
           db.prepare('SELECT * FROM system_settings WHERE id=1').get();
  }
  return db.prepare('SELECT * FROM system_settings WHERE id=1').get();
}

function readSettings(storeId = 1) {
  const current = row(storeId);
  if (!current) throw new Error('Configurações do sistema não encontradas.');
  return JSON.parse(current.value);
}

function sequences(storeId = 1) {
  if (hasColumn('document_sequences', 'store_id')) {
    return Object.fromEntries(db.prepare('SELECT kind, next_value FROM document_sequences WHERE store_id=?').all(storeId)
      .map(({ kind, next_value }) => [kind, next_value]));
  }
  return Object.fromEntries(db.prepare('SELECT kind, next_value FROM document_sequences').all()
    .map(({ kind, next_value }) => [kind, next_value]));
}

function nextNumber(kind, storeId = 1) {
  return db.transaction(() => {
    if (hasColumn('document_sequences', 'store_id')) {
      let current = db.prepare('SELECT next_value FROM document_sequences WHERE store_id=? AND kind=?').get(storeId, kind);
      if (!current) {
        db.prepare('INSERT OR IGNORE INTO document_sequences (store_id, kind, next_value) VALUES (?, ?, 1)').run(storeId, kind);
        current = { next_value: 1 };
      }
      db.prepare('UPDATE document_sequences SET next_value=? WHERE store_id=? AND kind=?').run(current.next_value + 1, storeId, kind);
      return current.next_value;
    }
    let current = db.prepare('SELECT next_value FROM document_sequences WHERE kind=?').get(kind);
    if (!current) {
      db.prepare('INSERT OR IGNORE INTO document_sequences (kind, next_value) VALUES (?, 1)').run(kind);
      current = { next_value: 1 };
    }
    db.prepare('UPDATE document_sequences SET next_value=? WHERE kind=?').run(current.next_value + 1, kind);
    return current.next_value;
  })();
}
module.exports = { defaultPermissions, userView, readSettings, sequences, nextNumber, row };

