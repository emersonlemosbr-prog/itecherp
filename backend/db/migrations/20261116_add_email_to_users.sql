-- 20261116_add_email_to_users.sql
-- Adiciona a coluna email individual na tabela users permitindo NULL inicialmente para preservar contas legadas.
-- Cria índice único parcial para garantir que cada e-mail cadastrado (não nulo) seja estritamente único no sistema.

ALTER TABLE IF EXISTS public.users
    ADD COLUMN IF NOT EXISTS email VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique_lower
    ON public.users (LOWER(TRIM(email)))
    WHERE email IS NOT NULL AND TRIM(email) <> '';
