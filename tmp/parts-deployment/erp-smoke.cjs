const {chromium}=require('../mobile-tests/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const D=require('../../backend/node_modules/better-sqlite3');
const env=require('../../backend/node_modules/dotenv').parse(fs.readFileSync('C:/ProgramData/iTechERP/backend/.env'));
const database=new D('C:/ProgramData/iTechERP/backend/db/itech.db',{readonly:true});
const owner=database.prepare('SELECT u.id,u.role,u.full_name,u.session_version FROM users u WHERE u.id=(SELECT user_id FROM frontals_price_list LIMIT 1)').get();database.close();
const auth={user:owner,token:require('../../backend/node_modules/jsonwebtoken').sign({id:owner.id,session_version:owner.session_version},env.JWT_SECRET,{expiresIn:'15m'})};
fs.mkdirSync(path.join(__dirname,'screenshots'),{recursive:true});
const tags=[];
const request=async(method,route)=>{const r=await fetch('http://127.0.0.1:3001/api/calculators/parts'+route,{method,headers:{Authorization:'Bearer '+auth.token}});if(!r.ok)throw new Error('Official API '+method+' '+route+' returned '+r.status);return r.json()};



(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const results=[];
 try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(a=>{localStorage.setItem('itech_token',a.token);localStorage.setItem('itech_user',JSON.stringify(a.user))},auth);
 for(const route of ['/','/ordens','/clientes','/garantias','/fiados','/historico-financeiro','/caixa','/estoque','/vendas','/venda-aparelho','/configuracoes','/peliculas-compativeis','/anotacoes']) {
  const page=await context.newPage();const errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)failed.push({url:new URL(r.url()).pathname,status:r.status()})});
  const response=await page.goto('https://itech.internal'+route);
  await page.locator('main').waitFor();await page.waitForLoadState('networkidle',{timeout:12000}).catch(()=>{});
  assert.equal(response.status(),200);assert.ok(!page.url().includes('/login'));assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  const heading=await page.locator('main').innerText();assert.ok(heading.trim().length>10);
  results.push({route,status:200,consoleErrors:errors.length,apiErrors:failed.length,title:heading.trim().split('\n')[0]});await page.close();
 }
 }finally{await browser.close()}
 fs.writeFileSync(path.join(__dirname,'erp-smoke-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
