const { chromium } = require('playwright');
const express = require('../../backend/node_modules/express');
const path = require('path');
const assert = require('node:assert/strict');
const app = express();
app.use(express.static(path.resolve(__dirname, '../../frontend/dist')));
app.get('*', (_, res) => res.sendFile(path.resolve(__dirname, '../../frontend/dist/index.html')));
const server = app.listen(3319, '127.0.0.1');
(async () => {
 const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
  for (const width of [360, 390, 1440]) {
   const context = await browser.newContext({viewport:{width,height:900}});
   await context.addInitScript(() => {
    localStorage.setItem('itech_user', JSON.stringify({id:1,full_name:'Teste',role:'admin'}));
    localStorage.setItem('itech_token', 'test');
    window.canvasLabels=[];
    const original=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.canvasLabels.push(String(text));return original.call(this,text,...args)};
   });
   const page = await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/**', route => {
    const url=route.request().url(); let data=[];
    if(url.includes('/dashboard/stats')) data={total_revenue:12345.67,total_profit:2345.67,sales_profit:1345.67,sales_day_revenue:345.67,sales_month_revenue:4567.89,pending_revenue:567.89,credit_accounts_open:678.90,sales_avg_ticket:789.01,repairs_in_progress:17,repairs_ready:18,repairs_completed:19,repairs_not_performed:20,sales_count:21,products_sold:22};
    if(url.includes('daily-revenue')) data=[{day:'2026-09-09',revenue:12345.67}];
    if(url.includes('monthly-revenue')) data=[{month:'09/2026',revenue:12345.67,profit:2345.67}];
    if(url.includes('status-distribution')) data=[{status:'delivered',count:19}];
    if(url.endsWith('/service-orders')) data=[{id:1,order_number:'OS-001',first_name:'Teste',service_price:891.23,status:'delivered',payment_status:'paid',entry_date:'2026-09-09'}];
    return route.fulfill({json:data});
   });
   await page.goto('http://127.0.0.1:3319');
   await page.getByRole('button',{name:'Ocultar valores',exact:true}).waitFor();
   assert.match(await page.locator('main').innerText(),/12\.345,67/);
   const counts=await page.locator('.dashboard-compact-card strong').allTextContents();
   await page.getByRole('button',{name:'Ocultar valores',exact:true}).click();
   await page.waitForTimeout(600);
   assert.equal((await page.locator('main').innerText()).match(/R\$\s*[\d]/g),null);
   assert.equal(await page.locator('main').getByText('R$ ••••••',{exact:true}).count(),7);
   assert.deepEqual((await page.locator('.dashboard-compact-card strong').allTextContents()).slice(0,6),counts.slice(0,6));
   assert.equal(await page.evaluate(()=>localStorage.getItem('dashboardValuesVisible')),'false');
   await page.reload();
   await page.getByRole('button',{name:'Mostrar valores',exact:true}).waitFor();
   await page.waitForTimeout(600);
   assert.ok(await page.evaluate(()=>window.canvasLabels.includes('R$ ••••••')));
   assert.equal((await page.locator('main').innerText()).match(/R\$\s*[\d]/g),null);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.getByRole('button',{name:'Mostrar valores',exact:true}).click();
   assert.match(await page.locator('main').innerText(),/12\.345,67/);
   assert.equal(await page.evaluate(()=>localStorage.getItem('dashboardValuesVisible')),'true');
   assert.deepEqual(errors,[]);
   console.log(`PASS ${width}px: monetary masking, quantities, charts, persistence, restoration, overflow`);
   await context.close();
  }
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
