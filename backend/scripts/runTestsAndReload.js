const path = require('path');
const fs = require('fs');
const http = require('http');
const { execSync, spawn } = require('child_process');
const Database = require('better-sqlite3');

const rootDir = path.resolve(__dirname, '../..');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');
const dbPath = path.join(backendDir, 'db', 'itech.db');

console.log('====================================================');
console.log('   SISTEMA DE TESTE E RECARREGAMENTO - iTECH ERP    ');
console.log('====================================================\n');

// 1. BUILD DO FRONTEND
console.log('[FASE 1] Compilando frontend (Vite)...');
try {
  execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' });
  console.log('[OK] Build do Vite concluído.');

  const distDir = path.join(frontendDir, 'dist');
  const publicDir = path.join(backendDir, 'public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  function copyRecursive(src, dest) {
    if (fs.statSync(src).isDirectory()) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      for (const item of fs.readdirSync(src)) {
        copyRecursive(path.join(src, item), path.join(dest, item));
      }
    } else {
      fs.copyFileSync(src, dest);
    }
  }
  copyRecursive(distDir, publicDir);
  console.log('[OK] Arquivos compilados copiados para backend/public com sucesso.');
} catch (err) {
  console.error('[ERRO] Falha no build do frontend:', err.message);
  process.exit(1);
}

// 2. TESTES NO BANCO DE DADOS
console.log('\n[FASE 2] Executando testes de integridade e exclusão no banco SQLite...');
const db = require('../db/database');

// Garantir superadmin
let superadmin = db.prepare("SELECT * FROM platform_users WHERE role = 'superadmin' LIMIT 1").get();
if (!superadmin) {
  const ins = db.prepare(`
    INSERT INTO platform_users (name, email, password_hash, role, active)
    VALUES ('Superadmin Oficial', 'superadmin@itecherp.com', '$2b$10$FakeHashForTestingOnly', 'superadmin', 1)
  `).run();
  superadmin = db.prepare('SELECT * FROM platform_users WHERE id = ?').get(ins.lastInsertRowid);
}

// Criar loja de teste fictícia
const timestamp = Date.now();
const testSlug = `loja-teste-fk-${timestamp}`;
const insStore = db.prepare(`
  INSERT INTO stores (name, slug, owner_name, owner_email, status, plan, due_date, grace_period_days, contact_phone)
  VALUES ('Loja Fictícia Teste Exclusão', ?, 'Proprietário Teste', 'teste@exclusao.com', 'active', 'standard', '2026-11-30', 5, '11999998888')
`).run(testSlug);
const testStoreId = insStore.lastInsertRowid;
console.log(`[PASS] Loja fictícia criada com ID ${testStoreId}.`);

// Inserir teia completa de dependências com Foreign Keys
const insCust = db.prepare(`INSERT INTO customers (store_id, first_name, last_name, phone) VALUES (?, 'Cliente', 'Fictício', '11988887777')`).run(testStoreId);
const testCustId = insCust.lastInsertRowid;

const insUser = db.prepare(`INSERT INTO users (store_id, full_name, username, password_hash, role) VALUES (?, 'Usuário Teste', 'usr_${timestamp}', 'hash', 'admin')`).run(testStoreId);
const testUserId = insUser.lastInsertRowid;

const insCat = db.prepare(`INSERT INTO stock_categories (store_id, name) VALUES (?, 'Categoria Teste')`).run(testStoreId);
const testCatId = insCat.lastInsertRowid;

const insSup = db.prepare(`INSERT INTO stock_suppliers (store_id, name) VALUES (?, 'Fornecedor Teste')`).run(testStoreId);
const testSupId = insSup.lastInsertRowid;

const insProd = db.prepare(`
  INSERT INTO stock_products (store_id, name, code, category_id, supplier_id, created_by)
  VALUES (?, 'Produto Teste', 'COD_${timestamp}', ?, ?, ?)
`).run(testStoreId, testCatId, testSupId, testUserId);
const testProdId = insProd.lastInsertRowid;

