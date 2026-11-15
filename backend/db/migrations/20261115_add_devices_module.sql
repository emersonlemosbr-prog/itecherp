-- 20261115_add_devices_module.sql
-- Módulo Aparelhos: Controle individual de estoque de celulares e dispositivos por IMEI / Número de Série

CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(150) NOT NULL,
    storage VARCHAR(50),
    color VARCHAR(80),
    category VARCHAR(80) NOT NULL DEFAULT 'Smartphone',
    imei1 VARCHAR(50),
    imei2 VARCHAR(50),
    serial_number VARCHAR(80),
    condition VARCHAR(50) NOT NULL DEFAULT 'Seminovo',
    battery_health INT,
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    sell_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    supplier_id INT REFERENCES stock_suppliers(id) ON DELETE SET NULL,
    supplier_name VARCHAR(255),
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'reserved', 'unavailable', 'sold', 'archived')),
    reservation_notes TEXT,
    reserved_at TIMESTAMPTZ,
    sold_at TIMESTAMPTZ,
    sale_id INT REFERENCES device_sales(id) ON DELETE SET NULL,
    sale_order_number VARCHAR(64),
    sale_customer_name VARCHAR(255),
    sale_price_sold NUMERIC(12, 2),
    notes TEXT,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_history (
    id SERIAL PRIMARY KEY,
    device_id INT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255),
    action_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices otimizados
CREATE INDEX IF NOT EXISTS idx_devices_store_status ON devices(store_id, status);
CREATE INDEX IF NOT EXISTS idx_devices_store_brand_model ON devices(store_id, brand, model);
CREATE INDEX IF NOT EXISTS idx_devices_store_imei1 ON devices(store_id, imei1);
CREATE INDEX IF NOT EXISTS idx_devices_store_serial ON devices(store_id, serial_number);
CREATE INDEX IF NOT EXISTS idx_devices_store_entry_date ON devices(store_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_device_history_device ON device_history(device_id);
CREATE INDEX IF NOT EXISTS idx_device_history_store ON device_history(store_id);

-- RLS
ALTER TABLE IF EXISTS public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.device_history ENABLE ROW LEVEL SECURITY;
