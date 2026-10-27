const express = require('express');
const { authenticate } = require('../middleware/auth');
const { appEvents } = require('../utils/events');

const router = express.Router();
router.use(authenticate);

router.get('/dashboard', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const onRefresh = (payload) => {
    res.write(`event: dashboard-refresh\n`);
    res.write(`data: ${JSON.stringify(payload || {})}\n\n`);
  };

  const onInventoryRefresh = (payload) => {
    res.write(`event: inventory-refresh\n`);
    res.write(`data: ${JSON.stringify(payload || {})}\n\n`);
  };

  appEvents.on('dashboard:refresh', onRefresh);
  appEvents.on('inventory:refresh', onInventoryRefresh);

  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ ok: true })}\n\n`);

  req.on('close', () => {
    appEvents.off('dashboard:refresh', onRefresh);
    appEvents.off('inventory:refresh', onInventoryRefresh);
  });
});

module.exports = router;