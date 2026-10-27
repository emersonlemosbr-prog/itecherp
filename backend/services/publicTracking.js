const crypto = require('crypto');

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

function generateTracking(db, id) {
  const base = new URL(process.env.PUBLIC_TRACKING_URL || `http://127.0.0.1:${require('../config/publicTracking').getListenConfig().port}`);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('PUBLIC_TRACKING_URL inválida');
  }
  const token = crypto.randomBytes(32).toString('hex');
  const result = db.prepare('UPDATE service_orders SET public_token_hash = ? WHERE id = ?').run(hashToken(token), id);
  return result.changes ? { url: `${base.origin}/acompanhamento/${token}` } : null;
}

function getPublicOrder(db, token) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hasStores = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stores'").get();
  const query = hasStores
    ? `SELECT so.id, so.order_number, c.first_name,
        TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS customer_name, so.brand, so.model,
        so.status, so.entry_date, so.updated_at, so.expected_delivery_date
        FROM service_orders so
        JOIN customers c ON c.id = so.customer_id
        LEFT JOIN stores s ON s.id = so.store_id
        WHERE so.public_token_hash = ?`
    : `SELECT so.id, so.order_number, c.first_name,
        TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS customer_name, so.brand, so.model,
        so.status, so.entry_date, so.updated_at, so.expected_delivery_date
        FROM service_orders so
        JOIN customers c ON c.id = so.customer_id
        WHERE so.public_token_hash = ?`;

  const row = db.prepare(query).get(hashToken(token));
  if (!row) return null;
  const { id, unlock_password, unlock_pattern, unlock_type, ...order } = row;
  order.first_name = (order.first_name || '').trim().split(/\s+/)[0];
  order.history = db.prepare('SELECT status, created_at FROM service_order_status_history WHERE service_order_id = ? ORDER BY id').all(id);
  return order;
}

module.exports = { hashToken, generateTracking, getPublicOrder };
