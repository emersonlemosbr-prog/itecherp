const crypto = require('crypto');

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

async function executeQuery(db, sql, params = []) {
  if (typeof db.execute === 'function') {
    return await db.execute(sql, params);
  }
  if (typeof db.prepare === 'function') {
    const sqliteSql = sql.replace(/\$(\d+)/g, '?');
    const info = db.prepare(sqliteSql).run(...params);
    return { rowCount: info.changes };
  }
  throw new Error('Database adapter inválido');
}

async function queryOne(db, sql, params = []) {
  if (typeof db.queryOne === 'function') {
    return await db.queryOne(sql, params);
  }
  if (typeof db.prepare === 'function') {
    const sqliteSql = sql.replace(/\$(\d+)/g, '?');
    return db.prepare(sqliteSql).get(...params) || null;
  }
  throw new Error('Database adapter inválido');
}

async function queryAll(db, sql, params = []) {
  if (typeof db.query === 'function') {
    return await db.query(sql, params);
  }
  if (typeof db.prepare === 'function') {
    const sqliteSql = sql.replace(/\$(\d+)/g, '?');
    return db.prepare(sqliteSql).all(...params);
  }
  return [];
}

function getPublicTrackingBaseUrl() {
  const envUrl = process.env.PUBLIC_TRACKING_URL;
  if (envUrl && envUrl.trim()) {
    const clean = envUrl.trim().replace(/\/+$/, '');
    // Se a variável ainda estiver apontando para o domínio legado descontinuado:
    if (clean.includes('erp.itechcelulareinformatica.com.br') || clean.includes('itechcelulareinformatica.com.br')) {
      return 'https://itechcloud.app';
    }
    return clean;
  }
  // Se houver APP_BASE_URL (ex: ShardCloud), usar como fallback
  const appBase = process.env.APP_BASE_URL;
  if (appBase && appBase.trim()) {
    const cleanApp = appBase.trim().replace(/\/+$/, '');
    if (!cleanApp.includes('itechcelulareinformatica.com.br')) {
      return cleanApp;
    }
  }
  // Em ambiente de teste automatizado sem URL definida, preserva a porta local
  if (process.env.NODE_ENV === 'test') {
    const defaultPort = require('../config/publicTracking').getListenConfig().port;
    return `http://127.0.0.1:${defaultPort}`;
  }
  return 'https://itechcloud.app';
}

function generateTracking(db, id) {
  const baseStr = getPublicTrackingBaseUrl();
  const base = new URL(baseStr.endsWith('/') ? baseStr : `${baseStr}/`);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('PUBLIC_TRACKING_URL inválida');
  }
  const token = crypto.randomBytes(32).toString('hex');
  const tokenH = hashToken(token);

  if (typeof db.execute === 'function') {
    return (async () => {
      const result = await db.execute('UPDATE service_orders SET public_token_hash = $1 WHERE id = $2', [tokenH, id]);
      return result.rowCount ? { url: `${base.origin}/acompanhamento/${token}` } : null;
    })();
  }

  // SQLite direto (compatibilidade síncrona com testes locais e scripts legados)
  const result = db.prepare('UPDATE service_orders SET public_token_hash = ? WHERE id = ?').run(tokenH, id);
  return result.changes ? { url: `${base.origin}/acompanhamento/${token}` } : null;
}

function cleanPublicText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractPublicCompanyInfo(rawSettings) {
  if (!rawSettings) {
    return { company_name: null, company_cnpj: null, company_logo: null };
  }
  let parsed = null;
  if (typeof rawSettings === 'object') {
    parsed = rawSettings;
  } else if (typeof rawSettings === 'string') {
    try {
      parsed = JSON.parse(rawSettings);
    } catch {
      parsed = null;
    }
  }
  const store = parsed && typeof parsed.store === 'object' && parsed.store !== null
    ? parsed.store
    : null;
  return {
    company_name: cleanPublicText(store?.name),
    company_cnpj: cleanPublicText(store?.cnpj),
    company_logo: cleanPublicText(store?.logo),
  };
}

function getPublicOrder(db, token) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenH = hashToken(token);
  const query = `
    SELECT so.id, so.order_number, c.first_name,
      TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS customer_name, so.brand, so.model,
      so.status, so.entry_date, so.updated_at, so.expected_delivery_date,
      ss.value AS store_settings_raw
    FROM service_orders so
    JOIN customers c ON c.id = so.customer_id
    LEFT JOIN system_settings ss ON ss.store_id = so.store_id
    WHERE so.public_token_hash = $1
  `;

  if (typeof db.queryOne === 'function') {
    return (async () => {
      const row = await db.queryOne(query, [tokenH]);
      if (!row) return null;
      const { id, store_settings_raw, unlock_password, unlock_pattern, unlock_type, ...order } = row;
      const company = extractPublicCompanyInfo(store_settings_raw);
      order.company_name = company.company_name;
      order.company_cnpj = company.company_cnpj;
      order.company_logo = company.company_logo;
      order.first_name = (order.first_name || '').trim().split(/\s+/)[0];
      order.history = await db.query('SELECT status, created_at FROM service_order_status_history WHERE service_order_id = $1 ORDER BY id', [id]);
      return order;
    })();
  }

  // SQLite direto (síncrono)
  const sqliteQuery = query.replace(/\$1/g, '?');
  const row = db.prepare(sqliteQuery).get(tokenH);
  if (!row) return null;
  const { id, store_settings_raw, unlock_password, unlock_pattern, unlock_type, ...order } = row;
  const company = extractPublicCompanyInfo(store_settings_raw);
  order.company_name = company.company_name;
  order.company_cnpj = company.company_cnpj;
  order.company_logo = company.company_logo;
  order.first_name = (order.first_name || '').trim().split(/\s+/)[0];
  order.history = db.prepare('SELECT status, created_at FROM service_order_status_history WHERE service_order_id = ? ORDER BY id').all(id);
  return order;
}

module.exports = { hashToken, generateTracking, getPublicOrder, extractPublicCompanyInfo };
