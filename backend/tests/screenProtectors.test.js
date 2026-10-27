const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itech-screen-protectors-'));
process.env.ITECH_DB_PATH = path.join(tempDir, 'test.db');

const db = require('../db/database');
const router = require('../routes/screenProtectors');

function handler(method, routePath) {
  const layer = router.stack.find(item => item.route?.path === routePath && item.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${routePath} não encontrado`);
  return layer.route.stack.at(-1).handle;
}

function call(routeHandler, { body = {}, params = {}, user = { id: 1, role: 'admin' } } = {}) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(data) { resolve({ status: this.statusCode, data }); },
    };
    routeHandler({ body, params, user }, response, reject);
  });
}

test('migra os 67 grupos e preserva os 226 modelos únicos', () => {
  const groups = db.prepare('SELECT COUNT(*) total FROM screen_protector_groups').get().total;
  const models = db.prepare('SELECT COUNT(DISTINCT model_name) total FROM screen_protector_models').get().total;
  assert.equal(groups, 67);
  assert.equal(models, 226);
});

test('cria, edita, persiste e exclui um grupo com seus modelos', async () => {
  db.prepare("INSERT INTO users (full_name, username, password_hash, role) VALUES ('Admin', 'admin_teste', 'x', 'admin')").run();

  const created = await call(handler('post', '/'), {
    body: { name: 'Grupo CRUD Teste', brand: 'Samsung', models: ['Samsung Teste 1', 'Samsung Teste 2', 'samsung teste 1'] },
  });
  assert.equal(created.status, 201);
  assert.deepEqual(created.data.models, ['Samsung Teste 1', 'Samsung Teste 2']);

  const updated = await call(handler('put', '/:id'), {
    params: { id: created.data.id },
    body: { name: 'Grupo CRUD Teste Editado', brand: 'Motorola', models: ['Motorola Teste X'] },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.name, 'Grupo CRUD Teste Editado');
  assert.equal(updated.data.brand, 'Motorola');
  assert.deepEqual(updated.data.models, ['Motorola Teste X']);

  const persisted = db.prepare('SELECT name, brand FROM screen_protector_groups WHERE id = ?').get(created.data.id);
  assert.deepEqual(persisted, { name: 'Grupo CRUD Teste Editado', brand: 'Motorola' });

  const listed = await call(handler('get', '/'));
  assert.equal(listed.data.length, 68);
  assert.ok(listed.data.some(group => group.id === created.data.id && group.models[0] === 'Motorola Teste X'));

  const removed = await call(handler('delete', '/:id'), { params: { id: created.data.id } });
  assert.equal(removed.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) total FROM screen_protector_groups').get().total, 67);
  assert.equal(db.prepare('SELECT COUNT(*) total FROM screen_protector_models WHERE group_id = ?').get(created.data.id).total, 0);
});

test.after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
