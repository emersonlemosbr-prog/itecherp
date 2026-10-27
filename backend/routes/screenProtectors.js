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

function getGroup(id, storeId = 1) {
  const group = db.prepare('SELECT id, name, brand, created_at, updated_at FROM screen_protector_groups WHERE id = ? AND store_id = ?').get(id, storeId);
  if (!group) return null;
  return {
    ...group,
    models: db.prepare(
      'SELECT model_name FROM screen_protector_models WHERE group_id = ? ORDER BY position, id'
    ).all(id).map(row => row.model_name),
  };
}

function getAllGroups(storeId = 1) {
  const groups = db.prepare(
    'SELECT id, name, brand, created_at, updated_at FROM screen_protector_groups WHERE store_id = ? ORDER BY id'
  ).all(storeId);
  const groupIds = groups.map(g => g.id);
  if (!groupIds.length) return [];
  const placeholders = groupIds.map(() => '?').join(',');
  const models = db.prepare(
    `SELECT group_id, model_name FROM screen_protector_models WHERE group_id IN (${placeholders}) ORDER BY group_id, position, id`
  ).all(...groupIds);
  const byGroup = new Map();
  for (const row of models) {
    if (!byGroup.has(row.group_id)) byGroup.set(row.group_id, []);
    byGroup.get(row.group_id).push(row.model_name);
  }
  return groups.map(group => ({ ...group, models: byGroup.get(group.id) || [] }));
}

router.get('/', (req, res) => {
  const storeId = req.user.store_id || 1;
  res.json(getAllGroups(storeId));
});

router.post('/', requireRole('admin'), (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const payload = normalizePayload(req.body);
    if (payload.error) return res.status(400).json({ error: payload.error });
    const exists = db.prepare('SELECT id FROM screen_protector_groups WHERE name = ? COLLATE NOCASE AND store_id = ?').get(payload.name, storeId);
    if (exists) return res.status(409).json({ error: 'Já existe um grupo de película com esse nome.' });

    const id = db.transaction(() => {
      const groupId = db.prepare(
        'INSERT INTO screen_protector_groups (store_id, name, brand, created_by) VALUES (?, ?, ?, ?)'
      ).run(storeId, payload.name, payload.brand, req.user.id).lastInsertRowid;
      const insertModel = db.prepare(
        'INSERT INTO screen_protector_models (group_id, model_name, position) VALUES (?, ?, ?)'
      );
      payload.models.forEach((model, position) => insertModel.run(groupId, model, position));
      return Number(groupId);
    })();

    logAction({ user: req.user, action: 'create_screen_protector_group', recordType: 'screen_protector_group', recordId: id, details: { name: payload.name } });
    res.status(201).json(getGroup(id, storeId));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireRole('admin'), (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const existing = db.prepare('SELECT id FROM screen_protector_groups WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
    if (!existing) return res.status(404).json({ error: 'Grupo de película não encontrado.' });
    const payload = normalizePayload(req.body);
    if (payload.error) return res.status(400).json({ error: payload.error });
    const duplicate = db.prepare(
      'SELECT id FROM screen_protector_groups WHERE name = ? COLLATE NOCASE AND id <> ? AND store_id = ?'
    ).get(payload.name, req.params.id, storeId);
    if (duplicate) return res.status(409).json({ error: 'Já existe um grupo de película com esse nome.' });

    db.transaction(() => {
      db.prepare(
        "UPDATE screen_protector_groups SET name = ?, brand = ?, updated_at = datetime('now') WHERE id = ? AND store_id = ?"
      ).run(payload.name, payload.brand, req.params.id, storeId);
      db.prepare('DELETE FROM screen_protector_models WHERE group_id = ?').run(req.params.id);
      const insertModel = db.prepare(
        'INSERT INTO screen_protector_models (group_id, model_name, position) VALUES (?, ?, ?)'
      );
      payload.models.forEach((model, position) => insertModel.run(req.params.id, model, position));
    })();

    logAction({ user: req.user, action: 'update_screen_protector_group', recordType: 'screen_protector_group', recordId: req.params.id, details: { name: payload.name } });
    res.json(getGroup(req.params.id, storeId));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const storeId = req.user.store_id || 1;
  const existing = db.prepare('SELECT id, name FROM screen_protector_groups WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
  if (!existing) return res.status(404).json({ error: 'Grupo de película não encontrado.' });
  db.prepare('DELETE FROM screen_protector_groups WHERE id = ? AND store_id = ?').run(req.params.id, storeId);
  logAction({ user: req.user, action: 'delete_screen_protector_group', recordType: 'screen_protector_group', recordId: req.params.id, details: { name: existing.name } });
  res.json({ success: true });
});

module.exports = router;

