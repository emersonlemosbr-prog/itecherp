// routes/platform.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { authenticatePlatformAdmin } = require('../middleware/platformAuth');
const { checkStoreSubscription } = require('../services/multiTenantService');

const router = express.Router();

// Rate limiting para o login da plataforma
const platformLoginAttempts = new Map();
function platformLoginRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxAttempts = 5;

  for (const [key, val] of platformLoginAttempts) {
    if (val.reset <= now) platformLoginAttempts.delete(key);
  }

  let record = platformLoginAttempts.get(ip);
  if (!record) {
    record = { count: 0, reset: now + windowMs };
    platformLoginAttempts.set(ip, record);
  }

  record.count += 1;
  if (record.count > maxAttempts) {
    const retrySec = Math.ceil((record.reset - now) / 1000);
    res.set('Retry-After', String(retrySec));
    return res.status(429).json({ error: `Muitas tentativas de login. Tente novamente em ${retrySec} segundos.` });
  }

  next();
}

/**
 * Login exclusivo para Administrador da Plataforma
 */
router.post('/login', platformLoginRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Informe e-mail e senha de administrador da plataforma.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const admin = db.prepare('SELECT * FROM platform_users WHERE LOWER(email) = ?').get(cleanEmail);

    if (!admin || !admin.active) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    platformLoginAttempts.delete(ip);

    db.prepare("UPDATE platform_users SET last_access = datetime('now') WHERE id = ?").run(admin.id);

    const token = jwt.sign(
      {
        id: admin.id,
        role: 'platform_admin',
        type: 'platform',
        session_version: admin.session_version
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (err) {
    console.error('[PLATFORM_LOGIN_ERROR]', err);
    res.status(500).json({ error: 'Erro ao processar login na plataforma.' });
  }
});

// Todas as rotas abaixo requerem autenticação de Administrador da Plataforma
router.use(authenticatePlatformAdmin);

/**
 * Dados do Administrador da Plataforma autenticado
 */
router.get('/me', (req, res) => {
  res.json({ admin: req.platformAdmin });
});

/**
 * Listagem pesquisável de lojas com métricas e status de assinatura
 */
router.get('/stores', (req, res) => {
  try {
    const { q, status } = req.query;

    let query = `
      SELECT
        s.*,
        (SELECT COUNT(*) FROM users u WHERE u.store_id = s.id AND u.active = 1) AS active_users_count,
        (SELECT COUNT(*) FROM service_orders so WHERE so.store_id = s.id) AS service_orders_count,
        (SELECT COUNT(*) FROM customers c WHERE c.store_id = s.id) AS customers_count,
        (SELECT COUNT(*) FROM store_sales ss WHERE ss.store_id = s.id AND ss.is_canceled = 0) AS sales_count,
        (SELECT MAX(last_access) FROM users u WHERE u.store_id = s.id) AS store_last_access
      FROM stores s
      WHERE 1=1
    `;

    const params = [];

    if (status && ['pending_activation', 'active', 'overdue', 'suspended'].includes(status)) {
      query += ` AND s.status = ?`;
      params.push(status);
    }

    if (q && q.trim()) {
      const term = `%${q.trim().toLowerCase()}%`;
      query += ` AND (LOWER(s.name) LIKE ? OR LOWER(s.owner_name) LIKE ? OR LOWER(s.owner_email) LIKE ?)`;
      params.push(term, term, term);
    }

    query += ` ORDER BY s.id DESC`;

    const rawStores = db.prepare(query).all(...params);

    // Atualiza status dinamicamente se necessário (ex: vencimento + tolerância)
    const stores = rawStores.map(store => {
      const sub = checkStoreSubscription(store);
      return {
        ...store,
        owner_password_hash: undefined,
        current_status: sub.status,
        effective_status: sub.effectiveStatus || sub.status || store.status,
        in_grace_period: !!sub.inGracePeriod,
        effective_last_access: store.last_access || store.store_last_access,
        subscription_due_date: store.due_date,
        due_date: store.due_date,
        email: store.owner_email,
        phone: store.contact_phone
      };
    });

    res.json({ stores, data: stores });
  } catch (err) {
    console.error('[PLATFORM_GET_STORES_ERROR]', err);
    res.status(500).json({ error: 'Erro ao buscar lojas.' });
  }
});

/**
 * Detalhes de uma loja específica e histórico de assinatura
 */
router.get('/stores/:id', (req, res) => {
  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
    if (!store) {
      return res.status(404).json({ error: 'Loja não encontrada.' });
    }

    const sub = checkStoreSubscription(store);
    const history = db.prepare(`
      SELECT * FROM store_subscription_history
      WHERE store_id = ?
      ORDER BY id DESC
    `).all(store.id);

    const users = db.prepare(`
      SELECT id, full_name, username, role, active, is_master, last_access, created_at
      FROM users
      WHERE store_id = ?
      ORDER BY is_master DESC, role ASC, full_name ASC
    `).all(store.id);

    const counts = {
      customers: db.prepare('SELECT COUNT(*) as c FROM customers WHERE store_id = ?').get(store.id).c,
      serviceOrders: db.prepare('SELECT COUNT(*) as c FROM service_orders WHERE store_id = ?').get(store.id).c,
      sales: db.prepare('SELECT COUNT(*) as c FROM store_sales WHERE store_id = ? AND is_canceled = 0').get(store.id).c,
      stockProducts: db.prepare('SELECT COUNT(*) as c FROM stock_products WHERE store_id = ? AND is_active = 1').get(store.id).c
    };

    delete store.owner_password_hash;
    store.subscription_due_date = store.due_date;
    store.email = store.owner_email;
    store.phone = store.contact_phone;

    res.json({
      store: {
        ...store,
        current_status: sub.status,
        in_grace_period: !!sub.inGracePeriod
      },
      counts,
      users,
      history
    });
  } catch (err) {
    console.error('[PLATFORM_GET_STORE_DETAIL_ERROR]', err);
    res.status(500).json({ error: 'Erro ao obter detalhes da loja.' });
  }
});

