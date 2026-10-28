const express = require('express');
const db = require('../db/database');
const { importModels } = require('../db/partsModelsSchema');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

const key = value => String(value || '').trim().toLocaleLowerCase('pt-BR');
const fail = (message, status = 400) => { const e = new Error(message); e.status = status; throw e; };
const wrap = fn => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Não foi possível concluir a operação.' });
  }
};

const option = async (id, user, kind) =>
  db.queryOne('SELECT * FROM parts_options WHERE id = $1 AND user_id = $2 AND kind = $3', [id, user, kind]);

const entries = async user =>
  db.query(`
    SELECT p.*, p.sale_price AS price, c.name AS category, c.show_assembly,
           q.name AS quality
    FROM frontals_price_list p
    LEFT JOIN parts_options c ON c.id = p.category_id
    LEFT JOIN parts_options q ON q.id = p.quality_id
    WHERE p.user_id = $1
    ORDER BY p.created_at DESC, p.id DESC
  `, [user]);

const models = async user =>
  db.query(`
    SELECT m.*, b.name AS brand
    FROM parts_models m
    JOIN parts_options b ON b.id = m.brand_id
    WHERE m.user_id = $1
    ORDER BY b.name, m.name
  `, [user]);

const modelById = async (id, user) =>
  db.queryOne(`
    SELECT m.*, b.name AS brand, b.name_key AS brand_key
    FROM parts_models m
    JOIN parts_options b ON b.id = m.brand_id
    WHERE m.id = $1 AND m.user_id = $2
  `, [id, user]);

const modelUsage = async model => {
  const allList = await db.query('SELECT id, brand, model FROM frontals_price_list WHERE user_id = $1', [model.user_id]);
  return allList.filter(p => key(p.brand) === model.brand_key && key(p.model) === model.name_key);
};

async function modelPayload(body, user) {
  const brand = await option(body.brand_id, user, 'brand');
  if (!brand) fail('Selecione uma marca válida.');
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 1000) {
    fail('Informe um modelo de até 1000 caracteres.');
  }
  return { brand, name: body.name.trim(), name_key: key(body.name) };
}

router.post('/models', wrap(async (req, res) => {
  const value = await modelPayload(req.body, req.user.id);
  const exists = await db.queryOne(
    'SELECT id FROM parts_models WHERE user_id = $1 AND brand_id = $2 AND name_key = $3',
    [req.user.id, value.brand.id, value.name_key]
  );
  if (exists) fail('Este modelo já está cadastrado para esta marca.', 409);

  const result = await db.execute(
    'INSERT INTO parts_models(user_id, brand_id, name, name_key) VALUES($1, $2, $3, $4) RETURNING id',
    [req.user.id, value.brand.id, value.name, value.name_key]
  );
  res.status(201).json(await modelById(Number(result.id), req.user.id));
}));

router.put('/models/:id', wrap(async (req, res) => {
  await db.transaction(async (tx) => {
    const old = await modelById(req.params.id, req.user.id);
    if (!old) fail('Modelo não encontrado.', 404);
    const value = await modelPayload(req.body, req.user.id);
    const duplicate = await tx.queryOne(
      'SELECT id FROM parts_models WHERE user_id = $1 AND brand_id = $2 AND name_key = $3 AND id <> $4',
      [req.user.id, value.brand.id, value.name_key, old.id]
    );
    if (duplicate) fail('Este modelo já está cadastrado para esta marca.', 409);

    const used = await modelUsage(old);
    if (used.length && old.brand_id !== value.brand.id) {
      fail(`Este modelo está sendo utilizado por ${used.length} peças. Altere os vínculos antes de mudar a marca.`, 409);
    }
    await tx.execute(
      'UPDATE parts_models SET brand_id = $1, name = $2, name_key = $3 WHERE id = $4',
      [value.brand.id, value.name, value.name_key, old.id]
    );
    for (const row of used) {
      await tx.execute('UPDATE frontals_price_list SET model = $1 WHERE id = $2', [value.name, row.id]);
    }
  });
  res.json(await modelById(req.params.id, req.user.id));
}));

