const Database = require('../backend/node_modules/better-sqlite3');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const db = new Database(path.join(__dirname, '../backend/db/itech.db'), { readonly: true });
const row = db.prepare('SELECT token FROM tracking_push ORDER BY rowid DESC LIMIT 1').get();
db.close();
if (!row?.token) throw new Error('Nenhuma OS com assinatura pública disponível para o teste prolongado.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const publicBase = 'https://acompanhar.itechcelulareinformatica.com.br';
const started = Date.now();
const duration = Number(process.env.CHECK_DURATION_MS || 180000);
const stats = { cycles: 0, local: 0, external: 0, pages: 0, sse: 0, failures: [], pids: new Set(), maxRss: 0 };

function listenerPid() {
  const text = execFileSync('powershell.exe', ['-NoProfile','-Command',
    "(Get-NetTCPConnection -State Listen -LocalPort 3002 | Select-Object -First 1).OwningProcess"], { encoding: 'utf8' }).trim();
  return Number(text);
}

async function checkedJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.json();
}

async function cycle() {
  stats.cycles++;
  const pid = listenerPid();
  stats.pids.add(pid);
  try {
    const local = await checkedJson('http://127.0.0.1:3002/health');
    if (local.service !== 'itech-public-tracking') throw new Error('local service incorreto');
    stats.local++;
    const external = await checkedJson(`${publicBase}/health`);
    if (external.service !== 'itech-public-tracking') throw new Error('external service incorreto');
    stats.external++;
    const page = await fetch(`${publicBase}/acompanhamento/${row.token}`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!page.ok || !(await page.text()).includes('Acompanhamento')) throw new Error(`pagina HTTP ${page.status}`);
    stats.pages++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const stream = await fetch(`${publicBase}/api/public/service-order/${row.token}/events`, { signal: controller.signal, cache: 'no-store' });
    if (!stream.ok || !String(stream.headers.get('content-type')).includes('text/event-stream')) throw new Error(`SSE HTTP ${stream.status}`);
    const first = await stream.body.getReader().read();
    clearTimeout(timeout);
    controller.abort();
    if (first.done || !new TextDecoder().decode(first.value).includes('event: order')) throw new Error('SSE sem evento inicial');
    stats.sse++;
    const usage = execFileSync('powershell.exe', ['-NoProfile','-Command',`(Get-Process -Id ${pid}).WorkingSet64`], { encoding: 'utf8' }).trim();
    stats.maxRss = Math.max(stats.maxRss, Number(usage));
    console.log(`${new Date().toISOString()} cycle=${stats.cycles} pid=${pid} local=200 external=200 page=200 sse=ok rssMB=${(Number(usage)/1048576).toFixed(1)}`);
  } catch (error) {
    stats.failures.push({ at: new Date().toISOString(), message: error.message, pid });
    console.error(`${new Date().toISOString()} FAILURE cycle=${stats.cycles} pid=${pid}: ${error.message}`);
  }
}

(async()=>{
  while (Date.now() - started < duration) { await cycle(); await sleep(5000); }
  console.log('SUMMARY', JSON.stringify({ ...stats, pids: [...stats.pids], maxRssMB: +(stats.maxRss/1048576).toFixed(1) }));
  if (stats.failures.length) process.exitCode=1;
})().catch(error=>{ console.error(error.stack || error); process.exitCode=1; });