/**
 * Ação: Ativar loja (pending_activation -> active ou reativação com data de vencimento)
 */
router.post('/stores/:id/activate', (req, res) => {
  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
    if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });

    const rawDueDate = req.body.dueDate || req.body.due_date;
    const rawGrace = req.body.gracePeriodDays !== undefined ? req.body.gracePeriodDays : req.body.grace_period_days;
    const { plan, notes } = req.body;

    if (!rawDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(rawDueDate).trim())) {
      return res.status(400).json({ error: 'Data de vencimento é obrigatória e deve estar no formato AAAA-MM-DD.' });
    }
    const finalDueDate = String(rawDueDate).trim();
    const parsedGrace = Number(rawGrace);
    const finalGrace = Number.isInteger(parsedGrace) && parsedGrace >= 0 ? parsedGrace : (store.grace_period_days || 3);
    const finalPlan = plan || store.plan || 'standard';

    db.transaction(() => {
      db.prepare(`
        UPDATE stores
        SET status = 'active', due_date = ?, grace_period_days = ?, plan = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(finalDueDate, finalGrace, finalPlan, store.id);

      db.prepare(`
        INSERT INTO store_subscription_history (
          store_id, action, previous_status, new_status,
          previous_due_date, new_due_date, notes,
          performed_by_platform_user_id, performed_by_name
        ) VALUES (?, 'activated', ?, 'active', ?, ?, ?, ?, ?)
      `).run(
        store.id,
        store.status,
        store.due_date,
        finalDueDate,
        notes || 'Loja ativada pelo administrador da plataforma.',
        req.platformAdmin.id,
        req.platformAdmin.name
      );
    })();

    const updated = db.prepare('SELECT * FROM stores WHERE id = ?').get(store.id);
    delete updated.owner_password_hash;
    updated.subscription_due_date = updated.due_date;
    updated.email = updated.owner_email;
    updated.phone = updated.contact_phone;
    res.json({ success: true, store: updated });
  } catch (err) {
    console.error('[PLATFORM_ACTIVATE_STORE_ERROR]', err);
    res.status(400).json({ error: err.message || 'Erro ao ativar loja.' });
  }
});

/**
 * Ação: Suspender loja
 */
router.post('/stores/:id/suspend', (req, res) => {
  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
    if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });

    const { notes } = req.body;

    db.transaction(() => {
      db.prepare(`
        UPDATE stores
        SET status = 'suspended', updated_at = datetime('now')
        WHERE id = ?
      `).run(store.id);

      db.prepare(`
        INSERT INTO store_subscription_history (
          store_id, action, previous_status, new_status, notes,
          performed_by_platform_user_id, performed_by_name
        ) VALUES (?, 'suspended', ?, 'suspended', ?, ?, ?)
      `).run(
        store.id,
        store.status,
        notes || 'Acesso suspenso pelo administrador da plataforma.',
        req.platformAdmin.id,
        req.platformAdmin.name
      );
    })();

    const updated = db.prepare('SELECT * FROM stores WHERE id = ?').get(store.id);
    delete updated.owner_password_hash;
    res.json({ success: true, store: updated });
  } catch (err) {
    console.error('[PLATFORM_SUSPEND_STORE_ERROR]', err);
    res.status(400).json({ error: err.message || 'Erro ao suspender loja.' });
  }
});

/**
 * Ação: Reativar loja
 */
router.post('/stores/:id/reactivate', (req, res) => {
  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
    if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });

    const rawDueDate = req.body.dueDate || req.body.due_date;
    const { notes } = req.body;

    let finalDueDate = rawDueDate || store.due_date;
    // Se a data de vencimento anterior já passou, definir para +30 dias a partir de hoje
    if (!rawDueDate) {
      const today = new Date().toISOString().slice(0, 10);
      if (!finalDueDate || finalDueDate < today) {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        finalDueDate = d.toISOString().slice(0, 10);
      }
    }

    db.transaction(() => {
      db.prepare(`
        UPDATE stores
        SET status = 'active', due_date = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(finalDueDate, store.id);

      db.prepare(`
        INSERT INTO store_subscription_history (
          store_id, action, previous_status, new_status,
          previous_due_date, new_due_date, notes,
          performed_by_platform_user_id, performed_by_name
        ) VALUES (?, 'reactivated', ?, 'active', ?, ?, ?, ?, ?)
      `).run(
        store.id,
        store.status,
        store.due_date,
        finalDueDate,
        notes || 'Loja reativada pelo administrador da plataforma.',
        req.platformAdmin.id,
        req.platformAdmin.name
      );
    })();

    const updated = db.prepare('SELECT * FROM stores WHERE id = ?').get(store.id);
    delete updated.owner_password_hash;
    res.json({ success: true, store: updated });
  } catch (err) {
    console.error('[PLATFORM_REACTIVATE_STORE_ERROR]', err);
    res.status(400).json({ error: err.message || 'Erro ao reativar loja.' });
  }
});

