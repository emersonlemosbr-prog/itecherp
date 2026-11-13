/**
 * Subscription Reminder Service — iTech ERP
 * Processa e emite lembretes automáticos de vencimento e cobrança por loja
 * utilizando fuso horário oficial America/Sao_Paulo e prevenção estrita de duplicidade.
 */

const db = require('../db/database');
const { appEvents } = require('../utils/events');

const REMINDER_STAGES = [
  {
    key: 'due_minus_7',
    dayDiff: 7,
    title: 'Sua mensalidade vence em 7 dias',
    description: (dueDate) => `A mensalidade da sua loja vence em 7 dias (${dueDate}). Regularize com antecedência para garantir o funcionamento ininterrupto.`,
    allowedStatuses: ['active']
  },
  {
    key: 'due_minus_3',
    dayDiff: 3,
    title: 'Lembrete: sua mensalidade está próxima do vencimento',
    description: (dueDate) => `Lembrete: sua mensalidade vence em 3 dias (${dueDate}).`,
    allowedStatuses: ['active']
  },
  {
    key: 'due_minus_1',
    dayDiff: 1,
    title: 'Atenção: sua mensalidade vence amanhã',
    description: (dueDate) => `Atenção: sua mensalidade vence amanhã (${dueDate}).`,
    allowedStatuses: ['active']
  },
  {
    key: 'due_today',
    dayDiff: 0,
    title: 'Sua mensalidade vence hoje',
    description: (dueDate) => `Sua mensalidade vence hoje (${dueDate}). Efetue o pagamento para manter todos os recursos comerciais liberados.`,
    allowedStatuses: ['active', 'overdue']
  },
  {
    key: 'due_plus_1',
    dayDiff: -1,
    title: 'Sua mensalidade está em atraso',
    description: (dueDate) => `Sua mensalidade vencida em ${dueDate} está em atraso. Entre em contato com o suporte para regularizar.`,
    allowedStatuses: ['active', 'overdue', 'suspended']
  },
  {
    key: 'due_plus_3',
    dayDiff: -3,
    title: 'Sua mensalidade continua pendente',
    description: (dueDate) => `Sua mensalidade vencida em ${dueDate} continua pendente. Regularize o acesso da sua loja para restabelecer as operações.`,
    allowedStatuses: ['active', 'overdue', 'suspended']
  }
];

/**
 * Retorna a data corrente formatada em YYYY-MM-DD no fuso horário America/Sao_Paulo
 */
function getSaoPauloDateString(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * Extrai YYYY-MM-DD de forma segura
 */
function extractDateOnlyString(val) {
  if (!val) return null;
  if (typeof val === 'string') {
    const match = val.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : val.slice(0, 10);
  }
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val).slice(0, 10);
}

/**
 * Calcula a diferença em dias inteiros (targetDate - baseDate)
 */
function calculateDayDiff(targetDateStr, baseDateStr) {
  const [y1, m1, d1] = targetDateStr.split('-').map(Number);
  const [y2, m2, d2] = baseDateStr.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t1 - t2) / (1000 * 60 * 60 * 24));
}

/**
 * Formata data no formato brasileiro DD/MM/AAAA
 */
function formatDateBR(dateStr) {
  if (!dateStr || !dateStr.includes('-')) return dateStr;
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Processa e envia lembretes para todas as lojas cadastradas
 */
async function processSubscriptionReminders(customTodayStr = null) {
  const todayStr = customTodayStr || getSaoPauloDateString();

  // Busca lojas ativas, em atraso ou suspensas com vencimento definido
  const stores = await db.query(`
    SELECT id, name, status, due_date
    FROM stores
    WHERE due_date IS NOT NULL
      AND status IN ('active', 'overdue', 'suspended')
  `);

  if (!stores || !stores.length) {
    return { processedStores: 0, sentReminders: 0 };
  }

  let sentReminders = 0;

  for (const store of stores) {
    const dueDateStr = extractDateOnlyString(store.due_date);
    if (!dueDateStr) continue;

    const dayDiff = calculateDayDiff(dueDateStr, todayStr);
    const matchingStage = REMINDER_STAGES.find(s => s.dayDiff === dayDiff);

    if (!matchingStage) continue;
    if (!matchingStage.allowedStatuses.includes(store.status)) continue;

    const dueDateBR = formatDateBR(dueDateStr);
    const reminderKey = `${matchingStage.key}_${dueDateStr}`;
    const title = matchingStage.title;
    const description = matchingStage.description(dueDateBR);

    // Verifica se já existe notificação deste ciclo/estágio para a loja
    const existing = await db.queryOne(`
      SELECT id FROM user_notifications
      WHERE store_id = $1
        AND event_key = 'subscription_reminder'
        AND metadata LIKE $2
      LIMIT 1
    `, [store.id, `%"reminder_key":"${reminderKey}"%`]);

    if (existing) {
      // Já enviado anteriormente para este vencimento e estágio
      continue;
    }

    // Busca usuários ativos da loja
    const users = await db.query(`
      SELECT id FROM users
      WHERE store_id = $1 AND active = 1
    `, [store.id]);

    if (!users || !users.length) continue;

    const metadataObj = {
      reminder_key: reminderKey,
      reminder_stage: matchingStage.key,
      due_date: dueDateStr
    };
    const metadataJson = JSON.stringify(metadataObj);

    let createdCount = 0;
    for (const u of users) {
      try {
        await db.execute(`
          INSERT INTO user_notifications (
            store_id, user_id, event_key, category, title, description, link, metadata, is_read, created_at
          ) VALUES ($1, $2, 'subscription_reminder', 'system', $3, $4, NULL, $5, FALSE, CURRENT_TIMESTAMP)
        `, [store.id, u.id, title, description, metadataJson]);
        createdCount++;
      } catch (err) {
        console.error(`[REMINDER_SERVICE] Falha ao gravar lembrete para user ${u.id}:`, err.message);
      }
    }

    if (createdCount > 0) {
      sentReminders++;
      appEvents.emit('notification:new', {
        storeId: store.id,
        eventKey: 'subscription_reminder',
        title,
        at: new Date().toISOString()
      });
    }
  }

  return { processedStores: stores.length, sentReminders };
}

let schedulerTimer = null;

function startSubscriptionReminderScheduler(intervalMs = 60 * 60 * 1000) {
  if (schedulerTimer) return;

  // Execução inicial com pequeno delay
  setTimeout(() => {
    processSubscriptionReminders().catch(err => {
      console.warn('[REMINDER_SCHEDULER_STARTUP_WARN]', err.message);
    });
  }, 4000);

  schedulerTimer = setInterval(() => {
    processSubscriptionReminders().catch(err => {
      console.warn('[REMINDER_SCHEDULER_INTERVAL_WARN]', err.message);
    });
  }, intervalMs);

  if (schedulerTimer.unref) {
    schedulerTimer.unref();
  }
}

function stopSubscriptionReminderScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

module.exports = {
  REMINDER_STAGES,
  getSaoPauloDateString,
  calculateDayDiff,
  processSubscriptionReminders,
  startSubscriptionReminderScheduler,
  stopSubscriptionReminderScheduler
};

