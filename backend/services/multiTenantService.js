// services/multiTenantService.js
const bcrypt = require('bcryptjs');
const db = require('../db/database');

const DEFAULT_SETTINGS_TEMPLATE = {
  store: {
    name: '',
    trade_name: '',
    cnpj: '',
    ie: '',
    email: '',
    phone: '',
    whatsapp: '',
    address: {
      street: '',
      number: '',
      complement: '',
      district: '',
      city: '',
      state: '',
      zip: '',
    },
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

/**
 * Verifica o status de assinatura da loja e aplica suspensão automática se vencida além da tolerância.
 */
async function checkStoreSubscription(storeOrId) {
  let store = storeOrId;
  if (typeof storeOrId === 'number' || (typeof storeOrId === 'string' && /^\d+$/.test(storeOrId))) {
    store = await db.queryOne('SELECT * FROM stores WHERE id = $1', [Number(storeOrId)]);
  }

  if (!store) {
    return { isAccessible: false, canAccessErp: false, status: 'not_found', effectiveStatus: 'not_found', reason: 'Loja não encontrada.' };
  }

  const now = new Date();

  // Se a loja ainda está aguardando ativação
  if (store.status === 'pending_activation') {
    return {
      isAccessible: false,
      canAccessErp: false,
      status: 'pending_activation',
      effectiveStatus: 'pending_activation',
      reason: 'Sua loja está aguardando ativação pela nossa equipe.',
      dueDate: store.due_date,
      storeName: store.name,
      contact: getPlatformContactInfo()
    };
  }

  // Se a loja já está suspensa manualmente ou por inadimplência
  if (store.status === 'suspended') {
    return {
      isAccessible: false,
      canAccessErp: false,
      status: 'suspended',
      effectiveStatus: 'suspended',
      reason: 'Acesso suspenso por assinatura vencida ou pendente.',
      dueDate: store.due_date,
      storeName: store.name,
      contact: getPlatformContactInfo()
    };
  }

  // Se tem data de vencimento, verificar atraso e tolerância
  if (store.due_date) {
    const dueDateStr = typeof store.due_date === 'string' ? store.due_date : store.due_date.toISOString().slice(0, 10);
    const dueDate = new Date(dueDateStr + 'T23:59:59');
    const graceDays = store.grace_period_days !== undefined ? store.grace_period_days : 3;
    const graceLimitDate = new Date(dueDate.getTime() + graceDays * 24 * 60 * 60 * 1000);

    if (now > graceLimitDate) {
      // Ultrapassou a tolerância: suspender automaticamente no banco
      await db.query(`
        UPDATE stores
        SET status = 'suspended', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [store.id]);

      await db.query(`
        INSERT INTO store_subscription_history (store_id, action, previous_status, new_status, notes, performed_by_name)
        VALUES ($1, 'auto_suspended_overdue', $2, 'suspended', 'Suspensão automática após encerramento do prazo de tolerância', 'Sistema')
      `, [store.id, store.status]);

      return {
        isAccessible: false,
        canAccessErp: false,
        status: 'suspended',
        effectiveStatus: 'suspended',
        reason: `Sua assinatura venceu em ${dueDateStr} e o período de tolerância encerrou. Entre em contato para regularizar o acesso.`,
        dueDate: dueDateStr,
        storeName: store.name,
        contact: getPlatformContactInfo()
      };
    } else if (now > dueDate) {
      // Venceu mas ainda está na tolerância: marca como 'overdue' se ainda não estiver
      if (store.status !== 'overdue') {
        await db.query(`
          UPDATE stores
          SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [store.id]);

        await db.query(`
          INSERT INTO store_subscription_history (store_id, action, previous_status, new_status, notes, performed_by_name)
          VALUES ($1, 'status_overdue', $2, 'overdue', 'Assinatura em período de tolerância', 'Sistema')
        `, [store.id, store.status]);
      }
      return {
        isAccessible: true,
        canAccessErp: true,
        status: 'overdue',
        effectiveStatus: 'overdue',
        inGracePeriod: true,
        dueDate: dueDateStr,
        storeName: store.name,
        contact: getPlatformContactInfo()
      };
    }
  }

  return {
    isAccessible: true,
    canAccessErp: true,
    status: store.status,
    effectiveStatus: store.status,
    dueDate: store.due_date,
    storeName: store.name
  };
}

/**
 * Retorna as informações de contato do administrador da plataforma para regularização.
 */
function getPlatformContactInfo() {
  return {
    name: process.env.PLATFORM_ADMIN_CONTACT_NAME || 'Administração iTech ERP',
    email: process.env.PLATFORM_ADMIN_CONTACT_EMAIL || 'suporte@itecherp.com.br',
    whatsapp: process.env.PLATFORM_ADMIN_CONTACT_WHATSAPP || '(11) 99999-9999',
    message: 'Para ativar ou regularizar sua assinatura, fale diretamente com o suporte.'
  };
}

/**
 * Valida a disponibilidade de um nickname operacional de ERP
 */
async function isNicknameAvailable(nickname) {
  if (!nickname || typeof nickname !== 'string') return false;
  const clean = nickname.trim().toLowerCase();
  if (!/^[\w.@-]{3,60}$/.test(clean)) return false;
  const existing = await db.queryOne('SELECT id FROM users WHERE LOWER(username) = $1', [clean]);
  return !existing;
}

/**
 * Cadastra uma nova loja no sistema (Multi-tenant)
 */
async function createStoreWithInitialData({
  storeName,
  ownerName,
  ownerEmail,
  email,
  phone,
  contactPhone,
  ownerPassword,
  googleId = null,
  nickname,
  erpPassword,
  plan = 'standard'
}) {
  const finalEmail = (ownerEmail || email || '').trim();
  const finalPhone = (contactPhone || phone || '').trim();

  if (!storeName || !storeName.trim()) throw new Error('Informe o nome da loja.');
  if (!ownerName || !ownerName.trim()) throw new Error('Informe o nome do proprietário.');
  if (!finalEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(finalEmail)) {
    throw new Error('Informe um e-mail válido para o proprietário.');
  }
  if (!nickname || !/^[\w.@-]{3,60}$/.test(nickname.trim())) {
    throw new Error('Informe um nickname válido para o login no ERP (3 a 60 caracteres).');
  }
  if (!erpPassword || erpPassword.length < 6) {
    throw new Error('A senha do ERP deve ter no mínimo 6 caracteres.');
  }

  const cleanOwnerEmail = finalEmail.toLowerCase();
  const cleanNickname = nickname.trim();

  return db.transaction(async (tx) => {
    // 1. Verificar se o e-mail do proprietário já existe
    const existingStore = await tx.queryOne('SELECT id FROM stores WHERE LOWER(owner_email) = $1', [cleanOwnerEmail]);
    if (existingStore) {
      const err = new Error('Já existe uma loja cadastrada com este e-mail de proprietário.');
      err.statusCode = 409;
      throw err;
    }

    // 1.1. Verificar se a conta Google já está vinculada
    if (googleId) {
      const existingGoogle = await tx.queryOne('SELECT id FROM stores WHERE google_id = $1', [googleId]);
      if (existingGoogle) {
        const err = new Error('Esta conta Google já está vinculada a uma loja existente no sistema.');
        err.statusCode = 409;
        throw err;
      }
    }

    // 2. Verificar se o nickname operacional já existe
    const existingUser = await tx.queryOne('SELECT id FROM users WHERE LOWER(username) = $1', [cleanNickname.toLowerCase()]);
    if (existingUser) {
      const err = new Error('Este nickname já está em uso por outro usuário. Escolha outro.');
      err.statusCode = 409;
      throw err;
    }

    // 3. Hashes de senha
    const ownerHash = ownerPassword ? bcrypt.hashSync(ownerPassword, 10) : null;
    const erpHash = bcrypt.hashSync(erpPassword, 10);

    // 4. Inserir a nova loja
    const slugBase = storeName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40);
    const slug = `${slugBase}-${Date.now().toString(36)}`;

    const storeInsert = await tx.queryOne(`
      INSERT INTO stores (name, slug, owner_name, owner_email, owner_password_hash, google_id, status, plan, grace_period_days, contact_phone)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending_activation', $7, 3, $8)
      RETURNING id
    `, [storeName.trim(), slug, ownerName.trim(), cleanOwnerEmail, ownerHash, googleId, plan, finalPhone || null]);

    const storeId = storeInsert.id;

    // 5. Inserir o usuário Administrador Master da nova loja
    const userInsert = await tx.queryOne(`
      INSERT INTO users (store_id, full_name, username, password_hash, role, active, is_master, job_title)
      VALUES ($1, $2, $3, $4, 'admin', 1, 1, 'Proprietário')
      RETURNING id
    `, [storeId, ownerName.trim(), cleanNickname, erpHash]);

    const userId = userInsert.id;

    // 6. Criar configurações iniciais do sistema para a loja
    const storeSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS_TEMPLATE));
    storeSettings.store.name = storeName.trim();
    storeSettings.store.trade_name = storeName.trim();
    storeSettings.store.email = cleanOwnerEmail;

    await tx.query(`
      INSERT INTO system_settings (store_id, value, version, updated_at)
      VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
      ON CONFLICT (store_id) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
    `, [storeId, JSON.stringify(storeSettings)]);

    // 7. Criar sequências de numeração inicial (começam em 1)
    for (const kind of ['order', 'sale', 'device_sale', 'report']) {
      await tx.query(`
        INSERT INTO document_sequences (store_id, kind, next_value)
        VALUES ($1, $2, 1)
        ON CONFLICT (store_id, kind) DO NOTHING
      `, [storeId, kind]);
    }

    // 8. Registrar histórico de assinatura
    await tx.query(`
      INSERT INTO store_subscription_history (store_id, action, new_status, notes, performed_by_name)
      VALUES ($1, 'registered', 'pending_activation', 'Cadastro inicial realizado pelo portal público. Aguardando ativação.', 'Cliente (Público)')
    `, [storeId]);

    return {
      storeId,
      userId,
      storeName: storeName.trim(),
      ownerName: ownerName.trim(),
      ownerEmail: cleanOwnerEmail,
      nickname: cleanNickname,
      status: 'pending_activation'
    };
  });
}

module.exports = {
  checkStoreSubscription,
  getPlatformContactInfo,
  isNicknameAvailable,
  createStoreWithInitialData,
  DEFAULT_SETTINGS_TEMPLATE
};
