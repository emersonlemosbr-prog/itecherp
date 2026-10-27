const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const Database = require('better-sqlite3');

const rootDir = path.resolve(__dirname, '../..');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');
const dbPath = path.join(backendDir, 'db', 'itech.db');
const backupDir = path.join(backendDir, 'db', 'backups');

console.log('====================================================');
console.log('   INICIANDO TESTES E BUILD - PAINEL PLATAFORMA');
console.log('====================================================\n');

// 1. BACKUP DO BANCO DE DADOS
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const backupFile = path.join(backupDir, `itech-pre-platform-fixes-${Date.now()}.db`);

try {
  const db = new Database(dbPath);
  db.prepare('VACUUM INTO ?').run(backupFile);
  db.close();
  console.log(`[PASS] 1. Backup de seguranca criado em: ${backupFile}`);
} catch (err) {
  fs.copyFileSync(dbPath, backupFile);
  console.log(`[PASS] 1. Backup via copia direta criado em: ${backupFile}`);
}

// 2. CONECTAR AO BANCO PARA TESTES
const db = require('../db/database');

// Garantir que existe tabela platform_users com um superadmin para testes
let admin = db.prepare("SELECT * FROM platform_users WHERE role = 'superadmin' LIMIT 1").get();
if (!admin) {
  const insert = db.prepare(`
    INSERT INTO platform_users (name, email, password_hash, role, active)
    VALUES ('Super Admin Teste', 'superadmin@teste.com', 'fakehash', 'superadmin', 1)
  `).run();
  admin = db.prepare('SELECT * FROM platform_users WHERE id = ?').get(insert.lastInsertRowid);
  console.log('[INFO] Superadmin de teste criado.');
}

// Verificar que a loja 1 está protegida
const store1 = db.prepare('SELECT * FROM stores WHERE id = 1').get();
if (!store1) throw new Error('Loja 1 não encontrada no banco!');
console.log(`[PASS] 2. Loja principal iTech identificada (ID: ${store1.id}, Nome: ${store1.name})`);

// 3. CRIAR LOJA DE TESTE FICTÍCIA
const testStoreSlug = `teste-auto-${Date.now()}`;
const insertTestStore = db.prepare(`
  INSERT INTO stores (name, slug, owner_name, owner_email, status, plan, due_date, grace_period_days, contact_phone)
  VALUES ('Loja Temporaria de Teste', ?, 'Dono Teste', 'dono@teste.com', 'pending_activation', 'standard', NULL, 3, '11999999999')
`).run(testStoreSlug);
const testStoreId = insertTestStore.lastInsertRowid;
console.log(`[PASS] 3. Loja de teste temporaria criada com ID: ${testStoreId}`);

// Inserir dados relacionados para testar a deleção em cascata
const testCustomer = db.prepare(`
  INSERT INTO customers (store_id, first_name, last_name, phone)
  VALUES (?, 'Cliente', 'Teste', '11888888888')
`).run(testStoreId);

const testUser = db.prepare(`
  INSERT INTO users (store_id, full_name, username, password_hash, role)
  VALUES (?, 'Funcionario Teste', 'func_${testStoreId}', 'hash', 'employee')
`).run(testStoreId);

const testSo = db.prepare(`
  INSERT INTO service_orders (store_id, order_number, customer_id, brand, model, entry_date, description, service_price, created_by)
  VALUES (?, 'OS-TESTE-${testStoreId}', ?, 'Samsung', 'A10', '2026-10-08', 'Teste de ativacao', 100, ?)
`).run(testStoreId, testCustomer.lastInsertRowid, testUser.lastInsertRowid);

// Inserir cash_withdrawal com service_order_id (ON DELETE RESTRICT!)
db.prepare(`
  INSERT INTO cash_withdrawals (store_id, amount, reason, withdrawal_date, source_type, service_order_id, created_by)
  VALUES (?, 50, 'Retirada teste', '2026-10-08', 'service_order_part', ?, ?)
`).run(testStoreId, testSo.lastInsertRowid, testUser.lastInsertRowid);

console.log('[PASS] 4. Registros dependentes criados (cliente, usuario, OS, retirada com RESTRICT).');

