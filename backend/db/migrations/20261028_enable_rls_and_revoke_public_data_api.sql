-- ============================================================================
-- iTech ERP - Migration de Segurança Supabase: Ativação de RLS e Bloqueio da Data API
-- Data: 2026-10-28
--
-- Objetivo:
--   1. Sanar todos os alertas críticos "RLS Disabled in Public" do Supabase Security Advisor.
--   2. Bloquear totalmente o acesso externo não autorizado via PostgREST / Data API
--      para as roles 'anon', 'authenticated' e 'PUBLIC'.
--   3. Preservar 100% do acesso do backend Node.js/Express (conexão direta pg via DATABASE_URL).
--   4. Garantir que as regras de negócio, permissões e isolamento multi-loja (store_id)
--      continuem sendo validados com integridade no backend.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. REVOGAÇÃO DE PRIVILÉGIOS NO SCHEMA PUBLIC PARA ROLES EXTERNAS DO SUPABASE
-- ----------------------------------------------------------------------------
-- Por padrão no PostgreSQL, o pseudo-papel PUBLIC possui USAGE no schema public.
-- No Supabase, as roles 'anon' (requisições com chave anônima da Data API) e
-- 'authenticated' (usuários logados via Supabase Auth) herdam privilégios de PUBLIC.
-- Como o iTech ERP não utiliza PostgREST e possui sua própria camada de autenticação
-- e autorização no Express, revogamos o acesso direto a todas as tabelas, sequências e rotinas.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated, PUBLIC;

-- Revoga criação de novos objetos no schema public por usuários não autorizados
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

-- Garante que quaisquer tabelas ou sequências futuras não herdem privilégios para anon ou authenticated
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated, PUBLIC;

-- ----------------------------------------------------------------------------
-- 2. HABILITAÇÃO DE ROW LEVEL SECURITY (RLS) EM TODAS AS 47 TABELAS DO ERP
-- ----------------------------------------------------------------------------
-- No PostgreSQL, uma tabela com RLS ativado e SEM POLÍTICAS criadas para 'anon'
-- ou 'authenticated' adota a política padrão de DENY ALL (bloqueio total).
-- Não criamos políticas abertas USING (true) para não expor tabelas privadas.
-- A role proprietária ('postgres') possui privilégio BYPASSRLS nativo no PostgreSQL,
-- permitindo que a API do backend continue executando consultas, escritas e transações
-- sem nenhuma quebra de funcionalidade.

-- Tenants e Plataforma
ALTER TABLE IF EXISTS public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.platform_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.store_subscription_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Usuários e Configurações
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.document_sequences ENABLE ROW LEVEL SECURITY;

-- Clientes
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;

-- Estoque e Produtos
ALTER TABLE IF EXISTS public.stock_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_movements ENABLE ROW LEVEL SECURITY;

-- Ordens de Serviço (OS) e Fotos
ALTER TABLE IF EXISTS public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service_order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service_order_photos ENABLE ROW LEVEL SECURITY;

-- Garantias e Financeiro
ALTER TABLE IF EXISTS public.warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.financial_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.financial_history_state ENABLE ROW LEVEL SECURITY;

-- Vendas
ALTER TABLE IF EXISTS public.store_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.store_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.device_sales ENABLE ROW LEVEL SECURITY;

-- Películas e Peças / Calculadoras
ALTER TABLE IF EXISTS public.screen_protector_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.screen_protector_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.parts_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.parts_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.frontals_price_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.frontals_calculator ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.piece_calculator ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pagbank_calculator ENABLE ROW LEVEL SECURITY;

-- Bloco de Notas e Etiquetas
ALTER TABLE IF EXISTS public.note_colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.note_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.note_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.note_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.note_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.favorite_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pinned_notes ENABLE ROW LEVEL SECURITY;

-- Antivírus e Diagnóstico
ALTER TABLE IF EXISTS public.virus_threat_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.virus_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.virus_scan_results ENABLE ROW LEVEL SECURITY;

-- Auditoria Geral e Notificações Push
ALTER TABLE IF EXISTS public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tracking_push ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. CONFIRMAÇÃO DE PRIVILÉGIOS PARA A CONEXÃO OFICIAL DO BACKEND (postgres)
-- ----------------------------------------------------------------------------
GRANT USAGE, CREATE ON SCHEMA public TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres;

-- ----------------------------------------------------------------------------
-- 4. OPÇÃO DE USUÁRIO DEDICADO COM MENORES PRIVILÉGIOS (MÍNIMO PRIVILÉGIO)
-- ----------------------------------------------------------------------------
-- Para ambientes onde se deseje conectar o backend com um usuário de banco dedicado
-- em vez do usuário superadmin 'postgres', pode-se criar a role 'itech_app':
--
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'itech_app') THEN
--     CREATE ROLE itech_app WITH LOGIN PASSWORD 'DefinaAquiUmaSenhaForte2026!';
--   END IF;
-- END
-- $$;
-- GRANT USAGE ON SCHEMA public TO itech_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO itech_app;
-- GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO itech_app;
-- ALTER ROLE itech_app BYPASSRLS;
-- ============================================================================
