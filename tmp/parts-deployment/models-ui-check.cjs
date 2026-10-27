const {chromium}=require('../mobile-tests/node_modules/playwright');
const fs=require('fs'),assert=require('assert/strict');
const D=require('../../backend/node_modules/better-sqlite3');
const root='C:/ProgramData/iTechERP';const db=new D(root+'/backend/db/itech.db',{readonly:true});
const owner=db.prepare('SELECT id,role,full_name,session_version FROM users WHERE id=(SELECT user_id FROM frontals_price_list LIMIT 1)').get();const baseline=db.prepare('SELECT * FROM frontals_price_list ORDER BY id').all();db.close();
const env=require('../../backend/node_modules/dotenv').parse(fs.readFileSync(root+'/backend/.env'));
const auth={user:owner,token:require('../../backend/node_modules/jsonwebtoken').sign({id:owner.id,session_version:owner.session_version},env.JWT_SECRET,{expiresIn:'30m'})};
const api=async(method,route,body)=>{const r=await fetch('http://127.0.0.1:3001/api/calculators/parts'+route,{method,headers:{Authorization:'Bearer '+auth.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data};
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const results=[];const tag='QA-MODELS-'+Date.now();
 try {
  for(const width of [1440,390,320]) {
   const context=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600});
   await context.addInitScript(a=>{localStorage.setItem('itech_token',a.token);localStorage.setItem('itech_user',JSON.stringify(a.user))},auth);
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('https://itech.internal/valor-frontais');await page.getByText('64 peça(s) encontrada(s)',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Adicionar peça',exact:true}).click();let dialog=page.getByRole('dialog');
   await dialog.getByLabel('Marca',{exact:true}).selectOption({label:'Motorola'});
   await dialog.getByRole('button',{name:'Adicionar / gerenciar modelos',exact:true}).click();dialog=page.getByRole('dialog');
   const brand=await dialog.getByLabel('Marca do modelo').inputValue();assert.ok(brand);
   const name=tag+'-'+width+' G55';
   await dialog.getByLabel('Nome do modelo',{exact:true}).fill(name);await dialog.getByRole('button',{name:'Adicionar',exact:true}).click();await dialog.getByText(name,{exact:true}).waitFor();
   await dialog.getByRole('button',{name:'Editar '+name,exact:true}).click();await dialog.getByLabel('Nome do modelo',{exact:true}).fill(name+' editado');await dialog.getByRole('button',{name:'Salvar alteração',exact:true}).click();await dialog.getByText(name+' editado',{exact:true}).waitFor();
   await page.screenshot({path:__dirname+'/screenshots/models-manager-'+width+'.png'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await dialog.getByRole('button',{name:'Concluir',exact:true}).click();dialog=page.getByRole('dialog');
   await dialog.getByRole('combobox',{name:'Modelo',exact:true}).fill('g5');await dialog.getByRole('option',{name:name+' editado',exact:true}).waitFor();
   const catalog=await api('GET','');const visible=await dialog.getByRole('listbox').getByRole('option').allTextContents();assert.ok(visible.every(n=>catalog.models.some(m=>m.brand==='Motorola'&&m.name===n)));
   await page.screenshot({path:__dirname+'/screenshots/models-autocomplete-'+width+'.png'});
   await dialog.getByRole('option',{name:name+' editado',exact:true}).click();
   await dialog.getByLabel('Marca',{exact:true}).selectOption({label:'Apple'});assert.equal(await dialog.getByRole('combobox',{name:'Modelo',exact:true}).inputValue(),'');
   await dialog.getByRole('combobox',{name:'Modelo',exact:true}).fill('g5');assert.equal(await dialog.getByRole('option',{name:name+' editado',exact:true}).count(),0);
   await dialog.getByLabel('Marca',{exact:true}).selectOption({label:'Motorola'});await dialog.getByRole('combobox',{name:'Modelo',exact:true}).fill(name);await dialog.getByRole('option',{name:name+' editado',exact:true}).click();
   await dialog.getByLabel('Custo da peça (R$)',{exact:true}).fill('45');await dialog.getByLabel('Valor de consulta / venda (R$)',{exact:true}).fill('90');await dialog.getByRole('button',{name:'Salvar peça',exact:true}).click();await dialog.waitFor({state:'detached'});
   await page.getByRole('button',{name:'Editar '+name+' editado',exact:true}).click();dialog=page.getByRole('dialog');
   await dialog.getByRole('button',{name:'Adicionar / gerenciar modelos',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Excluir '+name+' editado',exact:true}).click();await dialog.getByRole('button',{name:'Confirmar exclusão',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'Este modelo está sendo utilizado por 1 peças.'}).waitFor();
   await dialog.getByRole('button',{name:'Concluir',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Valor de consulta / venda (R$)',{exact:true}).fill('95');await dialog.getByRole('button',{name:'Salvar peça',exact:true}).click();await dialog.waitFor({state:'detached'});
   await page.getByRole('button',{name:'Excluir '+name+' editado',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Excluir peça',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
   await page.getByRole('button',{name:'Adicionar peça',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Marca',{exact:true}).selectOption({label:'Motorola'});await dialog.getByRole('button',{name:'Adicionar / gerenciar modelos',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Excluir '+name+' editado',exact:true}).click();await dialog.getByRole('button',{name:'Confirmar exclusão',exact:true}).click();await dialog.getByText(name+' editado',{exact:true}).waitFor({state:'detached'});
   assert.deepEqual(errors,[]);results.push({width,passed:true,checks:['create model','edit model','brand filter','g5 search','brand reset','create part','edit part','manage from edit','delete blocked','delete unused','no overflow','no JS errors']});await context.close();
  }
 } finally {
  const state=await api('GET','');for(const p of state.entries.filter(p=>p.model.startsWith(tag)))await api('DELETE','/entries/'+p.id);for(const m of state.models.filter(m=>m.name.startsWith(tag)))await api('DELETE','/models/'+m.id);await browser.close();
  const current=new D(root+'/backend/db/itech.db',{readonly:true});assert.deepEqual(current.prepare('SELECT * FROM frontals_price_list ORDER BY id').all(),baseline);current.close();
  fs.writeFileSync(__dirname+'/models-ui-results.json',JSON.stringify({results,originalRecordsPreserved:baseline.length},null,2));
 }
 console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1});

