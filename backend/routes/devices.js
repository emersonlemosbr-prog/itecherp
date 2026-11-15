const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { enforceStoreSuspension } = require('../middleware/suspension');
const { emitInventoryRefresh } = require('../utils/events');

const router = express.Router();
router.use(authenticate);
router.use(enforceStoreSuspension);

function normalizeString(val) {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  return str.length > 0 ? str : null;
}

function normalizeNumber(val, defaultVal = 0) {
  if (val === null || val === undefined || val === '') return defaultVal;
  const num = Number(val);
  return Number.isNaN(num) ? defaultVal : num;
}

function sanitizeImei(imei) {
  if (!imei) return null;
  const cleaned = String(imei).replace(/\s+/g, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function canViewFinancials(user) {
  if (!user) return false;
  if (user.role === 'admin' || user.is_master) return true;
  const p = user.permissions || {};
  return !!(p.financial_view || p.financial || p.dashboard);
}

// -------------------------------------------------------------
// GET /api/devices - Listar dispositivos com filtros e métricas
// -------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const isFinancialAllowed = canViewFinancials(req.user);

    const {
      tab = 'in_stock', // all, in_stock, reserved, unavailable, older_60, sold, archived
      q = '',
      brand,
      condition,
      storage,
      supplier_id,
      entry_start,
      entry_end,
      sort = 'recent',
      page = 1,
      limit = 25
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    // 1. Contadores dinâmicos para as abas e métricas do topo
    // SQLite/PostgreSQL date diff:
    // Para SQLite: julianday('now') - julianday(entry_date) > 60
    // Para Postgres: CURRENT_DATE - entry_date > 60
    const rawCounts = await db.query(`
      SELECT
        COUNT(CASE WHEN status != 'archived' THEN 1 END) AS count_all,
        COUNT(CASE WHEN status = 'in_stock' THEN 1 END) AS count_in_stock,
        COUNT(CASE WHEN status = 'reserved' THEN 1 END) AS count_reserved,
        COUNT(CASE WHEN status = 'unavailable' THEN 1 END) AS count_unavailable,
        COUNT(CASE WHEN status = 'sold' THEN 1 END) AS count_sold,
        COUNT(CASE WHEN status = 'archived' THEN 1 END) AS count_archived,
        COUNT(CASE WHEN status = 'in_stock' AND (julianday('now') - julianday(entry_date)) > 60 THEN 1 END) AS count_older_60,
        SUM(CASE WHEN status IN ('in_stock', 'reserved') THEN cost_price ELSE 0 END) AS stock_cost_total,
        SUM(CASE WHEN status = 'in_stock' THEN (sell_price - cost_price) ELSE 0 END) AS potential_profit_total,
        SUM(CASE WHEN status = 'in_stock' AND (julianday('now') - julianday(entry_date)) > 60 THEN cost_price ELSE 0 END) AS older_60_cost_total
      FROM devices
      WHERE store_id = $1
    `, [storeId]);

    const countsRow = rawCounts[0] || {};
    const counts = {
      all: Number(countsRow.count_all) || 0,
      in_stock: Number(countsRow.count_in_stock) || 0,
      reserved: Number(countsRow.count_reserved) || 0,
      unavailable: Number(countsRow.count_unavailable) || 0,
      older_60: Number(countsRow.count_older_60) || 0,
      sold: Number(countsRow.count_sold) || 0,
      archived: Number(countsRow.count_archived) || 0
    };

    const metrics = {
      in_stock_count: counts.in_stock,
      stock_cost_total: isFinancialAllowed ? Number(countsRow.stock_cost_total || 0) : null,
      potential_profit_total: isFinancialAllowed ? Number(countsRow.potential_profit_total || 0) : null,
      older_60_count: counts.older_60,
      older_60_cost_total: isFinancialAllowed ? Number(countsRow.older_60_cost_total || 0) : null
    };

    // 2. Montagem dos filtros da consulta de listagem
    const conditions = ['d.store_id = $1'];
    const params = [storeId];
    let pIdx = 2;

    // Aba
    if (tab === 'in_stock') {
      conditions.push("d.status = 'in_stock'");
    } else if (tab === 'reserved') {
      conditions.push("d.status = 'reserved'");
    } else if (tab === 'unavailable') {
      conditions.push("d.status = 'unavailable'");
    } else if (tab === 'older_60') {
      conditions.push("d.status = 'in_stock' AND (julianday('now') - julianday(d.entry_date)) > 60");
    } else if (tab === 'sold') {
      conditions.push("d.status = 'sold'");
    } else if (tab === 'archived') {
      conditions.push("d.status = 'archived'");
    } else if (tab === 'all') {
      conditions.push("d.status != 'archived'");
    }

    // Busca textual geral (modelo, imei1, imei2, serial, cor)
    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      conditions.push(`(
        d.model LIKE $${pIdx} OR
        d.brand LIKE $${pIdx} OR
        d.imei1 LIKE $${pIdx} OR
        d.imei2 LIKE $${pIdx} OR
        d.serial_number LIKE $${pIdx} OR
        d.color LIKE $${pIdx}
      )`);
      params.push(term);
      pIdx++;
    }

    if (brand && brand !== 'all') {
      conditions.push(`d.brand = $${pIdx}`);
      params.push(brand);
      pIdx++;
    }

    if (condition && condition !== 'all') {
      conditions.push(`d.condition = $${pIdx}`);
      params.push(condition);
      pIdx++;
    }

    if (storage && storage !== 'all') {
      conditions.push(`d.storage = $${pIdx}`);
      params.push(storage);
      pIdx++;
    }

    if (supplier_id && supplier_id !== 'all') {
      conditions.push(`d.supplier_id = $${pIdx}`);
      params.push(Number(supplier_id));
      pIdx++;
    }

    if (entry_start) {
      conditions.push(`d.entry_date >= $${pIdx}`);
      params.push(entry_start);
      pIdx++;
    }

    if (entry_end) {
      conditions.push(`d.entry_date <= $${pIdx}`);
      params.push(entry_end);
      pIdx++;
    }

    // Ordenação
    let orderBy = 'd.id DESC';
    if (sort === 'oldest') {
      orderBy = 'd.id ASC';
    } else if (sort === 'price_asc') {
      orderBy = 'd.sell_price ASC, d.id DESC';
    } else if (sort === 'price_desc') {
      orderBy = 'd.sell_price DESC, d.id DESC';
    } else if (sort === 'days_in_stock_desc') {
      orderBy = 'd.entry_date ASC, d.id ASC';
    } else {
      orderBy = 'd.id DESC'; // recent
    }

    const whereClause = conditions.join(' AND ');

    // Total filtrado
    const totalRow = await db.queryOne(`
      SELECT COUNT(*) AS total
      FROM devices d
      WHERE ${whereClause}
    `, params);
    const total = Number(totalRow?.total) || 0;

    // Consulta paginada
    const listQuery = `
      SELECT
        d.id,
        d.store_id,
        d.brand,
        d.model,
        d.storage,
        d.color,
        d.category,
        d.imei1,
        d.imei2,
        d.serial_number,
        d.condition,
        d.battery_health,
        ${isFinancialAllowed ? 'd.cost_price,' : '0 AS cost_price,'}
        d.sell_price,
        ${isFinancialAllowed ? '(d.sell_price - d.cost_price) AS potential_profit,' : '0 AS potential_profit,'}
        ${isFinancialAllowed ? 'CASE WHEN d.cost_price > 0 THEN ROUND(((d.sell_price - d.cost_price) / d.cost_price) * 100, 1) ELSE 0 END AS profit_margin_percent,' : '0 AS profit_margin_percent,'}
        d.supplier_id,
        d.supplier_name,
        d.entry_date,
        d.status,
        d.reservation_notes,
        d.reserved_at,
        d.sold_at,
        d.sale_id,
        d.sale_order_number,
        d.sale_customer_name,
        d.sale_price_sold,
        d.notes,
        d.created_by,
        d.created_at,
        d.updated_at,
        ROUND(julianday('now') - julianday(d.entry_date)) AS days_in_stock,
        s.name AS linked_supplier_name
      FROM devices d
      LEFT JOIN stock_suppliers s ON s.id = d.supplier_id
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const rows = await db.query(listQuery, params);

    res.json({
      items: rows,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      counts,
      metrics,
      isFinancialAllowed
    });
  } catch (err) {
    console.error('[DEVICES_LIST_ERROR]', err);
    res.status(500).json({ error: 'Erro ao listar aparelhos: ' + err.message });
  }
});

// -------------------------------------------------------------
// GET /api/devices/brands - Marcas cadastradas + marcas populares
// -------------------------------------------------------------
router.get('/brands', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const rows = await db.query(`
      SELECT DISTINCT brand
      FROM devices
      WHERE store_id = $1 AND brand IS NOT NULL AND brand != ''
      ORDER BY brand ASC
    `, [storeId]);

    const registeredBrands = rows.map(r => r.brand);
    const standardBrands = ['Apple', 'Samsung', 'Motorola', 'Xiaomi', 'Realme', 'Oppo', 'Asus', 'Infinix', 'Outra'];
    const merged = Array.from(new Set([...standardBrands, ...registeredBrands]));

    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar marcas: ' + err.message });
  }
});

// -------------------------------------------------------------
// GET /api/devices/:id - Obter detalhes completos do aparelho
// -------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const isFinancialAllowed = canViewFinancials(req.user);

    const device = await db.queryOne(`
      SELECT
        d.*,
        ROUND(julianday('now') - julianday(d.entry_date)) AS days_in_stock,
        s.name AS linked_supplier_name
      FROM devices d
      LEFT JOIN stock_suppliers s ON s.id = d.supplier_id
      WHERE d.id = $1 AND d.store_id = $2
    `, [req.params.id, storeId]);

    if (!device) {
      return res.status(404).json({ error: 'Aparelho não encontrado.' });
    }

    if (!isFinancialAllowed) {
      device.cost_price = null;
    }

    const history = await db.query(`
      SELECT id, device_id, action_type, description, details, user_name, created_at
      FROM device_history
      WHERE device_id = $1 AND store_id = $2
      ORDER BY id DESC
    `, [req.params.id, storeId]);

    res.json({
      ...device,
      history: history.map(h => {
        let detailsParsed = h.details;
        if (typeof h.details === 'string') {
          try { detailsParsed = JSON.parse(h.details); } catch (_) {}
        }
        return { ...h, details: detailsParsed };
      })
    });
  } catch (err) {
    console.error('[DEVICES_GET_ERROR]', err);
    res.status(500).json({ error: 'Erro ao consultar aparelho: ' + err.message });
  }
});

// -------------------------------------------------------------
// POST /api/devices - Cadastrar novo aparelho
// -------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const userId = req.user.id || null;
    const userName = req.user.name || req.user.full_name || 'Usuário';

    const brand = normalizeString(req.body.brand);
    const model = normalizeString(req.body.model);
    const storage = normalizeString(req.body.storage);
    const color = normalizeString(req.body.color);
    const category = normalizeString(req.body.category) || 'Smartphone';
    const imei1 = sanitizeImei(req.body.imei1);
    const imei2 = sanitizeImei(req.body.imei2);
    const serialNumber = normalizeString(req.body.serial_number);
    const condition = normalizeString(req.body.condition) || 'Seminovo';
    const batteryHealth = req.body.battery_health !== undefined && req.body.battery_health !== '' && req.body.battery_health !== null
      ? Math.max(0, Math.min(100, parseInt(req.body.battery_health, 10)))
      : null;
    const costPrice = normalizeNumber(req.body.cost_price, 0);
    const sellPrice = normalizeNumber(req.body.sell_price, 0);
    const supplierId = req.body.supplier_id ? Number(req.body.supplier_id) : null;
    const supplierName = normalizeString(req.body.supplier_name);
    const entryDate = normalizeString(req.body.entry_date) || new Date().toISOString().slice(0, 10);
    const notes = normalizeString(req.body.notes);

    if (!brand) return res.status(400).json({ error: 'A marca do aparelho é obrigatória.' });
    if (!model) return res.status(400).json({ error: 'O modelo do aparelho é obrigatório.' });

    // Pelo menos IMEI 1 ou Número de Série deve ser preenchido para identificação individual
    if (!imei1 && !serialNumber) {
      return res.status(400).json({ error: 'Informe ao menos o IMEI 1 ou o Número de Série para identificar o aparelho.' });
    }

    // Se fornecido IMEI 1, validar formato (apenas dígitos, normalmente 14 ou 15 caracteres)
    if (imei1) {
      if (!/^\d{14,16}$/.test(imei1)) {
        return res.status(400).json({ error: 'IMEI 1 inválido. O IMEI deve conter entre 14 e 16 dígitos numéricos.' });
      }
    }

    if (imei2) {
      if (!/^\d{14,16}$/.test(imei2)) {
        return res.status(400).json({ error: 'IMEI 2 inválido. O IMEI deve conter entre 14 e 16 dígitos numéricos.' });
      }
    }

    // Validação de duplicidade de IMEI 1 ativo na mesma loja
    if (imei1) {
      const existingImei = await db.queryOne(`
        SELECT id, model, status
        FROM devices
        WHERE store_id = $1 AND imei1 = $2 AND status IN ('in_stock', 'reserved', 'unavailable')
      `, [storeId, imei1]);

      if (existingImei) {
        return res.status(409).json({
          error: `Já existe um aparelho ativo (${existingImei.model}) cadastrado com o IMEI ${imei1} nesta loja.`
        });
      }
    }

    // Validação de duplicidade de Número de Série ativo na mesma loja
    if (serialNumber) {
      const existingSerial = await db.queryOne(`
        SELECT id, model, status
        FROM devices
        WHERE store_id = $1 AND serial_number = $2 AND status IN ('in_stock', 'reserved', 'unavailable')
      `, [storeId, serialNumber]);

      if (existingSerial) {
        return res.status(409).json({
          error: `Já existe um aparelho ativo (${existingSerial.model}) cadastrado com o Número de Série ${serialNumber} nesta loja.`
        });
      }
    }

    // Inserção
    const info = await db.execute(`
      INSERT INTO devices (
        store_id, brand, model, storage, color, category,
        imei1, imei2, serial_number, condition, battery_health,
        cost_price, sell_price, supplier_id, supplier_name,
        entry_date, status, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'in_stock', $17, $18)
      RETURNING id
    `, [
      storeId, brand, model, storage, color, category,
      imei1, imei2, serialNumber, condition, batteryHealth,
      costPrice, sellPrice, supplierId, supplierName,
      entryDate, notes, userId
    ]);

    const newId = info.id;

    // Registrar histórico
    await db.execute(`
      INSERT INTO device_history (
        device_id, store_id, user_id, user_name, action_type, description, details
      ) VALUES ($1, $2, $3, $4, 'created', $5, $6)
    `, [
      newId,
      storeId,
      userId,
      userName,
      'Aparelho cadastrado no estoque',
      JSON.stringify({ brand, model, storage, color, imei1, serialNumber, costPrice, sellPrice })
    ]);

    emitInventoryRefresh({ source: 'device_create', deviceId: newId });

    const created = await db.queryOne('SELECT * FROM devices WHERE id = $1', [newId]);
    res.status(201).json(created);
  } catch (err) {
    console.error('[DEVICES_POST_ERROR]', err);
    res.status(500).json({ error: 'Erro ao cadastrar aparelho: ' + err.message });
  }
});

// -------------------------------------------------------------
// PUT /api/devices/:id - Editar informações do aparelho
// -------------------------------------------------------------
router.put('/:id', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const userId = req.user.id || null;
    const userName = req.user.name || req.user.full_name || 'Usuário';

    const existing = await db.queryOne('SELECT * FROM devices WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!existing) {
      return res.status(404).json({ error: 'Aparelho não encontrado.' });
    }

    const brand = normalizeString(req.body.brand ?? existing.brand);
    const model = normalizeString(req.body.model ?? existing.model);
    const storage = normalizeString(req.body.storage ?? existing.storage);
    const color = normalizeString(req.body.color ?? existing.color);
    const category = normalizeString(req.body.category ?? existing.category) || 'Smartphone';
    const imei1 = sanitizeImei(req.body.imei1 !== undefined ? req.body.imei1 : existing.imei1);
    const imei2 = sanitizeImei(req.body.imei2 !== undefined ? req.body.imei2 : existing.imei2);
    const serialNumber = normalizeString(req.body.serial_number !== undefined ? req.body.serial_number : existing.serial_number);
    const condition = normalizeString(req.body.condition ?? existing.condition) || 'Seminovo';
    const batteryHealth = req.body.battery_health !== undefined
      ? (req.body.battery_health !== '' && req.body.battery_health !== null ? Math.max(0, Math.min(100, parseInt(req.body.battery_health, 10))) : null)
      : existing.battery_health;
    const costPrice = req.body.cost_price !== undefined ? normalizeNumber(req.body.cost_price, existing.cost_price) : existing.cost_price;
    const sellPrice = req.body.sell_price !== undefined ? normalizeNumber(req.body.sell_price, existing.sell_price) : existing.sell_price;
    const supplierId = req.body.supplier_id !== undefined ? (req.body.supplier_id ? Number(req.body.supplier_id) : null) : existing.supplier_id;
    const supplierName = normalizeString(req.body.supplier_name ?? existing.supplier_name);
    const entryDate = normalizeString(req.body.entry_date ?? existing.entry_date);
    const notes = normalizeString(req.body.notes !== undefined ? req.body.notes : existing.notes);

    if (!brand) return res.status(400).json({ error: 'A marca do aparelho é obrigatória.' });
    if (!model) return res.status(400).json({ error: 'O modelo do aparelho é obrigatório.' });

    if (!imei1 && !serialNumber) {
      return res.status(400).json({ error: 'Informe ao menos o IMEI 1 ou o Número de Série para identificar o aparelho.' });
    }

    if (imei1 && !/^\d{14,16}$/.test(imei1)) {
      return res.status(400).json({ error: 'IMEI 1 inválido. O IMEI deve conter entre 14 e 16 dígitos numéricos.' });
    }

    if (imei2 && !/^\d{14,16}$/.test(imei2)) {
      return res.status(400).json({ error: 'IMEI 2 inválido. O IMEI deve conter entre 14 e 16 dígitos numéricos.' });
    }

    // Verificar duplicidade de IMEI 1 com outros registros ativos
    if (imei1) {
      const duplicateImei = await db.queryOne(`
        SELECT id, model
        FROM devices
        WHERE store_id = $1 AND imei1 = $2 AND id != $3 AND status IN ('in_stock', 'reserved', 'unavailable')
      `, [storeId, imei1, existing.id]);

      if (duplicateImei) {
        return res.status(409).json({
          error: `O IMEI ${imei1} já está em uso pelo aparelho ${duplicateImei.model} (ID #${duplicateImei.id}).`
        });
      }
    }

    // Verificar duplicidade de Serial com outros registros ativos
    if (serialNumber) {
      const duplicateSerial = await db.queryOne(`
        SELECT id, model
        FROM devices
        WHERE store_id = $1 AND serial_number = $2 AND id != $3 AND status IN ('in_stock', 'reserved', 'unavailable')
      `, [storeId, serialNumber, existing.id]);

      if (duplicateSerial) {
        return res.status(409).json({
          error: `O Número de Série ${serialNumber} já está em uso pelo aparelho ${duplicateSerial.model} (ID #${duplicateSerial.id}).`
        });
      }
    }

    // Detectar alterações relevantes para histórico
    const changes = [];
    if (brand !== existing.brand) changes.push(`Marca: ${existing.brand} -> ${brand}`);
    if (model !== existing.model) changes.push(`Modelo: ${existing.model} -> ${model}`);
    if (storage !== existing.storage) changes.push(`Armazenamento: ${existing.storage || '-'} -> ${storage || '-'}`);
    if (color !== existing.color) changes.push(`Cor: ${existing.color || '-'} -> ${color || '-'}`);
    if (condition !== existing.condition) changes.push(`Condição: ${existing.condition} -> ${condition}`);
    if (batteryHealth !== existing.battery_health) changes.push(`Saúde da bateria: ${existing.battery_health ?? 'vazio'}% -> ${batteryHealth ?? 'vazio'}%`);
    if (Number(costPrice) !== Number(existing.cost_price)) changes.push(`Custo: R$ ${existing.cost_price} -> R$ ${costPrice}`);
    if (Number(sellPrice) !== Number(existing.sell_price)) changes.push(`Preço: R$ ${existing.sell_price} -> R$ ${sellPrice}`);
    if (imei1 !== existing.imei1) changes.push(`IMEI 1: ${existing.imei1 || '-'} -> ${imei1 || '-'}`);
    if (imei2 !== existing.imei2) changes.push(`IMEI 2: ${existing.imei2 || '-'} -> ${imei2 || '-'}`);

    await db.execute(`
      UPDATE devices
      SET
        brand = $1,
        model = $2,
        storage = $3,
        color = $4,
        category = $5,
        imei1 = $6,
        imei2 = $7,
        serial_number = $8,
        condition = $9,
        battery_health = $10,
        cost_price = $11,
        sell_price = $12,
        supplier_id = $13,
        supplier_name = $14,
        entry_date = $15,
        notes = $16,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $17 AND store_id = $18
    `, [
      brand, model, storage, color, category,
      imei1, imei2, serialNumber, condition, batteryHealth,
      costPrice, sellPrice, supplierId, supplierName,
      entryDate, notes, existing.id, storeId
    ]);

    if (changes.length > 0) {
      await db.execute(`
        INSERT INTO device_history (
          device_id, store_id, user_id, user_name, action_type, description, details
        ) VALUES ($1, $2, $3, $4, 'updated', $5, $6)
      `, [
        existing.id,
        storeId,
        userId,
        userName,
        `Aparelho atualizado: ${changes.join(', ')}`,
        JSON.stringify(changes)
      ]);
    }

    emitInventoryRefresh({ source: 'device_update', deviceId: existing.id });

    const updated = await db.queryOne('SELECT * FROM devices WHERE id = $1', [existing.id]);
    res.json(updated);
  } catch (err) {
    console.error('[DEVICES_PUT_ERROR]', err);
    res.status(500).json({ error: 'Erro ao atualizar aparelho: ' + err.message });
  }
});

