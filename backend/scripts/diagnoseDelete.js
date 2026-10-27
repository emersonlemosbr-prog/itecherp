const db = require('../db/database');

console.log('=== PLATFORM USERS ===');
const users = db.prepare('SELECT id, name, email, role, active FROM platform_users').all();
console.log(JSON.stringify(users, null, 2));

console.log('=== STORES ===');
const stores = db.prepare('SELECT id, name, slug, owner_name, owner_email, status FROM stores').all();
console.log(JSON.stringify(stores, null, 2));

// Test dry-run delete on each non-store 1
for (const store of stores) {
  if (store.id === 1) continue;
  console.log(`\n=== DRY RUN DELETE TEST FOR STORE ID ${store.id}: ${store.name} ===`);
  const storeId = store.id;
  try {
    db.transaction(() => {
      // 1. service_order_photos & service_order_status_history
      const p1 = db.prepare(`DELETE FROM service_order_photos WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = ?)`).run(storeId);
      const p2 = db.prepare(`DELETE FROM service_order_status_history WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = ?)`).run(storeId);

      // 2. cash_withdrawals
      const cw = db.prepare('DELETE FROM cash_withdrawals WHERE store_id = ?').run(storeId);

      // 3. warranties & credit_accounts
      const w = db.prepare('DELETE FROM warranties WHERE store_id = ?').run(storeId);
      const ca = db.prepare('DELETE FROM credit_accounts WHERE store_id = ?').run(storeId);

      // 4. service_orders
      const so = db.prepare('DELETE FROM service_orders WHERE store_id = ?').run(storeId);

      // 5. store_sales & store_sale_items
      const ssi = db.prepare(`DELETE FROM store_sale_items WHERE sale_id IN (SELECT id FROM store_sales WHERE store_id = ?)`).run(storeId);
      const ss = db.prepare('DELETE FROM store_sales WHERE store_id = ?').run(storeId);

      // 6. device_sales
      const ds = db.prepare('DELETE FROM device_sales WHERE store_id = ?').run(storeId);

      // 7. stock
      const sm = db.prepare(`DELETE FROM stock_movements WHERE product_id IN (SELECT id FROM stock_products WHERE store_id = ?)`).run(storeId);
      const sl = db.prepare(`DELETE FROM stock_levels WHERE product_id IN (SELECT id FROM stock_products WHERE store_id = ?)`).run(storeId);
      const sp = db.prepare('DELETE FROM stock_products WHERE store_id = ?').run(storeId);
      const sc = db.prepare('DELETE FROM stock_categories WHERE store_id = ?').run(storeId);
      const sup = db.prepare('DELETE FROM stock_suppliers WHERE store_id = ?').run(storeId);

      // 8. customers
      const c = db.prepare('DELETE FROM customers WHERE store_id = ?').run(storeId);

      // 9. notes
      const storeNoteRows = db.prepare('SELECT id FROM notes WHERE store_id = ?').all(storeId);
      if (storeNoteRows.length > 0) {
        const noteIds = storeNoteRows.map(n => n.id);
        const ph = noteIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM note_checklists WHERE note_id IN (${ph})`).run(...noteIds);
        db.prepare(`DELETE FROM note_attachments WHERE note_id IN (${ph})`).run(...noteIds);
        db.prepare(`DELETE FROM note_reminders WHERE note_id IN (${ph})`).run(...noteIds);
        db.prepare(`DELETE FROM note_labels WHERE note_id IN (${ph})`).run(...noteIds);
        db.prepare(`DELETE FROM favorite_notes WHERE note_id IN (${ph})`).run(...noteIds);
        db.prepare(`DELETE FROM pinned_notes WHERE note_id IN (${ph})`).run(...noteIds);
      }
      const n = db.prepare('DELETE FROM notes WHERE store_id = ?').run(storeId);
      const l = db.prepare('DELETE FROM labels WHERE store_id = ?').run(storeId);

      // 10. Calculadoras
      db.prepare('DELETE FROM pagbank_calculator WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM piece_calculator WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM frontals_calculator WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM frontals_price_list WHERE store_id = ?').run(storeId);

      // 11. Catalogo
      db.prepare('DELETE FROM screen_protector_models WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM screen_protector_groups WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM parts_models WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM parts_options WHERE store_id = ?').run(storeId);

      // 12. Virus
      db.prepare(`DELETE FROM virus_scan_results WHERE scan_id IN (SELECT id FROM virus_scans WHERE store_id = ?)`).run(storeId);
      db.prepare('DELETE FROM virus_scans WHERE store_id = ?').run(storeId);

      // 13. Financeiro
      db.prepare('DELETE FROM financial_history WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM financial_history_state WHERE store_id = ?').run(storeId);

      // 14. Documentos & config
      db.prepare('DELETE FROM document_sequences WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM system_settings WHERE store_id = ?').run(storeId);

      // 15. Audit
      db.prepare('DELETE FROM audit_log WHERE store_id = ?').run(storeId);

      // 16. Tokens
      const storeUserRows = db.prepare('SELECT id FROM users WHERE store_id = ?').all(storeId);
      if (storeUserRows.length > 0) {
        const uIds = storeUserRows.map(u => u.id);
        const ph = uIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM password_reset_tokens WHERE target_type = 'user' AND target_id IN (${ph})`).run(...uIds);
      }
      if (store.owner_email) {
        db.prepare(`DELETE FROM password_reset_tokens WHERE (target_type = 'owner' AND target_id = ?) OR email = ?`).run(storeId, store.owner_email);
      } else {
        db.prepare(`DELETE FROM password_reset_tokens WHERE target_type = 'owner' AND target_id = ?`).run(storeId);
      }

      // 17. Users
      db.prepare('DELETE FROM users WHERE store_id = ?').run(storeId);

      // 18. Subscription history
      db.prepare('DELETE FROM store_subscription_history WHERE store_id = ?').run(storeId);

      // 19. Store
      db.prepare('DELETE FROM stores WHERE id = ?').run(storeId);

      console.log(`[DRY RUN OK] Store ${storeId} deleted successfully inside transaction. Rolling back...`);
      throw new Error('DRY_RUN_ROLLBACK');
    })();
  } catch (err) {
    if (err.message === 'DRY_RUN_ROLLBACK') {
      console.log(`[ROLLBACK SUCCESSFUL] Store ${storeId} remains intact.`);
    } else {
      console.error(`[DRY RUN FAILED] Store ${storeId} error:`, err);
    }
  }
}
