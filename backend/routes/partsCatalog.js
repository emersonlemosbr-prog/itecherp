const express = require('express');
const db = require('../db/database');
const { importModels } = require('../db/partsModelsSchema');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate, requireRole('admin'));
const key = value => value.trim().toLocaleLowerCase('pt-BR');
const fail = (message, status=400) => { const e=new Error(message); e.status=status; throw e; };
const wrap = fn => (req,res) => { try { fn(req,res); } catch(e) { res.status(e.status || 500).json({error:e.status ? e.message : 'Não foi possível concluir a operação.'}); } };
const option = (id,user,kind) => db.prepare('SELECT * FROM parts_options WHERE id=? AND user_id=? AND kind=?').get(id,user,kind);
const entries = user => db.prepare(`SELECT p.*, p.sale_price AS price, c.name AS category, c.show_assembly,
 q.name AS quality FROM frontals_price_list p LEFT JOIN parts_options c ON c.id=p.category_id
 LEFT JOIN parts_options q ON q.id=p.quality_id WHERE p.user_id=? ORDER BY p.created_at DESC,p.id DESC`).all(user);
const models = user => db.prepare(`SELECT m.*,b.name AS brand FROM parts_models m
  JOIN parts_options b ON b.id=m.brand_id WHERE m.user_id=? ORDER BY b.name,m.name`).all(user);
const modelById = (id,user) => db.prepare(`SELECT m.*,b.name AS brand,b.name_key AS brand_key
  FROM parts_models m JOIN parts_options b ON b.id=m.brand_id WHERE m.id=? AND m.user_id=?`).get(id,user);
const modelUsage = model => db.prepare('SELECT id,brand,model FROM frontals_price_list WHERE user_id=?').all(model.user_id)
  .filter(p => key(p.brand)===model.brand_key && key(p.model)===model.name_key);
