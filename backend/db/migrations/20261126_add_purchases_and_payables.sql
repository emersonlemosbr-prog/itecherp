-- ============================================================================
-- Migration: 20261126_add_purchases_and_payables.sql
-- Objetivo:
--   Criar estrutura multi-tenant para os módulos Compras e Contas a Pagar
--   e ampliar source_type em cash_withdrawals para lançamentos automáticos.
-- ============================================================================

ALTER TABLE IF EXISTS public.cash_withdrawals
  DROP CONSTRAINT IF EXISTS cash_withdrawals_source_type_check;
ALTER TABLE IF EXISTS public.cash_withdrawals
  ADD CONSTRAINT cash_withdrawals_source_type_check
  CHECK (source_type IN ('manual', 'service_order_part', 'purchase_payment', 'payable_payment'));

CREATE TABLE IF NOT EXISTS public.purchases (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    purchase_number VARCHAR(64) NOT NULL,
    origin_type VARCHAR(32) NOT NULL CHECK (origin_type IN ('supplier', 'customer_trade')),
    supplier_id INT REFERENCES public.stock_suppliers(id) ON DELETE SET NULL,
    supplier_name VARCHAR(255),
    customer_id INT REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(255),
    invoice_number VARCHAR(120),
    purchase_date DATE NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    freight NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_condition VARCHAR(32) NOT NULL CHECK (payment_condition IN ('cash', 'installments')),
    payment_method VARCHAR(64),
    down_payment NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    installments_count INT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'canceled')),
    notes TEXT,
    idempotency_key VARCHAR(128),
    created_by INT REFERENCES public.users(id) ON DELETE SET NULL,
    created_by_name_snapshot VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_purchases_number UNIQUE(store_id, purchase_number)
);
CREATE INDEX IF NOT EXISTS idx_purchases_store_date ON public.purchases(store_id, purchase_date DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_idempotency ON public.purchases(store_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.purchase_items (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    purchase_id INT NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    item_type VARCHAR(32) NOT NULL CHECK (item_type IN ('device', 'existing_accessory', 'new_accessory')),
    product_id INT REFERENCES public.stock_products(id) ON DELETE SET NULL,
    device_id INT,
    description VARCHAR(255) NOT NULL,
    identifier VARCHAR(120),
    brand VARCHAR(100),
    model VARCHAR(150),
    storage VARCHAR(50),
    color VARCHAR(80),
    condition VARCHAR(50),
    category_id INT,
    category_name VARCHAR(120),
    quantity INT NOT NULL DEFAULT 1,
    unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    sale_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON public.purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_store ON public.purchase_items(store_id);

CREATE TABLE IF NOT EXISTS public.accounts_payable (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    purchase_id INT REFERENCES public.purchases(id) ON DELETE SET NULL,
    supplier_id INT REFERENCES public.stock_suppliers(id) ON DELETE SET NULL,
    supplier_name VARCHAR(255),
    origin_type VARCHAR(32) NOT NULL DEFAULT 'manual' CHECK (origin_type IN ('purchase', 'manual')),
    category VARCHAR(120),
    description VARCHAR(255) NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'canceled')),
    due_date DATE NOT NULL,
    notes TEXT,
    created_by INT REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_store_status ON public.accounts_payable(store_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_purchase ON public.accounts_payable(purchase_id);

CREATE TABLE IF NOT EXISTS public.payable_installments (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    payable_id INT NOT NULL REFERENCES public.accounts_payable(id) ON DELETE CASCADE,
    installment_number INT NOT NULL DEFAULT 1,
    total_installments INT NOT NULL DEFAULT 1,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'canceled')),
    payment_method VARCHAR(64),
    cash_withdrawal_id INT REFERENCES public.cash_withdrawals(id) ON DELETE SET NULL,
    notified_due_soon_at TIMESTAMPTZ,
    notified_overdue_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payable_installments_store_due ON public.payable_installments(store_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_payable_installments_payable ON public.payable_installments(payable_id);

CREATE TABLE IF NOT EXISTS public.payable_payments (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    payable_id INT NOT NULL REFERENCES public.accounts_payable(id) ON DELETE CASCADE,
    installment_id INT NOT NULL REFERENCES public.payable_installments(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(64) NOT NULL,
    cash_withdrawal_id INT REFERENCES public.cash_withdrawals(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(128),
    notes TEXT,
    created_by INT REFERENCES public.users(id) ON DELETE SET NULL,
    created_by_name_snapshot VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payable_payments_store ON public.payable_payments(store_id, payment_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payable_payments_idempotency ON public.payable_payments(store_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE IF EXISTS public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.accounts_payable ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payable_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payable_payments ENABLE ROW LEVEL SECURITY;
