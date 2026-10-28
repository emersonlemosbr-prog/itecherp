// routes/platform.js
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { authenticatePlatformAdmin } = require('../middleware/platformAuth');
const { checkStoreSubscription } = require('../services/multiTenantService');

const router = express.Router();

function validatePasswordRules(password) {
  if (!password || password.length < 8) {
    return 'A senha deve conter no mínimo 8 caracteres.';
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'A senha deve conter pelo menos uma letra e um número.';
  }
  const weak = ['12345678', 'password', 'admin123', 'admin@123', 'senha123'];
  if (weak.includes(password.toLowerCase())) {
    return 'Esta senha é muito simples. Escolha uma senha mais forte.';
  }
  return null;
}

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

// Rate limiting restrito para recuperação emergencial da senha mestra
const platformRecoveryAttempts = new Map();
function platformRecoveryRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutos
  const maxAttempts = 3;

  for (const [key, val] of platformRecoveryAttempts) {
    if (val.reset <= now) platformRecoveryAttempts.delete(key);
  }

  let record = platformRecoveryAttempts.get(ip);
  if (!record) {
    record = { count: 0, reset: now + windowMs };
    platformRecoveryAttempts.set(ip, record);
  }

  record.count += 1;
  if (record.count > maxAttempts) {
    const retrySec = Math.ceil((record.reset - now) / 1000);
    res.set('Retry-After', String(retrySec));
    return res.status(429).json({ error: `Muitas tentativas de recuperação. Tente novamente em ${retrySec} segundos.` });
  }

  next();
}

/**
 * Procedimento Seguro de Configuração / Redefinição Emergencial da Senha Mestra
 * Requer o segredo temporário PLATFORM_RECOVERY_SECRET configurado no ambiente.
 * Uso único por segredo, expiração/invalidação automática e registro de auditoria.
 */
