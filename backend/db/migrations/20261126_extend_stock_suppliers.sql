-- ============================================================================
-- Migration: 20261126_extend_stock_suppliers.sql
-- Objetivo:
--   Estender a tabela stock_suppliers com dados cadastrais completos (PF/PJ,
--   CPF/CNPJ, IE, contatos e endereço) preservando 100% dos registros existentes.
-- ============================================================================

ALTER TABLE IF EXISTS public.stock_suppliers ADD COLUMN IF NOT EXISTS trade_name VARCHAR(255);
ALTER TABLE IF EXISTS public.stock_suppliers ADD COLUMN IF NOT EXISTS person_type VARCHAR(8) DEFAULT 'PJ';
ALTER TABLE IF EXISTS public.stock_suppliers ADD COLUMN IF NOT EXISTS document VARCHAR(32);
ALTER TABLE IF EXISTS public.stock_suppliers ADD COLUMN IF NOT EXISTS state_registration VARCHAR(64);
ALTER TABLE IF EXISTS public.stock_suppliers ADD COLUMN IF NOT EXISTS phone VARCHAR(32);
ALTER TABLE IF EXISTS public.stock_suppliers ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(32);
ALTER TABLE IF EXISTS public.stock_suppliers ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE IF EXISTS public.stock_suppliers ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255);
ALTER TABLE IF EXISTS public.stock_suppliers ADD COLUMN IF NOT EXISTS postal_code VARCHAR(16);
ALTER TABLE IF EXISTS public.stock_suppliers ADD COLUMN IF NOT EXISTS street VARCHAR(255);
ALTER TABLE IF EXISTS public.stock_suppliers ADD COLUMN IF NOT EXISTS number VARCHAR(32);
ALTER TABLE IF EXISTS public.stock_suppliers ADD COLUMN IF NOT EXISTS complement VARCHAR(120);
ALTER TABLE IF EXISTS public.stock_suppliers ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(120);
ALTER TABLE IF EXISTS public.stock_suppliers ADD COLUMN IF NOT EXISTS city VARCHAR(120);
ALTER TABLE IF EXISTS public.stock_suppliers ADD COLUMN IF NOT EXISTS state VARCHAR(16);
ALTER TABLE IF EXISTS public.stock_suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_stock_suppliers_document ON public.stock_suppliers(store_id, document);
