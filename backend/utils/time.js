const dgram = require('dgram');

const NTP_HOST = process.env.NTP_HOST || 'pool.ntp.br';
const NTP_PORT = Number(process.env.NTP_PORT || 123);
const NTP_TIMEOUT_MS = Number(process.env.NTP_TIMEOUT_MS || 1800);
const NTP_SYNC_INTERVAL_MS = Number(process.env.NTP_SYNC_INTERVAL_MS || 10 * 60 * 1000);

const NTP_TO_UNIX_EPOCH_SECONDS = 2208988800;

let offsetMs = 0;
let hasSync = false;
let lastSyncAt = 0;
let inFlightSync = null;

function toSqliteDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function queryNtpTime() {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const packet = Buffer.alloc(48);
    packet[0] = 0x1b;

    let closed = false;
    const safeClose = () => { if (!closed) { closed = true; try { socket.close(); } catch (_) {} } };
    const timeout = setTimeout(() => {
      safeClose();
      reject(new Error(`NTP timeout (${NTP_TIMEOUT_MS}ms) para ${NTP_HOST}`));
    }, NTP_TIMEOUT_MS);

    socket.once('error', (err) => {
      clearTimeout(timeout);
      safeClose();
      reject(err);
    });

    socket.once('message', (msg) => {
      clearTimeout(timeout);
      safeClose();

      if (!msg || msg.length < 48) {
        reject(new Error('Resposta NTP inválida.'));
        return;
      }

      const seconds = msg.readUInt32BE(40) - NTP_TO_UNIX_EPOCH_SECONDS;
      const fraction = msg.readUInt32BE(44);
      const millis = seconds * 1000 + Math.round((fraction * 1000) / 0x100000000);
      resolve(new Date(millis));
    });

    socket.send(packet, 0, packet.length, NTP_PORT, NTP_HOST, (err) => {
      if (err) {
        clearTimeout(timeout);
        safeClose();
        reject(err);
      }
    });
  });
}

async function syncNtpOffset(force = false) {
  const now = Date.now();
  const isFresh = hasSync && now - lastSyncAt < NTP_SYNC_INTERVAL_MS;
  if (!force && isFresh) return;

  if (inFlightSync) {
    await inFlightSync;
    return;
  }

  inFlightSync = (async () => {
    const localBefore = Date.now();
    const ntpDate = await queryNtpTime();
    const localAfter = Date.now();
    const midpoint = Math.round((localBefore + localAfter) / 2);

    offsetMs = ntpDate.getTime() - midpoint;
    hasSync = true;
    lastSyncAt = Date.now();
  })();

  try {
    await inFlightSync;
  } finally {
    inFlightSync = null;
  }
}

async function getTrustedDate() {
  try {
    await syncNtpOffset();
  } catch (error) {
    // Fallback obrigatório: horário local do servidor da aplicação.
    if (!hasSync) {
      console.error('[TIME] Falha ao sincronizar com NTP, usando relógio local:', error.message);
    }
  }

  return new Date(Date.now() + (hasSync ? offsetMs : 0));
}

async function getTrustedNowSqlite() {
  const trustedDate = await getTrustedDate();
  return toSqliteDateTime(trustedDate);
}

// Sincroniza em background para reduzir latência em requisições.
setInterval(() => {
  syncNtpOffset().catch((err) => {
    console.error('[TIME] Erro ao sincronizar NTP em background:', err.message);
  });
}, NTP_SYNC_INTERVAL_MS).unref();

module.exports = {
  getTrustedDate,
  getTrustedNowSqlite,
  toSqliteDateTime,
};