// -------------------------------------------------------------
// POST /api/devices/:id/reserve - Reservar aparelho
// -------------------------------------------------------------
router.post('/:id/reserve', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const userId = req.user.id || null;
    const userName = req.user.name || req.user.full_name || 'Usuário';

    const existing = await db.queryOne('SELECT * FROM devices WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!existing) return res.status(404).json({ error: 'Aparelho não encontrado.' });

    if (existing.status === 'sold') {
      return res.status(400).json({ error: 'Não é possível reservar um aparelho que já foi vendido.' });
    }
    if (existing.status === 'archived') {
      return res.status(400).json({ error: 'Não é possível reservar um aparelho arquivado.' });
    }

    const reservationNotes = normalizeString(req.body.reservation_notes) || 'Reservado para cliente';
    const nowIso = new Date().toISOString();

    await db.execute(`
      UPDATE devices
      SET
        status = 'reserved',
        reservation_notes = $1,
        reserved_at = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND store_id = $4
    `, [reservationNotes, nowIso, existing.id, storeId]);

    await db.execute(`
      INSERT INTO device_history (
        device_id, store_id, user_id, user_name, action_type, description, details
      ) VALUES ($1, $2, $3, $4, 'reserved', $5, $6)
    `, [
      existing.id,
      storeId,
      userId,
      userName,
      `Aparelho reservado: ${reservationNotes}`,
      JSON.stringify({ reservation_notes: reservationNotes, reserved_at: nowIso })
    ]);

    emitInventoryRefresh({ source: 'device_reserved', deviceId: existing.id });

    const updated = await db.queryOne('SELECT * FROM devices WHERE id = $1', [existing.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao reservar aparelho: ' + err.message });
  }
});

// -------------------------------------------------------------
// POST /api/devices/:id/cancel-reservation - Cancelar reserva
// -------------------------------------------------------------
router.post('/:id/cancel-reservation', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const userId = req.user.id || null;
    const userName = req.user.name || req.user.full_name || 'Usuário';

    const existing = await db.queryOne('SELECT * FROM devices WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!existing) return res.status(404).json({ error: 'Aparelho não encontrado.' });

    if (existing.status !== 'reserved') {
      return res.status(400).json({ error: 'Este aparelho não está reservado.' });
    }

    await db.execute(`
      UPDATE devices
      SET
        status = 'in_stock',
        reservation_notes = NULL,
        reserved_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND store_id = $2
    `, [existing.id, storeId]);

    await db.execute(`
      INSERT INTO device_history (
        device_id, store_id, user_id, user_name, action_type, description, details
      ) VALUES ($1, $2, $3, $4, 'reservation_cancelled', $5, $6)
    `, [
      existing.id,
      storeId,
      userId,
      userName,
      'Reserva cancelada — aparelho devolvido ao estoque disponível',
      JSON.stringify({ previous_reservation: existing.reservation_notes })
    ]);

    emitInventoryRefresh({ source: 'device_reservation_cancelled', deviceId: existing.id });

    const updated = await db.queryOne('SELECT * FROM devices WHERE id = $1', [existing.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao cancelar reserva: ' + err.message });
  }
});

// -------------------------------------------------------------
// POST /api/devices/:id/status - Alterar status (unavailable / in_stock)
// -------------------------------------------------------------
router.post('/:id/status', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const userId = req.user.id || null;
    const userName = req.user.name || req.user.full_name || 'Usuário';

    const existing = await db.queryOne('SELECT * FROM devices WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!existing) return res.status(404).json({ error: 'Aparelho não encontrado.' });

    const newStatus = req.body.status;
    const reason = normalizeString(req.body.reason) || '';

    if (!['in_stock', 'unavailable'].includes(newStatus)) {
      return res.status(400).json({ error: 'Status inválido para esta operação.' });
    }

    await db.execute(`
      UPDATE devices
      SET
        status = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND store_id = $3
    `, [newStatus, existing.id, storeId]);

    const desc = newStatus === 'unavailable'
      ? `Aparelho marcado como indisponível${reason ? `: ${reason}` : ''}`
      : 'Aparelho retornado ao estoque disponível';

    await db.execute(`
      INSERT INTO device_history (
        device_id, store_id, user_id, user_name, action_type, description, details
      ) VALUES ($1, $2, $3, $4, 'status_change', $5, $6)
    `, [
      existing.id,
      storeId,
      userId,
      userName,
      desc,
      JSON.stringify({ previous_status: existing.status, new_status: newStatus, reason })
    ]);

    emitInventoryRefresh({ source: 'device_status_change', deviceId: existing.id });

    const updated = await db.queryOne('SELECT * FROM devices WHERE id = $1', [existing.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alterar status: ' + err.message });
  }
});

// -------------------------------------------------------------
// POST /api/devices/:id/archive - Arquivar aparelho
// -------------------------------------------------------------
router.post('/:id/archive', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const userId = req.user.id || null;
    const userName = req.user.name || req.user.full_name || 'Usuário';

    const existing = await db.queryOne('SELECT * FROM devices WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!existing) return res.status(404).json({ error: 'Aparelho não encontrado.' });

    await db.execute(`
      UPDATE devices
      SET status = 'archived', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND store_id = $2
    `, [existing.id, storeId]);

    await db.execute(`
      INSERT INTO device_history (
        device_id, store_id, user_id, user_name, action_type, description, details
      ) VALUES ($1, $2, $3, $4, 'archived', $5, $6)
    `, [
      existing.id,
      storeId,
      userId,
      userName,
      'Aparelho arquivado',
      JSON.stringify({ previous_status: existing.status })
    ]);

    emitInventoryRefresh({ source: 'device_archived', deviceId: existing.id });

    const updated = await db.queryOne('SELECT * FROM devices WHERE id = $1', [existing.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao arquivar aparelho: ' + err.message });
  }
});

// -------------------------------------------------------------
// POST /api/devices/:id/restore - Restaurar aparelho arquivado
// -------------------------------------------------------------
router.post('/:id/restore', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const userId = req.user.id || null;
    const userName = req.user.name || req.user.full_name || 'Usuário';

    const existing = await db.queryOne('SELECT * FROM devices WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!existing) return res.status(404).json({ error: 'Aparelho não encontrado.' });

    if (existing.status !== 'archived') {
      return res.status(400).json({ error: 'Este aparelho não está arquivado.' });
    }

    await db.execute(`
      UPDATE devices
      SET status = 'in_stock', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND store_id = $2
    `, [existing.id, storeId]);

    await db.execute(`
      INSERT INTO device_history (
        device_id, store_id, user_id, user_name, action_type, description, details
      ) VALUES ($1, $2, $3, $4, 'restored', $5, $6)
    `, [
      existing.id,
      storeId,
      userId,
      userName,
      'Aparelho desarquivado e devolvido ao estoque disponível',
      JSON.stringify({ previous_status: 'archived' })
    ]);

    emitInventoryRefresh({ source: 'device_restored', deviceId: existing.id });

    const updated = await db.queryOne('SELECT * FROM devices WHERE id = $1', [existing.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao restaurar aparelho: ' + err.message });
  }
});

module.exports = router;
