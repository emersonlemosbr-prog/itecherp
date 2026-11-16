-- 20261116_allow_null_product_id_in_store_sale_items.sql
-- Permite que itens de venda de aparelhos ou serviços rápidos (que não são produtos de estoque)
-- sejam gravados em store_sale_items com product_id NULL e integridade referencial mantida com ON DELETE SET NULL.

ALTER TABLE IF EXISTS public.store_sale_items
    ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE IF EXISTS public.store_sale_items
    DROP CONSTRAINT IF EXISTS store_sale_items_product_id_fkey;

ALTER TABLE IF EXISTS public.store_sale_items
    ADD CONSTRAINT store_sale_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.stock_products(id) ON DELETE SET NULL;