/**
 * Ação: Alterar data de vencimento e tolerância (suporta PUT e POST)
 */
const handleUpdateDueDate = (req, res) => {
  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
    if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });

    const rawDueDate = req.body.dueDate || req.body.due_date;
    const rawGrace = req.body.gracePeriodDays !== undefined ? req.body.gracePeriodDays : req.body.grace_period_days;
    const { notes } = req.body;

    if (!rawDueDate) {
      return res.status(400).json({ error: 'Informe uma data de vencimento válida (AAAA-MM-DD).' });
    }

    const cleanDateStr = String(rawDueDate).trim();
    const dateMatch = cleanDateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) {
      return res.status(400).json({ error: 'Informe uma data de vencimento válida no formato AAAA-MM-DD.' });
    }
    const dueDate = dateMatch[1];

    const parsedGrace = Number(rawGrace);
    const finalGrace = Number.isInteger(parsedGrace) && parsedGrace >= 0
      ? parsedGrace
      : (store.grace_period_days !== undefined ? store.grace_period_days : 3);

    const adminId = req.platformAdmin?.id || null;
    const adminName = req.platformAdmin?.name || 'Administrador da Plataforma';

    // Se a loja estava em atraso (overdue) e a nova data de vencimento é futura, reabilitar para 'active'
    const today = new Date().toISOString().slice(0, 10);
    let newStatus = store.status;
    if (store.status === 'overdue' && dueDate >= today) {
      newStatus = 'active';
    }

    db.transaction(() => {
      db.prepare(`
        UPDATE stores
        SET due_date = ?, grace_period_days = ?, status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(dueDate, finalGrace, newStatus, store.id);

      db.prepare(`
        INSERT INTO store_subscription_history (
          store_id, action, previous_status, new_status,
          previous_due_date, new_due_date, notes,
          performed_by_platform_user_id, performed_by_name
        ) VALUES (?, 'due_date_update', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        store.id,
        store.status,
        newStatus,
        store.due_date,
        dueDate,
        notes || `Vencimento alterado para ${dueDate} com tolerância de ${finalGrace} dia(s).`,
        adminId,
        adminName
      );
    })();

    const updated = db.prepare('SELECT * FROM stores WHERE id = ?').get(store.id);
    delete updated.owner_password_hash;
    const sub = checkStoreSubscription(updated);
    updated.subscription_due_date = updated.due_date;
    updated.effective_status = sub.effectiveStatus || sub.status || updated.status;
    updated.current_status = sub.status;
    updated.email = updated.owner_email;
    updated.phone = updated.contact_phone;
    res.json({ success: true, store: updated });
  } catch (err) {
    console.error('[PLATFORM_DUE_DATE_ERROR]', err);
    res.status(400).json({ error: err.message || 'Erro ao atualizar data de vencimento.' });
  }
};