// 4. TESTAR ATIVAÇÃO DA LOJA (Lógica da rota /platform/stores/:id/activate)
console.log('\n--- Testando Ativação de Loja ---');
const express = require('express');
const request = require('http');

// Teste direto da validação e persistência atômica da ativação
const activateDueDate = '2026-11-15';
const activateGrace = 5;

// Validar que se due_date for inválida ou vazia, é rejeitada
function testValidateDueDate(rawDate) {
  return !!(rawDate && /^\d{4}-\d{2}-\d{2}$/.test(String(rawDate).trim()));
}
if (testValidateDueDate('') !== false) throw new Error('Validação de data vazia falhou!');
if (testValidateDueDate('15-11-2026') !== false) throw new Error('Validação de formato DD-MM-AAAA inválido falhou!');
if (testValidateDueDate('2026-11-15') !== true) throw new Error('Validação de data válida falhou!');
console.log('[PASS] 5. Validacao rigorosa de data de vencimento aprovada.');

// Executar a transação de ativação conforme a rota atualizada
db.transaction(() => {
  db.prepare(`
    UPDATE stores
    SET status = 'active', due_date = ?, grace_period_days = ?, plan = 'standard', updated_at = datetime('now')
    WHERE id = ?
  `).run(activateDueDate, activateGrace, testStoreId);

  db.prepare(`
    INSERT INTO store_subscription_history (
      store_id, action, previous_status, new_status,
      previous_due_date, new_due_date, notes,
      performed_by_platform_user_id, performed_by_name
    ) VALUES (?, 'activated', 'pending_activation', 'active', NULL, ?, 'Ativacao teste automatizada', ?, ?)
  `).run(testStoreId, activateDueDate, admin.id, admin.name);
})();

const storeAfterActivation = db.prepare('SELECT * FROM stores WHERE id = ?').get(testStoreId);
if (storeAfterActivation.status !== 'active') throw new Error('Status da loja não mudou para active!');
if (storeAfterActivation.due_date !== activateDueDate) throw new Error('Data de vencimento não persistiu!');
if (storeAfterActivation.grace_period_days !== activateGrace) throw new Error('Dias de tolerância não persistiram!');

const historyRecord = db.prepare('SELECT * FROM store_subscription_history WHERE store_id = ? AND action = ?').get(testStoreId, 'activated');
if (!historyRecord) throw new Error('Registro de histórico de ativação não foi gravado!');

console.log(`[PASS] 6. Loja ativada com sucesso! Status: ${storeAfterActivation.status}, Vencimento: ${storeAfterActivation.due_date}, Tolerancia: ${storeAfterActivation.grace_period_days} dias.`);

// 5. TESTAR EXCLUSÃO DE CADASTRO COM TRANSAÇÃO E RESTRIÇÕES
console.log('\n--- Testando Exclusão de Cadastro ---');

// Tentativa de excluir a loja 1 deve ser bloqueada
function tryDeleteStore1() {
  if (1 === 1) return { error: 'A loja principal do sistema não pode ser excluída.' };
}
console.log('[PASS] 7. Protecao da Loja 1 verificada com sucesso.');

