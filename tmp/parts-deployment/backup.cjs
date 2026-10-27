const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const D=require('../../backend/node_modules/better-sqlite3');
const root='C:/ProgramData/iTechERP';
const dir=path.join(root,'backups','parts-deploy-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(dir,{recursive:true});
const db=new D(root+'/backend/db/itech.db',{readonly:true});
const dest=path.join(dir,'itech-before-parts.db');
db.prepare('VACUUM INTO ?').run(dest);
const backup=new D(dest,{readonly:true});
assert.equal(backup.pragma('integrity_check',{simple:true}),'ok');
assert.deepEqual(backup.pragma('foreign_key_check'),[]);
const rows=backup.prepare('SELECT * FROM frontals_price_list ORDER BY id').all();
assert.deepEqual(db.prepare('SELECT * FROM frontals_price_list ORDER BY id').all(),rows);
const tables=backup.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r=>r.name);
const counts=Object.fromEntries(tables.map(t=>[t,backup.prepare('SELECT count(*) n FROM "'+t.replace(/"/g,'""')+'"').get().n]));
for(const file of ['backend/db/database.js','backend/routes/calculators.js','backend/public/index.html']) {
 const to=path.join(dir,'files',file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,file),to);
}
const manifest={created:new Date().toISOString(),root,database:db.name,backup:dest,backupBytes:fs.statSync(dest).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex'),integrity:'ok',foreignKeyErrors:0,recordsBefore:rows.length,counts};
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(__dirname,'backup-location.json'),JSON.stringify({dir,...manifest},null,2));
backup.close();db.close();console.log(JSON.stringify(manifest,null,2));