router.put('/stores/:id/due-date', handleUpdateDueDate);
router.post('/stores/:id/due-date', handleUpdateDueDate);

/**
 * Procedimento atômico e seguro de exclusão em cascata de dados de uma loja
 */
function executeDeleteStore(storeId, store, adminId, adminName) {
  // 0. Desvincular referências de usuários da loja em logs e tabelas antes da remoção
  db.prepare('UPDATE audit_log SET user_id = NULL WHERE user_id IN (SELECT id FROM users WHERE store_id = ?)').run(storeId);
  db.prepare('UPDATE stock_movements SET user_id = NULL WHERE user_id IN (SELECT id FROM users WHERE store_id = ?)').run(storeId);
  db.prepare('UPDATE cash_withdrawals SET created_by = NULL WHERE created_by IN (SELECT id FROM users WHERE store_id = ?)').run(storeId);

  // 1. service_order_photos & service_order_status_history
  db.prepare(`
    DELETE FROM service_order_photos
    WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = ?)
  `).run(storeId);

  db.prepare(`
    DELETE FROM service_order_status_history
    WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = ?)
  `).run(storeId);

  // 2. cash_withdrawals (ON DELETE RESTRICT referente a service_orders)
  db.prepare('DELETE FROM cash_withdrawals WHERE store_id = ? OR service_order_id IN (SELECT id FROM service_orders WHERE store_id = ?)').run(storeId, storeId);

  // 3. warranties & credit_accounts
  db.prepare('DELETE FROM warranties WHERE store_id = ? OR service_order_id IN (SELECT id FROM service_orders WHERE store_id = ?)').run(storeId, storeId);
  db.prepare('DELETE FROM credit_accounts WHERE store_id = ? OR service_order_id IN (SELECT id FROM service_orders WHERE store_id = ?)').run(storeId, storeId);

  // 4. service_orders
  db.prepare('DELETE FROM service_orders WHERE store_id = ?').run(storeId);

  // 5. store_sales & store_sale_items
  db.prepare(`
    DELETE FROM store_sale_items
    WHERE sale_id IN (SELECT id FROM store_sales WHERE store_id = ?)
       OR product_id IN (SELECT id FROM stock_products WHERE store_id = ?)
  `).run(storeId, storeId);
  db.prepare('DELETE FROM store_sales WHERE store_id = ?').run(storeId);

  // 6. device_sales
  db.prepare('DELETE FROM device_sales WHERE store_id = ?').run(storeId);

  // 7. stock_movements, stock_levels, stock_products, stock_categories, stock_suppliers
  db.prepare(`
    DELETE FROM stock_movements
    WHERE store_id = ? OR product_id IN (SELECT id FROM stock_products WHERE store_id = ?)
  `).run(storeId, storeId);
  db.prepare(`
    DELETE FROM stock_levels
    WHERE product_id IN (SELECT id FROM stock_products WHERE store_id = ?)
  `).run(storeId);
  db.prepare('DELETE FROM stock_products WHERE store_id = ?').run(storeId);
  db.prepare('DELETE FROM stock_categories WHERE store_id = ?').run(storeId);
  db.prepare('DELETE FROM stock_suppliers WHERE store_id = ?').run(storeId);

  // 8. customers
  db.prepare('DELETE FROM customers WHERE store_id = ?').run(storeId);

  // 9. notes e tabelas filhas
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
  db.prepare('DELETE FROM notes WHERE store_id = ?').run(storeId);
  db.prepare('DELETE FROM labels WHERE store_id = ?').run(storeId);

  // 10. Calculadoras e listas de preços
  db.prepare('DELETE FROM pagbank_calculator WHERE store_id = ?').run(storeId);
  db.prepare('DELETE FROM piece_calculator WHERE store_id = ?').run(storeId);
  db.prepare('DELETE FROM frontals_calculator WHERE store_id = ?').run(storeId);
  db.prepare('DELETE FROM frontals_price_list WHERE store_id = ?').run(storeId);

  // 11. Películas e catálogo de peças
  db.prepare('DELETE FROM screen_protector_models WHERE store_id = ?').run(storeId);
  db.prepare('DELETE FROM screen_protector_groups WHERE store_id = ?').run(storeId);
  db.prepare('DELETE FROM parts_models WHERE store_id = ?').run(storeId);
  db.prepare('DELETE FROM parts_options WHERE store_id = ?').run(storeId);

  // 12. Escaneamento de vírus
  db.prepare(`
    DELETE FROM virus_scan_results
    WHERE scan_id IN (SELECT id FROM virus_scans WHERE store_id = ?)
  `).run(storeId);
  db.prepare('DELETE FROM virus_scans WHERE store_id = ?').run(storeId);

  // 13. Fechamentos e histórico financeiro
  db.prepare('DELETE FROM financial_history WHERE store_id = ?').run(storeId);
  db.prepare('DELETE FROM financial_history_state WHERE store_id = ?').run(storeId);

  // 14. Numeração e configurações do sistema
  db.prepare('DELETE FROM document_sequences WHERE store_id = ?').run(storeId);
  db.prepare('DELETE FROM system_settings WHERE store_id = ?').run(storeId);

  // 15. Logs de auditoria interna da loja
  db.prepare('DELETE FROM audit_log WHERE store_id = ?').run(storeId);

  // 16. Tokens de redefinição de senha
  const storeUserRows = db.prepare('SELECT id FROM users WHERE store_id = ?').all(storeId);
  if (storeUserRows.length > 0) {
    const uIds = storeUserRows.map(u => u.id);
    const ph = uIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM password_reset_tokens WHERE target_type = 'user' AND target_id IN (${ph})`).run(...uIds);
  }
  if (store.owner_email) {
    db.prepare('DELETE FROM password_reset_tokens WHERE (target_type = \'owner\' AND target_id = ?) OR email = ?').run(storeId, store.owner_email);
  } else {
    db.prepare('DELETE FROM password_reset_tokens WHERE target_type = \'owner\' AND target_id = ?').run(storeId);
  }

  // 17. Usuários vinculados exclusivamente à loja
  db.prepare('DELETE FROM users WHERE store_id = ?').run(storeId);

  // 18. Histórico de assinaturas da loja
  db.prepare('DELETE FROM store_subscription_history WHERE store_id = ?').run(storeId);

  // 19. Registro da loja
  db.prepare('DELETE FROM stores WHERE id = ?').run(storeId);

  // 20. Auditoria administrativa da plataforma
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
    INSERT INTO platform_audit_logs (
      platform_user_id, platform_user_name, action, target_type, target_id, target_name, details
    ) VALUES (?, ?, 'DELETE_STORE', 'store', ?, ?, ?)
  `).run(
    adminId,
    adminName,
    storeId,
    store.name,
    JSON.stringify({
      action: 'DELETE_STORE',
      store_id: storeId,
      store_name: store.name,
      plan: store.plan,
      status: store.status
    })
  );
}