router.delete('/models/:id', wrap(async (req, res) => {
  await db.transaction(async (tx) => {
    const old = await modelById(req.params.id, req.user.id);
    if (!old) fail('Modelo não encontrado.', 404);
    const used = (await modelUsage(old)).length;
    if (used) fail(`Este modelo está sendo utilizado por ${used} peças. Altere os vínculos antes de excluir.`, 409);
    await tx.execute('DELETE FROM parts_models WHERE id = $1 AND user_id = $2', [old.id, req.user.id]);
  });
  res.json({ success: true });
}));

router.get('/', wrap(async (req, res) => {
  const user = req.user.id;
  await db.transaction(async (tx) => {
    const uncat = await tx.queryOne('SELECT id FROM frontals_price_list WHERE user_id = $1 AND category_id IS NULL', [user]);
    if (uncat) {
      await tx.execute(
        "INSERT INTO parts_options(user_id, kind, name, name_key, show_assembly) VALUES($1, 'category', 'Frontais', 'frontais', 1) ON CONFLICT DO NOTHING",
        [user]
      );
      const category = await tx.queryOne(
        "SELECT id FROM parts_options WHERE user_id = $1 AND kind = 'category' AND name_key = 'frontais'",
        [user]
      );
      if (category) {
        await tx.execute('UPDATE frontals_price_list SET category_id = $1 WHERE user_id = $2 AND category_id IS NULL', [category.id, user]);
      }
    }
    const brands = await tx.query('SELECT DISTINCT brand FROM frontals_price_list WHERE user_id = $1', [user]);
    for (const row of brands) {
      if (row.brand) {
        await tx.execute(
          "INSERT INTO parts_options(user_id, kind, name, name_key) VALUES($1, 'brand', $2, $3) ON CONFLICT DO NOTHING",
          [user, row.brand, key(row.brand)]
        );
      }
    }
  });

  await importModels(db, req.user.id);

  const entryList = await entries(req.user.id);
  const optList = await db.query('SELECT * FROM parts_options WHERE user_id = $1 ORDER BY LOWER(name)', [req.user.id]);
  const modelList = await models(req.user.id);

  res.json({ entries: entryList, options: optList, models: modelList });
}));

function validateOption(body) {
  if (!['category', 'brand', 'quality'].includes(body.kind)) fail('Tipo de cadastro inválido.');
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) {
    fail('Informe um nome de até 100 caracteres.');
  }
}

router.post('/options', wrap(async (req, res) => {
  validateOption(req.body);
  const { kind, name, show_assembly } = req.body;
  const exists = await db.queryOne(
    'SELECT id FROM parts_options WHERE user_id = $1 AND kind = $2 AND name_key = $3',
    [req.user.id, kind, key(name)]
  );
  if (exists) fail('Este nome já está cadastrado.', 409);

  const result = await db.execute(
    'INSERT INTO parts_options(user_id, kind, name, name_key, show_assembly) VALUES($1, $2, $3, $4, $5) RETURNING id',
    [req.user.id, kind, name.trim(), key(name), kind === 'category' && show_assembly ? 1 : 0]
  );
  res.status(201).json({ id: Number(result.id) });
}));

