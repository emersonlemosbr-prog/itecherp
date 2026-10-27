const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { checkHealth } = require('../scripts/publicTrackingSupervisor');
const { rotatingLog } = require('../scripts/rotatingLog');

async function until(check) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for supervisor recovery');
}

test('supervisor recovers a hung child, refuses duplicates and keeps isolated failures', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itech-supervisor-'));
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const flag = path.join(dir, 'hang');
  const fixture = path.join(dir, 'origin.cjs');
  const runner = path.join(dir, 'runner.cjs');
  fs.writeFileSync(fixture, `require('node:http').createServer((req,res)=>{
    if(require('node:fs').existsSync(${JSON.stringify(flag)})) return;
    res.end(JSON.stringify({status:'ok',service:'itech-public-tracking'}));
  }).listen(${port},'127.0.0.1');`);
  fs.writeFileSync(runner, `const s=require(${JSON.stringify(require.resolve('../scripts/publicTrackingSupervisor'))}).supervise(${JSON.stringify({ port, logs: dir, script: fixture, intervalMs: 200, timeoutMs: 100, graceMs: 500 })});
    process.on('message',()=>{s.stop();process.disconnect();});`);
  const processOptions = { silent: true, windowsHide: true };
  const worker = fork(runner, [], processOptions);
  const log = () => fs.existsSync(path.join(dir, 'watchdog.log')) ? fs.readFileSync(path.join(dir, 'watchdog.log'), 'utf8') : '';
  const pids = () => [...log().matchAll(/start child PID=(\d+)/g)].map(match => Number(match[1]));
  t.after(async () => {
    if (worker.connected) worker.send('stop');
    if (worker.exitCode === null) await once(worker, 'exit');
    for (const pid of pids()) { try { process.kill(pid); } catch {} }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const healthy = () => checkHealth(`http://127.0.0.1:${port}/health`, 200);
  await until(healthy);
  const duplicate = fork(runner, [], processOptions);
  // Disconnect IPC so the refused supervisor can terminate naturally.
  duplicate.disconnect();
  const [code] = await once(duplicate, 'exit');
  assert.equal(code, 1);
  assert.equal(pids().length, 1);
  fs.writeFileSync(flag, '');
  await until(() => log().includes('health failure 1/3'));
  fs.unlinkSync(flag);
  await until(() => log().includes('origin recovered'));
  assert.equal(pids().length, 1, 'isolated failure must not restart child');
  fs.writeFileSync(flag, '');
  await until(() => log().includes('restarting ONLY owned public'));
  fs.unlinkSync(flag);
  await until(() => pids().length === 2);
  await until(healthy);
  assert.notEqual(pids()[0], pids()[1]);
  process.kill(pids()[1]);
  await until(() => pids().length === 3);
  await until(healthy);
});

test('persistent logs rotate with a bounded number of backups', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itech-log-'));
  try {
    const write = rotatingLog(path.join(dir, 'server.log'), 120, 2);
    for (let i = 0; i < 20; i++) write('entry '.repeat(8));
    assert.deepEqual(fs.readdirSync(dir).sort(), ['server.log', 'server.log.1', 'server.log.2']);
    for (const file of fs.readdirSync(dir)) assert.ok(fs.statSync(path.join(dir, file)).size <= 120);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