/**
 * Ação: Excluir cadastro de loja permanentemente (apenas SUPERADMIN)
 */
router.delete('/stores/:id', (req, res) => {
  try {
    if (!req.platformAdmin || req.platformAdmin.role !== 'superadmin') {
      return res.status(403).json({ error: 'Apenas Superadministradores podem excluir cadastros de lojas.' });
    }

    const storeId = parseInt(req.params.id, 10);
    if (isNaN(storeId) || storeId <= 0) {
      return res.status(400).json({ error: 'ID de loja inválido.' });
    }

    if (storeId === 1) {
      return res.status(403).json({ error: 'A loja principal do sistema (iTech) não pode ser excluída.' });
    }

    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
    if (!store) {
      return res.status(404).json({ error: 'Loja não encontrada.' });
    }

    const confirmation = (req.body?.confirmation || req.query?.confirmation || '').trim();
    if (confirmation !== 'EXCLUIR') {
      return res.status(400).json({ error: 'Para confirmar a exclusão permanente, digite e envie EXCLUIR.' });
    }

    const adminId = req.platformAdmin?.id || null;
    const adminName = req.platformAdmin?.name || 'Administrador da Plataforma';

    db.transaction(() => {
      executeDeleteStore(storeId, store, adminId, adminName);
    })();

    res.json({ success: true, message: `Cadastro da loja "${store.name}" excluído com sucesso.` });
  } catch (err) {
    console.error('[PLATFORM_DELETE_STORE_ERROR]', err);
    res.status(500).json({
      error: err.message || 'Erro ao excluir cadastro da loja.',
      details: err.message
    });
  }
});

