const fs=require('fs'),assert=require('assert/strict');
const D=require('../../backend/node_modules/better-sqlite3');
const root='C:/ProgramData/iTechERP';
const db=new D(root+'/backend/db/itech.db',{readonly:true});
const owner=db.prepare('SELECT id,role,full_name,session_version FROM users WHERE id=(SELECT user_id FROM frontals_price_list LIMIT 1)').get();
const before=db.prepare('SELECT * FROM frontals_price_list ORDER BY id').all();db.close();
const env=require('../../backend/node_modules/dotenv').parse(fs.readFileSync(root+'/backend/.env'));
const token=require('../../backend/node_modules/jsonwebtoken').sign({id:owner.id,session_version:owner.session_version},env.JWT_SECRET,{expiresIn:'30m'});
const call=async(method,route,body,status=200)=>{const r=await fetch('http://127.0.0.1:3001/api/calculators/parts'+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data};
(async()=>{
 const initial=await call('GET','');assert.equal(initial.entries.length,64);assert.ok(initial.models.length);
 const brand=initial.options.find(o=>o.kind==='brand'&&o.name==='Motorola')||initial.options.find(o=>o.kind==='brand');
 const brand2=initial.options.find(o=>o.kind==='brand'&&o.id!==brand.id);
 let model,part;
 try {
  model=await call('POST','/models',{brand_id:brand.id,name:'QA Model '+Date.now()},201);
  await call('POST','/models',{brand_id:brand.id,name:model.name.toLowerCase()},409);
  model=await call('PUT','/models/'+model.id,{brand_id:brand.id,name:model.name+' editado'});
  const body={...initial.entries[0],brand:brand.name,model:model.name,model_id:model.id,description:'QA temporário modelos'};
  part=await call('POST','/entries',body,201);
  const blocked=await call('DELETE','/models/'+model.id,null,409);assert.match(blocked.error,/1 peças/);
  await call('PUT','/models/'+model.id,{brand_id:brand2.id,name:model.name},409);
  await call('POST','/entries',{...body,brand:brand2.name},400);
  part=await call('PUT','/entries/'+part.id,{...body,sale_price:123.45});assert.equal(part.sale_price,123.45);
  model=await call('PUT','/models/'+model.id,{brand_id:brand.id,name:model.name+' renomeado'});
  let state=await call('GET','');assert.equal(state.entries.find(p=>p.id===part.id).model,model.name);
  assert.equal(state.entries.find(p=>p.id===part.id).sale_price,123.45);
  await call('DELETE','/entries/'+part.id);part=null;
  await call('DELETE','/models/'+model.id);model=null;
  const current=new D(root+'/backend/db/itech.db',{readonly:true});assert.deepEqual(current.prepare('SELECT * FROM frontals_price_list ORDER BY id').all(),before);
  assert.equal(current.pragma('integrity_check',{simple:true}),'ok');assert.equal(current.pragma('foreign_key_check').length,0);current.close();
  fs.writeFileSync('tmp/parts-deployment/models-api-results.json',JSON.stringify({passed:true,partsPreserved:before.length,models:initial.models.length,checks:['create','rename','duplicate case','brand relation','brand mismatch','delete used blocked','edit part','rename propagation','delete unused','integrity']},null,2));
  console.log('PASS: official API; all 64 original records unchanged');
 } finally {if(part)await call('DELETE','/entries/'+part.id);if(model)await call('DELETE','/models/'+model.id);}
})().catch(e=>{console.error(e);process.exitCode=1});
