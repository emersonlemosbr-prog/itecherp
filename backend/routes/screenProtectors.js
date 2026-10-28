const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();
const BRANDS = new Set(['Samsung', 'Motorola', 'Xiaomi', 'POCO', 'Apple', 'Realme', 'LG', 'Nokia', 'Itel', 'Outra']);

router.use(authenticate);

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizePayload(body) {
  const name = cleanText(body?.name);
  const brand = cleanText(body?.brand);
  const seen = new Set();
  const models = (Array.isArray(body?.models) ? body.models : [])
    .map(cleanText)
    .filter(model => {
      const key = model.toLocaleLowerCase('pt-BR');
      if (!model || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (!name) return { error: 'Informe o nome do grupo da película.' };
  if (name.length > 300) return { error: 'O nome do grupo deve ter no máximo 300 caracteres.' };
  if (!BRANDS.has(brand)) return { error: 'Selecione uma marca válida.' };
  if (models.length === 0) return { error: 'Adicione pelo menos um modelo compatível.' };
  if (models.some(model => model.length > 150)) return { error: 'Cada modelo deve ter no máximo 150 caracteres.' };
  return { name, brand, models };
}

async function getGroup(id, storeId = 1) {
  const group = await db.queryOne('SELECT id, name, brand, created_at, updated_at FROM screen_protector_groups WHERE id = $1 AND store_id = $2', [id, storeId]);
  if (!group) return null;
  const models = await db.query(
    'SELECT model_name FROM screen_protector_models WHERE group_id = $1 ORDER BY position, id',
    [id]
  );
  return {
    ...group,
    models: models.map(row => row.model_name),
  };
}

async function getAllGroups(storeId = 1) {
  const groups = await db.query(
    'SELECT id, name, brand, created_at, updated_at FROM screen_protector_groups WHERE store_id = $1 ORDER BY id',
    [storeId]
  );
  const groupIds = groups.map(g => g.id);
  if (!groupIds.length) return [];
  const placeholders = groupIds.map((_, i) => `$${i + 1}`).join(',');
  const models = await db.query(
    `SELECT group_id, model_name FROM screen_protector_models WHERE group_id IN (${placeholders}) ORDER BY group_id, position, id`,
    ...groupIds
  );
  const byGroup = new Map();
  for (const row of models) {
    if (!byGroup.has(row.group_id)) byGroup.set(row.group_id, []);
    byGroup.get(row.group_id).push(row.model_name);
  }
  return groups.map(group => ({ ...group, models: byGroup.get(group.id) || [] }));
}

router.get('/', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    res.json(await getAllGroups(storeId));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar grupos de películas: ' + err.message });
  }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const payload = normalizePayload(req.body);
    if (payload.error) return res.status(400).json({ error: payload.error });

    const exists = await db.queryOne('SELECT id FROM screen_protector_groups WHERE LOWER(name) = LOWER($1) AND store_id = $2', [payload.name, storeId]);
    if (exists) return res.status(409).json({ error: 'Já existe um grupo de película com esse nome.' });

    const id = await db.transaction(async (tx) => {
      const groupRes = await tx.execute(
        'INSERT INTO screen_protector_groups (store_id, name, brand, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
        [storeId, payload.name, payload.brand, req.user.id]
      );
      const groupId = groupRes.id;
      for (let position = 0; position < payload.models.length; position++) {
        await tx.execute(
          'INSERT INTO screen_protector_models (group_id, model_name, position) VALUES ($1, $2, $3)',
          [groupId, payload.models[position], position]
        );
      }
      return Number(groupId);
    });

    await logAction({ user: req.user, action: 'create_screen_protector_group', recordType: 'screen_protector_group', recordId: id, details: { name: payload.name } });
    res.status(201).json(await getGroup(id, storeId));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const existing = await db.queryOne('SELECT id FROM screen_protector_groups WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!existing) return res.status(404).json({ error: 'Grupo de película não encontrado.' });

    const payload = normalizePayload(req.body);
    if (payload.error) return res.status(400).json({ error: payload.error });

    const duplicate = await db.queryOne(
      'SELECT id FROM screen_protector_groups WHERE LOWER(name) = LOWER($1) AND id <> $2 AND store_id = $3',
      [payload.name, req.params.id, storeId]
    );
    if (duplicate) return res.status(409).json({ error: 'Já existe um grupo de película com esse nome.' });

    await db.transaction(async (tx) => {
      await tx.execute(
        'UPDATE screen_protector_groups SET name = $1, brand = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND store_id = $4',
        [payload.name, payload.brand, req.params.id, storeId]
      );
      await tx.execute('DELETE FROM screen_protector_models WHERE group_id = $1', [req.params.id]);
      for (let position = 0; position < payload.models.length; position++) {
        await tx.execute(
          'INSERT INTO screen_protector_models (group_id, model_name, position) VALUES ($1, $2, $3)',
          [req.params.id, payload.models[position], position]
        );
      }
    });

    await logAction({ user: req.user, action: 'update_screen_protector_group', recordType: 'screen_protector_group', recordId: req.params.id, details: { name: payload.name } });
    res.json(await getGroup(req.params.id, storeId));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const existing = await db.queryOne('SELECT id, name FROM screen_protector_groups WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!existing) return res.status(404).json({ error: 'Grupo de película não encontrado.' });
    await db.execute('DELETE FROM screen_protector_groups WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    await logAction({ user: req.user, action: 'delete_screen_protector_group', recordType: 'screen_protector_group', recordId: req.params.id, details: { name: existing.name } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir grupo de película: ' + err.message });
  }
});

module.exports = router;
