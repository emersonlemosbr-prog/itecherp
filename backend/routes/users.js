const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { userView, defaultPermissions } = require('../services/settings');
const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const users = await db.query('SELECT * FROM users WHERE store_id = $1 ORDER BY full_name', [storeId]);
    res.json(users.map(userView));
  } catch (err) {
    next(err);
  }
});

async function save(req, res) {
  try {
    const storeId = req.user.store_id || 1;
    const id = req.params.id ? Number(req.params.id) : null;

    const result = await db.transaction(async (tx) => {
      const old = id ? await tx.queryOne('SELECT * FROM users WHERE id = $1 AND store_id = $2', [id, storeId]) : null;
      if (id && !old) throw new Error('Usuário não encontrado nesta loja.');

      const actor = await tx.queryOne('SELECT * FROM users WHERE id = $1 AND store_id = $2', [req.user.id, storeId]);
      const b = { ...old, ...req.body };
      const role = String(b.role || '').toLowerCase();
      const active = b.active === undefined ? 1 : Number(!!b.active);

      if (!['admin', 'employee'].includes(role) || typeof b.full_name !== 'string' || !b.full_name.trim() || typeof b.username !== 'string' || !/^[\w.@-]{3,60}$/.test(b.username)) {
        throw new Error('Informe nome, usuário válido (3 a 60 caracteres) e tipo de acesso.');
      }

      if ((!old || b.password) && (typeof b.password !== 'string' || b.password.length < 8 || Buffer.byteLength(b.password) > 72)) {
        throw new Error('A senha deve ter entre 8 e 72 caracteres.');
      }

      if (b.password && b.password !== b.confirm_password) {
        throw new Error('A confirmação de senha não confere.');
      }

      // Limites por loja: 2 administradores e 6 funcionários
      if (active) {
        const countRow = await tx.queryOne('SELECT COUNT(*) AS n FROM users WHERE store_id = $1 AND active = 1 AND role = $2 AND id <> $3', [storeId, role, id || -1]);
        if (Number(countRow?.n || 0) >= (role === 'admin' ? 2 : 6)) {
          throw new Error(role === 'admin' ? 'Limite de administradores atingido. O sistema permite no máximo 2 administradores por loja.' : 'Limite de funcionários atingido. O sistema permite no máximo 6 funcionários por loja.');
        }
      }

      if (old?.role === 'admin' && old.active && (role !== 'admin' || !active)) {
        const adminCount = await tx.queryOne("SELECT COUNT(*) AS n FROM users WHERE store_id = $1 AND role = 'admin' AND active = 1", [storeId]);
        if (Number(adminCount?.n || 0) <= 1) {
          throw new Error('Mantenha pelo menos um administrador ativo na loja.');
        }
      }

      if (old?.is_master && !actor?.is_master) {
        const error = new Error('Somente o ADM Master pode alterar a conta do ADM Master.');
        error.statusCode = 403;
        throw error;
      }

      if (old?.is_master && (role !== 'admin' || !active)) {
        throw new Error('O ADM Master deve permanecer ativo e com acesso de administrador.');
      }

      const permissions = req.body.permissions || (typeof old?.permissions === 'object' ? old.permissions : JSON.parse(old?.permissions || '{}'));
      if (!permissions || Array.isArray(permissions) || Object.entries(permissions).some(([key, value]) => !(key in defaultPermissions) || typeof value !== 'boolean')) {
        throw new Error('Permissões inválidas.');
      }

      const hash = b.password ? bcrypt.hashSync(b.password, 12) : old.password_hash;
      let userId = id;

      if (old) {
        await tx.query(
          'UPDATE users SET full_name = $1, username = $2, role = $3, active = $4, job_title = $5, permissions = $6, password_hash = $7, session_version = session_version + 1 WHERE id = $8 AND store_id = $9',
          [b.full_name.trim(), b.username, role, active, String(b.job_title || '').slice(0, 100), JSON.stringify(permissions), hash, id, storeId]
        );
      } else {
        const insertRes = await tx.queryOne(
          'INSERT INTO users (store_id, full_name, username, role, active, job_title, permissions, password_hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
          [storeId, b.full_name.trim(), b.username, role, active, String(b.job_title || '').slice(0, 100), JSON.stringify(permissions), hash]
        );
        userId = insertRes.id;
      }

      await logAction({ user: req.user, action: old ? 'user_updated_permissions_status' : 'user_created', recordType: 'user', recordId: userId, storeId });
      if (old && b.password) {
        await logAction({ user: req.user, action: 'password_changed', recordType: 'user', recordId: userId, storeId });
      }

      const updatedUser = await tx.queryOne('SELECT * FROM users WHERE id = $1 AND store_id = $2', [userId, storeId]);
      return userView(updatedUser);
    });

    res.status(id ? 200 : 201).json(result);
  } catch (error) {
    res.status(error.statusCode || (String(error.message).includes('unique') || String(error.message).includes('UNIQUE') ? 409 : 400)).json({
      error: String(error.message).includes('unique') || String(error.message).includes('UNIQUE') ? 'Já existe um usuário com esse nome de usuário.' : error.message
    });
  }
}

