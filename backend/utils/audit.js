// utils/audit.js
const db = require('../db/database');

function logAction({ user, action, recordType, recordId, details }) {
  db.prepare(`
    INSERT INTO audit_log (user_id, user_name, action, record_type, record_id, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    user ? user.id : null,
    user ? user.full_name : 'sistema',
    action,
    recordType || null,
    recordId ? String(recordId) : null,
    details ? JSON.stringify(details) : null
  );
}

module.exports = { logAction };
