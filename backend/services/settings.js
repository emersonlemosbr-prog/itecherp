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

async function readSettings(storeId = 1) {
  const current = await row(storeId);
  if (!current || !current.value) {
    return {
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
        home: '/',
        auto_backup: false,
        backup_frequency: 'daily',
      },
      finance: {
        default_payment_method: 'pix',
      },
    };
  }
  return typeof current.value === 'object' && current.value !== null
    ? current.value
    : JSON.parse(current.value);
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
