/**
 * Notification Service — iTech ERP
 * Gerencia a criação, envio seletivo, persistência e permissões de notificações por usuário.
 */
const db = require('../db/database');
const { appEvents } = require('../utils/events');

// Catálogo com as chaves oficiais de eventos de notificação e suas permissões necessárias
const NOTIFICATION_EVENTS = {
  // Ordens de Serviço
  'os_created': { category: 'orders', label: 'Quando uma nova OS for aberta', requiredPermission: 'orders' },
  'os_updated': { category: 'orders', label: 'Quando uma OS for atualizada', requiredPermission: 'orders' },
  'os_status_changed': { category: 'orders', label: 'Quando uma OS mudar de status', requiredPermission: 'orders' },
  'os_completed': { category: 'orders', label: 'Quando uma OS for concluída', requiredPermission: 'orders' },
  'os_delivered': { category: 'orders', label: 'Quando uma OS for entregue', requiredPermission: 'orders' },

  // Vendas
  'sale_box_completed': { category: 'sales', label: 'Quando uma venda de caixa for realizada', requiredPermission: 'store_sales' },
  'sale_device_completed': { category: 'sales', label: 'Quando um aparelho for vendido', requiredPermission: 'device_sales' },
  'sale_canceled': { category: 'sales', label: 'Quando uma venda for cancelada', requiredPermission: 'store_sales' },
  'sale_by_other_staff': { category: 'sales', label: 'Quando uma venda for registrada por outro funcionário', requiredPermission: 'store_sales' },

  // Estoque
  'product_created': { category: 'inventory', label: 'Quando um produto for cadastrado', requiredPermission: 'inventory' },
  'stock_entry': { category: 'inventory', label: 'Quando houver entrada de estoque', requiredPermission: 'inventory' },
  'stock_exit': { category: 'inventory', label: 'Quando houver saída de estoque', requiredPermission: 'inventory' },
  'stock_min_reached': { category: 'inventory', label: 'Quando um produto atingir estoque mínimo', requiredPermission: 'inventory' },
  'stock_out': { category: 'inventory', label: 'Quando um produto ficar sem estoque', requiredPermission: 'inventory' },

  // Financeiro
  'finance_movement': { category: 'finance', label: 'Quando uma movimentação financeira for registrada', adminOnly: true },
  'finance_expense': { category: 'finance', label: 'Quando uma despesa for lançada', adminOnly: true },
  'finance_revenue': { category: 'finance', label: 'Quando uma receita for registrada', adminOnly: true },
  'finance_updated': { category: 'finance', label: 'Quando houver alteração em movimentações financeiras', adminOnly: true },

  // Clientes
  'customer_created': { category: 'customers', label: 'Quando um novo cliente for cadastrado', requiredPermission: 'customers' },
  'customer_updated': { category: 'customers', label: 'Quando os dados de um cliente forem alterados', requiredPermission: 'customers' },

  // Sistema
  'system_important': { category: 'system', label: 'Notificações importantes do sistema' },
  'system_admin_alert': { category: 'system', label: 'Alertas administrativos', adminOnly: true },
  'system_update': { category: 'system', label: 'Avisos de atualização do sistema' },
  'subscription_reminder': { category: 'system', label: 'Lembretes de vencimento da mensalidade', adminOnly: false },
};

/**
 * Retorna as preferências do usuário. Caso ainda não existam no banco, retorna os padrões habilitados ('all').
 */
async function getUserNotificationPreferences(storeId, userId) {
  const row = await db.queryOne(
    'SELECT mode, preferences FROM user_notification_preferences WHERE store_id = $1 AND user_id = $2',
    [storeId, userId]
  );

  let preferences = {};
  if (row?.preferences) {
    preferences = typeof row.preferences === 'object' ? row.preferences : JSON.parse(row.preferences);
  }

  const mode = row?.mode || 'all';

  // Se for 'all', todos os eventos são true por padrão
  // Se for 'none', todos são false
  // Se for 'custom', mescla com o objeto salvo (default true para novidades)
  const result = {};
  for (const key of Object.keys(NOTIFICATION_EVENTS)) {
    if (mode === 'all') {
      result[key] = true;
    } else if (mode === 'none') {
      result[key] = false;
    } else {
      result[key] = preferences[key] !== undefined ? Boolean(preferences[key]) : true;
    }
  }

  return {
    mode,
    preferences: result,
  };
}

