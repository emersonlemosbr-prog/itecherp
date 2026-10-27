const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const backend = path.resolve(__dirname, '..');
const logs = path.join(backend, 'logs');
const serverScript = path.join(backend, 'publicTrackingServer.js');
fs.mkdirSync(logs, { recursive: true });
const output = fs.createWriteStream(path.join(logs, 'public-server.log'), { flags: 'a' });
const errors = fs.createWriteStream(path.join(logs, 'public-server-error.log'), { flags: 'a' });
let child;
let stopping = false;
let failures = 0;

const stamp = () => new Date().toISOString();
const info = message => { const line = `${stamp()} [SUPERVISOR ${process.pid}] ${message}\n`; output.write(line); process.stdout.write(line); };
const report = message => { const line = `${stamp()} [SUPERVISOR ${process.pid}] ${message}\n`; errors.write(line); process.stderr.write(line); };

function start() {
  info(`Starting ${serverScript} on PUBLIC_PORT=${process.env.PUBLIC_PORT || 3002}`);
  child = spawn(process.execPath, [serverScript], { cwd: backend, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const pid = child.pid;
  info(`Child started PID=${pid}`);
  child.stdout.on('data', data => output.write(`${stamp()} [NODE ${pid}] ${data}`));
  child.stderr.on('data', data => errors.write(`${stamp()} [NODE ${pid}] ${data}`));
  child.on('error', cause => report(`Child process error: ${cause.stack || cause}`));
  child.on('exit', (code, signal) => {
    report(`Child exited PID=${pid} code=${code} signal=${signal || 'none'} stopping=${stopping}`);
    child = null;
    if (stopping) return finish();
    failures++;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(failures - 1, 5));
    report(`Unexpected exit; restarting only public tracking in ${delay}ms (failure ${failures})`);
    setTimeout(start, delay);
  });
  setTimeout(() => { if (child?.pid === pid) failures = 0; }, 60000).unref();
}

function finish() {
  info('Supervisor stopped cleanly.');
  output.end();
  errors.end();
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (stopping) return;
  stopping = true;
  info(`Received ${signal}; forwarding to child PID=${child?.pid || 'none'}`);
  if (child) child.kill(signal); else finish();
});

process.on('uncaughtException', cause => { report(`Supervisor uncaughtException: ${cause.stack || cause}`); process.exit(1); });
process.on('unhandledRejection', cause => { report(`Supervisor unhandledRejection: ${cause?.stack || cause}`); process.exit(1); });
info('Persistent public tracking supervisor initialized.');
start();