router.put('/options/:id', wrap(async (req, res) => {
  const old = await db.queryOne('SELECT * FROM parts_options WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!old) fail('Cadastro não encontrado.', 404);
  validateOption({ ...req.body, kind: old.kind });
  const name = req.body.name.trim();

  const duplicate = await db.queryOne(
    'SELECT id FROM parts_options WHERE user_id = $1 AND kind = $2 AND name_key = $3 AND id <> $4',
    [req.user.id, old.kind, key(name), old.id]
  );
  if (duplicate) fail('Este nome já está cadastrado.', 409);

  await db.transaction(async (tx) => {
    await tx.execute(
      'UPDATE parts_options SET name = $1, name_key = $2, show_assembly = $3 WHERE id = $4',
      [name, key(name), old.kind === 'category' && req.body.show_assembly ? 1 : 0, old.id]
    );
    if (old.kind === 'brand') {
      const rows = await tx.query('SELECT id, brand FROM frontals_price_list WHERE user_id = $1', [req.user.id]);
      for (const row of rows) {
        if (key(row.brand) === old.name_key) {
          await tx.execute('UPDATE frontals_price_list SET brand = $1 WHERE id = $2', [name, row.id]);
        }
      }
    }
  });
  res.json({ success: true });
}));

router.delete('/options/:id', wrap(async (req, res) => {
  const old = await db.queryOne('SELECT * FROM parts_options WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!old) fail('Cadastro não encontrado.', 404);

  const allEntries = await entries(req.user.id);
  const used = allEntries.some(p =>
    old.kind === 'category' ? p.category_id === old.id :
    old.kind === 'quality' ? p.quality_id === old.id :
    key(p.brand) === old.name_key
  );
  if (used) fail('Este cadastro está sendo usado por uma peça. Altere as peças antes de excluir.', 409);

  if (old.kind === 'brand') {
    const hasModels = await db.queryOne('SELECT id FROM parts_models WHERE brand_id = $1 AND user_id = $2', [old.id, req.user.id]);
    if (hasModels) fail('Esta marca possui modelos cadastrados. Altere ou exclua os modelos antes de excluir a marca.', 409);
  }

  await db.execute('DELETE FROM parts_options WHERE id = $1', [old.id]);
  res.json({ success: true });
}));

async function payload(body, user) {
  const cat = await option(body.category_id, user, 'category');
  if (!cat) fail('Selecione uma categoria válida.');
  if (body.quality_id && !(await option(body.quality_id, user, 'quality'))) {
    fail('Selecione uma qualidade válida.');
  }
  const brandOpt = await db.queryOne(
    "SELECT id FROM parts_options WHERE user_id = $1 AND kind = 'brand' AND name_key = $2",
    [user, key(body.brand)]
  );
  if (typeof body.brand !== 'string' || !brandOpt) fail('Selecione uma marca cadastrada.');
  if (typeof body.model !== 'string' || !body.model.trim()) fail('Informe o modelo.');

  if (body.model_id != null) {
    const model = await db.queryOne(
      'SELECT m.*, b.name_key AS brand_key FROM parts_models m JOIN parts_options b ON b.id = m.brand_id WHERE m.id = $1 AND m.user_id = $2',
      [body.model_id, user]
    );
    if (!model || model.brand_key !== key(body.brand) || model.name_key !== key(body.model)) {
      fail('Selecione um modelo cadastrado para a marca escolhida.');
    }
  }

  for (const field of ['cost_price', 'sale_price']) {
    if (typeof body[field] !== 'number' || !Number.isFinite(body[field]) || body[field] < 0) {
      fail('Informe valores válidos, iguais ou maiores que zero.');
    }
  }
  if (!['', 'with', 'without'].includes(body.frame || '')) fail('Opção de aro inválida.');

  const result = {
    category_id: Number(body.category_id),
    quality_id: body.quality_id ? Number(body.quality_id) : null,
    cost_price: body.cost_price,
    sale_price: body.sale_price
  };

  for (const field of ['brand', 'model', 'version', 'description', 'part_code', 'assembly_type', 'frame']) {
    if (body[field] != null && typeof body[field] !== 'string') fail('Campo de texto inválido.');
    result[field] = (body[field] || '').trim();
    if (result[field].length > 1000) fail('Limite de 1000 caracteres por campo.');
  }
  return result;
}

router.post('/entries', wrap(async (req, res) => {
  const data = await payload(req.body, req.user.id);
  const cols = Object.keys(data);
  const placeholders = cols.map((_, i) => `$${i + 2}`).join(',');
  const result = await db.execute(
    `INSERT INTO frontals_price_list(user_id, ${cols.join(',')}) VALUES($1, ${placeholders}) RETURNING id`,
    [req.user.id, ...Object.values(data)]
  );
  const allEntries = await entries(req.user.id);
  res.status(201).json(allEntries.find(p => p.id === Number(result.id)));
}));

router.put('/entries/:id', wrap(async (req, res) => {
  const exists = await db.queryOne('SELECT id FROM frontals_price_list WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!exists) fail('Peça não encontrada.', 404);

  const data = await payload(req.body, req.user.id);
  const cols = Object.keys(data);
  const setClauses = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const params = [...Object.values(data), req.params.id, req.user.id];

  await db.execute(
    `UPDATE frontals_price_list SET ${setClauses} WHERE id = $${cols.length + 1} AND user_id = $${cols.length + 2}`,
    params
  );
  const allEntries = await entries(req.user.id);
  res.json(allEntries.find(p => p.id === Number(req.params.id)));
}));

router.delete('/entries/:id', wrap(async (req, res) => {
  const result = await db.execute('DELETE FROM frontals_price_list WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!result.changes) fail('Peça não encontrada.', 404);
  res.json({ success: true });
}));

module.exports = router;