function modelPayload(body,user) {
  const brand=option(body.brand_id,user,'brand');
  if(!brand) fail('Selecione uma marca válida.');
  if(typeof body.name!=='string' || !body.name.trim() || body.name.trim().length>1000) fail('Informe um modelo de até 1000 caracteres.');
  return {brand,name:body.name.trim(),name_key:key(body.name)};
}
router.post('/models',wrap((req,res)=>{
  const value=modelPayload(req.body,req.user.id);
  if(db.prepare('SELECT id FROM parts_models WHERE user_id=? AND brand_id=? AND name_key=?').get(req.user.id,value.brand.id,value.name_key)) fail('Este modelo já está cadastrado para esta marca.',409);
  const result=db.prepare('INSERT INTO parts_models(user_id,brand_id,name,name_key) VALUES(?,?,?,?)').run(req.user.id,value.brand.id,value.name,value.name_key);
  res.status(201).json(modelById(Number(result.lastInsertRowid),req.user.id));
}));
router.put('/models/:id',wrap((req,res)=>{
  db.transaction(()=>{
    const old=modelById(req.params.id,req.user.id);
    if(!old) fail('Modelo não encontrado.',404);
    const value=modelPayload(req.body,req.user.id);
    if(db.prepare('SELECT id FROM parts_models WHERE user_id=? AND brand_id=? AND name_key=? AND id<>?').get(req.user.id,value.brand.id,value.name_key,old.id)) fail('Este modelo já está cadastrado para esta marca.',409);
    const used=modelUsage(old);
    if(used.length && old.brand_id!==value.brand.id) fail(`Este modelo está sendo utilizado por ${used.length} peças. Altere os vínculos antes de mudar a marca.`,409);
    db.prepare('UPDATE parts_models SET brand_id=?,name=?,name_key=? WHERE id=?').run(value.brand.id,value.name,value.name_key,old.id);
    // An explicit rename propagates the name only; prices and every other field stay intact.
    for(const row of used) db.prepare('UPDATE frontals_price_list SET model=? WHERE id=?').run(value.name,row.id);
  })();
  res.json(modelById(req.params.id,req.user.id));
}));
router.delete('/models/:id',wrap((req,res)=>{
  db.transaction(()=>{
    const old=modelById(req.params.id,req.user.id);
    if(!old) fail('Modelo não encontrado.',404);
    const used=modelUsage(old).length;
    if(used) fail(`Este modelo está sendo utilizado por ${used} peças. Altere os vínculos antes de excluir.`,409);
    db.prepare('DELETE FROM parts_models WHERE id=? AND user_id=?').run(old.id,req.user.id);
  })();
  res.json({success:true});
}));
router.get('/',wrap((req,res) => {
  // Older clients can still save through /frontals/entries. Classify those additions too.
  db.transaction(() => {
    const user=req.user.id;
    if(db.prepare('SELECT id FROM frontals_price_list WHERE user_id=? AND category_id IS NULL').get(user)) {
      db.prepare("INSERT OR IGNORE INTO parts_options(user_id,kind,name,name_key,show_assembly) VALUES(?,'category','Frontais','frontais',1)").run(user);
      const category=db.prepare("SELECT id FROM parts_options WHERE user_id=? AND kind='category' AND name_key='frontais'").get(user);
      db.prepare('UPDATE frontals_price_list SET category_id=? WHERE user_id=? AND category_id IS NULL').run(category.id,user);
    }
    for(const row of db.prepare('SELECT DISTINCT brand FROM frontals_price_list WHERE user_id=?').all(user)) {
      db.prepare("INSERT OR IGNORE INTO parts_options(user_id,kind,name,name_key) VALUES(?,'brand',?,?)").run(user,row.brand,key(row.brand));
    }
  })();
  db.transaction(() => importModels(db, req.user.id))();
  res.json({entries:entries(req.user.id), options:db.prepare('SELECT * FROM parts_options WHERE user_id=? ORDER BY name COLLATE NOCASE').all(req.user.id), models:models(req.user.id)});
}));
function validateOption(body) {
  if (!['category','brand','quality'].includes(body.kind)) fail('Tipo de cadastro inválido.');
  if (typeof body.name!=='string' || !body.name.trim() || body.name.trim().length>100) fail('Informe um nome de até 100 caracteres.');
}
router.post('/options',wrap((req,res) => {
  validateOption(req.body);
  const {kind,name,show_assembly}=req.body;
  if(db.prepare('SELECT id FROM parts_options WHERE user_id=? AND kind=? AND name_key=?').get(req.user.id,kind,key(name))) fail('Este nome já está cadastrado.',409);
  const result=db.prepare('INSERT INTO parts_options(user_id,kind,name,name_key,show_assembly) VALUES(?,?,?,?,?)').run(req.user.id,kind,name.trim(),key(name),kind==='category'&&show_assembly?1:0);
  res.status(201).json({id:Number(result.lastInsertRowid)});
}));
router.put('/options/:id',wrap((req,res) => {
  const old=db.prepare('SELECT * FROM parts_options WHERE id=? AND user_id=?').get(req.params.id,req.user.id);
  if(!old) fail('Cadastro não encontrado.',404);
  validateOption({...req.body,kind:old.kind});
  const name=req.body.name.trim();
  if(db.prepare('SELECT id FROM parts_options WHERE user_id=? AND kind=? AND name_key=? AND id<>?').get(req.user.id,old.kind,key(name),old.id)) fail('Este nome já está cadastrado.',409);
  db.transaction(()=>{
    db.prepare('UPDATE parts_options SET name=?,name_key=?,show_assembly=? WHERE id=?').run(name,key(name),old.kind==='category'&&req.body.show_assembly?1:0,old.id);
    if(old.kind==='brand') {
      for(const row of db.prepare('SELECT id,brand FROM frontals_price_list WHERE user_id=?').all(req.user.id)) {
        if(key(row.brand)===old.name_key) db.prepare('UPDATE frontals_price_list SET brand=? WHERE id=?').run(name,row.id);
      }
    }
  })();
  res.json({success:true});
}));
router.delete('/options/:id',wrap((req,res)=>{
  const old=db.prepare('SELECT * FROM parts_options WHERE id=? AND user_id=?').get(req.params.id,req.user.id);
  if(!old) fail('Cadastro não encontrado.',404);
  const used=entries(req.user.id).some(p=>old.kind==='category'?p.category_id===old.id:old.kind==='quality'?p.quality_id===old.id:key(p.brand)===old.name_key);
  if(used) fail('Este cadastro está sendo usado por uma peça. Altere as peças antes de excluir.',409);
  if(old.kind==='brand' && db.prepare('SELECT id FROM parts_models WHERE brand_id=? AND user_id=?').get(old.id,req.user.id)) fail('Esta marca possui modelos cadastrados. Altere ou exclua os modelos antes de excluir a marca.',409);
  db.prepare('DELETE FROM parts_options WHERE id=?').run(old.id);
  res.json({success:true});
}));
function payload(body,user) {
  if(!option(body.category_id,user,'category')) fail('Selecione uma categoria válida.');
  if(body.quality_id && !option(body.quality_id,user,'quality')) fail('Selecione uma qualidade válida.');
  if(typeof body.brand!=='string' || !db.prepare("SELECT id FROM parts_options WHERE user_id=? AND kind='brand' AND name_key=?").get(user,key(body.brand))) fail('Selecione uma marca cadastrada.');
  if(typeof body.model!=='string' || !body.model.trim()) fail('Informe o modelo.');
  // Old clients send only text. New clients also send the selected catalog ID.
  if(body.model_id != null) {
    const model=db.prepare(`SELECT m.*,b.name_key AS brand_key FROM parts_models m JOIN parts_options b ON b.id=m.brand_id WHERE m.id=? AND m.user_id=?`).get(body.model_id,user);
    if(!model || model.brand_key!==key(body.brand) || model.name_key!==key(body.model)) fail('Selecione um modelo cadastrado para a marca escolhida.');
  }
  for(const field of ['cost_price','sale_price']) if(typeof body[field]!=='number'||!Number.isFinite(body[field])||body[field]<0) fail('Informe valores válidos, iguais ou maiores que zero.');
  if(!['','with','without'].includes(body.frame || '')) fail('Opção de aro inválida.');
  const result={category_id:Number(body.category_id),quality_id:body.quality_id?Number(body.quality_id):null,cost_price:body.cost_price,sale_price:body.sale_price};
  for(const field of ['brand','model','version','description','part_code','assembly_type','frame']) {
    if(body[field]!=null && typeof body[field]!=='string') fail('Campo de texto inválido.');
    result[field]=(body[field]||'').trim();
    if(result[field].length>1000) fail('Limite de 1000 caracteres por campo.');
  }
  return result;
}
router.post('/entries',wrap((req,res)=>{
  const data=payload(req.body,req.user.id);
  const cols=Object.keys(data);
  const result=db.prepare(`INSERT INTO frontals_price_list(user_id,${cols.join(',')}) VALUES(?,${cols.map(()=>'?').join(',')})`).run(req.user.id,...Object.values(data));
  res.status(201).json(entries(req.user.id).find(p=>p.id===Number(result.lastInsertRowid)));
}));
router.put('/entries/:id',wrap((req,res)=>{
  if(!db.prepare('SELECT id FROM frontals_price_list WHERE id=? AND user_id=?').get(req.params.id,req.user.id)) fail('Peça não encontrada.',404);
  const data=payload(req.body,req.user.id);
  db.prepare(`UPDATE frontals_price_list SET ${Object.keys(data).map(c=>`${c}=?`).join(',')} WHERE id=? AND user_id=?`).run(...Object.values(data),req.params.id,req.user.id);
  res.json(entries(req.user.id).find(p=>p.id===Number(req.params.id)));
}));
router.delete('/entries/:id',wrap((req,res)=>{
  const result=db.prepare('DELETE FROM frontals_price_list WHERE id=? AND user_id=?').run(req.params.id,req.user.id);
  if(!result.changes) fail('Peça não encontrada.',404);
  res.json({success:true});
}));
module.exports=router;
