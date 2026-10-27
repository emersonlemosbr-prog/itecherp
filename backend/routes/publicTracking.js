// Legacy number-based tracking is intentionally disabled.
const router = require('express').Router();
router.use((_req, res) => res.status(404).json({ error: 'Acompanhamento dispon?vel somente pelo link seguro.' }));
module.exports = router;
