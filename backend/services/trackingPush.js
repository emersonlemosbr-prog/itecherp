const crypto = require('crypto');
const webpush = require('web-push');
const labels = { received: 'Recebido', diagnosis: 'Em Diagnóstico', waiting_parts: 'Aguardando Peças', repairing: 'Em Reparo', ready: 'Pronto para Retirada', delivered: 'Entregue', not_performed: 'Reparo Não Realizado' };

function migrate(db) {
  // A tabela tracking_push já está incluída no postgresSchema.sql
}

function mount(app, db, find) {
  app.get('/api/public/push-key', (_req, res) => res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null }));
  app.post('/api/public/service-order/:token/subscriptions',
    require('express').json({ limit: '16kb' }), find, async (req, res) => {
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
      const order = await db.queryOne('SELECT id FROM service_orders WHERE public_token_hash = $1', [tokenHash]);
      if (!order) return res.status(404).json({ error: 'Acompanhamento não encontrado.' });
      const latestRow = await db.queryOne('SELECT COALESCE(MAX(id), 0) AS id FROM service_order_status_history WHERE service_order_id = $1', [order.id]);
      const latest = latestRow?.id || 0;
      await db.query(`
        INSERT INTO tracking_push (order_id, endpoint, subscription, token, last_history)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT(order_id, endpoint) DO UPDATE SET
          subscription = EXCLUDED.subscription, token = EXCLUDED.token, last_history = EXCLUDED.last_history
      `, [order.id, subscription.endpoint, JSON.stringify(subscription), token, latest]);
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
      const rows = await db.query(`
        SELECT p.order_id, p.endpoint, p.subscription, p.token, p.last_history,
          o.order_number, o.public_token_hash
        FROM tracking_push p
        JOIN service_orders o ON o.id = p.order_id
      `);

      for (const row of rows) {
        if (stopped) break;
        if (crypto.createHash('sha256').update(row.token).digest('hex') !== row.public_token_hash) {
          await db.query('DELETE FROM tracking_push WHERE order_id = $1 AND endpoint = $2', [row.order_id, row.endpoint]);
          continue;
        }
        const history = await db.queryOne(
          'SELECT id, status FROM service_order_status_history WHERE service_order_id = $1 AND id > $2 ORDER BY id LIMIT 1',
          [row.order_id, row.last_history]
        );
        if (!history) continue;
        const payload = JSON.stringify({
          title: `OS-${String(row.order_number).replace(/^(?:(?:SO|OS)[\s-]*)+/i, '')}`,
          body: `Status: ${labels[history.status] || 'Em atendimento'}`,
          icon: '/assets/logo.png', tag: `os-${row.order_id}`,
          url: `/acompanhamento/${row.token}`,
        });
        try {
          await webpush.sendNotification(JSON.parse(row.subscription), payload);
          await db.query(
            'UPDATE tracking_push SET last_history = $1 WHERE order_id = $2 AND endpoint = $3 AND last_history = $4',
            [history.id, row.order_id, row.endpoint, row.last_history]
          );
        } catch (error) {
          if (error.statusCode === 404 || error.statusCode === 410) {
            await db.query('DELETE FROM tracking_push WHERE order_id = $1 AND endpoint = $2', [row.order_id, row.endpoint]);
          } else {
            console.error('[PUBLIC_TRACKING] Falha ao enviar push:', error.statusCode || error.message);
          }
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
