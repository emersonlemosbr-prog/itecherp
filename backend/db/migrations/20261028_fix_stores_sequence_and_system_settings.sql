-- ============================================================================
-- Migration: 20261028_fix_stores_sequence_and_system_settings.sql
-- Objetivo:
--   1. Sincronizar com segurança a sequência stores_id_seq com o MAX(id) da tabela stores.
--   2. Sincronizar todas as sequências SERIAL associadas às tabelas existentes.
--   3. Garantir a existência do registro de configurações padrão em system_settings
--      para todas as lojas existentes que ainda não possuam registro (ex: Loja 1).
--   4. Preservar integralmente os dados de clientes, ordens, usuários e lojas sem perda ou reset.
-- ============================================================================

DO $$
BEGIN
    -- 1. Sincronizar sequência stores_id_seq
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'stores_id_seq') THEN
        PERFORM setval('stores_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.stores), true);
    END IF;

    -- 2. Sincronizar sequência users_id_seq
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'users_id_seq') THEN
        PERFORM setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.users), true);
    END IF;

    -- 3. Sincronizar sequência platform_users_id_seq
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'platform_users_id_seq') THEN
        PERFORM setval('platform_users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.platform_users), true);
    END IF;

    -- 4. Sincronizar sequência system_settings_id_seq
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'system_settings_id_seq') THEN
        PERFORM setval('system_settings_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.system_settings), true);
    END IF;

    -- 5. Sincronizar sequências adicionais de tabelas principais se existirem
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'customers_id_seq') THEN
        PERFORM setval('customers_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.customers), true);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'service_orders_id_seq') THEN
        PERFORM setval('service_orders_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.service_orders), true);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'stock_products_id_seq') THEN
        PERFORM setval('stock_products_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.stock_products), true);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'store_sales_id_seq') THEN
        PERFORM setval('store_sales_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.store_sales), true);
    END IF;
END $$;

-- 6. Garantir registro de configurações em system_settings para todas as lojas existentes
-- Cria a linha padrão caso a loja não tenha configurações criadas ainda.
INSERT INTO public.system_settings (store_id, value, version, updated_at)
SELECT 
    s.id AS store_id,
    json_build_object(
        'store', json_build_object(
            'name', s.name,
            'trade_name', COALESCE(s.name, 'iTech'),
            'cnpj', '',
            'ie', '',
            'email', s.owner_email,
            'phone', COALESCE(s.contact_phone, ''),
            'whatsapp', '',
            'address', json_build_object(
                'street', '',
                'number', '',
                'complement', '',
                'district', '',
                'city', '',
                'state', '',
                'zip', ''
            ),
            'logo', ''
        ),
        'documents', json_build_object(
            'receipt_terms', 'Agradecemos a preferência! Garantia legal de 90 dias.',
            'warranty_terms', 'Garantia legal de 90 dias para defeitos de fabricação e serviços executados.',
            'quote_terms', 'Orçamento válido por 10 dias.',
            'ticket_message', 'Obrigado pela preferência! Volte sempre.',
            'warranty_days', 90
        ),
        'system', json_build_object(
            'theme', 'dark',
            'home', '/',
            'auto_backup', false,
            'backup_frequency', 'daily'
        ),
        'finance', json_build_object(
            'default_payment_method', 'pix'
        )
    )::text AS value,
    1 AS version,
    CURRENT_TIMESTAMP AS updated_at
FROM public.stores s
WHERE NOT EXISTS (
    SELECT 1 FROM public.system_settings ss WHERE ss.store_id = s.id
)
ON CONFLICT (store_id) DO NOTHING;

-- 7. Garantir sequências de documentos básicas para cada loja existente
INSERT INTO public.document_sequences (store_id, kind, next_value)
SELECT s.id, k.kind, 1
FROM public.stores s
CROSS JOIN (VALUES ('order'), ('sale'), ('device_sale'), ('report')) AS k(kind)
ON CONFLICT (store_id, kind) DO NOTHING;
