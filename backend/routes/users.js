const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { userView, defaultPermissions } = require('../services/settings');
const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/', (req, res) => {
  const storeId = req.user.store_id || 1;
  const users = db.prepare('SELECT * FROM users WHERE store_id = ? ORDER BY full_name').all(storeId);
  res.json(users.map(userView));
});

function save(req, res) {
  try {
    const storeId = req.user.store_id || 1;
    const id = req.params.id ? Number(req.params.id) : null;

    const result = db.transaction(() => {
      const old = id ? db.prepare('SELECT * FROM users WHERE id=? AND store_id=?').get(id, storeId) : null;
      if (id && !old) throw Error('Usuário não encontrado nesta loja.');

      const actor = db.prepare('SELECT * FROM users WHERE id=? AND store_id=?').get(req.user.id, storeId);
      const b = { ...old, ...req.body };
      const role = String(b.role || '').toLowerCase();
      const active = b.active === undefined ? 1 : Number(!!b.active);

      if (!['admin', 'employee'].includes(role) || typeof b.full_name !== 'string' || !b.full_name.trim() || typeof b.username !== 'string' || !/^[\w.@-]{3,60}$/.test(b.username)) {
        throw Error('Informe nome, usuário válido (3 a 60 caracteres) e tipo de acesso.');
      }

      if ((!old || b.password) && (typeof b.password !== 'string' || b.password.length < 8 || Buffer.byteLength(b.password) > 72)) {
        throw Error('A senha deve ter entre 8 e 72 caracteres.');
      }

      if (b.password && b.password !== b.confirm_password) {
        throw Error('A confirmação de senha não confere.');
      }

      // Limites por loja: 2 administradores e 6 funcionários
      if (active && db.prepare('SELECT COUNT(*) AS n FROM users WHERE store_id=? AND active=1 AND role=? AND id<>?').get(storeId, role, id || -1).n >= (role === 'admin' ? 2 : 6)) {
        throw Error(role === 'admin' ? 'Limite de administradores atingido. O sistema permite no máximo 2 administradores por loja.' : 'Limite de funcionários atingido. O sistema permite no máximo 6 funcionários por loja.');
      }

      if (old?.role === 'admin' && old.active && (role !== 'admin' || !active) && db.prepare("SELECT COUNT(*) AS n FROM users WHERE store_id=? AND role='admin' AND active=1").get(storeId).n <= 1) {
        throw Error('Mantenha pelo menos um administrador ativo na loja.');
      }

      if (old?.is_master && !actor?.is_master) {
        const error = Error('Somente o ADM Master pode alterar a conta do ADM Master.');
        error.statusCode = 403;
        throw error;
      }

      if (old?.is_master && (role !== 'admin' || !active)) {
        throw Error('O ADM Master deve permanecer ativo e com acesso de administrador.');
      }

      const permissions = req.body.permissions || JSON.parse(old?.permissions || '{}');
      if (!permissions || Array.isArray(permissions) || Object.entries(permissions).some(([key, value]) => !(key in defaultPermissions) || typeof value !== 'boolean')) {
        throw Error('Permissões inválidas.');
      }

      const hash = b.password ? bcrypt.hashSync(b.password, 12) : old.password_hash;
      let userId = id;

      if (old) {
        db.prepare('UPDATE users SET full_name=?,username=?,role=?,active=?,job_title=?,permissions=?,password_hash=?,session_version=session_version+1 WHERE id=? AND store_id=?')
          .run(b.full_name.trim(), b.username, role, active, String(b.job_title || '').slice(0, 100), JSON.stringify(permissions), hash, id, storeId);
      } else {
        userId = db.prepare('INSERT INTO users(store_id,full_name,username,role,active,job_title,permissions,password_hash) VALUES(?,?,?,?,?,?,?,?)')
          .run(storeId, b.full_name.trim(), b.username, role, active, String(b.job_title || '').slice(0, 100), JSON.stringify(permissions), hash).lastInsertRowid;
      }

      logAction({ user: req.user, action: old ? 'user_updated_permissions_status' : 'user_created', recordType: 'user', recordId: userId });
      if (old && b.password) logAction({ user: req.user, action: 'password_changed', recordType: 'user', recordId: userId });

      return userView(db.prepare('SELECT * FROM users WHERE id=? AND store_id=?').get(userId, storeId));
    })();

    res.status(id ? 200 : 201).json(result);
  } catch (error) {
    res.status(error.statusCode || (String(error.message).includes('UNIQUE') ? 409 : 400)).json({
      error: String(error.message).includes('UNIQUE') ? 'Já existe um usuário com esse nome de usuário.' : error.message
    });
  }
}

