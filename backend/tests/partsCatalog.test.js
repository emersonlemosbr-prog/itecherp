const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const Database=require('better-sqlite3');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'itech-parts-'));
process.env.ITECH_DB_PATH=path.join(dir,'test.db');
const db=require('../db/database');
const router=require('../routes/partsCatalog');
for(const id of [1,2]) db.prepare("INSERT INTO users(id,full_name,username,password_hash,role) VALUES(?,?,?,'x','admin')").run(id,'Admin '+id,'parts'+id);
function call(method,url,body={},id, user=1) {
 const layer=router.stack.find(s=>s.route?.path===url&&s.route.methods[method]);
 const out={status:200};
 layer.route.stack.at(-1).handle({body,params:{id},user:{id:user}},{status(n){out.status=n;return this},json(b){out.body=b}});
 return out;
}
const add=(kind,name)=>call('post','/options',{kind,name}).body.id;
let cat,brand,quality,part;
test('migration preserves every legacy column, creates backup and is idempotent',()=>{
 const file=path.join(dir,'legacy.db'); const legacy=new Database(file);
 legacy.exec("CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1); CREATE TABLE frontals_price_list(id INTEGER PRIMARY KEY,user_id INTEGER,brand TEXT,model TEXT,version TEXT,cost_price REAL,sale_price REAL,created_at TEXT); INSERT INTO frontals_price_list VALUES(37,1,'Samsung','A15','original',85.25,190.75,'2026-01-01');");
 const before=legacy.prepare('SELECT * FROM frontals_price_list').all();
 const migrate=require('../db/partsCatalogSchema'); migrate(legacy);migrate(legacy);
 for(const [key,value] of Object.entries(before[0])) assert.equal(legacy.prepare('SELECT * FROM frontals_price_list').get()[key],value);
 assert.equal(legacy.prepare('SELECT name FROM parts_options WHERE kind=\'category\'').get().name,'Frontais');
 const backups=fs.readdirSync(path.join(dir,'backups'));assert.ok(backups.length>=2);
 assert.equal(legacy.pragma('integrity_check',{simple:true}),'ok');legacy.close();
});
test('create and validate categories, brands and qualities',()=>{
 cat=add('category','Baterias');brand=add('brand','Samsung');quality=add('quality','Premium');
 assert.ok(cat&&brand&&quality);
 assert.equal(call('post','/options',{kind:'brand',name:' samsung '}).status,409);
 assert.equal(call('post','/options',{kind:'invalid',name:'X'}).status,400);
});
test('create part with optional version, frame and editable prices',()=>{
 const result=call('post','/entries',{category_id:cat,brand:'Samsung',model:'A15',quality_id:quality,cost_price:45,sale_price:65,description:'Bateria',part_code:'EB-A15'});
 assert.equal(result.status,201);part=result.body;assert.equal(part.price,65);assert.equal(part.version,'');
});
test('block deletion of every used dictionary kind',()=>{
 for(const id of [cat,brand,quality]) assert.equal(call('delete','/options/:id',{},id).status,409);
});
test('rename references without losing prices',()=>{
 assert.equal(call('put','/options/:id',{name:'Samsung Mobile'},brand).status,200);
 assert.equal(call('put','/options/:id',{name:'Baterias especiais'},cat).status,200);
 assert.equal(call('put','/options/:id',{name:'Original'},quality).status,200);
 part=call('get','/').body.entries[0];assert.equal(part.brand,'Samsung Mobile');assert.equal(part.quality,'Original');assert.equal(part.category,'Baterias especiais');assert.equal(part.price,65);
});
test('user isolation and foreign ownership validation',()=>{
 assert.equal(call('get','/',{},null,2).body.entries.length,0);
 assert.equal(call('put','/entries/:id',part,part.id,2).status,404);
 assert.equal(call('delete','/entries/:id',{},part.id,2).status,404);
 assert.equal(call('post','/entries',part,null,2).status,400);
 assert.equal(call('delete','/options/:id',{},cat,2).status,404);
});
test('edit part and reject invalid values',()=>{
 assert.equal(call('put','/entries/:id',{...part,sale_price:-1},part.id).status,400);
 assert.equal(call('put','/entries/:id',{...part,sale_price:NaN},part.id).status,400);
 const result=call('put','/entries/:id',{...part,sale_price:75,frame:'without',version:'V2'},part.id);assert.equal(result.body.price,75);assert.equal(result.body.frame,'without');
});
test('delete part and then delete unused categories brands qualities',()=>{
 assert.equal(call('delete','/entries/:id',{},part.id).status,200);
 for(const model of call('get','/').body.models) assert.equal(call('delete','/models/:id',{},model.id).status,200);
 for(const id of [cat,brand,quality])assert.equal(call('delete','/options/:id',{},id).status,200);
 assert.equal(call('get','/').body.entries.length,0);
});
after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true})});