/**
 * Salva as preferências de notificação do usuário no banco.
 */
async function saveUserNotificationPreferences(storeId, userId, { mode, preferences }) {
  const validMode = ['all', 'none', 'custom'].includes(mode) ? mode : 'custom';
  const cleanPrefs = {};

  if (preferences && typeof preferences === 'object') {
    for (const key of Object.keys(NOTIFICATION_EVENTS)) {
      if (preferences[key] !== undefined) {
        cleanPrefs[key] = Boolean(preferences[key]);
      }
    }
  }

  await db.query(`
    INSERT INTO user_notification_preferences (store_id, user_id, mode, preferences, updated_at)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    ON CONFLICT (store_id, user_id)
    DO UPDATE SET mode = EXCLUDED.mode, preferences = EXCLUDED.preferences, updated_at = CURRENT_TIMESTAMP
  `, [storeId, userId, validMode, JSON.stringify(cleanPrefs)]);

  return getUserNotificationPreferences(storeId, userId);
}

/**
 * Dispara uma notificação para todos os usuários elegíveis da loja
 * de acordo com o isolamento multi-tenant, cargo, permissões ativas e preferências seletivas.
 */
async function dispatchNotification({
  storeId,
  actorId, // ID do usuário que gerou o evento (opcional, para filtrar auto-notificação se aplicável)
  eventKey,
  title,
  description,
  link = null,
  metadata = {}
}) {
  const eventDef = NOTIFICATION_EVENTS[eventKey];
  if (!eventDef) {
    console.warn(`[NOTIFICATIONS] Evento desconhecido ignorado: ${eventKey}`);
    return;
  }

  // 1. Busca todos os usuários ativos da loja
  const users = await db.query(
    'SELECT id, username, full_name, role, permissions FROM users WHERE store_id = $1 AND active = 1',
    [storeId]
  );

  if (!users || !users.length) return;

  const insertedIds = [];

  for (const user of users) {
    // 2. Validação estrita de perfil e permissão
    const isAdmin = user.role === 'admin';
    if (eventDef.adminOnly && !isAdmin) {
      continue; // Não é admin, ignora evento financeiro/administrativo
    }

    if (eventDef.requiredPermission && !isAdmin) {
      let perms = {};
      try {
        perms = typeof user.permissions === 'object' && user.permissions !== null
          ? user.permissions
          : JSON.parse(user.permissions || '{}');
      } catch {}

      if (!perms[eventDef.requiredPermission]) {
        continue; // Não tem a permissão para a área (ex: orders, inventory, customers), ignora
      }
    }

    // 3. Regra especial para venda realizada por outro funcionário
    if (eventKey === 'sale_by_other_staff') {
      if (actorId && user.id === actorId) {
        continue; // O próprio vendedor não recebe "venda registrada por outro"
      }
    }

    // 4. Checa as preferências seletivas do usuário
    const userPrefs = await getUserNotificationPreferences(storeId, user.id);
    if (userPrefs.mode === 'none') {
      continue;
    }
    if (userPrefs.mode === 'custom' && !userPrefs.preferences[eventKey]) {
      continue;
    }

    // 5. Grava a notificação no banco de dados para este usuário
    try {
      const res = await db.queryOne(`
        INSERT INTO user_notifications (store_id, user_id, event_key, category, title, description, link, metadata, is_read)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
        RETURNING id
      `, [storeId, user.id, eventKey, eventDef.category, title, description, link, JSON.stringify(metadata)]);

      if (res?.id) insertedIds.push(res.id);
    } catch (err) {
      console.error(`[NOTIFICATIONS] Falha ao gravar notificação para user ${user.id}:`, err.message);
    }
  }

  // 6. Notifica em tempo real os clientes conectados via SSE da loja
  if (insertedIds.length > 0) {
    appEvents.emit('notification:new', {
      storeId,
      eventKey,
      count: insertedIds.length,
      at: new Date().toISOString()
    });
  }
}

module.exports = {
  NOTIFICATION_EVENTS,
  getUserNotificationPreferences,
  saveUserNotificationPreferences,
  dispatchNotification,
};