router.post('/', save);
router.put('/:id', save);

router.delete('/:id', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const result = await db.transaction(async (tx) => {
      const actor = await tx.queryOne('SELECT * FROM users WHERE id = $1 AND (store_id = $2 OR store_id IS NULL)', [req.user.id, storeId]);
      const target = await tx.queryOne('SELECT * FROM users WHERE id = $1 AND (store_id = $2 OR store_id IS NULL)', [req.params.id, storeId]);
      if (!target) throw new Error('Usuário não encontrado nesta loja.');
      if (target.id === actor?.id) {
        const error = new Error('O ADM Master não pode excluir a própria conta autenticada.');
        error.statusCode = 400;
        throw error;
      }
      if (target.is_master) {
        const masterCount = await tx.queryOne('SELECT COUNT(*) AS n FROM users WHERE store_id = $1 AND is_master = 1', [storeId]);
        if (Number(masterCount?.n || 0) <= 1) {
          const error = new Error('A loja não pode ficar sem um ADM Master.');
          error.statusCode = 400;
          throw error;
        }
      }

      const refRow = await tx.queryOne(`
        SELECT (
          (SELECT COUNT(*) FROM service_orders WHERE created_by = $1) +
          (SELECT COUNT(*) FROM cash_withdrawals WHERE created_by = $1) +
          (SELECT COUNT(*) FROM audit_log WHERE user_id = $1) +
          (SELECT COUNT(*) FROM device_sales WHERE created_by = $1) +
          (SELECT COUNT(*) FROM stock_products WHERE created_by = $1) +
          (SELECT COUNT(*) FROM stock_movements WHERE user_id = $1) +
          (SELECT COUNT(*) FROM store_sales WHERE created_by = $1 OR canceled_by = $1) +
          (SELECT COUNT(*) FROM service_order_photos WHERE created_by = $1) +
          (SELECT COUNT(*) FROM screen_protector_groups WHERE created_by = $1)
        ) AS n
      `, [target.id]);
      const references = Number(refRow?.n || 0);

      if (references > 0 && !actor.is_master) {
        const error = new Error('Somente o ADM Master pode excluir permanentemente um usuário com registros vinculados.');
        error.statusCode = 403;
        throw error;
      }

      const name = target.full_name;
      await tx.query('UPDATE service_orders SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, $1), created_by = NULL WHERE created_by = $2', [name, target.id]);
      await tx.query('UPDATE cash_withdrawals SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, $1), created_by = NULL WHERE created_by = $2', [name, target.id]);
      await tx.query('UPDATE audit_log SET user_name = COALESCE(user_name, $1), user_id = NULL WHERE user_id = $2', [name, target.id]);
      await tx.query('UPDATE device_sales SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, $1), created_by = NULL WHERE created_by = $2', [name, target.id]);
      await tx.query('UPDATE stock_products SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, $1), created_by = NULL WHERE created_by = $2', [name, target.id]);
      await tx.query('UPDATE stock_movements SET user_name = COALESCE(user_name, $1), user_id = NULL WHERE user_id = $2', [name, target.id]);
      await tx.query('UPDATE store_sales SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, $1), created_by = NULL WHERE created_by = $2', [name, target.id]);
      await tx.query('UPDATE store_sales SET canceled_by_name_snapshot = COALESCE(canceled_by_name_snapshot, $1), canceled_by = NULL WHERE canceled_by = $2', [name, target.id]);
      await tx.query('UPDATE service_order_photos SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, $1), created_by = NULL WHERE created_by = $2', [name, target.id]);
      await tx.query('UPDATE screen_protector_groups SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, $1), created_by = NULL WHERE created_by = $2', [name, target.id]);
      await tx.query('DELETE FROM notes WHERE user_id = $1', [target.id]);
      await tx.query('DELETE FROM labels WHERE user_id = $1', [target.id]);

      for (const table of ['pagbank_calculator', 'piece_calculator', 'frontals_calculator', 'frontals_price_list', 'favorite_notes', 'pinned_notes']) {
        await tx.query(`DELETE FROM ${table} WHERE user_id = $1`, [target.id]);
      }
      await tx.query('DELETE FROM users WHERE id = $1 AND (store_id = $2 OR store_id IS NULL)', [target.id, storeId]);
      await logAction({ user: req.user.id === target.id ? null : req.user, action: 'user_deleted', recordType: 'user', recordId: target.id, details: { responsible: req.user.full_name }, storeId });
      return { references };
    });

    res.json({ success: true, mode: 'permanent', preserved_references: result.references });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

module.exports = router;
