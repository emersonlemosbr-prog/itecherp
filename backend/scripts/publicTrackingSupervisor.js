const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { getListenConfig } = require('../config/publicTracking');
const { rotatingLog } = require('./rotatingLog');

function checkHealth(url, timeout = 4000) {
  return new Promise(resolve => {
    const req = http.get(url, { agent: false }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; if (body.length > 8192) req.destroy(); });
      res.on('error', () => resolve(false));
      res.on('end', () => {
        try { const value = JSON.parse(body); resolve(res.statusCode === 200 && value.status === 'ok' && value.service === 'itech-public-tracking'); }
        catch { resolve(false); }
      });
    });
    req.setTimeout(timeout, () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

function supervise(options = {}) {
  const backend = path.resolve(__dirname, '..');
  const port = options.port || getListenConfig().port;
  const logs = options.logs || path.join(backend, 'logs');
  const output = rotatingLog(path.join(logs, 'public-server.log'));
  const errors = rotatingLog(path.join(logs, 'public-server-error.log'));
  const watchdog = rotatingLog(path.join(logs, 'watchdog.log'));
  const healthUrl = `http://127.0.0.1:${port}/health`;
  const intervalMs = options.intervalMs || 15000;
  const timeoutMs = options.timeoutMs || 4000;
  let child, interval, restartTimer;
  let stopping = false, checking = false, failures = 0, exits = 0, started = 0;
  const log = message => watchdog(`[SUPERVISOR ${process.pid}] port=${port} ${message}`);
  const lock = net.createServer(socket => socket.end());
  const lockAddress = process.platform === 'win32'
    ? `\\\\.\\pipe\\itech-public-supervisor-${port}`
    : path.join(require('node:os').tmpdir(), `itech-public-supervisor-${port}.sock`);

  function start() {
    if (stopping) return;
    failures = 0;
    started = Date.now();
    child = spawn(process.execPath, [options.script || path.join(backend, 'publicTrackingServer.js')], {
      cwd: backend, env: { ...process.env, PUBLIC_PORT: String(port), ...options.env },
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const current = child;
    log(`start child PID=${current.pid}`);
    current.stdout.on('data', data => output(`[NODE ${current.pid}] ${data}`));
    current.stderr.on('data', data => errors(`[NODE ${current.pid}] ${data}`));
    current.on('error', error => errors(`spawn PID=${current.pid}: ${error.stack || error}`));
    current.on('close', (code, signal) => {
      log(`exit child PID=${current.pid} code=${code} signal=${signal || 'none'}`);
      child = null;
      if (stopping) return lock.close();
      if (Date.now() - started > 60000) exits = 0;
      const delay = Math.min(30000, 1000 * 2 ** Math.min(exits++, 5));
      log(`restart public server in ${delay}ms`);
      restartTimer = setTimeout(start, delay);
    });
  }

  async function tick() {
    if (checking || stopping || !child || Date.now() - started < (options.graceMs ?? 20000)) return;
    checking = true;
    const current = child;
    try {
      const healthy = await checkHealth(healthUrl, timeoutMs);
      if (current !== child || stopping) return;
      if (healthy) {
        if (failures) log(`origin recovered PID=${current.pid}`);
        failures = 0;
      } else {
        log(`origin health failure ${++failures}/3 PID=${current.pid}`);
        if (failures >= 3) {
          log(`origin unhealthy; restarting ONLY owned public PID=${current.pid}`);
          current.kill();
        }
      }
    } finally { checking = false; }
  }

  function stop() {
    if (stopping) return;
    stopping = true;
    log(`stop requested; child PID=${child?.pid || 'none'}`);
    clearInterval(interval);
    clearTimeout(restartTimer);
    if (child) child.kill(); else lock.close();
  }
  lock.on('error', error => {
    errors(`supervisor lock failed: ${error.code}; no duplicate started`);
    process.exitCode = 1;
  });
  lock.listen(lockAddress, async () => {
    if (await checkHealth(healthUrl, timeoutMs)) {
      log('Existing healthy origin without this supervisor; refusing duplicate.');
      process.exitCode = 1;
      lock.close();
      return;
    }
    log('persistent supervisor started');
    start();
    interval = setInterval(() => tick().catch(error => {
      errors(`watchdog exception: ${error.stack || error}`);
      stop();
      process.exitCode = 1;
    }), intervalMs);
  });
  return { stop };
}

if (require.main === module) {
  const supervisor = supervise();
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, supervisor.stop);
}
module.exports = { checkHealth, supervise };
