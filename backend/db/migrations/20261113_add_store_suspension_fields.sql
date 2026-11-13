-- 20261113_add_store_suspension_fields.sql
-- Adiciona campos de auditoria e motivo da suspensão na tabela stores
ALTER TABLE stores ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS suspended_by_name VARCHAR(255);