router.post('/emergency-setup', platformRecoveryRateLimit, async (req, res) => {
  try {
    const expectedSecret = process.env.PLATFORM_RECOVERY_SECRET;
    if (!expectedSecret || expectedSecret.trim().length < 16) {
      return res.status(403).json({
        error: 'Procedimento de recuperação emergencial não habilitado no servidor. Configure PLATFORM_RECOVERY_SECRET com no mínimo 16 caracteres nas variáveis de ambiente.',
      });
    }

    const { recoverySecret, email, newPassword, name } = req.body;

    if (!recoverySecret || typeof recoverySecret !== 'string') {
      return res.status(400).json({ error: 'Informe o segredo de recuperação emergencial (recoverySecret).' });
    }

    // Comparação de tempo constante (timing-safe) via SHA-256
    const hashReceived = crypto.createHash('sha256').update(recoverySecret.trim()).digest();
    const hashExpected = crypto.createHash('sha256').update(expectedSecret.trim()).digest();
    if (!crypto.timingSafeEqual(hashReceived, hashExpected)) {
      return res.status(401).json({ error: 'Segredo de recuperação emergencial inválido.' });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Informe um e-mail válido para o Superadmin.' });
    }

    const pwdError = validatePasswordRules(newPassword);
    if (pwdError) {
      return res.status(400).json({ error: pwdError });
    }

    const secretHash = hashReceived.toString('hex');

    // Verificar se este segredo já foi utilizado (garantia de uso único)
    const alreadyUsed = await db.queryOne(`
      SELECT id FROM password_reset_tokens
      WHERE token_hash = $1 AND target_type = 'platform' AND used_at IS NOT NULL
      LIMIT 1
    `, [secretHash]);

    if (alreadyUsed) {
      return res.status(400).json({
        error: 'Este segredo de recuperação já foi utilizado. Atualize a variável PLATFORM_RECOVERY_SECRET no painel do servidor para autorizar uma nova redefinição.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name || 'Superadmin iTech').trim();
    const hash = await bcrypt.hash(newPassword, 12);
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';

    let adminId = null;
    let actionType = '';

    await db.transaction(async (tx) => {
      const existing = await tx.queryOne('SELECT id, name, session_version FROM platform_users WHERE LOWER(email) = $1', [cleanEmail]);

      if (existing) {
        adminId = existing.id;
        actionType = 'superadmin_emergency_password_reset';
        const newSessionVersion = (existing.session_version || 0) + 1;
        await tx.execute(`
          UPDATE platform_users
          SET password_hash = $1,
              active = 1,
              session_version = $2,
              last_access = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [hash, newSessionVersion, existing.id]);
      } else {
        // Verificar se há algum superadmin cadastrado
        const countRes = await tx.queryOne('SELECT COUNT(*) as count FROM platform_users WHERE role = $1', ['superadmin']);
        const count = parseInt(countRes?.count || '0', 10);
        if (count > 0) {
          throw new Error('Já existem administradores da plataforma cadastrados. Informe o e-mail exato do Superadmin que deseja redefinir.');
        }

        // Se nenhum superadmin existe, cria o primeiro
        actionType = 'superadmin_emergency_initial_setup';
        const insertRes = await tx.execute(`
          INSERT INTO platform_users (name, email, password_hash, role, active, session_version)
          VALUES ($1, $2, $3, 'superadmin', 1, 1)
          RETURNING id
        `, [cleanName, cleanEmail, hash]);
        adminId = insertRes.id;
      }

      // Marcar segredo como utilizado de forma atômica
      await tx.execute(`
        INSERT INTO password_reset_tokens (email, token_hash, target_type, target_id, expires_at, used_at)
        VALUES ($1, $2, 'platform', $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [cleanEmail, secretHash, adminId || 0]);

      // Registrar auditoria sem registrar senhas ou segredos
      await tx.query(`
        INSERT INTO platform_audit_logs (platform_user_id, platform_user_name, action, target_type, target_id, target_name, details, ip_address)
        VALUES ($1, $2, $3, 'platform_user', $4, $5, 'Senha mestra redefinida com sucesso via procedimento emergencial autorizado', $6)
      `, [adminId, cleanName, actionType, adminId, cleanEmail, ip]);
    });

    res.json({
      success: true,
      message: 'Senha mestra configurada com sucesso! Todas as sessões anteriores foram invalidadas.',
    });
  } catch (err) {
    console.error('[PLATFORM_EMERGENCY_SETUP_ERROR]', err.message);
    res.status(400).json({ error: err.message || 'Erro ao processar configuração emergencial.' });
  }
});

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
    const admin = await db.queryOne('SELECT * FROM platform_users WHERE LOWER(email) = $1', [cleanEmail]);

    if (!admin || !admin.active) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    platformLoginAttempts.delete(ip);

    await db.execute('UPDATE platform_users SET last_access = CURRENT_TIMESTAMP WHERE id = $1', [admin.id]);

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
 * Redefinição de senha do próprio Superadmin autenticado
 */
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Informe a senha atual e a nova senha.' });
    }

    const admin = await db.queryOne('SELECT * FROM platform_users WHERE id = $1', [req.platformAdmin.id]);
    if (!admin) {
      return res.status(404).json({ error: 'Administrador não encontrado.' });
    }

    const match = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Senha atual incorreta.' });
    }

    const pwdError = validatePasswordRules(newPassword);
    if (pwdError) {
      return res.status(400).json({ error: pwdError });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    const newSessionVersion = (admin.session_version || 0) + 1;
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';

    await db.execute(`
      UPDATE platform_users
      SET password_hash = $1,
          session_version = $2,
          last_access = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [hash, newSessionVersion, admin.id]);

    await db.query(`
      INSERT INTO platform_audit_logs (platform_user_id, platform_user_name, action, target_type, target_id, target_name, details, ip_address)
      VALUES ($1, $2, 'superadmin_password_change', 'platform_user', $3, $4, 'Senha mestra alterada pelo próprio Superadmin autenticado', $5)
    `, [admin.id, admin.name, admin.id, admin.email, ip]);

    res.json({
      success: true,
      message: 'Senha alterada com sucesso! Faça login novamente com sua nova credencial.',
    });
  } catch (err) {
    console.error('[PLATFORM_CHANGE_PASSWORD_ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao alterar senha do administrador.' });
  }
});

/**
 * Dados do Administrador da Plataforma autenticado
 */
router.get('/me', (req, res) => {
  res.json({ admin: req.platformAdmin });
});

/**
 * Listagem pesquisável de lojas com métricas e status de assinatura
 */
router.get('/stores', async (req, res) => {
  try {
    const { q, status } = req.query;

    let queryStr = `
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
    let paramIndex = 1;

    if (status && ['pending_activation', 'active', 'overdue', 'suspended'].includes(status)) {
      queryStr += ` AND s.status = $${paramIndex++}`;
      params.push(status);
    }

    if (q && q.trim()) {
      const term = `%${q.trim().toLowerCase()}%`;
      queryStr += ` AND (LOWER(s.name) LIKE $${paramIndex} OR LOWER(s.owner_name) LIKE $${paramIndex} OR LOWER(s.owner_email) LIKE $${paramIndex})`;
      params.push(term);
      paramIndex++;
    }

    queryStr += ` ORDER BY s.id DESC`;

    const rawStores = await db.query(queryStr, ...params);

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
router.get('/stores/:id', async (req, res) => {
  try {
    const store = await db.queryOne('SELECT * FROM stores WHERE id = $1', [req.params.id]);
    if (!store) {
      return res.status(404).json({ error: 'Loja não encontrada.' });
    }

    const sub = checkStoreSubscription(store);
    const history = await db.query(`
      SELECT * FROM store_subscription_history
      WHERE store_id = $1
      ORDER BY id DESC
    `, [store.id]);

    const users = await db.query(`
      SELECT id, full_name, username, role, active, is_master, last_access, created_at
      FROM users
      WHERE store_id = $1
      ORDER BY is_master DESC, role ASC, full_name ASC
    `, [store.id]);

    const custCount = await db.queryOne('SELECT COUNT(*) as c FROM customers WHERE store_id = $1', [store.id]);
    const soCount = await db.queryOne('SELECT COUNT(*) as c FROM service_orders WHERE store_id = $1', [store.id]);
    const salesCount = await db.queryOne('SELECT COUNT(*) as c FROM store_sales WHERE store_id = $1 AND is_canceled = 0', [store.id]);
    const stockCount = await db.queryOne('SELECT COUNT(*) as c FROM stock_products WHERE store_id = $1 AND is_active = 1', [store.id]);

    const counts = {
      customers: parseInt(custCount?.c || 0, 10),
      serviceOrders: parseInt(soCount?.c || 0, 10),
      sales: parseInt(salesCount?.c || 0, 10),
      stockProducts: parseInt(stockCount?.c || 0, 10)
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
router.post('/stores/:id/activate', async (req, res) => {
  try {
    const store = await db.queryOne('SELECT * FROM stores WHERE id = $1', [req.params.id]);
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

    await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE stores
        SET status = 'active', due_date = $1, grace_period_days = $2, plan = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [finalDueDate, finalGrace, finalPlan, store.id]);

      await tx.execute(`
        INSERT INTO store_subscription_history (
          store_id, action, previous_status, new_status,
          previous_due_date, new_due_date, notes,
          performed_by_platform_user_id, performed_by_name
        ) VALUES ($1, 'activated', $2, 'active', $3, $4, $5, $6, $7)
      `, [
        store.id,
        store.status,
        store.due_date,
        finalDueDate,
        notes || 'Loja ativada pelo administrador da plataforma.',
        req.platformAdmin.id,
        req.platformAdmin.name
      ]);
    });

    const updated = await db.queryOne('SELECT * FROM stores WHERE id = $1', [store.id]);
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
router.post('/stores/:id/suspend', async (req, res) => {
  try {
    const store = await db.queryOne('SELECT * FROM stores WHERE id = $1', [req.params.id]);
    if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });

    const { notes } = req.body;

    await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE stores
        SET status = 'suspended', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [store.id]);

      await tx.execute(`
        INSERT INTO store_subscription_history (
          store_id, action, previous_status, new_status, notes,
          performed_by_platform_user_id, performed_by_name
        ) VALUES ($1, 'suspended', $2, 'suspended', $3, $4, $5)
      `, [
        store.id,
        store.status,
        notes || 'Acesso suspenso pelo administrador da plataforma.',
        req.platformAdmin.id,
        req.platformAdmin.name
      ]);
    });

    const updated = await db.queryOne('SELECT * FROM stores WHERE id = $1', [store.id]);
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
router.post('/stores/:id/reactivate', async (req, res) => {
  try {
    const store = await db.queryOne('SELECT * FROM stores WHERE id = $1', [req.params.id]);
    if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });

    const rawDueDate = req.body.dueDate || req.body.due_date;
    const { notes } = req.body;

    let finalDueDate = rawDueDate || store.due_date;
    if (!rawDueDate) {
      const today = new Date().toISOString().slice(0, 10);
      if (!finalDueDate || finalDueDate < today) {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        finalDueDate = d.toISOString().slice(0, 10);
      }
    }

    await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE stores
        SET status = 'active', due_date = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [finalDueDate, store.id]);

      await tx.execute(`
        INSERT INTO store_subscription_history (
          store_id, action, previous_status, new_status,
          previous_due_date, new_due_date, notes,
          performed_by_platform_user_id, performed_by_name
        ) VALUES ($1, 'reactivated', $2, 'active', $3, $4, $5, $6, $7)
      `, [
        store.id,
        store.status,
        store.due_date,
        finalDueDate,
        notes || 'Loja reativada pelo administrador da plataforma.',
        req.platformAdmin.id,
        req.platformAdmin.name
      ]);
    });

    const updated = await db.queryOne('SELECT * FROM stores WHERE id = $1', [store.id]);
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
const handleUpdateDueDate = async (req, res) => {
  try {
    const store = await db.queryOne('SELECT * FROM stores WHERE id = $1', [req.params.id]);
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

    const today = new Date().toISOString().slice(0, 10);
    let newStatus = store.status;
    if (store.status === 'overdue' && dueDate >= today) {
      newStatus = 'active';
    }

    await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE stores
        SET due_date = $1, grace_period_days = $2, status = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [dueDate, finalGrace, newStatus, store.id]);

      await tx.execute(`
        INSERT INTO store_subscription_history (
          store_id, action, previous_status, new_status,
          previous_due_date, new_due_date, notes,
          performed_by_platform_user_id, performed_by_name
        ) VALUES ($1, 'due_date_update', $2, $3, $4, $5, $6, $7, $8)
      `, [
        store.id,
        store.status,
        newStatus,
        store.due_date,
        dueDate,
        notes || `Vencimento alterado para ${dueDate} com tolerância de ${finalGrace} dia(s).`,
        adminId,
        adminName
      ]);
    });

    const updated = await db.queryOne('SELECT * FROM stores WHERE id = $1', [store.id]);
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
async function executeDeleteStore(storeId, store, adminId, adminName, tx = db) {
  await tx.execute('UPDATE audit_log SET user_id = NULL WHERE user_id IN (SELECT id FROM users WHERE store_id = $1)', [storeId]);
  await tx.execute('UPDATE stock_movements SET user_id = NULL WHERE user_id IN (SELECT id FROM users WHERE store_id = $1)', [storeId]);
  await tx.execute('UPDATE cash_withdrawals SET created_by = NULL WHERE created_by IN (SELECT id FROM users WHERE store_id = $1)', [storeId]);

  await tx.execute('DELETE FROM service_order_photos WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = $1)', [storeId]);
  await tx.execute('DELETE FROM service_order_status_history WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = $1)', [storeId]);
  await tx.execute('DELETE FROM cash_withdrawals WHERE store_id = $1 OR service_order_id IN (SELECT id FROM service_orders WHERE store_id = $2)', [storeId, storeId]);
  await tx.execute('DELETE FROM warranties WHERE store_id = $1 OR service_order_id IN (SELECT id FROM service_orders WHERE store_id = $2)', [storeId, storeId]);
  await tx.execute('DELETE FROM credit_accounts WHERE store_id = $1 OR service_order_id IN (SELECT id FROM service_orders WHERE store_id = $2)', [storeId, storeId]);
  await tx.execute('DELETE FROM service_orders WHERE store_id = $1', [storeId]);

  await tx.execute(`
    DELETE FROM store_sale_items
    WHERE sale_id IN (SELECT id FROM store_sales WHERE store_id = $1)
       OR product_id IN (SELECT id FROM stock_products WHERE store_id = $2)
  `, [storeId, storeId]);
  await tx.execute('DELETE FROM store_sales WHERE store_id = $1', [storeId]);
  await tx.execute('DELETE FROM device_sales WHERE store_id = $1', [storeId]);

  await tx.execute(`
    DELETE FROM stock_movements
    WHERE store_id = $1 OR product_id IN (SELECT id FROM stock_products WHERE store_id = $2)
  `, [storeId, storeId]);
  await tx.execute('DELETE FROM stock_levels WHERE product_id IN (SELECT id FROM stock_products WHERE store_id = $1)', [storeId]);
  await tx.execute('DELETE FROM stock_products WHERE store_id = $1', [storeId]);
  await tx.execute('DELETE FROM stock_categories WHERE store_id = $1', [storeId]);
  await tx.execute('DELETE FROM stock_suppliers WHERE store_id = $1', [storeId]);
  await tx.execute('DELETE FROM customers WHERE store_id = $1', [storeId]);

  const storeNoteRows = await tx.query('SELECT id FROM notes WHERE store_id = $1', [storeId]);
  if (storeNoteRows.length > 0) {
    const noteIds = storeNoteRows.map(n => n.id);
    const ph = noteIds.map((_, i) => `$${i + 1}`).join(',');
    await tx.execute(`DELETE FROM note_checklists WHERE note_id IN (${ph})`, ...noteIds);
    await tx.execute(`DELETE FROM note_attachments WHERE note_id IN (${ph})`, ...noteIds);
    await tx.execute(`DELETE FROM note_reminders WHERE note_id IN (${ph})`, ...noteIds);
    await tx.execute(`DELETE FROM note_labels WHERE note_id IN (${ph})`, ...noteIds);
    await tx.execute(`DELETE FROM favorite_notes WHERE note_id IN (${ph})`, ...noteIds);
    await tx.execute(`DELETE FROM pinned_notes WHERE note_id IN (${ph})`, ...noteIds);
  }
  await tx.execute('DELETE FROM notes WHERE store_id = $1', [storeId]);
  await tx.execute('DELETE FROM labels WHERE store_id = $1', [storeId]);

  await tx.execute('DELETE FROM pagbank_calculator WHERE store_id = $1', [storeId]);
  await tx.execute('DELETE FROM piece_calculator WHERE store_id = $1', [storeId]);
  await tx.execute('DELETE FROM frontals_calculator WHERE store_id = $1', [storeId]);
  await tx.execute('DELETE FROM frontals_price_list WHERE store_id = $1', [storeId]);

  await tx.execute('DELETE FROM screen_protector_models WHERE store_id = $1', [storeId]);
  await tx.execute('DELETE FROM screen_protector_groups WHERE store_id = $1', [storeId]);
  await tx.execute('DELETE FROM parts_models WHERE store_id = $1', [storeId]);
  await tx.execute('DELETE FROM parts_options WHERE store_id = $1', [storeId]);

  await tx.execute('DELETE FROM virus_scan_results WHERE scan_id IN (SELECT id FROM virus_scans WHERE store_id = $1)', [storeId]);
  await tx.execute('DELETE FROM virus_scans WHERE store_id = $1', [storeId]);
  await tx.execute('DELETE FROM financial_history WHERE store_id = $1', [storeId]);
  await tx.execute('DELETE FROM financial_history_state WHERE store_id = $1', [storeId]);

  await tx.execute('DELETE FROM document_sequences WHERE store_id = $1', [storeId]);
  await tx.execute('DELETE FROM system_settings WHERE store_id = $1', [storeId]);
  await tx.execute('DELETE FROM audit_log WHERE store_id = $1', [storeId]);

  const storeUserRows = await tx.query('SELECT id FROM users WHERE store_id = $1', [storeId]);
  if (storeUserRows.length > 0) {
    const uIds = storeUserRows.map(u => u.id);
    const ph = uIds.map((_, i) => `$${i + 1}`).join(',');
    await tx.execute(`DELETE FROM password_reset_tokens WHERE target_type = 'user' AND target_id IN (${ph})`, ...uIds);
  }
  if (store.owner_email) {
    await tx.execute("DELETE FROM password_reset_tokens WHERE (target_type = 'owner' AND target_id = $1) OR email = $2", [storeId, store.owner_email]);
  } else {
    await tx.execute("DELETE FROM password_reset_tokens WHERE target_type = 'owner' AND target_id = $1", [storeId]);
  }

  await tx.execute('DELETE FROM users WHERE store_id = $1', [storeId]);
  await tx.execute('DELETE FROM store_subscription_history WHERE store_id = $1', [storeId]);
  await tx.execute('DELETE FROM stores WHERE id = $1', [storeId]);

  await tx.execute(`
    INSERT INTO platform_audit_logs (
      platform_user_id, platform_user_name, action, target_type, target_id, target_name, details
    ) VALUES ($1, $2, 'DELETE_STORE', 'store', $3, $4, $5)
  `, [
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
  ]);
}

/**
 * Ação: Excluir cadastro de loja permanentemente (apenas SUPERADMIN)
 */
router.delete('/stores/:id', async (req, res) => {
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

    const store = await db.queryOne('SELECT * FROM stores WHERE id = $1', [storeId]);
    if (!store) {
      return res.status(404).json({ error: 'Loja não encontrada.' });
    }

    const confirmation = (req.body?.confirmation || req.query?.confirmation || '').trim();
    if (confirmation !== 'EXCLUIR') {
      return res.status(400).json({ error: 'Para confirmar a exclusão permanente, digite e envie EXCLUIR.' });
    }

    const adminId = req.platformAdmin?.id || null;
    const adminName = req.platformAdmin?.name || 'Administrador da Plataforma';

    await db.transaction(async (tx) => {
      await executeDeleteStore(storeId, store, adminId, adminName, tx);
    });

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
router.post('/stores/bulk-action', async (req, res) => {
  try {
    const { action, storeIds, dueDate, gracePeriodDays, notes, confirmation } = req.body;

    if (!['activate', 'suspend', 'delete'].includes(action)) {
      return res.status(400).json({ error: 'Ação em massa inválida. Opções: activate, suspend ou delete.' });
    }

    if (!Array.isArray(storeIds) || storeIds.length === 0) {
      return res.status(400).json({ error: 'Nenhuma loja selecionada para a ação em massa.' });
    }

    const rawIds = [...new Set(storeIds.map(Number))].filter(id => Number.isInteger(id) && id > 0);
    if (rawIds.length === 0) {
      return res.status(400).json({ error: 'Nenhum ID de loja válido fornecido.' });
    }

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

    await db.transaction(async (tx) => {
      for (const id of rawIds) {
        if (id === 1 && (action === 'delete' || action === 'suspend')) {
          skippedIds.push({ id, reason: 'A loja principal do sistema (iTech) não pode ser suspensa ou excluída.' });
          continue;
        }

        const store = await tx.queryOne('SELECT * FROM stores WHERE id = $1', [id]);
        if (!store) {
          skippedIds.push({ id, reason: 'Loja não encontrada.' });
          continue;
        }

        if (action === 'activate') {
          await tx.execute(`
            UPDATE stores
            SET status = 'active', due_date = $1, grace_period_days = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
          `, [finalDueDate, finalGrace, id]);

          await tx.execute(`
            INSERT INTO store_subscription_history (
              store_id, action, previous_status, new_status,
              previous_due_date, new_due_date, notes,
              performed_by_platform_user_id, performed_by_name
            ) VALUES ($1, 'bulk_activated', $2, 'active', $3, $4, $5, $6, $7)
          `, [
            id,
            store.status,
            store.due_date,
            finalDueDate,
            notes || 'Loja ativada via ação em massa no painel da plataforma.',
            adminId,
            adminName
          ]);

          processedIds.push(id);
        } else if (action === 'suspend') {
          await tx.execute(`
            UPDATE stores
            SET status = 'suspended', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [id]);

          await tx.execute(`
            INSERT INTO store_subscription_history (
              store_id, action, previous_status, new_status, notes,
              performed_by_platform_user_id, performed_by_name
            ) VALUES ($1, 'bulk_suspended', $2, 'suspended', $3, $4, $5)
          `, [
            id,
            store.status,
            notes || 'Acesso suspenso via ação em massa no painel da plataforma.',
            adminId,
            adminName
          ]);

          processedIds.push(id);
        } else if (action === 'delete') {
          await executeDeleteStore(id, store, adminId, adminName, tx);
          processedIds.push(id);
        }
      }

      await tx.execute(`
        INSERT INTO platform_audit_logs (
          platform_user_id, platform_user_name, action, target_type, target_id, target_name, details
        ) VALUES ($1, $2, $3, 'bulk_stores', 0, $4, $5)
      `, [
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
      ]);
    });

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
router.post('/stores/:id/payment', async (req, res) => {
  try {
    const store = await db.queryOne('SELECT * FROM stores WHERE id = $1', [req.params.id]);
    if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });

    const { amount, paymentMethod, extendMonths, newDueDate, notes } = req.body;
    const amountVal = parseFloat(amount) || 0;
    const method = (paymentMethod || 'PIX').trim();

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

    await db.transaction(async (tx) => {
      const shouldActivate = ['suspended', 'overdue', 'pending_activation'].includes(store.status);
      const newStatus = shouldActivate ? 'active' : store.status;

      await tx.execute(`
        UPDATE stores
        SET status = $1, due_date = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [newStatus, nextDueDate, store.id]);

      await tx.execute(`
        INSERT INTO store_subscription_history (
          store_id, action, previous_status, new_status,
          previous_due_date, new_due_date, amount_paid, payment_method, notes,
          performed_by_platform_user_id, performed_by_name
        ) VALUES ($1, 'payment_registered', $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
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
      ]);
    });

    const updated = await db.queryOne('SELECT * FROM stores WHERE id = $1', [store.id]);
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
router.get('/stores/:id/history', async (req, res) => {
  try {
    const history = await db.query(`
      SELECT * FROM store_subscription_history
      WHERE store_id = $1
      ORDER BY id DESC
    `, [req.params.id]);

    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar histórico da loja.' });
  }
});

/**
 * Listar outros administradores da plataforma
 */
router.get('/admins', async (_req, res) => {
  try {
    const admins = await db.query(`
      SELECT id, name, email, role, active, created_at, last_access
      FROM platform_users
      ORDER BY id ASC
    `);
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
    const existing = await db.queryOne('SELECT id FROM platform_users WHERE LOWER(email) = $1', [cleanEmail]);
    if (existing) {
      return res.status(409).json({ error: 'Já existe um administrador cadastrado com este e-mail.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const insert = await db.execute(`
      INSERT INTO platform_users (name, email, password_hash, role, active)
      VALUES ($1, $2, $3, 'superadmin', 1)
      RETURNING id
    `, [name.trim(), cleanEmail, hash]);

    res.status(201).json({
      success: true,
      admin: {
        id: insert.id,
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
