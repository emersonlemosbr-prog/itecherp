const { chromium }=require('playwright');
const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const root=__dirname;
const results=[];
const screenshots=path.join(root,'screenshots');fs.mkdirSync(screenshots,{recursive:true});
const base='http://127.0.0.1:3306';
async function main(){
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
 for(const [width,height] of [[360,800],[390,844],[412,915],[430,932],[1440,1000]]){
  const mobile=width<768;
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'}:{})});
  const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.route('https://fonts.gstatic.com/**',route=>route.abort());
  await page.route('https://res.cloudinary.com/mobile-test/**',route=>route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(root,'photo.png'))}));
  await page.goto(base); await page.getByPlaceholder('seu usuário').fill('mobile-test');await page.locator('input[type=password]').fill('mobile-test-only');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL(base+'/');
  async function audit(name){
   await page.waitForTimeout(300);
   const info=await page.evaluate(()=>{
    const visible=e=>e.getClientRects().length>0;
    const dialog=document.querySelector('.app-modal');
    const panel=dialog?.querySelector(':scope > div');
    const r=panel?.getBoundingClientRect();
    return {width:window.innerWidth,scroll:document.documentElement.scrollWidth,fields:[...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]),select,textarea')].filter(visible).filter(e=>parseFloat(getComputedStyle(e).fontSize)<16).map(e=>e.outerHTML.slice(0,100)),dialog:r?{top:r.top,bottom:r.bottom,width:r.width,scroll:panel.scrollWidth,client:panel.clientWidth}:null,overflow:[...document.querySelectorAll('main *')].filter(visible).filter(e=>e.getBoundingClientRect().right>innerWidth+2&&!e.closest('.table-scroll')).map(e=>({tag:e.tagName,cls:e.className})).slice(0,8)};
   });
   results.push({width,height,name,...info});
   assert.ok(info.scroll<=width+2,`${width} ${name}: page overflow ${JSON.stringify(info)}`);
   if(mobile) assert.equal(info.fields.length,0,`${width} ${name}: small fonts ${JSON.stringify(info.fields)}`);
   if(info.dialog){assert.ok(info.dialog.top>=-1&&info.dialog.bottom<=height+1,`${name}: panel outside viewport ${JSON.stringify(info.dialog)}`);assert.ok(info.dialog.scroll<=info.dialog.client+2,`${name}: panel horizontal overflow`)}
  }
  await page.locator('main h2').first().waitFor();await audit('dashboard');await page.screenshot({path:path.join(screenshots,`${width}-dashboard.png`)});
  if(mobile){
   await page.getByRole('button',{name:'Abrir menu'}).click();await page.getByRole('button',{name:'Ferramentas'}).click();
   await page.locator('nav a').last().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(screenshots,`${width}-sidebar.png`)});
   await page.locator('nav a[href="/clientes"]').click();await page.waitForURL('**/clientes');await page.waitForTimeout(350);assert.equal(await page.locator('.mobile-sidebar').evaluate(e=>e.getBoundingClientRect().right<=0),true);
  }else await page.goto(base+'/clientes');
  await page.getByRole('button',{name:'Novo Cliente',exact:true}).click();await audit('new-customer');
  let dialog=page.getByRole('dialog');let fields=dialog.locator('input');await fields.nth(0).fill(`Mobile${width}`);await fields.nth(1).fill('Teste');await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
  await page.goto(base+'/ordens/nova');
  await page.getByPlaceholder('Digite o nome do cliente...').fill(`Mobile${width}`);await page.getByRole('button',{name:new RegExp(`Mobile${width} Teste`)}).first().click();
  await audit('new-order');
  await page.locator('input[type=file][capture]').setInputFiles(path.join(root,'photo.png'));
  await page.locator('img[src^="blob:"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(screenshots,`${width}-order-photo.png`)});await audit('order-photo');
  await page.getByRole('button',{name:'Salvar Ordem de Serviço',exact:true}).click();
  await page.getByRole('button',{name:'Enviando fotos...'}).waitFor();
  if(mobile) assert.equal(await page.getByRole('button',{name:'Fechar modal'}).isDisabled(),true);
  await page.waitForURL(mobile?'**/ordens':/\/ordens\/\d+$/);assert.equal(await page.getByRole('dialog').count(),0);
  if(!mobile) await page.goto(base+'/ordens');
  await page.getByRole('link',{name:'Editar OS SO-000107',exact:true}).waitFor();await audit('orders');
  const table=page.locator('.table-scroll').first();const scroll=await table.evaluate(e=>{e.scrollLeft=e.scrollWidth;return {left:e.scrollLeft,width:e.clientWidth,total:e.scrollWidth}});if(mobile) assert.ok(scroll.left>0,'OS table must scroll');await table.evaluate(e=>e.scrollLeft=0);
  if(mobile){const client=await context.newCDPSession(page);const box=await table.boundingBox();await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width-30,y:box.y+90}]});await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+40,y:box.y+90}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);assert.ok(await table.evaluate(e=>e.scrollLeft)>0,'touch pan');await table.evaluate(e=>e.scrollLeft=0)}
  await page.getByRole('link',{name:'Editar OS SO-000107',exact:true}).click();await page.waitForURL('**/ordens/107/editar');await audit('edit-order');
  await page.locator('textarea').first().fill('Editado no teste mobile');
  if(mobile){await page.setViewportSize({width,height:400});await page.locator('textarea').first().focus();await page.waitForTimeout(250);const rect=await page.locator('.app-modal > div').evaluate(e=>e.getBoundingClientRect().bottom);assert.ok(rect<=401,'reduced viewport keyboard');await page.setViewportSize({width,height})}
  await page.getByRole('button',{name:'Salvar Ordem de Serviço',exact:true}).click();await page.waitForURL(mobile?'**/ordens':/\/ordens\/107$/);
  await page.goto(base+'/fiados');await page.getByRole('button',{name:'Novo Fiado',exact:true}).click();await page.getByPlaceholder('Digite o nome do cliente...').fill(`Mobile${width}`);await page.getByRole('button',{name:new RegExp(`Mobile${width} Teste`)}).first().click();await page.getByRole('dialog').locator('input[type=number]').fill('12.50');await audit('credit');await page.getByRole('dialog').getByRole('button',{name:'Salvar',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
  await page.goto(base+'/anotacoes');await page.getByRole('button',{name:'Nova anotação',exact:true}).click();await page.getByPlaceholder('Título', {exact:true}).fill(`Nota ${width}`);await page.getByPlaceholder('Escreva sua anotação...').fill('Teste de rolagem e teclado');await audit('note');await page.getByRole('dialog').getByRole('button',{name:'Salvar',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
  await page.goto(base+'/estoque');await page.getByRole('button',{name:'Cadastrar Produto',exact:true}).click();await audit('inventory-product');await page.screenshot({path:path.join(screenshots,`${width}-stock-modal.png`)});await page.getByRole('dialog').getByRole('button',{name:'Fechar',exact:true}).click();
  for(const route of ['/estoque','/historico-financeiro','/vendas','/venda-aparelho','/garantias','/caixa','/usuarios','/pagbank-calculadora','/calculo-peca','/valor-frontais','/peliculas-compativeis','/removedor-virus']){await page.goto(base+route);await page.locator('main').waitFor();await audit(route)}
  assert.deepEqual(errors,[],`JS errors ${width}`);
  console.log(`PASS ${width}x${height}`);await context.close();
 }
 }finally{fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(results,null,2));await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
