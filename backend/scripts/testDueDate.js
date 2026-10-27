const db = require('../db/database');
const store = db.prepare('SELECT * FROM stores WHERE id = 1').get();
console.log('Current store:', store.name, 'due_date:', store.due_date);
const admin = db.prepare('SELECT * FROM platform_users LIMIT 1').get();
console.log('Admin:', admin.name, 'id:', admin.id);

const dueDate = '2099-12-31';
const finalGrace = 5;
const notes = 'Teste de alteracao';

try {
  db.transaction(() => {
    db.prepare("UPDATE stores SET due_date = ?, grace_period_days = ?, updated_at = datetime('now') WHERE id = ?").run(dueDate, finalGrace, store.id);
    db.prepare(`INSERT INTO store_subscription_history (
      store_id, action, previous_due_date, new_due_date, notes,
      performed_by_platform_user_id, performed_by_name
    ) VALUES (?, 'due_date_update', ?, ?, ?, ?, ?)`).run(
      store.id,
      store.due_date,
      dueDate,
      notes,
      admin.id,
      admin.name
    );
  })();
  console.log('Update success!');
} catch (e) {
  console.error('Error during transaction:', e);
}
