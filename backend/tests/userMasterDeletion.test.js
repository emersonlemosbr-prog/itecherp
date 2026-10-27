const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itech-master-delete-'));
process.env.ITECH_DB_PATH = path.join(tempDir, 'test.db');
const db = require('../db/database');
db.exec("ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1; ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0; ALTER TABLE users ADD COLUMN job_title TEXT; ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '{}';");
const users = require('../routes/users');
const { requireRole } = require('../middleware/auth');

const deleteUser = users.stack.find(item => item.route?.path === '/:id' && item.route.methods.delete).route.stack.at(-1).handle;
function addUser(id, name, role='employee', master=0) {
  db.prepare('INSERT INTO users(id,full_name,username,password_hash,role,active,is_master) VALUES(?,?,?,?,?,1,?)').run(id,name,`user${id}`,'x',role,master);
}
async function remove(actorId, targetId) {
  const actor=db.prepare('SELECT * FROM users WHERE id=?').get(actorId);
  const out={statusCode:200};
  const res={status(n){out.statusCode=n;return this},json(body){out.body=body;return this}};
  await deleteUser({params:{id:String(targetId)},user:actor},res);
  return out;
}

addUser(1,'ADM Master','admin',1);
addUser(2,'Administrador comum','admin');
addUser(3,'Funcionário vinculado');
addUser(4,'Funcionário livre');
const customer=db.prepare("INSERT INTO customers(first_name,last_name) VALUES('Cliente','Histórico')").run().lastInsertRowid;
const order=db.prepare("INSERT INTO service_orders(order_number,customer_id,entry_date,created_by) VALUES('USR-MASTER-1',?,'2026-09-20',3)").run(customer).lastInsertRowid;

after(() => { db.close(); fs.rmSync(tempDir,{recursive:true,force:true}); });

test('administrador comum não força exclusão de usuário vinculado', async () => {
  const result=await remove(2,3);
  assert.equal(result.statusCode,403);
  assert.match(result.body.error,/Somente o ADM Master/);
  assert.ok(db.prepare('SELECT id FROM users WHERE id=3').get());
});

test('funcionário é recusado pelo middleware administrativo', () => {
  const out={statusCode:200};
  requireRole('admin')({user:{role:'employee'}},{status(n){out.statusCode=n;return this},json(body){out.body=body}},()=>assert.fail('não deveria autorizar'));
  assert.equal(out.statusCode,403);
});

test('ADM Master exclui usuário livre definitivamente', async () => {
  const result=await remove(1,4);
  assert.equal(result.statusCode,200);
  assert.equal(db.prepare('SELECT id FROM users WHERE id=4').get(),undefined);
});

test('ADM Master exclui usuário vinculado e preserva autoria histórica', async () => {
  const result=await remove(1,3);
  assert.equal(result.statusCode,200);
  assert.ok(result.body.preserved_references>0);
  const history=db.prepare('SELECT created_by,created_by_name_snapshot FROM service_orders WHERE id=?').get(order);
  assert.equal(history.created_by,null);
  assert.equal(history.created_by_name_snapshot,'Funcionário vinculado');
});

test('ADM Master exclui administrador comum', async () => {
  const result=await remove(1,2);
  assert.equal(result.statusCode,200);
  assert.equal(db.prepare('SELECT id FROM users WHERE id=2').get(),undefined);
});

test('ADM Master não pode excluir a própria conta nem o último master', async () => {
  const self=await remove(1,1);
  assert.equal(self.statusCode,400);
  assert.match(self.body.error,/própria conta/);
  assert.ok(db.prepare('SELECT id FROM users WHERE id=1').get());
});