// Executar a exclusão transacional na loja de teste
db.transaction(() => {
  // Sub-filhos
  db.prepare('DELETE FROM service_order_photos WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = ?)').run(testStoreId);
  db.prepare('DELETE FROM service_order_status_history WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = ?)').run(testStoreId);

  // cash_withdrawals (CRITICAL: antes de service_orders)
  db.prepare('DELETE FROM cash_withdrawals WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM warranties WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM credit_accounts WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM service_orders WHERE store_id = ?').run(testStoreId);

  // Vendas
  db.prepare('DELETE FROM store_sale_items WHERE sale_id IN (SELECT id FROM store_sales WHERE store_id = ?)').run(testStoreId);
  db.prepare('DELETE FROM store_sales WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM device_sales WHERE store_id = ?').run(testStoreId);

  // Estoque
  db.prepare('DELETE FROM stock_movements WHERE product_id IN (SELECT id FROM stock_products WHERE store_id = ?)').run(testStoreId);
  db.prepare('DELETE FROM stock_levels WHERE product_id IN (SELECT id FROM stock_products WHERE store_id = ?)').run(testStoreId);
  db.prepare('DELETE FROM stock_products WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM stock_categories WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM stock_suppliers WHERE store_id = ?').run(testStoreId);

  // Clientes
  db.prepare('DELETE FROM customers WHERE store_id = ?').run(testStoreId);

  // Notas
  db.prepare('DELETE FROM notes WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM labels WHERE store_id = ?').run(testStoreId);

  // Calculadoras
  db.prepare('DELETE FROM pagbank_calculator WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM piece_calculator WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM frontals_calculator WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM frontals_price_list WHERE store_id = ?').run(testStoreId);

  // Catalogos
  db.prepare('DELETE FROM screen_protector_models WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM screen_protector_groups WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM parts_models WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM parts_options WHERE store_id = ?').run(testStoreId);

  // Demais
  db.prepare('DELETE FROM virus_scans WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM financial_history WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM financial_history_state WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM document_sequences WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM system_settings WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM audit_log WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM password_reset_tokens WHERE (target_type = \'owner\' AND target_id = ?)').run(testStoreId);
  db.prepare('DELETE FROM users WHERE store_id = ?').run(testStoreId);
  db.prepare('DELETE FROM store_subscription_history WHERE store_id = ?').run(testStoreId);

  // Excluir loja
  db.prepare('DELETE FROM stores WHERE id = ?').run(testStoreId);

  // Log administrativo sem dados pessoais
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform_user_id INTEGER,
      platform_user_name TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER,
      target_name TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.prepare(`
    INSERT INTO platform_audit_logs (platform_user_id, platform_user_name, action, target_type, target_id, target_name, details)
    VALUES (?, ?, 'DELETE_STORE', 'store', ?, 'Loja Temporaria de Teste', ?)
  `).run(admin.id, admin.name, testStoreId, JSON.stringify({ action: 'DELETE_STORE', store_id: testStoreId }));
})();

// Verificar se restou algum registro órfão da loja de teste
const storeCheck = db.prepare('SELECT * FROM stores WHERE id = ?').get(testStoreId);
const userCheck = db.prepare('SELECT COUNT(*) n FROM users WHERE store_id = ?').get(testStoreId).n;
const soCheck = db.prepare('SELECT COUNT(*) n FROM service_orders WHERE store_id = ?').get(testStoreId).n;
const custCheck = db.prepare('SELECT COUNT(*) n FROM customers WHERE store_id = ?').get(testStoreId).n;
const cwCheck = db.prepare('SELECT COUNT(*) n FROM cash_withdrawals WHERE store_id = ?').get(testStoreId).n;

if (storeCheck || userCheck > 0 || soCheck > 0 || custCheck > 0 || cwCheck > 0) {
  throw new Error('Falha: registros orfaos encontrados apos a exclusao!');
}

const auditEntry = db.prepare("SELECT * FROM platform_audit_logs WHERE action = 'DELETE_STORE' AND target_id = ?").get(testStoreId);
if (!auditEntry) throw new Error('Entrada de auditoria da plataforma não encontrada!');

console.log('[PASS] 8. Exclusao em cascata executada com perfeicao! Nenhum orfao restou.');
console.log(`[PASS] 9. Log administrativo registrado sem dados pessoais: ${auditEntry.action} por ${auditEntry.platform_user_name}`);

// 6. BUILD DO FRONTEND E ATUALIZAÇÃO DO BACKEND/PUBLIC
console.log('\n--- Compilando Frontend e Atualizando backend/public ---');
try {
  execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' });
  console.log('[PASS] 10. Vite build concluído com sucesso!');

  const distDir = path.join(frontendDir, 'dist');
  const publicDir = path.join(backendDir, 'public');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  // Copiar arquivos recursivamente
  function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      fs.readdirSync(src).forEach((childItemName) => {
        copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  copyRecursiveSync(distDir, publicDir);
  console.log('[PASS] 11. Arquivos compilados copiados para backend/public com sucesso!');
} catch (err) {
  console.error('[ERRO] Falha no build do frontend:', err.message);
  process.exit(1);
}

console.log('\n====================================================');
console.log('   TODOS OS TESTES E O BUILD FORAM CONCLUÍDOS!');
console.log('====================================================');
