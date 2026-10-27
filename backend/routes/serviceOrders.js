// routes/serviceOrders.js
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { nextOrderNumber } = require('../utils/orderNumber');
const { getTrustedNowSqlite } = require('../utils/time');
const { emitDashboardRefresh } = require('../utils/events');
const { ensureFinancialHistoryUpToDate } = require('../utils/financialHistory');
const { getStorageService } = require('../services/storage');
const { normalizePartDetails, recordOnDelivery } = require('../services/serviceOrderPartWithdrawal');
const { encryptDevicePassword, decryptDevicePassword } = require('../utils/deviceCrypto');

const cloudPhotos = require('../services/cloudinaryPhotos');
const router = express.Router();
router.use(authenticate);

router.post('/:id/tracking', (req, res, next) => {
  const storeId = req.user.store_id || 1;
  res.set('Cache-Control', 'no-store');
  if (!/^[1-9]\d*$/.test(req.params.id)) return res.status(400).json({ error: 'OS inválida.' });
  try {
    const order = db.prepare('SELECT id FROM service_orders WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
    if (!order) return res.status(404).json({ error: 'Ordem de serviço não encontrada nesta loja.' });

    const result = require('../services/publicTracking').generateTracking(db, req.params.id);
    if (!result) return res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
    res.json(result);
  } catch (error) { next(error); }
});

const PAID_METHODS = ['pix', 'cash', 'credit_card', 'debit_card'];
const PHOTO_TYPE_VALUES = [
  'Sem classificação',
  'Frente',
  'Traseira',
  'Tela',
  'Lateral esquerda',
  'Lateral direita',
  'Parte superior',
  'Parte inferior',
  'Câmeras',
  'Conector',
  'Outro',
];
const MAX_PHOTOS = Number(process.env.SERVICE_ORDER_MAX_PHOTOS || 8);
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_PHOTOS, fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype || '';
    if (IMAGE_MIME_TYPES.has(mime)) return cb(null, true);
    cb(new Error('Formato de imagem inválido. Use JPG, PNG ou WebP.'));
  },
});

function serializePhoto(row, user) {
  return {
    id: row.id,
    service_order_id: row.service_order_id,
    storage_key: row.storage_key,
    original_name: row.original_name,
    mime_type: row.mime_type,
    file_size: row.file_size,
    photo_type: row.photo_type || 'Sem classificação',
    description: row.description || '',
    created_by: row.created_by,
    created_by_name: user?.full_name || null,
    created_at: row.created_at,
    public_id: row.public_id,
    url: row.url || null,
    legacy: !row.public_id,
  };
}

function computePaymentStatus(payment_method) {
  if (PAID_METHODS.includes(payment_method)) return 'paid';
  if (payment_method === 'credit_account') return 'credit_account';
  if (payment_method === 'not_performed') return 'not_performed';
  return 'pending';
}