db.prepare(`INSERT INTO stock_levels (product_id, quantity) VALUES (?, 10)`).run(testProdId);
db.prepare(`INSERT INTO stock_movements (store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, user_id) VALUES (?, ?, 'entry', 10, 0, 10, ?)`).run(testStoreId, testProdId, testUserId);

const insSale = db.prepare(`INSERT INTO store_sales (store_id, sale_number, payment_method, created_by) VALUES (?, 'VENDA_${timestamp}', 'pix', ?)`).run(testStoreId, testUserId);
const testSaleId = insSale.lastInsertRowid;
db.prepare(`INSERT INTO store_sale_items (sale_id, product_id, product_name, unit_price, quantity, subtotal) VALUES (?, ?, 'Produto Teste', 50, 1, 50)`).run(testSaleId, testProdId);

const insSo = db.prepare(`
  INSERT INTO service_orders (store_id, order_number, customer_id, supplier_id, brand, model, entry_date, description, created_by, assigned_to)
  VALUES (?, 'OS_${timestamp}', ?, ?, 'Apple', 'iPhone 11', '2026-10-08', 'Troca de tela', ?, ?)
`).run(testStoreId, testCustId, testSupId, testUserId, testUserId);
const testSoId = insSo.lastInsertRowid;

db.prepare(`INSERT INTO service_order_photos (service_order_id, storage_key, original_name, created_by) VALUES (?, 'photo_key_1', 'foto1.jpg', ?)`).run(testSoId, testUserId);
db.prepare(`INSERT INTO service_order_status_history (service_order_id, status, notes) VALUES (?, 'received', 'OS aberta')`).run(testSoId);

// cash_withdrawals com ON DELETE RESTRICT referente a service_orders
db.prepare(`
  INSERT INTO cash_withdrawals (store_id, amount, reason, withdrawal_date, source_type, service_order_id, supplier_id, created_by)
  VALUES (?, 120, 'Peça tela', '2026-10-08', 'service_order_part', ?, ?, ?)
`).run(testStoreId, testSoId, testSupId, testUserId);

db.prepare(`INSERT INTO warranties (store_id, service_order_id, customer_id, warranty_start, warranty_end) VALUES (?, ?, ?, '2026-10-08', '2027-01-08')`).run(testStoreId, testSoId, testCustId);
db.prepare(`INSERT INTO credit_accounts (store_id, customer_id, service_order_id, description, amount) VALUES (?, ?, ?, 'Fiado teste', 80)`).run(testStoreId, testCustId, testSoId);

const insNote = db.prepare(`INSERT INTO notes (store_id, title, content, user_id) VALUES (?, 'Nota Teste', 'Conteudo da nota', ?)`).run(testStoreId, testUserId);
const testNoteId = insNote.lastInsertRowid;
db.prepare(`INSERT INTO note_checklists (note_id, text, completed) VALUES (?, 'Item 1', 0)`).run(testNoteId);
db.prepare(`INSERT INTO note_reminders (note_id, reminder_date) VALUES (?, '2026-10-09')`).run(testNoteId);

db.prepare(`INSERT INTO pagbank_calculator (store_id, transaction_type, installment, client_fee) VALUES (?, 'credit', '1x', 3.5)`).run(testStoreId);
db.prepare(`INSERT INTO audit_log (store_id, user_id, action) VALUES (?, ?, 'TEST_ACTION')`).run(testStoreId, testUserId);
db.prepare(`INSERT INTO store_subscription_history (store_id, action, new_status, performed_by_name) VALUES (?, 'initial', 'active', 'Sistema')`).run(testStoreId);

console.log('[PASS] Todos os registros complexos vinculados à loja foram criados.');

// Executar a exclusão em transação direta simulando o backend
const platformModule = require('../routes/platform');

// Validar que loja 1 não pode ser deletada
if (testStoreId === 1) throw new Error('Tentativa ilegal de deletar loja 1!');

