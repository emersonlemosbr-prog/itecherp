const path = require('path');
// Open the existing schema without running unrelated startup data migrations.
const db = new (require('better-sqlite3'))(process.env.ITECH_DB_PATH || path.join(__dirname, '..', 'db', 'itech.db'), { fileMustExist: true });
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
const { recordOnDelivery } = require('../services/serviceOrderPartWithdrawal');

const apply = process.argv.includes('--apply');

const eligibleSql = `
  SELECT so.*, s.name AS supplier_name,
    (SELECT MIN(h.created_at)
       FROM service_order_status_history h
      WHERE h.service_order_id = so.id AND h.status = 'delivered') AS delivered_history,
    (SELECT w.id
       FROM cash_withdrawals w
      WHERE w.service_order_id = so.id AND w.source_type = 'service_order_part') AS withdrawal_id
  FROM service_orders so
  LEFT JOIN stock_suppliers s ON s.id = so.supplier_id
  WHERE so.status = 'delivered' AND so.parts_cost > 0
  ORDER BY so.id
`;

function historicalDate(order) {
  const value = order.delivery_date || order.delivered_history || order.updated_at || order.created_at;
  if (!value) throw new Error(`A OS ${order.order_number} não possui data histórica segura.`);
  return String(value).slice(0, 10);
}

const eligible = db.prepare(eligibleSql).all();
const missing = eligible.filter(order => !order.withdrawal_id);
const report = {
  database: path.resolve(process.env.ITECH_DB_PATH || path.join(__dirname, '..', 'db', 'itech.db')),
  mode: apply ? 'apply' : 'dry-run',
  analyzed: db.prepare('SELECT COUNT(*) AS n FROM service_orders').get().n,
  with_parts_cost: db.prepare('SELECT COUNT(*) AS n FROM service_orders WHERE parts_cost > 0').get().n,
  with_supplier: db.prepare('SELECT COUNT(*) AS n FROM service_orders WHERE supplier_id IS NOT NULL').get().n,
  eligible: eligible.length,
  already_existing: eligible.length - missing.length,
  missing_before: missing.length,
  missing_orders: missing.map(o => ({ id: o.id, order_number: o.order_number, parts_cost: o.parts_cost, date: historicalDate(o) })),
  created: [],
};

if (apply) {
  db.transaction(() => {
    // Re-read under the write lock to avoid using an OS edited after the audit.
    for (const order of db.prepare(eligibleSql).all().filter(item => !item.withdrawal_id)) {
      const withdrawalDate = historicalDate(order);
      const existing = db.prepare("SELECT id FROM cash_withdrawals WHERE service_order_id=? AND source_type='service_order_part'").get(order.id);
      if (existing) continue;
      const withdrawalId = recordOnDelivery(db, null, { ...order, delivery_date: withdrawalDate }, withdrawalDate, order.created_by);
      report.created.push({
        withdrawal_id: withdrawalId, service_order_id: order.id,
        order_number: order.order_number, parts_cost: order.parts_cost,
        supplier: order.supplier_name, status: order.status, withdrawal_date: withdrawalDate,
      });
    }
  }).immediate();
}

report.remaining_missing = db.prepare(`
  SELECT COUNT(*) AS n FROM service_orders so
  LEFT JOIN stock_suppliers s ON s.id = so.supplier_id
  WHERE so.status = 'delivered' AND so.parts_cost > 0
    AND NOT EXISTS (
      SELECT 1 FROM cash_withdrawals w
      WHERE w.service_order_id = so.id AND w.source_type = 'service_order_part'
    )
`).get().n;
report.duplicates = db.prepare(`
  SELECT COUNT(*) AS n FROM (
    SELECT service_order_id FROM cash_withdrawals
    WHERE source_type = 'service_order_part'
    GROUP BY service_order_id HAVING COUNT(*) > 1
  )
`).get().n;
report.manual_total = db.prepare("SELECT COUNT(*) AS n FROM cash_withdrawals WHERE source_type = 'manual'").get().n;

console.log(JSON.stringify(report, null, 2));

db.close();