/**
 * Ações em Massa para Lojas: Ativar, Suspender ou Excluir Lojas Selecionadas
 */
router.post('/stores/bulk-action', (req, res) => {
  try {
    const { action, storeIds, dueDate, gracePeriodDays, notes, confirmation } = req.body;

    if (!['activate', 'suspend', 'delete'].includes(action)) {
      return res.status(400).json({ error: 'Ação em massa inválida. Opções: activate, suspend ou delete.' });
    }

    if (!Array.isArray(storeIds) || storeIds.length === 0) {
      return res.status(400).json({ error: 'Nenhuma loja selecionada para a ação em massa.' });
    }

    // Deduplicar e validar IDs numéricos
    const rawIds = [...new Set(storeIds.map(Number))].filter(id => Number.isInteger(id) && id > 0);
    if (rawIds.length === 0) {
      return res.status(400).json({ error: 'Nenhum ID de loja válido fornecido.' });
    }

    // Exclusão em massa é restrita exclusivamente a Superadministradores com confirmação EXCLUIR
    if (action === 'delete') {
      if (!req.platformAdmin || req.platformAdmin.role !== 'superadmin') {
        return res.status(403).json({ error: 'Apenas Superadministradores podem excluir cadastros de lojas em massa.' });
      }
      if (String(confirmation).trim() !== 'EXCLUIR') {
        return res.status(400).json({ error: 'Para confirmar a exclusão em massa, digite e envie EXCLUIR.' });
      }
    }

    const adminId = req.platformAdmin?.id || null;
    const adminName = req.platformAdmin?.name || 'Administrador da Plataforma';

    // Para ativação: preparar data de vencimento padrão caso não informada (+30 dias)
    let finalDueDate = null;
    let finalGrace = 3;
    if (action === 'activate') {
      if (dueDate && /^\d{4}-\d{2}-\d{2}$/.test(String(dueDate).trim())) {
        finalDueDate = String(dueDate).trim();
      } else {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        finalDueDate = d.toISOString().slice(0, 10);
      }
      const parsedG = Number(gracePeriodDays);
      finalGrace = Number.isInteger(parsedG) && parsedG >= 0 ? parsedG : 3;
    }

    const processedIds = [];
    const skippedIds = [];

    db.transaction(() => {
      for (const id of rawIds) {
        // A Loja 1 (iTech Celular e Informática) é o tenant principal protegido e nunca pode ser suspensa ou excluída
        if (id === 1 && (action === 'delete' || action === 'suspend')) {
          skippedIds.push({ id, reason: 'A loja principal do sistema (iTech) não pode ser suspensa ou excluída.' });
          continue;
        }

        const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
        if (!store) {
          skippedIds.push({ id, reason: 'Loja não encontrada.' });
          continue;
        }

        if (action === 'activate') {
          db.prepare(`
            UPDATE stores
            SET status = 'active', due_date = ?, grace_period_days = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(finalDueDate, finalGrace, id);

          db.prepare(`
            INSERT INTO store_subscription_history (
              store_id, action, previous_status, new_status,
              previous_due_date, new_due_date, notes,
              performed_by_platform_user_id, performed_by_name
            ) VALUES (?, 'bulk_activated', ?, 'active', ?, ?, ?, ?, ?)
          `).run(
            id,
            store.status,
            store.due_date,
            finalDueDate,
            notes || 'Loja ativada via ação em massa no painel da plataforma.',
            adminId,
            adminName
          );

          processedIds.push(id);
        } else if (action === 'suspend') {
          db.prepare(`
            UPDATE stores
            SET status = 'suspended', updated_at = datetime('now')
            WHERE id = ?
          `).run(id);

          db.prepare(`
            INSERT INTO store_subscription_history (
              store_id, action, previous_status, new_status, notes,
              performed_by_platform_user_id, performed_by_name
            ) VALUES (?, 'bulk_suspended', ?, 'suspended', ?, ?, ?)
          `).run(
            id,
            store.status,
            notes || 'Acesso suspenso via ação em massa no painel da plataforma.',
            adminId,
            adminName
          );

          processedIds.push(id);
        } else if (action === 'delete') {
          executeDeleteStore(id, store, adminId, adminName);
          processedIds.push(id);
        }
      }

      // Registro de Auditoria Administrativa da Operação em Massa
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
        INSERT INTO platform_audit_logs (
          platform_user_id, platform_user_name, action, target_type, target_id, target_name, details
        ) VALUES (?, ?, ?, 'bulk_stores', 0, ?, ?)
      `).run(
        adminId,
        adminName,
        `BULK_${action.toUpperCase()}`,
        `${processedIds.length} lojas afetadas`,
        JSON.stringify({
          action,
          total_requested: rawIds.length,
          processed_ids: processedIds,
          skipped_ids: skippedIds,
          notes: notes || null
        })
      );
    })();

    const actionLabels = {
      activate: 'ativada(s)',
      suspend: 'suspensa(s)',
      delete: 'excluída(s)'
    };

    res.json({
      success: true,
      action,
      total_requested: rawIds.length,
      processed_count: processedIds.length,
      affected_ids: processedIds,
      skipped_ids: skippedIds,
      message: `${processedIds.length} loja(s) ${actionLabels[action] || 'processada(s)'} com sucesso.`
    });
  } catch (err) {
    console.error('[PLATFORM_BULK_ACTION_ERROR]', err);
    res.status(500).json({ error: 'Erro ao executar ação em massa: ' + (err.message || 'Erro no banco de dados') });
  }
});

/**
 * Ação: Registrar manualmente um pagamento
 */
router.post('/stores/:id/payment', (req, res) => {
  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
    if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });

    const { amount, paymentMethod, extendMonths, newDueDate, notes } = req.body;
    const amountVal = parseFloat(amount) || 0;
    const method = (paymentMethod || 'PIX').trim();

    // Calcular novo vencimento se solicitado prorrogação
    let nextDueDate = store.due_date;
    if (newDueDate && /^\d{4}-\d{2}-\d{2}$/.test(newDueDate)) {
      nextDueDate = newDueDate;
    } else if (extendMonths && Number(extendMonths) > 0) {
      const baseDate = (store.due_date && store.due_date >= new Date().toISOString().slice(0, 10))
        ? new Date(store.due_date + 'T12:00:00')
        : new Date();
      baseDate.setMonth(baseDate.getMonth() + Number(extendMonths));
      nextDueDate = baseDate.toISOString().slice(0, 10);
    }

    db.transaction(() => {
      // Se estava suspensa ou atrasada, ao pagar reativa a loja automaticamente
      const shouldActivate = ['suspended', 'overdue', 'pending_activation'].includes(store.status);
      const newStatus = shouldActivate ? 'active' : store.status;

      db.prepare(`
        UPDATE stores
        SET status = ?, due_date = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newStatus, nextDueDate, store.id);

      db.prepare(`
        INSERT INTO store_subscription_history (
          store_id, action, previous_status, new_status,
          previous_due_date, new_due_date, amount_paid, payment_method, notes,
          performed_by_platform_user_id, performed_by_name
        ) VALUES (?, 'payment_registered', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        store.id,
        store.status,
        newStatus,
        store.due_date,
        nextDueDate,
        amountVal,
        method,
        notes || `Pagamento manual de R$ ${amountVal.toFixed(2)} registrado via ${method}.`,
        req.platformAdmin.id,
        req.platformAdmin.name
      );
    })();

    const updated = db.prepare('SELECT * FROM stores WHERE id = ?').get(store.id);
    delete updated.owner_password_hash;
    res.json({ success: true, store: updated });
  } catch (err) {
    console.error('[PLATFORM_REGISTER_PAYMENT_ERROR]', err);
    res.status(400).json({ error: err.message || 'Erro ao registrar pagamento manual.' });
  }
});

