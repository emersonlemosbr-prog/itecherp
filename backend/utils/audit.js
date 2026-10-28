// utils/audit.js
const db = require('../db/database');

async function logAction({ user, action, recordType, recordId, details, storeId }) {
  try {
    const sId = storeId || user?.store_id || 1;
    await db.query(`
      INSERT INTO audit_log (store_id, user_id, user_name, action, record_type, record_id, details)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      sId,
      user ? user.id : null,
      user ? (user.full_name || user.username) : 'sistema',
      action,
      recordType || null,
      recordId ? String(recordId) : null,
      details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null
    ]);
  } catch (err) {
    console.error('[AUDIT_ERROR] Falha ao registrar log de auditoria:', err.message);
  }
}

module.exports = { logAction };
