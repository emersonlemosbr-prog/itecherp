// middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { userView } = require('../services/settings');
const { authorize } = require('./permissions');
const { checkStoreSubscription } = require('../services/multiTenantService');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const headerToken = header.startsWith('Bearer ') ? header.slice(7) : null;
  const queryToken = typeof req.query?.token === 'string' ? req.query.token : null;
  const token = headerToken || queryToken;

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
    if (!user.active || (payload.session_version || 0) !== user.session_version) return res.status(401).json({ error: 'Sessão revogada. Entre novamente.' });

    // Verificação de isolamento e assinatura da loja (Multi-Tenant)
    if (user.store_id) {
      const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(user.store_id);
      if (!store) {
        return res.status(403).json({ error: 'Loja associada não encontrada.', code: 'STORE_NOT_FOUND' });
      }

      const subscription = checkStoreSubscription(store);
      if (!subscription.isAccessible) {
        return res.status(403).json({
          error: subscription.reason,
          code: subscription.status === 'pending_activation' ? 'STORE_PENDING' : 'STORE_SUSPENDED',
          subscription
        });
      }
      req.store = store;
    }

    req.user = userView(user);
    authorize(req, res, next);
  } catch (err) {
    return res.status(401).json({ error: 'Sessão expirada ou token inválido.' });
  }
}

// Restringe a rota a determinados papéis. Ex: requireRole('admin')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Você não tem permissão para esta ação.' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };

