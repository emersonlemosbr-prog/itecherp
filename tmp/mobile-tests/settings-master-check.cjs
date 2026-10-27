const { chromium } = require('playwright');
const jwt = require('../../backend/node_modules/jsonwebtoken');
const Database = require('../../backend/node_modules/better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const root=path.resolve(__dirname,'../..');
const secret=fs.readFileSync(path.join(root,'backend/.env'),'utf8').match(/^JWT_SECRET=(.+)$/m)[1].trim();
const db=new Database(path.join(root,'backend/db/itech.db'),{readonly:true});
const user=db.prepare("SELECT * FROM users WHERE is_master=1 AND active=1").get();
db.close();
if(!user) throw new Error('ADM Master ativo não encontrado');
const token=jwt.sign({id:user.id,role:user.role,session_version:user.session_version},secret,{expiresIn:'10m'});
const widths=[320,375,390,430,1440];

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  for(const width of widths){
   const mobile=width<768;
   const context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile});
   const page=await context.newPage();
   await page.addInitScript(({token,user})=>{localStorage.setItem('itech_token',token);localStorage.setItem('itech_user',JSON.stringify(user))},{token,user:{id:user.id,full_name:user.full_name,username:user.username,role:user.role,active:true,is_master:true}});
   await page.goto('http://127.0.0.1:3001/configuracoes');
   await page.getByRole('tablist',{name:'Configurações'}).waitFor();
   const initial=await page.evaluate(()=>{const list=document.querySelector('[role=tablist]');const tabs=[...list.querySelectorAll('[role=tab]')].map(e=>e.getBoundingClientRect());return {doc:document.documentElement.scrollWidth,viewport:innerWidth,client:list.clientWidth,scroll:list.scrollWidth,overlaps:tabs.slice(1).some((r,i)=>r.left<tabs[i].right-0.5)}});
   if(initial.doc>width+1) throw new Error(`${width}: overflow global ${initial.doc}`);
   if(mobile&&initial.scroll<=initial.client) throw new Error(`${width}: abas não rolam horizontalmente`);
   if(initial.overlaps) throw new Error(`${width}: abas sobrepostas`);
   await page.getByRole('tab',{name:'Usuários e Acessos'}).click();
   await page.getByText('ADM MASTER',{exact:true}).waitFor();
   const selected=await page.getByRole('tab',{name:'Usuários e Acessos'}).evaluate(e=>({selected:e.getAttribute('aria-selected'),border:getComputedStyle(e).borderBottomColor,left:e.parentElement.scrollLeft}));
   if(selected.selected!=='true'||(mobile&&selected.left<=0)) throw new Error(`${width}: seleção/rolagem da aba falhou ${JSON.stringify(selected)}`);
   const adminCard=page.locator('article').filter({hasText:'@admin'});
   if(!await adminCard.getByText('Desativado',{exact:true}).isVisible()) throw new Error(`${width}: @admin não aparece desativado`);
   await page.screenshot({path:path.join(__dirname,'screenshots',`${width}-settings-users.png`),fullPage:true});
   console.log(`PASS ${width}px`,selected);
   await context.close();
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
