const fs = require('fs');
const path = require('path');
const db = new (require('../backend/node_modules/better-sqlite3'))(path.join(__dirname,'../backend/db/itech.db'), {readonly:true});
const env = require('../backend/node_modules/dotenv').parse(fs.readFileSync(path.join(__dirname,'../backend/.env')));
const user=db.prepare("SELECT id,session_version FROM users WHERE active=1 AND role='admin' LIMIT 1").get();
const token=require('../backend/node_modules/jsonwebtoken').sign(user,env.JWT_SECRET,{expiresIn:'2m'});
(async()=>{
 const response=await fetch('http://127.0.0.1:3001/api/cash-withdrawals',{headers:{Authorization:`Bearer ${token}`}});
 if(!response.ok)throw new Error(`HTTP ${response.status}`);
 const rows=await response.json();
 const repaired=rows.filter(w=>w.id>=22 && w.id<=117);
 if(repaired.length!==96 || repaired.some(w=>!w.service_order_id || !w.order_number))throw new Error('Missing repaired links');
 console.log(JSON.stringify({http:response.status,repaired_visible:repaired.length,linked_to_orders:true}));
 db.close();
})().catch(e=>{console.error(e.message);process.exitCode=1});
