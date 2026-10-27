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
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const results=[];
 try {
  for(const width of [1440,768,390,320]) {
   const tag='DEPLOY-'+width+'-'+Date.now();tags.push(tag);
   const context=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600});
   await context.addInitScript(auth=>{localStorage.setItem('itech_token',auth.token);localStorage.setItem('itech_user',JSON.stringify(auth.user))},auth);
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('https://itech.internal/valor-frontais');
   await page.getByText('64 peça(s) encontrada(s)',{exact:true}).waitFor();
   assert.equal(await page.locator('article.parts-row').count(),64);
   await page.screenshot({path:path.join(__dirname,`screenshots/parts-${width}.png`),fullPage:false});
   const overflow=()=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   assert.equal(await overflow(),false,'page overflow '+tag);
   await page.getByRole('button',{name:'Adicionar peça',exact:true}).click();
   let dialog=page.getByRole('dialog');await dialog.getByRole('heading',{name:'Adicionar peça'}).waitFor();
   await dialog.getByLabel('Modelo',{exact:true}).fill('Galaxy A15 teste');
   await dialog.getByRole('button',{name:'Adicionar / gerenciar categorias'}).click();
   dialog=page.getByRole('dialog');await dialog.getByLabel('Adicionar cadastro',{exact:true}).fill('Baterias '+tag);
   await dialog.getByRole('button',{name:'Adicionar',exact:true}).click();
   await dialog.getByText('Baterias '+tag,{exact:true}).waitFor();
   await dialog.getByRole('button',{name:'Marcas',exact:true}).click();
   await dialog.getByLabel('Adicionar cadastro',{exact:true}).fill('Marca '+tag);await dialog.getByRole('button',{name:'Adicionar',exact:true}).click();await dialog.getByText('Marca '+tag,{exact:true}).waitFor();
   await dialog.getByRole('button',{name:'Qualidades',exact:true}).click();await dialog.getByLabel('Adicionar cadastro',{exact:true}).fill('Premium '+tag);await dialog.getByRole('button',{name:'Adicionar',exact:true}).click();await dialog.getByText('Premium '+tag,{exact:true}).waitFor();
   await dialog.getByRole('button',{name:'Concluir',exact:true}).click();
   dialog=page.getByRole('dialog');assert.equal(await dialog.getByLabel('Modelo',{exact:true}).inputValue(),'Galaxy A15 teste');
   await dialog.getByLabel('Categoria',{exact:true}).selectOption({label:'Baterias '+tag});
   await dialog.getByLabel('Marca',{exact:true}).selectOption({label:'Marca '+tag});await dialog.getByLabel('Qualidade',{exact:true}).selectOption({label:'Premium '+tag});
   await dialog.getByLabel('Nome / descrição da peça',{exact:true}).fill('Bateria de teste');
   await dialog.getByLabel('Código da peça (opcional)',{exact:true}).fill('EB-A15');
   await dialog.getByLabel('Custo da peça (R$)',{exact:true}).fill('45');await dialog.getByLabel('Valor de consulta / venda (R$)',{exact:true}).fill('65');
   await dialog.getByRole('button',{name:'Salvar peça',exact:true}).scrollIntoViewIfNeeded();
   const bounds=await dialog.locator('.parts-modal').evaluate(el=>({top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,width:el.scrollWidth,client:el.clientWidth}));
   assert.ok(bounds.top>=0&&bounds.bottom<=901,'modal bounds '+JSON.stringify(bounds));assert.ok(bounds.width<=bounds.client+1,'modal overflow');
   await page.screenshot({path:path.join(__dirname,`screenshots/parts-form-${width}.png`)});
   await dialog.getByRole('button',{name:'Salvar peça',exact:true}).click();await dialog.waitFor({state:'detached'});
   await page.getByRole('button',{name:new RegExp('Baterias '+tag)}).click();await page.getByRole('textbox',{name:'Pesquisar peça, marca ou modelo'}).fill('a15 premium');
   await page.getByText('1 peça(s) encontrada(s)',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Editar Galaxy A15 teste',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Valor de consulta / venda (R$)',{exact:true}).fill('75');await dialog.getByRole('button',{name:'Salvar peça',exact:true}).click();await dialog.waitFor({state:'detached'});
   await page.locator('article.parts-row').getByText('R$ 75,00',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Excluir Galaxy A15 teste',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Excluir peça',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
   await page.getByText('0 peça(s) encontrada(s)',{exact:true}).waitFor();
   if(true) {
    await page.getByRole('button',{name:'Gerenciar',exact:true}).click();
    const manager=page.getByRole('dialog');
    for(const [tab,name] of [['Categorias','Baterias '+tag],['Marcas','Marca '+tag],['Qualidades','Premium '+tag]]) {
      await manager.getByRole('button',{name:tab,exact:true}).click();
      await manager.getByRole('button',{name:'Renomear '+name,exact:true}).click();
      await manager.getByLabel('Renomear cadastro',{exact:true}).fill(name+' editado');
      await manager.getByRole('button',{name:'Salvar alteração',exact:true}).click();
      await manager.getByText(name+' editado',{exact:true}).waitFor();
      await manager.getByRole('button',{name:'Excluir '+name+' editado',exact:true}).click();
      await manager.getByRole('button',{name:'Confirmar exclusão',exact:true}).click();
      await manager.getByText(name+' editado',{exact:true}).waitFor({state:'detached'});
    }
    await manager.getByRole('button',{name:'Concluir',exact:true}).click();
   }
   assert.equal(await overflow(),false);assert.deepEqual(errors,[]);results.push({width,legacy:64,crud:true,search:true,modal:bounds});
   await context.close();
  }
  console.log(JSON.stringify(results,null,2));fs.writeFileSync(path.join(__dirname,'parts-results.json'),JSON.stringify(results,null,2));
 }finally{
   await browser.close();
   const state=await request('GET','/');
   const testOptions=state.options.filter(o=>tags.some(tag=>['Baterias '+tag,'Marca '+tag,'Premium '+tag,'Baterias '+tag+' editado','Marca '+tag+' editado','Premium '+tag+' editado'].includes(o.name)));
   const categoryIds=testOptions.filter(o=>o.kind==='category').map(o=>o.id);
   for(const part of state.entries.filter(p=>categoryIds.includes(p.category_id)&&p.model==='Galaxy A15 teste'))await request('DELETE','/entries/'+part.id);
   for(const o of testOptions)await request('DELETE','/options/'+o.id);
   const final=await request('GET','/');console.log('Official records after test cleanup: '+final.entries.length);
 }
})().catch(e=>{console.error(e);process.exitCode=1});
