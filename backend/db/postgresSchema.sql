-- Esquema PostgreSQL DDL para iTech ERP Multi-Tenant SaaS
-- Compatível com PostgreSQL 14+

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Lojas / Tenants da plataforma
CREATE TABLE IF NOT EXISTS stores (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    document VARCHAR(32),
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(32),
    owner_name VARCHAR(255) NOT NULL,
    plan VARCHAR(64) DEFAULT 'basic',
    subscription_status VARCHAR(32) DEFAULT 'pending_activation', -- pending_activation, active, overdue, suspended, canceled
    subscription_due_date DATE,
    grace_period_days INT DEFAULT 3,
    last_access_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Administradores da Plataforma (Superadmin isolado dos lojistas)
CREATE TABLE IF NOT EXISTS platform_users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Histórico de assinaturas e pagamentos manuais
CREATE TABLE IF NOT EXISTS store_subscription_history (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    action VARCHAR(64) NOT NULL,
    amount NUMERIC(12,2) DEFAULT 0.00,
    previous_status VARCHAR(32),
    new_status VARCHAR(32),
    previous_due_date DATE,
    new_due_date DATE,
    notes TEXT,
    created_by_platform_user_id INT REFERENCES platform_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tokens de recuperação de senha do lojista
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token_hash VARCHAR(128) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Usuários do ERP (operadores, proprietários e técnicos por loja)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'technician',
    permissions JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_store ON users(store_id);

-- 6. Configurações por loja
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
    company_name VARCHAR(255) DEFAULT 'iTech',
    company_cnpj VARCHAR(32),
    company_phone VARCHAR(32),
    company_address TEXT,
    company_pix_key VARCHAR(255),
    company_logo TEXT,
    company_terms TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Sequências numéricas de documentos por loja
CREATE TABLE IF NOT EXISTS document_sequences (
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    kind VARCHAR(32) NOT NULL,
    last_number INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (store_id, kind)
);

-- 8. Clientes
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    first_name VARCHAR(120) NOT NULL,
    last_name VARCHAR(120),
    email VARCHAR(255),
    phone VARCHAR(32),
    cpf VARCHAR(32),
    address TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customers_store ON customers(store_id);

-- 9. Ordens de Serviço (OS)
CREATE TABLE IF NOT EXISTS service_orders (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    order_number VARCHAR(64) NOT NULL,
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    brand VARCHAR(120),
    model VARCHAR(120) NOT NULL,
    serial_number VARCHAR(120),
    color VARCHAR(64),
    reported_defect TEXT,
    technical_diagnosis TEXT,
    service_performed TEXT,
    status VARCHAR(64) NOT NULL DEFAULT 'pending',
    entry_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expected_delivery_date TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    labor_cost NUMERIC(12,2) DEFAULT 0.00,
    parts_cost NUMERIC(12,2) DEFAULT 0.00,
    total_cost NUMERIC(12,2) DEFAULT 0.00,
    payment_method VARCHAR(64),
    technician_id INT REFERENCES users(id) ON DELETE SET NULL,
    internal_notes TEXT,
    public_token_hash VARCHAR(128) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_so_store_order UNIQUE(store_id, order_number)
);
CREATE INDEX IF NOT EXISTS idx_service_orders_store ON service_orders(store_id);

-- 10. Histórico de status da OS
CREATE TABLE IF NOT EXISTS service_order_status_history (
    id SERIAL PRIMARY KEY,
    service_order_id INT NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
    status VARCHAR(64) NOT NULL,
    notes TEXT,
    changed_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 11. Fotos da OS
CREATE TABLE IF NOT EXISTS service_order_photos (
    id SERIAL PRIMARY KEY,
    service_order_id INT NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    photo_type VARCHAR(32) DEFAULT 'entry',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 12. Garantias
CREATE TABLE IF NOT EXISTS warranties (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    service_order_id INT REFERENCES service_orders(id) ON DELETE SET NULL,
    customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
    period_days INT DEFAULT 90,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    terms TEXT,
    status VARCHAR(32) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_warranties_store ON warranties(store_id);

-- 13. Contas a receber / Fiado
CREATE TABLE IF NOT EXISTS credit_accounts (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    service_order_id INT REFERENCES service_orders(id) ON DELETE SET NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    remaining_balance NUMERIC(12,2) NOT NULL,
    due_date DATE,
    status VARCHAR(32) DEFAULT 'open',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_store ON credit_accounts(store_id);

-- 14. Pagamentos do Fiado
CREATE TABLE IF NOT EXISTS credit_account_payments (
    id SERIAL PRIMARY KEY,
    credit_account_id INT NOT NULL REFERENCES credit_accounts(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    payment_method VARCHAR(64) NOT NULL,
    received_by INT REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 15. Sangrias / Retiradas de Caixa
CREATE TABLE IF NOT EXISTS cash_withdrawals (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    reason TEXT NOT NULL,
    performed_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_store ON cash_withdrawals(store_id);

-- 16. Categorias de Estoque
CREATE TABLE IF NOT EXISTS stock_categories (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_category_store_name UNIQUE(store_id, name)
);
CREATE INDEX IF NOT EXISTS idx_stock_categories_store ON stock_categories(store_id);

-- 17. Fornecedores
CREATE TABLE IF NOT EXISTS stock_suppliers (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(120),
    phone VARCHAR(32),
    email VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_supplier_store_name UNIQUE(store_id, name)
);
CREATE INDEX IF NOT EXISTS idx_stock_suppliers_store ON stock_suppliers(store_id);

-- 18. Produtos de Estoque
CREATE TABLE IF NOT EXISTS stock_products (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    model VARCHAR(120),
    category_id INT REFERENCES stock_categories(id) ON DELETE SET NULL,
    supplier_id INT REFERENCES stock_suppliers(id) ON DELETE SET NULL,
    cost_price NUMERIC(12,2) DEFAULT 0.00,
    sale_price NUMERIC(12,2) DEFAULT 0.00,
    min_stock INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_product_store_code UNIQUE(store_id, code)
);
CREATE INDEX IF NOT EXISTS idx_stock_products_store ON stock_products(store_id);

-- 19. Níveis de Estoque
CREATE TABLE IF NOT EXISTS stock_levels (
    product_id INT PRIMARY KEY REFERENCES stock_products(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 20. Movimentações de Estoque
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
    movement_type VARCHAR(32) NOT NULL,
    quantity_delta INT NOT NULL,
    previous_quantity INT NOT NULL,
    new_quantity INT NOT NULL,
    reason TEXT,
    reference_type VARCHAR(64),
    reference_id INT,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_store ON stock_movements(store_id);

-- 21. Vendas de Balcão (Store Sales)
CREATE TABLE IF NOT EXISTS store_sales (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sale_number VARCHAR(64) NOT NULL,
    subtotal NUMERIC(12,2) DEFAULT 0.00,
    discount_type VARCHAR(16),
    discount_value NUMERIC(12,2) DEFAULT 0.00,
    discount_amount NUMERIC(12,2) DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL,
    payment_method VARCHAR(64) NOT NULL,
    notes TEXT,
    is_canceled BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,
    canceled_by INT REFERENCES users(id) ON DELETE SET NULL,
    cancel_reason TEXT,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sales_store_number UNIQUE(store_id, sale_number)
);
CREATE INDEX IF NOT EXISTS idx_store_sales_store ON store_sales(store_id);

-- 22. Itens das Vendas de Balcão
CREATE TABLE IF NOT EXISTS store_sale_items (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sale_id INT NOT NULL REFERENCES store_sales(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES stock_products(id) ON DELETE RESTRICT,
    product_name VARCHAR(255) NOT NULL,
    product_code VARCHAR(64),
    cost_price NUMERIC(12,2) DEFAULT 0.00,
    unit_price NUMERIC(12,2) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    subtotal NUMERIC(12,2) NOT NULL,
    is_canceled BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMPTZ
);

-- 23. Vendas de Aparelhos (Device Sales)
CREATE TABLE IF NOT EXISTS device_sales (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    order_number VARCHAR(64) NOT NULL,
    customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
    sale_date DATE NOT NULL,
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
    items_json JSONB DEFAULT '[]',
    total_amount NUMERIC(12,2) NOT NULL,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_device_sales_store_number UNIQUE(store_id, order_number)
);
CREATE INDEX IF NOT EXISTS idx_device_sales_store ON device_sales(store_id);

-- 24. Películas (Screen Protector Groups e Models)
CREATE TABLE IF NOT EXISTS screen_protector_groups (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(120) NOT NULL,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_screen_groups_store ON screen_protector_groups(store_id);

CREATE TABLE IF NOT EXISTS screen_protector_models (
    id SERIAL PRIMARY KEY,
    group_id INT NOT NULL REFERENCES screen_protector_groups(id) ON DELETE CASCADE,
    model_name VARCHAR(255) NOT NULL,
    position INT DEFAULT 0
);

-- 25. Anotações (Notes)
CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    content TEXT,
    color_id INT,
    archived BOOLEAN DEFAULT FALSE,
    trashed BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    position INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notes_store ON notes(store_id);

-- 26. Varreduras de Vírus (Virus Scans)
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
    status VARCHAR(32) DEFAULT 'completed',
    apps_analyzed INT DEFAULT 0,
    threats_found INT DEFAULT 0,
    threats_removed INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_virus_scans_store ON virus_scans(store_id);

CREATE TABLE IF NOT EXISTS virus_scan_results (
    id SERIAL PRIMARY KEY,
    scan_id INT NOT NULL REFERENCES virus_scans(id) ON DELETE CASCADE,
    package_name VARCHAR(255),
    app_name VARCHAR(255),
    version_name VARCHAR(64),
    version_code INT,
    apk_path TEXT,
    sha256 VARCHAR(64),
    risk_score INT DEFAULT 0,
    risk_level VARCHAR(32) DEFAULT 'safe',
    threat_type VARCHAR(64),
    reason TEXT,
    status VARCHAR(32) DEFAULT 'safe',
    protected BOOLEAN DEFAULT FALSE,
    removable BOOLEAN DEFAULT TRUE,
    removal_status VARCHAR(32),
    error_message TEXT,
    removed_by VARCHAR(64),
    removed_at TIMESTAMPTZ
);

-- 27. Histórico Financeiro Mensal (Fechamentos)
CREATE TABLE IF NOT EXISTS financial_history (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    year INT NOT NULL,
    month INT NOT NULL,
    revenue NUMERIC(12,2) DEFAULT 0.00,
    cost NUMERIC(12,2) DEFAULT 0.00,
    gross_profit NUMERIC(12,2) DEFAULT 0.00,
    net_profit NUMERIC(12,2) DEFAULT 0.00,
    order_count INT DEFAULT 0,
    metrics JSONB DEFAULT '{}',
    is_closed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_fin_history_store_year_month UNIQUE(store_id, year, month)
);
CREATE INDEX IF NOT EXISTS idx_fin_history_store ON financial_history(store_id);

-- 28. Logs de Auditoria
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    store_id INT REFERENCES stores(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(120) NOT NULL,
    record_type VARCHAR(64),
    record_id INT,
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_store ON audit_logs(store_id);
