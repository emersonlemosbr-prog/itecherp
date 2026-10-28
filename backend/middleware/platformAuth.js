// middleware/platformAuth.js
const jwt = require('jsonwebtoken');
 const db = require('../db/database');

async function authenticatePlatformAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token de administrador da plataforma não fornecido.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'platform_admin' || payload.type !== 'platform') {
      return res.status(403).json({ error: 'Acesso exclusivo para administradores da plataforma iTech ERP.' });
    }

    const admin = await db.queryOne('SELECT id, name, email, role, active, session_version FROM platform_users WHERE id = $1', [payload.id]);
    if (!admin || !admin.active) {
      return res.status(401).json({ error: 'Conta de administrador da plataforma inativa ou não encontrada.' });
    }

    if ((payload.session_version || 0) !== admin.session_version) {
      return res.status(401).json({ error: 'Sessão revogada. Faça login novamente no painel da plataforma.' });
    }

    req.platformAdmin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessão expirada ou token de administrador inválido.' });
  }
}

module.exports = { authenticatePlatformAdmin };