router.post('/', save);
router.put('/:id', save);

router.delete('/:id', (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const result = db.transaction(() => {
      const actor = db.prepare('SELECT * FROM users WHERE id=? AND (store_id=? OR store_id IS NULL)').get(req.user.id, storeId);
      const target = db.prepare('SELECT * FROM users WHERE id=? AND (store_id=? OR store_id IS NULL)').get(req.params.id, storeId);
      if (!target) throw Error('Usuário não encontrado nesta loja.');
      if (target.id === actor?.id) {
        const error = Error('O ADM Master não pode excluir a própria conta autenticada.');
        error.statusCode = 400;
        throw error;
      }
      if (target.is_master && db.prepare('SELECT COUNT(*) n FROM users WHERE store_id=? AND is_master=1').get(storeId).n <= 1) {
        const error = Error('A loja não pode ficar sem um ADM Master.');
        error.statusCode = 400;
        throw error;
      }

      const references = db.prepare(`SELECT
        (SELECT COUNT(*) FROM service_orders WHERE created_by=@id)+
        (SELECT COUNT(*) FROM cash_withdrawals WHERE created_by=@id)+
        (SELECT COUNT(*) FROM audit_log WHERE user_id=@id)+
        (SELECT COUNT(*) FROM device_sales WHERE created_by=@id)+
        (SELECT COUNT(*) FROM stock_products WHERE created_by=@id)+
        (SELECT COUNT(*) FROM stock_movements WHERE user_id=@id)+
        (SELECT COUNT(*) FROM store_sales WHERE created_by=@id OR canceled_by=@id)+
        (SELECT COUNT(*) FROM service_order_photos WHERE created_by=@id)+
        (SELECT COUNT(*) FROM screen_protector_groups WHERE created_by=@id) AS n`).get({ id: target.id }).n;

      if (references > 0 && !actor.is_master) {
        const error = Error('Somente o ADM Master pode excluir permanentemente um usuário com registros vinculados.');
        error.statusCode = 403;
        throw error;
      }

      const name = target.full_name;
      db.prepare('UPDATE service_orders SET created_by_name_snapshot=COALESCE(created_by_name_snapshot,?),created_by=NULL WHERE created_by=?').run(name, target.id);
      db.prepare('UPDATE cash_withdrawals SET created_by_name_snapshot=COALESCE(created_by_name_snapshot,?),created_by=NULL WHERE created_by=?').run(name, target.id);
      db.prepare('UPDATE audit_log SET user_name=COALESCE(user_name,?),user_id=NULL WHERE user_id=?').run(name, target.id);
      db.prepare('UPDATE device_sales SET created_by_name_snapshot=COALESCE(created_by_name_snapshot,?),created_by=NULL WHERE created_by=?').run(name, target.id);
      db.prepare('UPDATE stock_products SET created_by_name_snapshot=COALESCE(created_by_name_snapshot,?),created_by=NULL WHERE created_by=?').run(name, target.id);
      db.prepare('UPDATE stock_movements SET user_name=COALESCE(user_name,?),user_id=NULL WHERE user_id=?').run(name, target.id);
      db.prepare('UPDATE store_sales SET created_by_name_snapshot=COALESCE(created_by_name_snapshot,?),created_by=NULL WHERE created_by=?').run(name, target.id);
      db.prepare('UPDATE store_sales SET canceled_by_name_snapshot=COALESCE(canceled_by_name_snapshot,?),canceled_by=NULL WHERE canceled_by=?').run(name, target.id);
      db.prepare('UPDATE service_order_photos SET created_by_name_snapshot=COALESCE(created_by_name_snapshot,?),created_by=NULL WHERE created_by=?').run(name, target.id);
      db.prepare('UPDATE screen_protector_groups SET created_by_name_snapshot=COALESCE(created_by_name_snapshot,?),created_by=NULL WHERE created_by=?').run(name, target.id);
      db.prepare('DELETE FROM notes WHERE user_id=?').run(target.id);
      db.prepare('DELETE FROM labels WHERE user_id=?').run(target.id);
      for (const table of ['pagbank_calculator', 'piece_calculator', 'frontals_calculator', 'frontals_price_list', 'favorite_notes', 'pinned_notes']) {
        db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(target.id);
      }
      db.prepare('DELETE FROM users WHERE id=? AND (store_id=? OR store_id IS NULL)').run(target.id, storeId);
      logAction({ user: req.user.id === target.id ? null : req.user, action: 'user_deleted', recordType: 'user', recordId: target.id, details: { responsible: req.user.full_name } });
      return { references };
    })();

    res.json({ success: true, mode: 'permanent', preserved_references: result.references });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

module.exports = router;
