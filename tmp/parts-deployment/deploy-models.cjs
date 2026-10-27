const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const D=require('../../backend/node_modules/better-sqlite3');
const root='C:/ProgramData/iTechERP';
const dir=path.join(root,'backups','models-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(dir,{recursive:true});
const db=new D(root+'/backend/db/itech.db');
const before=db.prepare('SELECT * FROM frontals_price_list ORDER BY id').all();
db.prepare('VACUUM INTO ?').run(path.join(dir,'before-models.db'));
const backup=new D(path.join(dir,'before-models.db'),{readonly:true});assert.equal(backup.pragma('integrity_check',{simple:true}),'ok');backup.close();
fs.writeFileSync(path.join(dir,'parts-before.json'),JSON.stringify(before,null,2));
for(const rel of ['backend/db/database.js','backend/routes/partsCatalog.js','backend/public/index.html']) {const target=path.join(dir,rel);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,rel),target);}
require('../../backend/db/partsModelsSchema')(db);
assert.deepEqual(db.prepare('SELECT * FROM frontals_price_list ORDER BY id').all(),before);
assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.equal(db.pragma('foreign_key_check').length,0);
const models=db.prepare('SELECT COUNT(*) n FROM parts_models').get().n;db.close();
for(const rel of ['backend/db/partsModelsSchema.js','backend/routes/partsCatalog.js']) fs.copyFileSync(path.resolve(rel),path.join(root,rel));
const databaseFile=path.join(root,'backend/db/database.js');let code=fs.readFileSync(databaseFile,'utf8');
if(!code.includes("require('./partsModelsSchema')(db)")) {code=code.replace("require('./partsCatalogSchema')(db);","require('./partsCatalogSchema')(db);\nrequire('./partsModelsSchema')(db);");assert.ok(code.includes("require('./partsModelsSchema')(db)"));fs.writeFileSync(databaseFile,code);}
fs.cpSync('frontend/dist/assets',root+'/backend/public/assets',{recursive:true});
fs.writeFileSync('tmp/parts-deployment/models-deploy.json',JSON.stringify({backup:dir,parts:before.length,models,preserved:true},null,2));
console.log(JSON.stringify({backup:dir,parts:before.length,models,preserved:true}));