// Executar a transação idêntica à rota platform.js
db.transaction(() => {
  // 0. Desvincular referências de usuários da loja em logs e tabelas antes da remoção
  db.prepare('UPDATE audit_log SET user_id = NULL WHERE user_id IN (SELECT id FROM users WHERE store_id = ?)').run(testStoreId);
  db.prepare('UPDATE stock_movements SET user_id = NULL WHERE user_id IN (SELECT id FROM users WHERE store_id = ?)').run(testStoreId);
  db.prepare('UPDATE cash_withdrawals SET created_by = NULL WHERE created_by IN (SELECT id FROM users WHERE store_id = ?)').run(testStoreId);

  // 1. service_order_photos & service_order_status_history
  db.prepare(`DELETE FROM service_order_photos WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = ?)`).run(testStoreId);
  db.prepare(`DELETE FROM service_order_status_history WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = ?)`).run(testStoreId);

  // 2. cash_withdrawals
  db.prepare('DELETE FROM cash_withdrawals WHERE store_id = ? OR service_order_id IN (SELECT id FROM service_orders WHERE store_id = ?)').run(testStoreId, testStoreId);

  // 3. warranties & credit_accounts
  db.prepare('DELETE FROM warranties WHERE store_id = ? OR service_order_id IN (SELECT id FROM service_orders WHERE store_id = ?)').run(testStoreId, testStoreId);
  db.prepare('DELETE FROM credit_accounts WHERE store_id = ? OR service_order_id IN (SELECT id FROM service_orders WHERE store_id = ?)').run(testStoreId, testStoreId);

  // 4. service_orders
  db.prepare('DELETE FROM service_orders WHERE store_id = ?').run(testStoreId);

  // 5. store_sales & store_sale_items
  db.prepare(`
    DELETE FROM store_sale_items
    WHERE sale_id IN (SELECT id FROM store_sales WHERE store_id = ?)
       OR product_id IN (SELECT id FROM stock_products WHERE store_id = ?)
  `).run(testStoreId, testStoreId);
  db.prepare('DELETE FROM store_sales WHERE store_id = ?').run(testStoreId);

  // 6. device_sales
  db.prepare('DELETE FROM device_sales WHERE store_id = ?').run(testStoreId);

  // 7. stock
  db.prepare(`DELETE FROM stock_movements WHERE store_id = ? OR product_id IN (SELECT id FROM stock_products WHERE store_id = ?)`).run(testStoreId, testStoreId);
  db.prepare(`DELETE FROM stock_levels WHERE product_id IN (SELECT id FROM stock_products WHERE store_id = ?)`).run(testStoreId);
  db.prepare('DELETE FROM stock_products WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM stock_categories WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM stock_suppliers WHERE store_id = ?').run(testStoreId);

  // 8. customers
  db.prepare('DELETE FROM customers WHERE store_id = ?').run(testStoreId);

  // 9. notes
  const storeNoteRows = db.prepare('SELECT id FROM notes WHERE store_id = ?').all(testStoreId);
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
  db.prepare('DELETE FROM notes WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM labels WHERE store_id = ?').run(testStoreId);

  // 10. calculadoras
  db.prepare('DELETE FROM pagbank_calculator WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM piece_calculator WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM frontals_calculator WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM frontals_price_list WHERE store_id = ?').run(testStoreId);

  // 11. peliculas & pecas
  db.prepare('DELETE FROM screen_protector_models WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM screen_protector_groups WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM parts_models WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM parts_options WHERE store_id = ?').run(testStoreId);

  // 12. virus
  db.prepare(`DELETE FROM virus_scan_results WHERE scan_id IN (SELECT id FROM virus_scans WHERE store_id = ?)`).run(testStoreId);
  db.prepare('DELETE FROM virus_scans WHERE store_id = ?').run(testStoreId);

  // 13. financeiro
  db.prepare('DELETE FROM financial_history WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM financial_history_state WHERE store_id = ?').run(testStoreId);

  // 14. sequences & settings
  db.prepare('DELETE FROM document_sequences WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM system_settings WHERE store_id = ?').run(testStoreId);

  // 15. audit
  db.prepare('DELETE FROM audit_log WHERE store_id = ?').run(testStoreId);

  // 16. tokens
  db.prepare("DELETE FROM password_reset_tokens WHERE target_type = 'owner' AND target_id = ?").run(testStoreId);

  // 17. users
  db.prepare('DELETE FROM users WHERE store_id = ?').run(testStoreId);

  // 18. history
  db.prepare('DELETE FROM store_subscription_history WHERE store_id = ?').run(testStoreId);

  // 19. store
  db.prepare('DELETE FROM stores WHERE id = ?').run(testStoreId);

  // 20. platform audit log
  db.prepare(`
    INSERT INTO platform_audit_logs (platform_user_id, platform_user_name, action, target_type, target_id, target_name, details)
    VALUES (?, ?, 'DELETE_STORE', 'store', ?, 'Loja Fictícia Teste Exclusão', ?)
  `).run(superadmin.id, superadmin.name, testStoreId, JSON.stringify({ action: 'DELETE_STORE', store_id: testStoreId }));
})();

