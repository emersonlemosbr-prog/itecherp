const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('better-sqlite3');
const migrate=require('../db/partsModelsSchema');
test('models migration preserves all part fields, deduplicates case and separates brands',()=>{
 const db=new D(':memory:');db.pragma('foreign_keys=ON');
 db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1);
 CREATE TABLE parts_options(id INTEGER PRIMARY KEY,user_id INTEGER,kind TEXT,name TEXT,name_key TEXT,UNIQUE(user_id,kind,name_key),UNIQUE(id,user_id));
 CREATE TABLE frontals_price_list(id INTEGER PRIMARY KEY,user_id INTEGER,brand TEXT,model TEXT,cost_price REAL,sale_price REAL);
 INSERT INTO frontals_price_list VALUES(1,1,'Apple','iPhone 7',50,100),(2,1,'Apple','iphone 7',70,140),(3,1,'Motorola','Moto G50',80,160);`);
 const before=db.prepare('SELECT * FROM frontals_price_list').all();migrate(db);migrate(db);
 assert.deepEqual(db.prepare('SELECT * FROM frontals_price_list').all(),before);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM parts_models').get().n,2);
 assert.equal(db.pragma('foreign_key_check').length,0);db.close();
});
