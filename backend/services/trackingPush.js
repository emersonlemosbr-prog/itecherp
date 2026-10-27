const crypto = require('crypto');
const webpush = require('web-push');
const labels = { received: 'Recebido', diagnosis: 'Em Diagnóstico', waiting_parts: 'Aguardando Peças', repairing: 'Em Reparo', ready: 'Pronto para Retirada', delivered: 'Entregue', not_performed: 'Reparo Não Realizado' };

function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS tracking_push (
    order_id INTEGER NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL, subscription TEXT NOT NULL, token TEXT NOT NULL,
    last_history INTEGER NOT NULL, PRIMARY KEY(order_id, endpoint)
  )`);
}

function mount(app, db, find) {
  app.get('/api/public/push-key', (_req, res) => res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null }));
  app.post('/api/public/service-order/:token/subscriptions',
    require('express').json({ limit: '16kb' }), find, (req, res) => {
      const subscription = req.body;
      let url;
      try { url = new URL(subscription?.endpoint); } catch { return res.status(400).json({ error: 'Inscrição inválida.' }); }
      if (url.protocol !== 'https:' || !subscription?.keys?.p256dh || !subscription?.keys?.auth ||
          typeof subscription.keys.p256dh !== 'string' || typeof subscription.keys.auth !== 'string' ||
          subscription.endpoint.length > 2048 || subscription.keys.p256dh.length > 512 || subscription.keys.auth.length > 512) {
        return res.status(400).json({ error: 'Inscrição inválida.' });
      }
      const token = req.params.token;
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const order = db.prepare('SELECT id FROM service_orders WHERE public_token_hash = ?').get(tokenHash);
      if (!order) return res.status(404).json({ error: 'Acompanhamento não encontrado.' });
      const latest = db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM service_order_status_history WHERE service_order_id = ?').get(order.id).id;
      db.prepare(`INSERT INTO tracking_push (order_id, endpoint, subscription, token, last_history)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(order_id, endpoint) DO UPDATE SET
        subscription = excluded.subscription, token = excluded.token, last_history = excluded.last_history`)
        .run(order.id, subscription.endpoint, JSON.stringify(subscription), token, latest);
      res.status(201).json({ status: 'ok' });
    });
}

function startWorker(db) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return { stop() {} };
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  let busy = false;
  let stopped = false;
  async function deliver() {
    if (busy || stopped) return;
    busy = true;
    try {
      const rows = db.prepare(`SELECT p.order_id, p.endpoint, p.subscription, p.token, p.last_history,
          o.order_number, o.public_token_hash
        FROM tracking_push p JOIN service_orders o ON o.id = p.order_id`).all();
      const next = db.prepare(`SELECT id, status FROM service_order_status_history
        WHERE service_order_id = ? AND id > ? ORDER BY id LIMIT 1`);
      const advance = db.prepare('UPDATE tracking_push SET last_history = ? WHERE order_id = ? AND endpoint = ? AND last_history = ?');
      const remove = db.prepare('DELETE FROM tracking_push WHERE order_id = ? AND endpoint = ?');
      for (const row of rows) {
        if (stopped) break;
        if (crypto.createHash('sha256').update(row.token).digest('hex') !== row.public_token_hash) {
          remove.run(row.order_id, row.endpoint);
          continue;
        }
        const history = next.get(row.order_id, row.last_history);
        if (!history) continue;
        const payload = JSON.stringify({
          title: `OS-${String(row.order_number).replace(/^(?:(?:SO|OS)[\s-]*)+/i, '')}`,
          body: `Status: ${labels[history.status] || 'Em atendimento'}`,
          icon: '/assets/logo.png', tag: `os-${row.order_id}`,
          url: `/acompanhamento/${row.token}`,
        });
        try {
          await webpush.sendNotification(JSON.parse(row.subscription), payload);
          advance.run(history.id, row.order_id, row.endpoint, row.last_history);
        } catch (error) {
          if (error.statusCode === 404 || error.statusCode === 410) remove.run(row.order_id, row.endpoint);
          else console.error('[PUBLIC_TRACKING] Falha ao enviar push:', error.statusCode || error.message);
        }
      }
    } catch (error) {
      if (!stopped) console.error('[PUBLIC_TRACKING] Falha no worker push:', error.message);
    } finally { busy = false; }
  }
  const timer = setInterval(deliver, 5000);
  timer.unref();
  return { stop() { stopped = true; clearInterval(timer); } };
}

module.exports = { migrate, mount, startWorker };