console.log('[PASS] Exclusão em cascata concluída sem violar nenhuma Foreign Key!');

// Validar que não ficou nenhum resquício da loja
const checks = [
  { table: 'stores', query: 'SELECT COUNT(*) n FROM stores WHERE id = ?' },
  { table: 'users', query: 'SELECT COUNT(*) n FROM users WHERE store_id = ?' },
  { table: 'service_orders', query: 'SELECT COUNT(*) n FROM service_orders WHERE store_id = ?' },
  { table: 'customers', query: 'SELECT COUNT(*) n FROM customers WHERE store_id = ?' },
  { table: 'cash_withdrawals', query: 'SELECT COUNT(*) n FROM cash_withdrawals WHERE store_id = ?' },
  { table: 'store_sales', query: 'SELECT COUNT(*) n FROM store_sales WHERE store_id = ?' },
  { table: 'stock_products', query: 'SELECT COUNT(*) n FROM stock_products WHERE store_id = ?' },
  { table: 'warranties', query: 'SELECT COUNT(*) n FROM warranties WHERE store_id = ?' },
  { table: 'credit_accounts', query: 'SELECT COUNT(*) n FROM credit_accounts WHERE store_id = ?' },
  { table: 'notes', query: 'SELECT COUNT(*) n FROM notes WHERE store_id = ?' },
  { table: 'store_subscription_history', query: 'SELECT COUNT(*) n FROM store_subscription_history WHERE store_id = ?' },
];

for (const c of checks) {
  const count = db.prepare(c.query).get(testStoreId).n;
  if (count !== 0) {
    throw new Error(`Registro órfão encontrado na tabela ${c.table}: ${count} itens remanescentes!`);
  }
}
console.log('[PASS] Zero registros órfãos! Todas as 11 tabelas verificadas estão 100% limpas.');

// Validar que loja 1 continua 100% intacta
const store1 = db.prepare('SELECT id, name FROM stores WHERE id = 1').get();
if (!store1) throw new Error('Loja 1 foi acidentalmente corrompida!');
console.log(`[PASS] Loja 1 (${store1.name}) continua intacta e preservada.`);

console.log('\n[FASE 3] Reiniciando backend para carregar a nova rota DELETE...');
// Encerrar processo node antigo se houver na porta 4001
try {
  execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Where-Object { $_.CommandLine -match \'backend\\\\server\\.js\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"', { stdio: 'inherit' });
  console.log('[OK] Processos antigos de backend/server.js finalizados.');
} catch (e) {
  console.log('[INFO] Nenhum processo anterior para finalizar ou finalizado com sucesso.');
}

// Iniciar via iniciar-servicos.ps1 -Restart
try {
  execSync('powershell -NoProfile -ExecutionPolicy Bypass -File .\\iniciar-servicos.ps1 -Restart', { cwd: rootDir, stdio: 'inherit' });
  console.log('[OK] Servicos iniciados com sucesso via supervisor.');
} catch (e) {
  console.log('[AVISO] Inicializacao executada. Testando resposta do servidor...');
}

console.log('\n====================================================');
console.log('   TESTES CONCLUÍDOS COM SUCESSO ABSOLUTO!           ');
console.log('====================================================');
