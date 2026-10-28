const crypto = require('crypto');

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

async function generateTracking(db, id) {
  const defaultPort = require('../config/publicTracking').getListenConfig().port;
  const base = new URL(process.env.PUBLIC_TRACKING_URL || `http://127.0.0.1:${defaultPort}`);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('PUBLIC_TRACKING_URL inválida');
  }
  const token = crypto.randomBytes(32).toString('hex');
  const result = await db.execute('UPDATE service_orders SET public_token_hash = $1 WHERE id = $2', [hashToken(token), id]);
  return result.rowCount ? { url: `${base.origin}/acompanhamento/${token}` } : null;
}

async function getPublicOrder(db, token) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const query = `
    SELECT so.id, so.order_number, c.first_name,
      TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS customer_name, so.brand, so.model,
      so.status, so.entry_date, so.updated_at, so.expected_delivery_date
    FROM service_orders so
    JOIN customers c ON c.id = so.customer_id
    LEFT JOIN stores s ON s.id = so.store_id
    WHERE so.public_token_hash = $1
  `;

  const row = await db.queryOne(query, [hashToken(token)]);
  if (!row) return null;
  const { id, unlock_password, unlock_pattern, unlock_type, ...order } = row;
  order.first_name = (order.first_name || '').trim().split(/\s+/)[0];
  order.history = await db.query('SELECT status, created_at FROM service_order_status_history WHERE service_order_id = $1 ORDER BY id', [id]);
  return order;
}

module.exports = { hashToken, generateTracking, getPublicOrder };