/**
 * Histórico de assinatura e pagamentos
 */
router.get('/stores/:id/history', (req, res) => {
  try {
    const history = db.prepare(`
      SELECT * FROM store_subscription_history
      WHERE store_id = ?
      ORDER BY id DESC
    `).all(req.params.id);

    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar histórico da loja.' });
  }
});

/**
 * Listar outros administradores da plataforma
 */
router.get('/admins', (_req, res) => {
  try {
    const admins = db.prepare(`
      SELECT id, name, email, role, active, created_at, last_access
      FROM platform_users
      ORDER BY id ASC
    `).all();
    res.json({ admins });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar administradores.' });
  }
});

/**
 * Criar novo administrador da plataforma (somente um admin da plataforma autenticado pode criar)
 */
router.post('/admins', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Informe o nome do administrador.' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'A senha deve conter no mínimo 8 caracteres.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM platform_users WHERE LOWER(email) = ?').get(cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'Já existe um administrador cadastrado com este e-mail.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const insert = db.prepare(`
      INSERT INTO platform_users (name, email, password_hash, role, active)
      VALUES (?, ?, ?, 'superadmin', 1)
    `).run(name.trim(), cleanEmail, hash);

    res.status(201).json({
      success: true,
      admin: {
        id: insert.lastInsertRowid,
        name: name.trim(),
        email: cleanEmail,
        role: 'superadmin'
      }
    });
  } catch (err) {
    console.error('[PLATFORM_CREATE_ADMIN_ERROR]', err);
    res.status(400).json({ error: err.message || 'Erro ao criar administrador da plataforma.' });
  }
});

module.exports = router;
