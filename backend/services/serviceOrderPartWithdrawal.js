function normalizePartDetails(db, costValue, supplierValue) {
  const partsCost = Number(costValue ?? 0);
  if (!Number.isFinite(partsCost) || partsCost < 0) {
    const error = new Error('Informe um custo de peça válido.');
    error.statusCode = 400;
    throw error;
  }
  const supplierId = supplierValue === '' || supplierValue == null ? null : Number(supplierValue);
  if (supplierId !== null && (!Number.isSafeInteger(supplierId) || supplierId < 1)) {
    const error = new Error('Selecione um fornecedor válido.');
    error.statusCode = 400;
    throw error;
  }
  if (supplierId !== null && !db.prepare('SELECT id FROM stock_suppliers WHERE id = ?').get(supplierId)) {
    const error = new Error('Fornecedor não encontrado.');
    error.statusCode = 400;
    throw error;
  }
  return { partsCost, supplierId };
}

function recordOnDelivery(db, previousStatus, order, trustedNow, createdBy) {
  // Synchronize only the persistent automatic origin; manual entries are untouched.
  const existing = db.prepare("SELECT id FROM cash_withdrawals WHERE service_order_id = ? AND source_type = 'service_order_part'").get(order.id);
  if (Number(order.parts_cost) <= 0) {
    if (existing) db.prepare("DELETE FROM cash_withdrawals WHERE id = ? AND source_type = 'service_order_part'").run(existing.id);
    return null;
  }
  if (order.status !== 'delivered') return existing?.id || null;
  const supplier = order.supplier_id ? db.prepare('SELECT name FROM stock_suppliers WHERE id = ?').get(order.supplier_id) : null;
  const reason = `Peça utilizada na ${order.order_number}`;
  const storeId = order.store_id || 1;
  db.prepare(`
    INSERT INTO cash_withdrawals
      (store_id, amount, reason, withdrawal_date, notes, created_by, source_type, service_order_id, supplier_id, supplier_name)
    VALUES (?, ?, ?, ?, NULL, ?, 'service_order_part', ?, ?, ?)
    ON CONFLICT(service_order_id) WHERE source_type = 'service_order_part'
    DO UPDATE SET store_id = excluded.store_id, amount = excluded.amount, reason = excluded.reason,
      supplier_id = excluded.supplier_id, supplier_name = excluded.supplier_name
  `).run(storeId, order.parts_cost, reason, order.delivery_date || trustedNow.slice(0, 10), createdBy || null, order.id, order.supplier_id || null, supplier?.name || null);
  return db.prepare("SELECT id FROM cash_withdrawals WHERE service_order_id = ? AND source_type = 'service_order_part'").get(order.id).id;
}

module.exports = { normalizePartDetails, recordOnDelivery };
