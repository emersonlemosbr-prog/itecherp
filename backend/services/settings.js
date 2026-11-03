const db = require('../db/database');

const defaultPermissions = Object.fromEntries(
  ['customers','create_customer','edit_customer','orders','create_order','edit_order','finish_order',
   'warranties','inventory','store_sales','device_sales','credits','android','notes','printing']
    .map(key => [key, false])
);

function userView(user) {
  let saved = {};
  try {
    saved = typeof user.permissions === 'object' && user.permissions !== null
      ? user.permissions
      : JSON.parse(user.permissions || '{}');
  } catch {}
  const { password_hash, ...safe } = user;
  return {
    ...safe,
    store_id: user.store_id || 1,
    active: !!user.active,
    is_master: !!user.is_master,
    permissions: user.role === 'admin'
      ? Object.fromEntries(Object.keys(defaultPermissions).map(key => [key, true]))
      : { ...defaultPermissions, ...saved }
  };
}

async function row(storeId = 1) {
  return await db.queryOne('SELECT * FROM system_settings WHERE store_id = $1 LIMIT 1', [storeId]);
}

const DEFAULT_SETTINGS = {
  store: {
    name: 'iTech Celular e Informática',
    trade_name: 'iTech',
    email: 'contato@itechcelulareinformatica.com.br',
    phone: '',
    whatsapp: '',
    address: { street: '', number: '', complement: '', district: '', city: '', state: '', zip: '' },
    logo: '',
  },
  documents: {
    receipt_terms: 'Agradecemos a preferência! Garantia legal de 90 dias.',
    warranty_terms: 'Garantia legal de 90 dias para defeitos de fabricação e serviços executados.',
    quote_terms: 'Orçamento válido por 10 dias.',
    ticket_message: 'Obrigado pela preferência! Volte sempre.',
    warranty_days: 90,
  },
  system: {
    theme: 'dark',
    color: '#ffbe0b',
    home: '/',
    page_size: 20,
    notifications: true,
    sounds: false,
    confirm_delete: true,
    edit_order_number: false,
    dashboard_refresh: true,
    financial_refresh: true,
    auto_backup: false,
    backup_frequency: 'daily',
  },
  finance: {
    rates: [3.19, 4.59, 5.99, 7.39, 8.79, 10.19, 11.59, 12.99, 14.39, 15.79, 17.19, 18.59],
    margin: 100,
    risk: 9.97,
    labor: 80,
    supplies_frame: 0,
    supplies_glue: 0.5,
    protector: 2,
    default_payment_method: 'pix',
    payments: {
      pix: true,
      cash: true,
      credit_card: true,
      debit_card: true,
      credit_account: true,
    },
  },
};

function mergeSettingsWithDefaults(raw) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(raw || {}),
    store: { ...DEFAULT_SETTINGS.store, ...(raw?.store || {}) },
    documents: { ...DEFAULT_SETTINGS.documents, ...(raw?.documents || {}) },
    system: { ...DEFAULT_SETTINGS.system, ...(raw?.system || {}) },
    finance: {
      ...DEFAULT_SETTINGS.finance,
      ...(raw?.finance || {}),
      payments: { ...DEFAULT_SETTINGS.finance.payments, ...(raw?.finance?.payments || {}) },
      rates: Array.isArray(raw?.finance?.rates) && raw.finance.rates.length > 0
        ? raw.finance.rates
        : DEFAULT_SETTINGS.finance.rates,
    },
  };
  return merged;
}

async function readSettings(storeId = 1) {
  const current = await row(storeId);
  if (!current || !current.value) {
    return DEFAULT_SETTINGS;
  }
  const parsed = typeof current.value === 'object' && current.value !== null
    ? current.value
    : JSON.parse(current.value);
  return mergeSettingsWithDefaults(parsed);
}

async function sequences(storeId = 1) {
  const rows = await db.query('SELECT kind, next_value FROM document_sequences WHERE store_id = $1', [storeId]);
  return Object.fromEntries(rows.map(({ kind, next_value }) => [kind, next_value]));
}

async function nextNumber(kind, storeId = 1) {
  return db.transaction(async (tx) => {
    let current = await tx.queryOne('SELECT next_value FROM document_sequences WHERE store_id = $1 AND kind = $2 FOR UPDATE', [storeId, kind]);
    if (!current) {
      await tx.query(`
        INSERT INTO document_sequences (store_id, kind, next_value)
        VALUES ($1, $2, 1)
        ON CONFLICT (store_id, kind) DO NOTHING
      `, [storeId, kind]);
      current = { next_value: 1 };
    }
    const val = current.next_value;
    await tx.query('UPDATE document_sequences SET next_value = next_value + 1 WHERE store_id = $1 AND kind = $2', [storeId, kind]);
    return val;
  });
}

module.exports = { defaultPermissions, userView, readSettings, sequences, nextNumber, row };
