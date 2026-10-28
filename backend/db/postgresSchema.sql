-- ============================================================================
-- iTech ERP - Esquema Completo para PostgreSQL (Supabase / Render)
-- Banco de dados novo e vazio, pronto para produção na nuvem
-- Compatível com PostgreSQL 14+
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. LOJAS / TENANTS (SaaS Multi-Loja)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stores (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(64) UNIQUE,
    owner_name VARCHAR(255) NOT NULL,
    owner_email VARCHAR(255) NOT NULL UNIQUE,
    owner_password_hash TEXT,
    google_id TEXT UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'pending_activation' CHECK (status IN ('pending_activation', 'active', 'overdue', 'suspended')),
    plan VARCHAR(64) NOT NULL DEFAULT 'standard',
    due_date DATE,
    grace_period_days INT NOT NULL DEFAULT 3,
    contact_phone VARCHAR(32),
    notes TEXT,
    last_access TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stores_status ON stores(status);
CREATE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug);

-- ----------------------------------------------------------------------------
-- 2. USUÁRIOS DA PLATAFORMA (Superadmins)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'superadmin' CHECK (role IN ('superadmin')),
    active SMALLINT NOT NULL DEFAULT 1,
    session_version INT NOT NULL DEFAULT 1,
    last_access TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 3. HISTÓRICO DE ASSINATURAS E PAGAMENTOS DA LOJA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_subscription_history (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    action VARCHAR(64) NOT NULL,
    previous_status VARCHAR(32),
    new_status VARCHAR(32),
    previous_due_date DATE,
    new_due_date DATE,
    amount_paid NUMERIC(12,2) DEFAULT 0.00,
    payment_method VARCHAR(64),
    notes TEXT,
    performed_by_platform_user_id INT REFERENCES platform_users(id) ON DELETE SET NULL,
    performed_by_name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_store_sub_hist_store ON store_subscription_history(store_id);

-- ----------------------------------------------------------------------------
-- 4. AUDITORIA DA PLATAFORMA (Ações de Superadmin)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_audit_logs (
    id SERIAL PRIMARY KEY,
    platform_user_id INT REFERENCES platform_users(id) ON DELETE SET NULL,
    platform_user_name VARCHAR(255),
    action VARCHAR(120) NOT NULL,
    target_type VARCHAR(64),
    target_id INT,
    target_name VARCHAR(255),
    details TEXT,
    ip_address VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_audit_action ON platform_audit_logs(action);

-- ----------------------------------------------------------------------------
-- 5. TOKENS DE RECUPERAÇÃO DE SENHA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token_hash VARCHAR(128) NOT NULL,
    target_type VARCHAR(32) NOT NULL DEFAULT 'owner' CHECK (target_type IN ('owner', 'user', 'platform')),
    target_id INT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pwd_reset_token ON password_reset_tokens(token_hash);

-- ----------------------------------------------------------------------------
-- 6. USUÁRIOS DO ERP POR LOJA (Operadores, Técnicos e Administradores)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('admin', 'employee')),
    active SMALLINT NOT NULL DEFAULT 1,
    is_master SMALLINT NOT NULL DEFAULT 0,
    job_title VARCHAR(120) NOT NULL DEFAULT '',
    permissions TEXT NOT NULL DEFAULT '{}',
    session_version INT NOT NULL DEFAULT 0,
    last_access TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_store_id ON users(store_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_master ON users(store_id, is_master) WHERE is_master = 1;

-- ----------------------------------------------------------------------------
-- 7. CONFIGURAÇÕES DO SISTEMA (Documento JSON por Loja com versionamento)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    last_backup TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_system_settings_store ON system_settings(store_id);

-- ----------------------------------------------------------------------------
-- 8. SEQUÊNCIAS ATÔMICAS DE DOCUMENTOS (OS e Vendas)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_sequences (
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    kind VARCHAR(64) NOT NULL,
    next_value INT NOT NULL DEFAULT 1,
    PRIMARY KEY (store_id, kind)
);

-- ----------------------------------------------------------------------------
-- 9. CLIENTES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    first_name VARCHAR(120) NOT NULL,
    last_name VARCHAR(120),
    birth_date VARCHAR(32),
    address TEXT,
    phone VARCHAR(32),
    is_system SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customers_store ON customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(store_id, first_name, last_name);

-- ----------------------------------------------------------------------------
-- 10. FORNECEDORES DE ESTOQUE E PEÇAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_suppliers (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    contact_info TEXT,
    notes TEXT,
    is_active SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stock_suppliers_store ON stock_suppliers(store_id);

-- ----------------------------------------------------------------------------
-- 11. CATEGORIAS DE ESTOQUE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_categories (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    is_active SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stock_categories_store ON stock_categories(store_id);

-- ----------------------------------------------------------------------------
-- 12. PRODUTOS DO ESTOQUE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_products (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    model VARCHAR(120),
    code VARCHAR(64) NOT NULL,
    barcode VARCHAR(64),
    category_id INT REFERENCES stock_categories(id) ON DELETE SET NULL,
    supplier_id INT REFERENCES stock_suppliers(id) ON DELETE SET NULL,
    cost_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    sale_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    min_stock INT NOT NULL DEFAULT 0,
    notes TEXT,
    is_active SMALLINT NOT NULL DEFAULT 1,
    deleted_at TIMESTAMPTZ,
    image_url TEXT,
    image_public_id TEXT,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_by_name_snapshot VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_product_store_code UNIQUE(store_id, code)
);
CREATE INDEX IF NOT EXISTS idx_stock_products_store ON stock_products(store_id);
CREATE INDEX IF NOT EXISTS idx_stock_products_name ON stock_products(store_id, name);

-- ----------------------------------------------------------------------------
-- 13. NÍVEIS DE ESTOQUE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_levels (
    product_id INT PRIMARY KEY REFERENCES stock_products(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 14. MOVIMENTAÇÕES DE ESTOQUE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
    movement_type VARCHAR(32) NOT NULL CHECK (movement_type IN ('entry', 'exit', 'adjustment', 'sale')),
    quantity_delta INT NOT NULL,
    previous_quantity INT NOT NULL,
    new_quantity INT NOT NULL,
    reason TEXT,
    reference_type VARCHAR(64),
    reference_id INT,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_store ON stock_movements(store_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 15. ORDENS DE SERVIÇO (OS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_orders (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    order_number VARCHAR(64) NOT NULL,
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    brand VARCHAR(120),
    model VARCHAR(120),
    imei1 VARCHAR(64),
    imei2 VARCHAR(64),
    entry_date TIMESTAMPTZ NOT NULL,
    expected_delivery_date TIMESTAMPTZ,
    delivery_date TIMESTAMPTZ,
    description TEXT,
    notes TEXT,
    service_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    parts_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    additional_costs NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    profit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(64) NOT NULL DEFAULT 'pending' CHECK (payment_method IN ('pix', 'cash', 'credit_card', 'debit_card', 'credit_account', 'not_performed', 'pending')),
    payment_status VARCHAR(64) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('paid', 'pending', 'credit_account', 'not_performed')),
    status VARCHAR(64) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'diagnosis', 'waiting_parts', 'repairing', 'ready', 'delivered', 'not_performed')),
    warranty_days INT DEFAULT 90,
    supplier_id INT REFERENCES stock_suppliers(id) ON DELETE SET NULL,
    public_token_hash VARCHAR(128) UNIQUE,
    unlock_type VARCHAR(32) DEFAULT 'none',
    unlock_password TEXT,
    unlock_pattern TEXT,
    device_condition TEXT,
    battery_health INT,
    checklist_notes TEXT,
    checklist_json TEXT,
    accessories_json TEXT,
    customer_name_snapshot VARCHAR(255),
    customer_phone_snapshot VARCHAR(32),
    customer_address_snapshot TEXT,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_by_name_snapshot VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_so_store_order UNIQUE(store_id, order_number)
);
CREATE INDEX IF NOT EXISTS idx_so_store ON service_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_so_customer ON service_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_so_status ON service_orders(status);
CREATE INDEX IF NOT EXISTS idx_so_public_token ON service_orders(public_token_hash);

-- ----------------------------------------------------------------------------
-- 16. HISTÓRICO DE STATUS DA OS (Timeline para Acompanhamento Público)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_order_status_history (
    id SERIAL PRIMARY KEY,
    service_order_id INT NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
    status VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_so_history ON service_order_status_history(service_order_id, id);

-- Trigger PostgreSQL para registro automático de status de OS
CREATE OR REPLACE FUNCTION trg_so_status_history_fn()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO service_order_status_history (service_order_id, status, created_at)
        VALUES (NEW.id, NEW.status, COALESCE(NEW.created_at, CURRENT_TIMESTAMP));
    ELSIF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO service_order_status_history (service_order_id, status, created_at)
        VALUES (NEW.id, NEW.status, COALESCE(NEW.updated_at, CURRENT_TIMESTAMP));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_so_status_history ON service_orders;
CREATE TRIGGER trg_so_status_history
AFTER INSERT OR UPDATE OF status ON service_orders
FOR EACH ROW EXECUTE FUNCTION trg_so_status_history_fn();

-- ----------------------------------------------------------------------------
-- 17. FOTOS DA ORDEM DE SERVIÇO
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_order_photos (
    id SERIAL PRIMARY KEY,
    service_order_id INT NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL,
    original_name VARCHAR(255),
    mime_type VARCHAR(100),
    file_size INT,
    photo_type VARCHAR(64) DEFAULT 'Sem classificação',
    description TEXT,
    url TEXT,
    public_id TEXT,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_by_name_snapshot VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_so_photos_order ON service_order_photos(service_order_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_so_photos_public_id ON service_order_photos(public_id) WHERE public_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 18. GARANTIAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warranties (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    service_order_id INT REFERENCES service_orders(id) ON DELETE SET NULL,
    customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
    pickup_date TIMESTAMPTZ,
    warranty_start TIMESTAMPTZ NOT NULL,
    warranty_end TIMESTAMPTZ NOT NULL,
    brand VARCHAR(120),
    model VARCHAR(120),
    amount_paid NUMERIC(12,2) DEFAULT 0.00,
    description TEXT,
    customer_name_snapshot VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_warranties_store ON warranties(store_id);
CREATE INDEX IF NOT EXISTS idx_warranties_end ON warranties(warranty_end);

-- ----------------------------------------------------------------------------
-- 19. CONTAS A RECEBER / FIADO
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_accounts (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    service_order_id INT REFERENCES service_orders(id) ON DELETE SET NULL,
    description TEXT,
    amount NUMERIC(12,2) NOT NULL,
    pickup_date TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid')),
    paid_at TIMESTAMPTZ,
    customer_name_snapshot VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_store ON credit_accounts(store_id);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_status ON credit_accounts(status);

-- ----------------------------------------------------------------------------
-- 20. RETIRADAS DE CAIXA / SANGRIA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cash_withdrawals (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    reason TEXT NOT NULL,
    withdrawal_date TIMESTAMPTZ NOT NULL,
    notes TEXT,
    source_type VARCHAR(64) NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'service_order_part')),
    service_order_id INT REFERENCES service_orders(id) ON DELETE RESTRICT,
    supplier_id INT REFERENCES stock_suppliers(id) ON DELETE SET NULL,
    supplier_name VARCHAR(255),
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_by_name_snapshot VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_store ON cash_withdrawals(store_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_withdrawals_so_part ON cash_withdrawals(service_order_id) WHERE source_type = 'service_order_part';

-- ----------------------------------------------------------------------------
-- 21. HISTÓRICO FINANCEIRO MENSAL
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_history (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INT NOT NULL,
    revenue NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    received NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    pending NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    profit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    net_profit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_services INT NOT NULL DEFAULT 0,
    total_sales INT NOT NULL DEFAULT 0,
    average_ticket NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    cash_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    pix_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    card_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    other_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    expenses NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01 00:00:00',
    closed_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01 23:59:59',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_financial_history_period UNIQUE(store_id, year, month)
);
CREATE INDEX IF NOT EXISTS idx_financial_history_store ON financial_history(store_id);

CREATE TABLE IF NOT EXISTS financial_history_state (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
    last_closed_year INT,
    last_closed_month INT CHECK (last_closed_month BETWEEN 1 AND 12),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 22. VENDAS DE BALCÃO (Store Sales / PDV)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_sales (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sale_number VARCHAR(64) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    discount_type VARCHAR(16) CHECK (discount_type IN ('value', 'percent')),
    discount_value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(64) NOT NULL CHECK (payment_method IN ('cash', 'pix', 'debit_card', 'credit_card')),
    notes TEXT,
    is_canceled SMALLINT NOT NULL DEFAULT 0,
    canceled_at TIMESTAMPTZ,
    canceled_by INT REFERENCES users(id) ON DELETE SET NULL,
    canceled_by_name_snapshot VARCHAR(255),
    cancel_reason TEXT,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_by_name_snapshot VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_store_sales_number UNIQUE(store_id, sale_number)
);
CREATE INDEX IF NOT EXISTS idx_store_sales_store ON store_sales(store_id);
CREATE INDEX IF NOT EXISTS idx_store_sales_date ON store_sales(created_at DESC);

CREATE TABLE IF NOT EXISTS store_sale_items (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sale_id INT NOT NULL REFERENCES store_sales(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES stock_products(id),
    product_name VARCHAR(255) NOT NULL,
    product_code VARCHAR(64),
    cost_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    unit_price NUMERIC(12,2) NOT NULL,
    quantity INT NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,
    is_canceled SMALLINT NOT NULL DEFAULT 0,
    canceled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_store_sale_items_sale ON store_sale_items(sale_id);

-- ----------------------------------------------------------------------------
-- 23. VENDAS DE APARELHOS (Device Sales)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_sales (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    order_number VARCHAR(64) NOT NULL,
    customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
    sale_date TIMESTAMPTZ NOT NULL,
    seller_name VARCHAR(255),
    customer_name VARCHAR(255) NOT NULL,
    customer_cpf_cnpj VARCHAR(32),
    address TEXT,
    city VARCHAR(120),
    state VARCHAR(32),
    cep VARCHAR(16),
    phone VARCHAR(32),
    email VARCHAR(255),
    horario VARCHAR(32),
    payment_method VARCHAR(64),
    notes TEXT,
    items_json TEXT NOT NULL DEFAULT '[]',
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_by_name_snapshot VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_device_sales_number UNIQUE(store_id, order_number)
);
CREATE INDEX IF NOT EXISTS idx_device_sales_store ON device_sales(store_id);

-- ----------------------------------------------------------------------------
-- 24. PELÍCULAS E COMPATIBILIDADES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS screen_protector_groups (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(120) NOT NULL,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_by_name_snapshot VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_screen_groups_store ON screen_protector_groups(store_id);

CREATE TABLE IF NOT EXISTS screen_protector_models (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    group_id INT NOT NULL REFERENCES screen_protector_groups(id) ON DELETE CASCADE,
    model_name VARCHAR(255) NOT NULL,
    position INT NOT NULL DEFAULT 0,
    CONSTRAINT uq_screen_group_model UNIQUE(group_id, model_name)
);
CREATE INDEX IF NOT EXISTS idx_screen_models_store ON screen_protector_models(store_id);

-- ----------------------------------------------------------------------------
-- 25. CATÁLOGO DE PEÇAS E FRONTAIS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parts_options (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(32) NOT NULL CHECK (kind IN ('category', 'brand', 'quality')),
    name VARCHAR(255) NOT NULL,
    name_key VARCHAR(255) NOT NULL,
    show_assembly SMALLINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_parts_options_key UNIQUE(store_id, user_id, kind, name_key),
    CONSTRAINT uq_parts_options_id_user UNIQUE(id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_parts_options_store ON parts_options(store_id);

CREATE TABLE IF NOT EXISTS parts_models (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    name_key VARCHAR(255) NOT NULL,
    FOREIGN KEY(brand_id, user_id) REFERENCES parts_options(id, user_id) ON DELETE CASCADE,
    CONSTRAINT uq_parts_models_key UNIQUE(store_id, user_id, brand_id, name_key)
);
CREATE INDEX IF NOT EXISTS idx_parts_models_store ON parts_models(store_id);

CREATE TABLE IF NOT EXISTS frontals_price_list (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    brand VARCHAR(120) NOT NULL,
    model VARCHAR(120) NOT NULL,
    version VARCHAR(64) NOT NULL DEFAULT 'primeira linha',
    cost_price NUMERIC(12,2) NOT NULL,
    sale_price NUMERIC(12,2) NOT NULL,
    category_id INT REFERENCES parts_options(id) ON DELETE SET NULL,
    quality_id INT REFERENCES parts_options(id) ON DELETE SET NULL,
    description TEXT NOT NULL DEFAULT '',
    part_code VARCHAR(64) NOT NULL DEFAULT '',
    assembly_type VARCHAR(64) NOT NULL DEFAULT '',
    frame VARCHAR(64) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_frontals_store ON frontals_price_list(store_id);

CREATE TABLE IF NOT EXISTS frontals_calculator (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    base_value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    brand VARCHAR(120) DEFAULT 'Apple',
    model VARCHAR(120),
    version VARCHAR(64) DEFAULT 'primeira linha',
    entries TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS piece_calculator (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    base_value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    entries TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pagbank_calculator (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    value NUMERIC(12,2) NOT NULL DEFAULT 100.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 26. BLOCO DE NOTAS (Estilo Google Keep)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS note_colors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(64) NOT NULL UNIQUE,
    bg_color VARCHAR(32) NOT NULL,
    border_color VARCHAR(32) NOT NULL,
    text_color VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO note_colors (id, name, bg_color, border_color, text_color) VALUES
  (1, 'Cinza escuro (Padrão)', '#1e1e1e', '#464646', '#ffffff'),
  (2, 'Branco', '#ffffff', '#d1d5db', '#111827'),
  (3, 'Preto', '#000000', '#333333', '#ffffff'),
  (4, 'Vermelho', '#b91c1c', '#ef4444', '#ffffff'),
  (5, 'Azul', '#1d4ed8', '#60a5fa', '#ffffff'),
  (6, 'Verde', '#15803d', '#4ade80', '#ffffff'),
  (7, 'Amarelo', '#facc15', '#f59e0b', '#111827'),
  (8, 'Laranja', '#ea580c', '#fb923c', '#ffffff')
ON CONFLICT(id) DO UPDATE SET
  name = EXCLUDED.name,
  bg_color = EXCLUDED.bg_color,
  border_color = EXCLUDED.border_color,
  text_color = EXCLUDED.text_color;

CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    content TEXT,
    color_id INT REFERENCES note_colors(id) DEFAULT 1,
    archived SMALLINT NOT NULL DEFAULT 0,
    trashed SMALLINT NOT NULL DEFAULT 0,
    deleted_at TIMESTAMPTZ,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notes_store ON notes(store_id);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS labels (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_labels_user_name UNIQUE(store_id, user_id, name)
);

CREATE TABLE IF NOT EXISTS note_labels (
    note_id INT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    label_id INT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (note_id, label_id)
);

CREATE TABLE IF NOT EXISTS note_checklists (
    id SERIAL PRIMARY KEY,
    note_id INT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    item_text TEXT NOT NULL,
    is_checked SMALLINT NOT NULL DEFAULT 0,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS note_attachments (
    id SERIAL PRIMARY KEY,
    note_id INT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    file_type VARCHAR(32) NOT NULL CHECK (file_type IN ('image', 'file')),
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    file_size INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS note_reminders (
    id SERIAL PRIMARY KEY,
    note_id INT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    remind_at TIMESTAMPTZ NOT NULL,
    done SMALLINT NOT NULL DEFAULT 0,
    notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS favorite_notes (
    id SERIAL PRIMARY KEY,
    note_id INT NOT NULL UNIQUE REFERENCES notes(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pinned_notes (
    id SERIAL PRIMARY KEY,
    note_id INT NOT NULL UNIQUE REFERENCES notes(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pinned_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 27. AGENTE ANTIVÍRUS (Virus Scanner)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS virus_threat_signatures (
    id SERIAL PRIMARY KEY,
    package_name VARCHAR(255),
    sha256 VARCHAR(64),
    app_name VARCHAR(255),
    threat_type VARCHAR(64),
    severity VARCHAR(32),
    reason TEXT,
    active SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS virus_scans (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    service_order_id INT REFERENCES service_orders(id) ON DELETE SET NULL,
    device_serial VARCHAR(120),
    manufacturer VARCHAR(120),
    model VARCHAR(120),
    android_version VARCHAR(32),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'completed',
    apps_analyzed INT DEFAULT 0,
    threats_found INT DEFAULT 0,
    threats_removed INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_virus_scans_store ON virus_scans(store_id);

CREATE TABLE IF NOT EXISTS virus_scan_results (
    id SERIAL PRIMARY KEY,
    scan_id INT NOT NULL REFERENCES virus_scans(id) ON DELETE CASCADE,
    package_name VARCHAR(255),
    app_name VARCHAR(255),
    version_name VARCHAR(64),
    version_code VARCHAR(32),
    apk_path TEXT,
    sha256 VARCHAR(64),
    risk_score INT DEFAULT 0,
    risk_level VARCHAR(32),
    threat_type VARCHAR(64),
    reason TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'detected',
    protected SMALLINT DEFAULT 0,
    removable SMALLINT DEFAULT 1,
    removal_status VARCHAR(32) DEFAULT 'pending',
    error_message TEXT,
    removed_by VARCHAR(64),
    removed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 28. LOGS DE AUDITORIA INTERNA (Zona de Perigo e Ações Administrativas)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    store_id INT REFERENCES stores(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255),
    action VARCHAR(120) NOT NULL,
    record_type VARCHAR(64),
    record_id VARCHAR(64),
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_log_store ON audit_log(store_id);

-- ----------------------------------------------------------------------------
-- 29. WEB PUSH PARA ACOMPANHAMENTO PÚBLICO
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tracking_push (
    order_id INT NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    subscription TEXT NOT NULL,
    token TEXT NOT NULL,
    last_history INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(order_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_tracking_push_token ON tracking_push(token);

-- ----------------------------------------------------------------------------
-- 30. SEGURANÇA SUPABASE (Ativação de RLS e Bloqueio da Data API PostgREST)
-- ----------------------------------------------------------------------------
-- Revoga todos os privilégios das roles públicas e anônimas da Data API
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated, PUBLIC;

-- Habilita Row Level Security em todas as 47 tabelas do sistema
ALTER TABLE IF EXISTS public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.platform_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.store_subscription_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.document_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service_order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service_order_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.financial_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.financial_history_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.store_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.store_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.device_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.screen_protector_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.screen_protector_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.parts_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.parts_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.frontals_price_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.frontals_calculator ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.piece_calculator ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pagbank_calculator ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.note_colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.note_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.note_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.note_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.note_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.favorite_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pinned_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.virus_threat_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.virus_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.virus_scan_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tracking_push ENABLE ROW LEVEL SECURITY;

-- Garante que a role postgres do backend mantenha permissões totais
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres;

-- ============================================================================
-- FIM DO ESQUEMA POSTGRESQL iTech ERP
-- ============================================================================
