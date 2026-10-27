// db/multiTenantSchema.js
// Migração segura para suporte a Multi-tenant (SaaS), isolamento por loja e administração da plataforma

module.exports = function migrateMultiTenant(db) {
  const hasColumn = (table, column) => {
    try {
      return db.prepare(`PRAGMA table_info(${table})`).all().some(item => item.name === column);
    } catch {
      return false;
    }
  };

  const hasTable = (table) => {
    return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
  };

  db.transaction(() => {
    // 1. Tabela de Lojas (Tenants)
    db.exec(`
      CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE,
        owner_name TEXT NOT NULL,
        owner_email TEXT NOT NULL UNIQUE,
        owner_password_hash TEXT,
        google_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending_activation' CHECK(status IN ('pending_activation', 'active', 'overdue', 'suspended')),
        plan TEXT NOT NULL DEFAULT 'standard',
        due_date TEXT,
        grace_period_days INTEGER NOT NULL DEFAULT 3,
        contact_phone TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        last_access TEXT
      );
    `);

    // 2. Tabela de Administradores da Plataforma (Superadmins)
    db.exec(`
      CREATE TABLE IF NOT EXISTS platform_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'superadmin' CHECK(role IN ('superadmin')),
        active INTEGER NOT NULL DEFAULT 1,
        session_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        last_access TEXT
      );
    `);

    // 3. Histórico de Assinatura e Pagamentos Manuais das Lojas
    db.exec(`
      CREATE TABLE IF NOT EXISTS store_subscription_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        previous_status TEXT,
        new_status TEXT,
        previous_due_date TEXT,
        new_due_date TEXT,
        amount_paid REAL DEFAULT 0,
        payment_method TEXT,
        notes TEXT,
        performed_by_platform_user_id INTEGER REFERENCES platform_users(id),
        performed_by_name TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // 4. Tokens para recuperação segura de acesso
    db.exec(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        target_type TEXT NOT NULL DEFAULT 'owner' CHECK(target_type IN ('owner', 'user', 'platform')),
        target_id INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // 5. Garantir que a Loja 1 (iTech Celular e Informática) exista
    const itechStore = db.prepare('SELECT id FROM stores WHERE id = 1').get();
    if (!itechStore) {
      db.prepare(`
        INSERT INTO stores (id, name, slug, owner_name, owner_email, status, plan, due_date, grace_period_days)
        VALUES (1, 'iTech Celular e Informática', 'itech', 'Emerson Lemos', 'contato@itechcelulareinformatica.com.br', 'active', 'pro', '2099-12-31', 5)
      `).run();

      db.prepare(`
        INSERT INTO store_subscription_history (store_id, action, new_status, new_due_date, notes, performed_by_name)
        VALUES (1, 'migration_initial_seed', 'active', '2099-12-31', 'Migração de dados pré-existentes da loja iTech', 'Sistema')
      `).run();
    }

    // 6. Adicionar store_id em todas as tabelas de dados do ERP
    const tablesToMigrate = [
      'users',
      'customers',
      'service_orders',
      'warranties',
      'credit_accounts',
      'cash_withdrawals',
      'financial_history',
      'financial_history_state',
      'audit_log',
      'pagbank_calculator',
      'piece_calculator',
      'frontals_calculator',
      'frontals_price_list',
      'stock_categories',
      'stock_suppliers',
      'stock_products',
      'stock_movements',
      'store_sales',
      'store_sale_items',
      'notes',
      'labels',
      'device_sales',
      'system_settings',
      'document_sequences',
      'screen_protector_groups',
      'screen_protector_models',
      'parts_options',
      'parts_models',
      'virus_scans'
    ];

    for (const table of tablesToMigrate) {
      if (hasTable(table)) {
        if (!hasColumn(table, 'store_id')) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN store_id INTEGER REFERENCES stores(id)`);
        }
        // Associar dados existentes para a Loja 1 (iTech)
        db.exec(`UPDATE ${table} SET store_id = 1 WHERE store_id IS NULL`);
        // Criar índice
        db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_store_id ON ${table}(store_id)`);
      }
    }

    // Garantir que a unicidade de sequences e settings suporte multi-tenant:
    // Para document_sequences: se a tabela não existir, cria direto; se existir sem PK composta, migra
    const seqTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='document_sequences'").get();
    if (!seqTableExists) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS document_sequences (
          store_id INTEGER NOT NULL REFERENCES stores(id),
          kind TEXT NOT NULL,
          next_value INTEGER NOT NULL,
          PRIMARY KEY (store_id, kind)
        );
        CREATE INDEX IF NOT EXISTS idx_document_sequences_store ON document_sequences(store_id);
      `);
    } else {
      const seqTableInfo = db.prepare("PRAGMA table_info(document_sequences)").all();
      const hasCompositePk = seqTableInfo.filter(c => c.pk > 0).length >= 2;
      if (!hasCompositePk) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS document_sequences_new (
            store_id INTEGER NOT NULL REFERENCES stores(id),
            kind TEXT NOT NULL,
            next_value INTEGER NOT NULL,
            PRIMARY KEY (store_id, kind)
          );
          INSERT OR IGNORE INTO document_sequences_new (store_id, kind, next_value)
          SELECT COALESCE(store_id, 1), kind, next_value FROM document_sequences;
          DROP TABLE document_sequences;
          ALTER TABLE document_sequences_new RENAME TO document_sequences;
          CREATE INDEX IF NOT EXISTS idx_document_sequences_store ON document_sequences(store_id);
        `);
      }
    }

    // Para system_settings: adicionar índice único em store_id se existir a tabela
    const hasSysSettings = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='system_settings'").get();
    if (!hasSysSettings) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS system_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
          value TEXT NOT NULL DEFAULT '{}',
          version INTEGER NOT NULL DEFAULT 1,
          last_backup TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_system_settings_store ON system_settings(store_id);
        INSERT OR IGNORE INTO system_settings (id, store_id, value, version) VALUES (1, 1, '{"documents":{"warranty_days":90}}', 1);
      `);
    } else {
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_system_settings_store ON system_settings(store_id);
      `);
    }

    // Para financial_history: garantir UNIQUE(store_id, year, month)
    const finTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='financial_history'").get()?.sql || '';
    if (!finTableSql.includes('store_id, year, month') && !finTableSql.includes('store_id, month, year')) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS financial_history_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          store_id INTEGER NOT NULL REFERENCES stores(id),
          month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
          year INTEGER NOT NULL,
          revenue REAL NOT NULL DEFAULT 0,
          received REAL NOT NULL DEFAULT 0,
          pending REAL NOT NULL DEFAULT 0,
          profit REAL NOT NULL DEFAULT 0,
          net_profit REAL NOT NULL DEFAULT 0,
          total_services INTEGER NOT NULL DEFAULT 0,
          total_sales INTEGER NOT NULL DEFAULT 0,
          average_ticket REAL NOT NULL DEFAULT 0,
          cash_total REAL NOT NULL DEFAULT 0,
          pix_total REAL NOT NULL DEFAULT 0,
          card_total REAL NOT NULL DEFAULT 0,
          other_total REAL NOT NULL DEFAULT 0,
          expenses REAL NOT NULL DEFAULT 0,
          opened_at TEXT NOT NULL,
          closed_at TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(store_id, year, month)
        );
        INSERT OR IGNORE INTO financial_history_new (
          id, store_id, month, year, revenue, received, pending, profit, net_profit,
          total_services, total_sales, average_ticket, cash_total, pix_total, card_total,
          other_total, expenses, opened_at, closed_at, created_at
        )
        SELECT id, COALESCE(store_id, 1), month, year, revenue, received, pending, profit, net_profit,
          total_services, total_sales, average_ticket, cash_total, pix_total, card_total,
          other_total, expenses, opened_at, closed_at, created_at
        FROM financial_history;
        DROP TABLE financial_history;
        ALTER TABLE financial_history_new RENAME TO financial_history;
        CREATE INDEX IF NOT EXISTS idx_financial_history_store ON financial_history(store_id);
        CREATE INDEX IF NOT EXISTS idx_financial_history_period ON financial_history(store_id, year DESC, month DESC);
      `);
    }

    // Vincular owner_password_hash do proprietário da loja 1 ao hash do usuário master se disponível
    const masterUser = db.prepare("SELECT password_hash FROM users WHERE store_id = 1 AND is_master = 1").get();
    if (masterUser && masterUser.password_hash) {
      db.prepare("UPDATE stores SET owner_password_hash = ? WHERE id = 1 AND owner_password_hash IS NULL").run(masterUser.password_hash);
    }
  })();
};

