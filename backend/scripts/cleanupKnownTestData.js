const db = require('../db/database');
const { computeMonthlySnapshot } = require('../utils/financialHistory');
const apply = process.argv.includes('--apply');

const customerIds = [74, 75, 77, 78, 80, 81, 95, 127];
const deviceSaleIds = [7, 8, 9, 10, 11];
const productIds = [14, 15, 16, 17, 18, 20];
const supplierIds = [5, 6];
const categoryIds = [3];
const serviceOrderIds = [169];

const placeholders = values => values.map(() => '?').join(',');
const list = (table, ids) => db.prepare(`SELECT * FROM ${table} WHERE id IN (${placeholders(ids)}) ORDER BY id`).all(...ids);
const report = {
  mode: apply ? 'apply' : 'dry-run',
  candidates: {
    customers: list('customers', customerIds).map(row => ({ id: row.id, name: `${row.first_name} ${row.last_name}` })),
    device_sales: list('device_sales', deviceSaleIds).map(row => ({ id: row.id, order_number: row.order_number, customer_name: row.customer_name })),
    products: list('stock_products', productIds).map(row => ({ id: row.id, name: row.name, code: row.code })),
    suppliers: list('stock_suppliers', supplierIds).map(row => ({ id: row.id, name: row.name })),
    categories: list('stock_categories', categoryIds).map(row => ({ id: row.id, name: row.name })),
    service_orders: list('service_orders', serviceOrderIds).map(row => ({ id: row.id, order_number: row.order_number, description: row.description })),
  },
  removed: {},
};

// Safety: refuse if the exact known signatures no longer match this audited dataset.
if (report.candidates.device_sales.some(row => !/^Cliente Device \d+$/.test(row.customer_name))) throw new Error('Assinatura inesperada em device_sales; limpeza cancelada.');
if (report.candidates.products.some(row => !/^TEST-\d+$|^FOTO-\d+$/.test(row.code))) throw new Error('Assinatura inesperada em stock_products; limpeza cancelada.');
if (report.candidates.service_orders.some(row => !/Teste de integra/i.test(row.description || ''))) throw new Error('Assinatura inesperada na OS de teste; limpeza cancelada.');

if (apply) db.transaction(() => {
  const remove = (key, sql, params = []) => { report.removed[key] = db.prepare(sql).run(...params).changes; };
  const notes = deviceSaleIds.map(id => `device_sale:${id}`);
  const storeSaleIds = db.prepare(`SELECT id FROM store_sales WHERE notes IN (${placeholders(notes)})`).all(...notes).map(row => row.id);
  if (storeSaleIds.length) {
    remove('store_sale_items', `DELETE FROM store_sale_items WHERE sale_id IN (${placeholders(storeSaleIds)})`, storeSaleIds);
    remove('store_sales', `DELETE FROM store_sales WHERE id IN (${placeholders(storeSaleIds)})`, storeSaleIds);
  }
  remove('device_sales', `DELETE FROM device_sales WHERE id IN (${placeholders(deviceSaleIds)})`, deviceSaleIds);
  remove('stock_movements', `DELETE FROM stock_movements WHERE product_id IN (${placeholders(productIds)})`, productIds);
  remove('stock_levels', `DELETE FROM stock_levels WHERE product_id IN (${placeholders(productIds)})`, productIds);
  remove('stock_products', `DELETE FROM stock_products WHERE id IN (${placeholders(productIds)})`, productIds);

  remove('cash_withdrawals', `DELETE FROM cash_withdrawals WHERE service_order_id IN (${placeholders(serviceOrderIds)})`, serviceOrderIds);
  remove('service_order_photos', `DELETE FROM service_order_photos WHERE service_order_id IN (${placeholders(serviceOrderIds)})`, serviceOrderIds);
  remove('service_order_status_history', `DELETE FROM service_order_status_history WHERE service_order_id IN (${placeholders(serviceOrderIds)})`, serviceOrderIds);
  remove('warranties', `DELETE FROM warranties WHERE service_order_id IN (${placeholders(serviceOrderIds)})`, serviceOrderIds);
  remove('credit_accounts', `DELETE FROM credit_accounts WHERE service_order_id IN (${placeholders(serviceOrderIds)})`, serviceOrderIds);
  remove('service_orders', `DELETE FROM service_orders WHERE id IN (${placeholders(serviceOrderIds)})`, serviceOrderIds);
  remove('customers', `DELETE FROM customers WHERE id IN (${placeholders(customerIds)})`, customerIds);
  remove('stock_suppliers', `DELETE FROM stock_suppliers WHERE id IN (${placeholders(supplierIds)})`, supplierIds);
  remove('stock_categories', `DELETE FROM stock_categories WHERE id IN (${placeholders(categoryIds)})`, categoryIds);
  remove('audit_log', `DELETE FROM audit_log WHERE
    (record_type='customer' AND record_id IN (${placeholders(customerIds.map(String))})) OR
    (record_type='service_order' AND record_id IN (${placeholders(serviceOrderIds.map(String))})) OR
    (record_type='stock_product' AND record_id IN (${placeholders(productIds.map(String))})) OR
    (record_type='device_sale' AND record_id IN (${placeholders(deviceSaleIds.map(String))})) OR
    (record_type='cash_withdrawal' AND record_id='15')`, [...customerIds.map(String), ...serviceOrderIds.map(String), ...productIds.map(String), ...deviceSaleIds.map(String)]);
  remove('future_financial_history', 'DELETE FROM financial_history WHERE year=2050 AND month=11');

  const snapshot = computeMonthlySnapshot(2026, 9);
  db.prepare(`UPDATE financial_history SET revenue=@revenue,received=@received,pending=@pending,profit=@profit,net_profit=@net_profit,
    total_services=@total_services,total_sales=@total_sales,average_ticket=@average_ticket,cash_total=@cash_total,pix_total=@pix_total,
    card_total=@card_total,other_total=@other_total,expenses=@expenses,opened_at=@opened_at,closed_at=@closed_at WHERE year=@year AND month=@month`).run(snapshot);
})();

report.remaining = {
  customers: db.prepare(`SELECT COUNT(*) n FROM customers WHERE id IN (${placeholders(customerIds)})`).get(...customerIds).n,
  device_sales: db.prepare(`SELECT COUNT(*) n FROM device_sales WHERE id IN (${placeholders(deviceSaleIds)})`).get(...deviceSaleIds).n,
  products: db.prepare(`SELECT COUNT(*) n FROM stock_products WHERE id IN (${placeholders(productIds)})`).get(...productIds).n,
  service_orders: db.prepare(`SELECT COUNT(*) n FROM service_orders WHERE id IN (${placeholders(serviceOrderIds)})`).get(...serviceOrderIds).n,
  suppliers: db.prepare(`SELECT COUNT(*) n FROM stock_suppliers WHERE id IN (${placeholders(supplierIds)})`).get(...supplierIds).n,
  categories: db.prepare(`SELECT COUNT(*) n FROM stock_categories WHERE id IN (${placeholders(categoryIds)})`).get(...categoryIds).n,
};
console.log(JSON.stringify(report, null, 2));
