-- ============================================================================
-- Migration: Criação das tabelas de Notificações e Preferências de Usuário
-- Compatível com PostgreSQL e SQLite
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_notification_preferences (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode VARCHAR(32) NOT NULL DEFAULT 'custom' CHECK (mode IN ('all', 'none', 'custom')),
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_pref_store_user UNIQUE (store_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_notif_pref_user ON user_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notif_pref_store ON user_notification_preferences(store_id);

CREATE TABLE IF NOT EXISTS user_notifications (
    id SERIAL PRIMARY KEY,
    store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_key VARCHAR(64) NOT NULL,
    category VARCHAR(32) NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    link VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_read ON user_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_user_notifications_store ON user_notifications(store_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_created ON user_notifications(created_at DESC);

-- Habilitar RLS
ALTER TABLE IF EXISTS user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_notifications ENABLE ROW LEVEL SECURITY;

