const {chromium}=require('../mobile-tests/node_modules/playwright');
const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
const D=require('../../backend/node_modules/better-sqlite3');
const env=require('../../backend/node_modules/dotenv').parse(fs.readFileSync('C:/ProgramData/iTechERP/backend/.env'));
const db=new D('C:/ProgramData/iTechERP/backend/db/itech.db',{readonly:true});
const owner=db.prepare('SELECT id,role,full_name,session_version FROM users WHERE id=(SELECT user_id FROM frontals_price_list LIMIT 1)').get();
const rows=db.prepare('SELECT * FROM frontals_price_list WHERE user_id=? ORDER BY created_at DESC,id DESC').all(owner.id);
const token=require('../../backend/node_modules/jsonwebtoken').sign({id:owner.id,session_version:owner.session_version},env.JWT_SECRET,{expiresIn:'10m'});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const results=[];
 try {for(const width of [1440,768,390,320]) {
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600});
  await context.addInitScript(a=>{localStorage.setItem('itech_token',a.token);localStorage.setItem('itech_user',JSON.stringify(a.owner))},{token,owner});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)errors.push(r.status()+' '+new URL(r.url()).pathname)});
  await page.goto('https://itech.internal/valor-frontais');await page.locator('article.parts-row').first().waitFor();
  assert.equal(await page.locator('article.parts-row').count(),rows.length);
  assert.doesNotMatch(await page.locator('main').innerText(),/custo/i);
  assert.doesNotMatch(await page.locator('.parts-page').innerHTML(),/cost_price|custo:/i);
  const prices=await page.locator('.parts-price').allTextContents();
  const expected=rows.map(r=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(r.sale_price).replace(/\s/g,''));
  assert.deepEqual(prices.map(p=>p.replace(/\s/g,'')).sort(),expected.sort());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.screenshot({path:__dirname+'/screenshots/privacy-'+width+'.png'});
  await page.locator('article.parts-row').first().getByRole('button',{name:/Editar/}).click();
  assert.equal(Number(await page.getByRole('dialog').getByLabel('Custo da peça (R$)',{exact:true}).inputValue()),rows[0].cost_price);
  await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('button',{name:'Adicionar peça',exact:true}).click();await page.getByRole('dialog').getByLabel('Custo da peça (R$)',{exact:true}).waitFor();
  await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.deepEqual(errors,[]);results.push({width,records:rows.length,costHidden:true,finalPricesUnchanged:true,costAvailableInForms:true,errors:0});await context.close();
 }}finally{await browser.close()}
 const all=db.prepare('SELECT * FROM frontals_price_list ORDER BY id').all();const baseline=require('./privacy-baseline.json');assert.equal(crypto.createHash('sha256').update(JSON.stringify(all)).digest('hex'),baseline.hash);db.close();
 fs.writeFileSync(__dirname+'/privacy-results.json',JSON.stringify({url:'https://itech.internal/valor-frontais',databaseUnchanged:true,results},null,2));console.log(JSON.stringify({databaseUnchanged:true,results},null,2));
})().catch(e=>{console.error(e);db.close();process.exitCode=1});