// Cria/atualiza a garantia e a conta de fiado de acordo com o estado atual da OS
function syncSideEffects(order, trustedNow) {
  const storeId = order.store_id || 1;

  // Fiado
  const existingCredit = db.prepare('SELECT * FROM credit_accounts WHERE service_order_id = ? AND store_id = ?').get(order.id, storeId);
  if (order.payment_status === 'credit_account') {
    if (!existingCredit) {
      db.prepare(`
        INSERT INTO credit_accounts (store_id, customer_id, service_order_id, description, amount, pickup_date, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
      `).run(storeId, order.customer_id, order.id, order.description, order.service_price, order.delivery_date, trustedNow);
    } else if (existingCredit.status === 'open') {
      db.prepare(`
        UPDATE credit_accounts
        SET customer_id = ?, description = ?, amount = ?, pickup_date = ?
        WHERE id = ? AND store_id = ?
      `).run(order.customer_id, order.description, order.service_price, order.delivery_date, existingCredit.id, storeId);
    }
  } else if (existingCredit && existingCredit.status === 'open') {
    db.prepare('DELETE FROM credit_accounts WHERE id = ? AND store_id = ?').run(existingCredit.id, storeId);
  }

  // Garantia: gerada quando a OS é entregue (delivered) e não foi "não realizado"
  const existingWarranty = db.prepare('SELECT * FROM warranties WHERE service_order_id = ? AND store_id = ?').get(order.id, storeId);
  if (order.status === 'delivered' && order.payment_status !== 'not_performed') {
    const start = order.delivery_date || new Date().toISOString().slice(0, 10);
    const end = new Date(new Date(start).getTime() + (order.warranty_days || 90) * 86400000)
      .toISOString().slice(0, 10);

    if (!existingWarranty) {
      db.prepare(`
        INSERT INTO warranties (store_id, service_order_id, customer_id, pickup_date, warranty_start, warranty_end, brand, model, amount_paid, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(storeId, order.id, order.customer_id, order.delivery_date, start, end, order.brand, order.model, order.service_price, order.description, trustedNow);
    } else {
      db.prepare(`
        UPDATE warranties
        SET customer_id = ?, pickup_date = ?, warranty_start = ?, warranty_end = ?,
            brand = ?, model = ?, amount_paid = ?, description = ?
        WHERE id = ? AND store_id = ?
      `).run(
        order.customer_id,
        order.delivery_date,
        start,
        end,
        order.brand,
        order.model,
        order.service_price,
        order.description,
        existingWarranty.id,
        storeId
      );
    }
  } else if (existingWarranty) {
    db.prepare('DELETE FROM warranties WHERE id = ? AND store_id = ?').run(existingWarranty.id, storeId);
  }
}

router.get('/', (req, res) => {
  const storeId = req.user.store_id || 1;
  const { q, status, payment_status } = req.query;
  let sql = `
    SELECT so.*, COALESCE(so.customer_name_snapshot, c.first_name) AS first_name,
      CASE WHEN so.customer_name_snapshot IS NOT NULL THEN '' ELSE c.last_name END AS last_name,
      COALESCE(so.customer_phone_snapshot, c.phone) AS phone
    FROM service_orders so
    JOIN customers c ON c.id = so.customer_id
    WHERE so.store_id = ?
  `;

  const params = [storeId];
  if (q) {
    sql += ` AND (so.order_number LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR so.customer_name_snapshot LIKE ? OR so.brand LIKE ? OR so.model LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }
  if (status) { sql += ' AND so.status = ?'; params.push(status); }
  if (payment_status) { sql += ' AND so.payment_status = ?'; params.push(payment_status); }
  sql += ' ORDER BY so.entry_date DESC, so.id DESC LIMIT 300';

  const orders = db.prepare(sql).all(...params).map((row) => {
    // Não expõe senhas em consultas de listagem
    const { unlock_password, ...safeRow } = row;
    return safeRow;
  });
  res.json(orders);
});

router.get('/:id', (req, res) => {
  const storeId = req.user.store_id || 1;
  const order = db.prepare(`
    SELECT so.*, COALESCE(so.customer_name_snapshot, c.first_name) AS first_name,
      CASE WHEN so.customer_name_snapshot IS NOT NULL THEN '' ELSE c.last_name END AS last_name,
      COALESCE(so.customer_phone_snapshot, c.phone) AS phone,
      COALESCE(so.customer_address_snapshot, c.address) AS address,
      COALESCE(so.supplier_name_snapshot, s.name) AS supplier_name,
      (SELECT w.id FROM cash_withdrawals w WHERE w.service_order_id = so.id AND w.source_type = 'service_order_part' AND w.store_id = so.store_id) AS part_withdrawal_id
    FROM service_orders so
    JOIN customers c ON c.id = so.customer_id
    LEFT JOIN stock_suppliers s ON s.id = so.supplier_id
    WHERE so.id = ? AND so.store_id = ?
  `).get(req.params.id, storeId);

  if (!order) return res.status(404).json({ error: 'Ordem de serviço não encontrada nesta loja.' });
  res.json({
    ...order,
    unlock_password: decryptDevicePassword(order.unlock_password),
    photos: db.prepare('SELECT * FROM service_order_photos WHERE service_order_id = ? ORDER BY id').all(order.id).map(serializePhoto)
  });
});

router.get('/:id/photos', (req, res) => {
  const storeId = req.user.store_id || 1;
  const order = db.prepare('SELECT id, order_number FROM service_orders WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
  if (!order) return res.status(404).json({ error: 'Ordem de serviço não encontrada nesta loja.' });

  const rows = db.prepare(`
    SELECT sp.*, COALESCE(sp.created_by_name_snapshot, u.full_name) AS created_by_name
    FROM service_order_photos sp
    LEFT JOIN users u ON u.id = sp.created_by
    WHERE sp.service_order_id = ?
    ORDER BY sp.created_at ASC, sp.id ASC
  `).all(req.params.id);

  res.json(rows.map((row) => serializePhoto(row, { full_name: row.created_by_name })));
});

router.get('/:id/photos/:photoId', async (req, res) => {
  const storeId = req.user.store_id || 1;
  const order = db.prepare('SELECT id FROM service_orders WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
  if (!order) return res.status(404).json({ error: 'Ordem de serviço não encontrada nesta loja.' });

  const photo = db.prepare('SELECT * FROM service_order_photos WHERE id = ? AND service_order_id = ?').get(req.params.photoId, req.params.id);
  if (!photo) return res.status(404).json({ error: 'Foto não encontrada.' });

  try {
    if (photo.url) return res.redirect(photo.url);
    const storage = getStorageService();
    const item = await storage.read(photo.storage_key);
    res.setHeader('Content-Type', photo.mime_type || item.mimeType || 'image/webp');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(item.buffer);
  } catch (error) {
    console.error('[SERVICE_ORDER_PHOTO_READ_FAILED]', error.message);
    return res.status(500).json({ error: 'Não foi possível carregar a foto solicitada.' });
  }
});

router.get('/:id/photos/:photoId/url', async (req, res) => {
  const storeId = req.user.store_id || 1;
  const order = db.prepare('SELECT id FROM service_orders WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
  if (!order) return res.status(404).json({ error: 'Ordem de serviço não encontrada nesta loja.' });

  const photo = db.prepare('SELECT * FROM service_order_photos WHERE id = ? AND service_order_id = ?').get(req.params.photoId, req.params.id);
  if (!photo) return res.status(404).json({ error: 'Foto não encontrada.' });

  res.json({ url: photo.url || null });
});

router.post('/:id/photos', (req, res, next) => upload.array('photos', MAX_PHOTOS)(req, res, (error) => error ? res.status(400).json({ error: 'Envie até ' + MAX_PHOTOS + ' imagens JPG, PNG ou WebP, com até 10 MB cada.' }) : next()), async (req, res) => {
  const storeId = req.user.store_id || 1;
  const order = db.prepare('SELECT id, order_number FROM service_orders WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
  if (!order) return res.status(404).json({ error: 'Ordem de serviço não encontrada nesta loja.' });

  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });

  const currentCount = db.prepare('SELECT COUNT(*) AS total FROM service_order_photos WHERE service_order_id = ?').get(req.params.id).total;
  if (currentCount + files.length > MAX_PHOTOS) {
    return res.status(400).json({ error: `Limite de ${MAX_PHOTOS} fotos atingido.` });
  }

  let metadata = [];
  try {
    metadata = req.body.metadata ? JSON.parse(req.body.metadata) : [];
  } catch (_error) {
    metadata = [];
  }

  const storage = cloudPhotos;
  const uploaded = [];
  const inserted = [];
  let committed = false;
  const tx = db.transaction((rows) => {
    const count = db.prepare('SELECT COUNT(*) AS total FROM service_order_photos WHERE service_order_id = ?').get(req.params.id).total;
    if (count + rows.length > MAX_PHOTOS) throw new Error('Limite de fotos atingido.');
    rows.forEach((row) => {
      const info = db.prepare(`
        INSERT INTO service_order_photos (
          service_order_id, storage_key, url, public_id, original_name, mime_type, file_size, photo_type, description, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        req.params.id,
        row.storage_key,
        row.url,
        row.public_id,
        row.original_name,
        row.mime_type,
        row.file_size,
        row.photo_type,
        row.description,
        req.user.id
      );
      inserted.push({ id: info.lastInsertRowid, ...row });
    });
  });

  try {
    const rowsToSave = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const metadataRow = Array.isArray(metadata) ? metadata[index] || {} : {};
      const safeType = PHOTO_TYPE_VALUES.includes(metadataRow.photoType) ? metadataRow.photoType : 'Sem classificação';
      const description = String(metadataRow.description || '').slice(0, 500);
      const uploadResult = await storage.upload({
        serviceOrderId: Number(req.params.id),
        orderNumber: order.order_number,
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
      });

      uploaded.push(uploadResult.public_id);
      rowsToSave.push({
        url: uploadResult.url,
        public_id: uploadResult.public_id,
        storage_key: uploadResult.storageKey,
        original_name: file.originalname,
        mime_type: uploadResult.mimeType || file.mimetype,
        file_size: uploadResult.fileSize,
        photo_type: safeType,
        description,
      });
    }

    tx(rowsToSave);
    committed = true;
    res.status(201).json(inserted.map((row) => serializePhoto({
      ...row,
      service_order_id: Number(req.params.id),
      created_by: req.user.id,
      created_at: new Date().toISOString(),
    }, req.user)));
  } catch (error) {
    if (!committed) await Promise.allSettled(uploaded.map((publicId) => cloudPhotos.delete(publicId)));
    console.error('[SERVICE_ORDER_PHOTO_UPLOAD_FAILED]');
    res.status(400).json({ error: error.message || 'Falha ao enviar foto.' });
  }
});

router.delete('/:id/photos/:photoId', async (req, res) => {
  const storeId = req.user.store_id || 1;
  const order = db.prepare('SELECT id FROM service_orders WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
  if (!order) return res.status(404).json({ error: 'Ordem de serviço não encontrada nesta loja.' });

  const photo = db.prepare('SELECT * FROM service_order_photos WHERE id = ? AND service_order_id = ?').get(req.params.photoId, req.params.id);
  if (!photo) return res.status(404).json({ error: 'Foto não encontrada.' });

  try {
    const deleted = photo.public_id ? await cloudPhotos.delete(photo.public_id) : await getStorageService().delete(photo.storage_key);
    if (!deleted) return res.status(502).json({ error: 'Não foi possível remover o arquivo. O registro foi preservado.' });
  } catch (_) { return res.status(502).json({ error: 'Falha ao excluir no armazenamento. Tente novamente.' }); }

  db.prepare('DELETE FROM service_order_photos WHERE id = ?').run(photo.id);
  logAction({ user: req.user, action: 'delete_service_order_photo', recordType: 'service_order_photo', recordId: photo.id, details: { service_order_id: req.params.id, storage_key: photo.storage_key } });
  res.json({ success: true });
});

router.post('/', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const trustedNow = await getTrustedNowSqlite();
    const b = req.body;
    if (!b.customer_id || !b.entry_date) {
      return res.status(400).json({ error: 'Cliente e data de entrada são obrigatórios.' });
    }

    // Validar se o cliente pertence a esta loja
    const customer = db.prepare('SELECT id FROM customers WHERE id = ? AND (store_id = ? OR store_id IS NULL)').get(b.customer_id, storeId);
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado nesta loja.' });

    const service_price = Number(b.service_price) || 0;
    const { partsCost: parts_cost, supplierId: supplier_id } = normalizePartDetails(db, b.parts_cost, b.supplier_id);
    const additional_costs = Number(b.additional_costs) || 0;
    const profit = service_price - parts_cost - additional_costs;
    const payment_method = b.payment_method || 'pending';
    const payment_status = computePaymentStatus(payment_method);
    const order_number = nextOrderNumber(storeId);
    const settings = require('../services/settings').readSettings(storeId);

    const unlock_type = ['none', 'pin', 'password', 'pattern'].includes(b.unlock_type) ? b.unlock_type : 'none';
    let unlock_password = null;
    let unlock_pattern = null;
    if (unlock_type === 'pin' || unlock_type === 'password') {
      unlock_password = b.unlock_password ? encryptDevicePassword(b.unlock_password) : null;
    } else if (unlock_type === 'pattern') {
      unlock_pattern = b.unlock_pattern || null;
    }

    const device_condition = b.device_condition || null;
    const battery_health = (b.battery_health !== undefined && b.battery_health !== '' && b.battery_health !== null && !isNaN(b.battery_health))
      ? Math.min(100, Math.max(0, parseInt(b.battery_health, 10)))
      : null;
    const checklist_notes = b.checklist_notes ? String(b.checklist_notes).slice(0, 2000) : null;
    const checklist_json = b.checklist_json
      ? (typeof b.checklist_json === 'object' ? JSON.stringify(b.checklist_json) : String(b.checklist_json))
      : null;
    const accessories_json = b.accessories_json
      ? (typeof b.accessories_json === 'object' ? JSON.stringify(b.accessories_json) : String(b.accessories_json))
      : null;

    const { order, withdrawalId } = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO service_orders (
          store_id, order_number, customer_id, brand, model, imei1, imei2, entry_date, expected_delivery_date,
          delivery_date, description, notes, service_price, parts_cost, supplier_id, additional_costs, profit,
          payment_method, payment_status, status, warranty_days,
          unlock_type, unlock_password, unlock_pattern, device_condition, battery_health, checklist_notes, checklist_json, accessories_json,
          created_by, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        storeId, order_number, b.customer_id, b.brand || null, b.model || null, b.imei1 || null, b.imei2 || null,
        b.entry_date, b.expected_delivery_date || null, b.delivery_date || (b.status === 'delivered' ? trustedNow.slice(0, 10) : null), b.description || null,
        b.notes || null, service_price, parts_cost, supplier_id, additional_costs, profit,
        payment_method, payment_status, b.status || 'received', b.warranty_days ?? settings.documents.warranty_days,
        unlock_type, unlock_password, unlock_pattern, device_condition, battery_health, checklist_notes, checklist_json, accessories_json,
        req.user.id, trustedNow, trustedNow
      );

      const order = db.prepare('SELECT * FROM service_orders WHERE id = ? AND store_id = ?').get(info.lastInsertRowid, storeId);
      syncSideEffects(order, trustedNow);
      const withdrawalId = recordOnDelivery(db, null, order, trustedNow, req.user.id);
      return { order, withdrawalId };
    })();
    await ensureFinancialHistoryUpToDate(trustedNow, storeId);

    logAction({ user: req.user, action: 'create_service_order', recordType: 'service_order', recordId: order.id, details: { order_number } });
    if (withdrawalId) logAction({ user: req.user, action: 'sync_cash_withdrawal_from_service_order', recordType: 'cash_withdrawal', recordId: withdrawalId, details: { service_order_id: order.id } });
    emitDashboardRefresh({ source: 'service_order_create', orderId: order.id, orderNumber: order.order_number });
    res.status(201).json({
      ...order,
      unlock_password: decryptDevicePassword(order.unlock_password),
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const trustedNow = await getTrustedNowSqlite();
    const existing = db.prepare('SELECT * FROM service_orders WHERE id = ? AND (store_id = ? OR store_id IS NULL)').get(req.params.id, storeId);
    if (!existing) return res.status(404).json({ error: 'Ordem de serviço não encontrada nesta loja.' });

    const b = req.body;
    const service_price = b.service_price !== undefined ? Number(b.service_price) : existing.service_price;
    const nextStatus = b.status ?? existing.status;
    const proposedPartsCost = b.parts_cost !== undefined ? b.parts_cost : existing.parts_cost;
    const proposedSupplierId = b.supplier_id !== undefined ? b.supplier_id : existing.supplier_id;
    const { partsCost: parts_cost, supplierId: supplier_id } = normalizePartDetails(db, proposedPartsCost, proposedSupplierId);
    const existingPartWithdrawal = db.prepare("SELECT id FROM cash_withdrawals WHERE service_order_id = ? AND source_type = 'service_order_part' AND (store_id = ? OR store_id IS NULL)").get(existing.id, storeId);
    if (existingPartWithdrawal && b.delivery_date !== undefined && (b.delivery_date || null) !== (existing.delivery_date || null)) {
      return res.status(409).json({ error: 'A data de entrega não pode ser alterada após a retirada automática.' });
    }
    const additional_costs = b.additional_costs !== undefined ? Number(b.additional_costs) : existing.additional_costs;
    const profit = service_price - parts_cost - additional_costs;
    const payment_method = b.payment_method || existing.payment_method;
    const payment_status = computePaymentStatus(payment_method);
    const requestedDeliveryDate = b.delivery_date !== undefined ? (b.delivery_date || null) : existing.delivery_date;
    const deliveryDate = nextStatus === 'delivered' && existing.status !== 'delivered' && !requestedDeliveryDate
      ? trustedNow.slice(0, 10) : requestedDeliveryDate;

    let unlock_type = existing.unlock_type || 'none';
    let unlock_password = existing.unlock_password || null;
    let unlock_pattern = existing.unlock_pattern || null;

    if (b.unlock_type !== undefined) {
      unlock_type = ['none', 'pin', 'password', 'pattern'].includes(b.unlock_type) ? b.unlock_type : 'none';
      if (unlock_type === 'none') {
        unlock_password = null;
        unlock_pattern = null;
      } else if (unlock_type === 'pin' || unlock_type === 'password') {
        unlock_pattern = null;
        if (b.unlock_password !== undefined) {
          unlock_password = b.unlock_password ? encryptDevicePassword(b.unlock_password) : null;
        }
      } else if (unlock_type === 'pattern') {
        unlock_password = null;
        if (b.unlock_pattern !== undefined) {
          unlock_pattern = b.unlock_pattern || null;
        }
      }
    } else {
      if (b.unlock_password !== undefined && (unlock_type === 'pin' || unlock_type === 'password')) {
        unlock_password = b.unlock_password ? encryptDevicePassword(b.unlock_password) : null;
      }
      if (b.unlock_pattern !== undefined && unlock_type === 'pattern') {
        unlock_pattern = b.unlock_pattern || null;
      }
    }

    const device_condition = b.device_condition !== undefined ? (b.device_condition || null) : existing.device_condition;
    const battery_health = b.battery_health !== undefined
      ? ((b.battery_health !== '' && b.battery_health !== null && !isNaN(b.battery_health))
          ? Math.min(100, Math.max(0, parseInt(b.battery_health, 10)))
          : null)
      : existing.battery_health;
    const checklist_notes = b.checklist_notes !== undefined
      ? (b.checklist_notes ? String(b.checklist_notes).slice(0, 2000) : null)
      : existing.checklist_notes;
    const checklist_json = b.checklist_json !== undefined
      ? (b.checklist_json ? (typeof b.checklist_json === 'object' ? JSON.stringify(b.checklist_json) : String(b.checklist_json)) : null)
      : existing.checklist_json;
    const accessories_json = b.accessories_json !== undefined
      ? (b.accessories_json ? (typeof b.accessories_json === 'object' ? JSON.stringify(b.accessories_json) : String(b.accessories_json)) : null)
      : existing.accessories_json;

    const { order, withdrawalId } = db.transaction(() => {
      db.prepare(`
        UPDATE service_orders SET
          brand=?, model=?, imei1=?, imei2=?, entry_date=?, expected_delivery_date=?, delivery_date=?,
          description=?, notes=?, service_price=?, parts_cost=?, supplier_id=?, additional_costs=?, profit=?,
          payment_method=?, payment_status=?, status=?, warranty_days=?,
          unlock_type=?, unlock_password=?, unlock_pattern=?, device_condition=?, battery_health=?, checklist_notes=?, checklist_json=?, accessories_json=?,
          updated_at=?
        WHERE id=? AND (store_id=? OR store_id IS NULL)
      `).run(
        b.brand ?? existing.brand, b.model ?? existing.model, b.imei1 ?? existing.imei1, b.imei2 ?? existing.imei2,
        b.entry_date ?? existing.entry_date, b.expected_delivery_date ?? existing.expected_delivery_date,
        deliveryDate, b.description ?? existing.description, b.notes ?? existing.notes,
        service_price, parts_cost, supplier_id, additional_costs, profit, payment_method, payment_status,
        nextStatus, b.warranty_days ?? existing.warranty_days,
        unlock_type, unlock_password, unlock_pattern, device_condition, battery_health, checklist_notes, checklist_json, accessories_json,
        trustedNow, req.params.id, storeId
      );
      const order = db.prepare('SELECT * FROM service_orders WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
      syncSideEffects(order, trustedNow);
      const withdrawalId = recordOnDelivery(db, existing.status, order, trustedNow, req.user.id);
      return { order, withdrawalId };
    })();
    await ensureFinancialHistoryUpToDate(trustedNow, storeId);

    logAction({ user: req.user, action: 'update_service_order', recordType: 'service_order', recordId: order.id, details: { status: order.status } });
    if (withdrawalId) logAction({ user: req.user, action: 'sync_cash_withdrawal_from_service_order', recordType: 'cash_withdrawal', recordId: withdrawalId, details: { service_order_id: order.id } });
    emitDashboardRefresh({ source: 'service_order_update', orderId: order.id, orderNumber: order.order_number });
    res.json({
      ...order,
      unlock_password: decryptDevicePassword(order.unlock_password),
      part_withdrawal_id: withdrawalId || null,
      photos: db.prepare('SELECT * FROM service_order_photos WHERE service_order_id = ? ORDER BY id').all(order.id).map(serializePhoto)
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const storeId = req.user.store_id || 1;
  const existing = db.prepare('SELECT id, order_number FROM service_orders WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
  if (!existing) return res.status(404).json({ error: 'Ordem de serviço não encontrada nesta loja.' });
  if (db.prepare("SELECT id FROM cash_withdrawals WHERE service_order_id = ? AND source_type = 'service_order_part' AND store_id = ?").get(req.params.id, storeId)) {
    return res.status(409).json({ error: 'Esta OS possui uma retirada automática de peça e não pode ser excluída.' });
  }

  const photos = db.prepare('SELECT * FROM service_order_photos WHERE service_order_id = ?').all(req.params.id);
  const storage = getStorageService();
  for (const photo of photos) {
    try {
      const deleted = photo.public_id ? await cloudPhotos.delete(photo.public_id) : await storage.delete(photo.storage_key);
      if (!deleted) throw new Error('Falha ao excluir foto.');
    } catch (err) {
      return res.status(502).json({ error: 'Não foi possível excluir as fotos. A OS foi preservada.' });
    }
  }

  db.prepare('DELETE FROM warranties WHERE service_order_id = ? AND store_id = ?').run(req.params.id, storeId);
  db.prepare('DELETE FROM credit_accounts WHERE service_order_id = ? AND store_id = ?').run(req.params.id, storeId);
  db.prepare('DELETE FROM service_orders WHERE id = ? AND store_id = ?').run(req.params.id, storeId);
  await ensureFinancialHistoryUpToDate(await getTrustedNowSqlite(), storeId);
  logAction({ user: req.user, action: 'delete_service_order', recordType: 'service_order', recordId: req.params.id });
  emitDashboardRefresh({ source: 'service_order_delete', orderId: Number(req.params.id), orderNumber: existing?.order_number || null });
  res.json({ success: true });
});

module.exports = router;
