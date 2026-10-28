// services/serviceOrderPartWithdrawal.js
async function normalizePartDetails(db, costValue, supplierValue) {
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
  if (supplierId !== null) {
    const supp = await db.queryOne('SELECT id FROM stock_suppliers WHERE id = $1', [supplierId]);
    if (!supp) {
      const error = new Error('Fornecedor não encontrado.');
      error.statusCode = 400;
      throw error;
    }
  }
  return { partsCost, supplierId };
}

async function recordOnDelivery(db, previousStatus, order, trustedNow, createdBy) {
  const existing = await db.queryOne("SELECT id FROM cash_withdrawals WHERE service_order_id = $1 AND source_type = 'service_order_part'", [order.id]);
  if (Number(order.parts_cost) <= 0) {
    if (existing) {
      await db.query("DELETE FROM cash_withdrawals WHERE id = $1 AND source_type = 'service_order_part'", [existing.id]);
    }
    return null;
  }
  if (order.status !== 'delivered') return existing?.id || null;
  const supplier = order.supplier_id ? await db.queryOne('SELECT name FROM stock_suppliers WHERE id = $1', [order.supplier_id]) : null;
  const reason = `Peça utilizada na ${order.order_number}`;
  const storeId = order.store_id || 1;

  await db.query(`
    INSERT INTO cash_withdrawals
      (store_id, amount, reason, withdrawal_date, notes, created_by, source_type, service_order_id, supplier_id, supplier_name)
    VALUES ($1, $2, $3, $4, NULL, $5, 'service_order_part', $6, $7, $8)
    ON CONFLICT(service_order_id) WHERE source_type = 'service_order_part'
    DO UPDATE SET store_id = EXCLUDED.store_id, amount = EXCLUDED.amount, reason = EXCLUDED.reason,
      supplier_id = EXCLUDED.supplier_id, supplier_name = EXCLUDED.supplier_name
  `, [
    storeId,
    order.parts_cost,
    reason,
    order.delivery_date || trustedNow.slice(0, 10),
    createdBy || null,
    order.id,
    order.supplier_id || null,
    supplier?.name || null
  ]);

  const row = await db.queryOne("SELECT id FROM cash_withdrawals WHERE service_order_id = $1 AND source_type = 'service_order_part'", [order.id]);
  return row?.id || null;
}

module.exports = { normalizePartDetails, recordOnDelivery };
