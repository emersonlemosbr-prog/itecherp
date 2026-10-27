const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function createScanRecord({ service_order_id, device, results = [], storeId = 1 }) {
  const startedAt = new Date().toISOString();
  const scanId = db.prepare(`
    INSERT INTO virus_scans (
      store_id, service_order_id, device_serial, manufacturer, model, android_version,
      started_at, finished_at, status, apps_analyzed, threats_found, threats_removed, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    storeId,
    service_order_id || null,
    device?.serial || null,
    device?.manufacturer || null,
    device?.model || null,
    device?.android_version || null,
    startedAt,
    startedAt,
    'completed',
    Array.isArray(results) ? results.length : 0,
    results.filter((row) => row.risk_level && row.risk_level !== 'safe').length,
    0,
    startedAt,
  );

  const insertResult = db.prepare(`
    INSERT INTO virus_scan_results (
      scan_id, package_name, app_name, version_name, version_code, apk_path, sha256,
      risk_score, risk_level, threat_type, reason, status, protected, removable, removal_status, error_message, removed_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of results) {
    insertResult.run(
      scanId.lastInsertRowid,
      row.package_name || null,
      row.app_name || null,
      row.version_name || null,
      row.version_code || null,
      row.apk_path || null,
      row.sha256 || null,
      row.risk_score || 0,
      row.risk_level || 'safe',
      row.threat_type || 'safe',
      row.reason || 'Sem indicadores críticos conhecidos.',
      row.status || 'safe',
      row.protected ? 1 : 0,
      row.removable === false ? 0 : 1,
      row.status === 'removed' ? 'removed' : 'pending',
      null,
      null,
    );
  }

  return scanId.lastInsertRowid;
}

function updateRemovalStatus({ scan_id, package_names = [], storeId = 1 }) {
  if (!Array.isArray(package_names) || package_names.length === 0) {
    return null;
  }

  const now = new Date().toISOString();
  const latestScan = db.prepare(`
    SELECT id FROM virus_scans
    WHERE id = ? AND store_id = ?
    LIMIT 1
  `).get(scan_id, storeId);

  if (!latestScan) {
    return null;
  }

  const packageList = package_names.filter(Boolean);
  if (!packageList.length) return null;
  const placeholders = packageList.map(() => '?').join(', ');

  db.prepare(`
    UPDATE virus_scan_results
    SET status = 'removed', removal_status = 'removed', removed_at = ?, error_message = NULL, removed_by = 'system'
    WHERE scan_id = ? AND package_name IN (${placeholders})
  `).run(now, latestScan.id, ...packageList);

  const updatedRows = db.prepare(`
    SELECT COUNT(*) as count FROM virus_scan_results WHERE scan_id = ? AND status = 'removed'
  `).get(latestScan.id);

  db.prepare(`
    UPDATE virus_scans
    SET status = 'removed', threats_removed = ?, finished_at = ?
    WHERE id = ? AND store_id = ?
  `).run(updatedRows.count, now, latestScan.id, storeId);

  return latestScan.id;
}

router.get('/history', (req, res) => {
  const storeId = req.user.store_id || 1;
  const { service_order_id } = req.query;
  const params = [storeId];
  let sql = `SELECT * FROM virus_scans WHERE store_id = ?`;

  if (service_order_id) {
    sql += ' AND service_order_id = ?';
    params.push(Number(service_order_id));
  }

  sql += ' ORDER BY created_at DESC LIMIT 20';

  const scans = db.prepare(sql).all(...params);
  if (!scans.length) {
    return res.json({ ok: true, scans: [] });
  }

  const placeholders = scans.map(() => '?').join(', ');
  const results = db.prepare(`
    SELECT * FROM virus_scan_results
    WHERE scan_id IN (${placeholders})
    ORDER BY id ASC
  `).all(...scans.map((scan) => scan.id));

  const resultMap = {};
  for (const row of results) {
    if (!resultMap[row.scan_id]) resultMap[row.scan_id] = [];
    resultMap[row.scan_id].push(row);
  }

  return res.json({
    ok: true,
    scans: scans.map((scan) => ({
      ...scan,
      results: resultMap[scan.id] || [],
    })),
  });
});

router.post('/scan/record', (req, res) => {
  const storeId = req.user.store_id || 1;
  const { service_order_id, device, results } = req.body || {};
  if (!device || !Array.isArray(results) || results.length > 2000 ||
      results.some(row => !row || typeof row.package_name !== 'string')) {
    return res.status(400).json({ ok: false, error: 'Resultado da varredura inválido.' });
  }
  const scanId = createScanRecord({ service_order_id, device, results, storeId });
  return res.json({ ok: true, scan_id: scanId });
});

router.post('/remove/record', (req, res) => {
  const storeId = req.user.store_id || 1;
  const { scan_id, package_names = [] } = req.body || {};
  if (!Number.isInteger(scan_id) || !Array.isArray(package_names) ||
      package_names.some(pkg => typeof pkg !== 'string')) {
    return res.status(400).json({ ok: false, error: 'Registro de remoção inválido.' });
  }
  const latestScanId = updateRemovalStatus({ scan_id, package_names, storeId });
  return res.json({ ok: true, scan_id: latestScanId });
});

module.exports = router;
