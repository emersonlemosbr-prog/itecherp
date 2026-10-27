const express = require('express')
const nodemailer = require('nodemailer')
const db = require('../db/database')
const { authenticate, requireRole } = require('../middleware/auth')
const { getTrustedNowSqlite } = require('../utils/time')
const { emitDashboardRefresh, emitInventoryRefresh } = require('../utils/events')

const router = express.Router()
router.use(authenticate)

function getMailTransport() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_SECURE,
    SMTP_FROM,
  } = process.env

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    return null
  }

  return {
    transporter: nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: String(SMTP_SECURE || '').toLowerCase() === 'true',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    }),
    from: SMTP_FROM,
  }
}

function parseItems(itemsJson) {
  try {
    return JSON.parse(itemsJson || '[]')
  } catch {
    return []
  }
}

function normalizeItem(item, index) {
  const quantity = Number(item.quantity) || 0
  const unitPrice = Number(item.unit_price) || 0
  const subtotal = Number(item.subtotal) || quantity * unitPrice

  return {
    item: item.item || String(index + 1),
    product: item.product || '',
    quantity,
    unit_price: unitPrice,
    subtotal,
  }
}

function normalizeSale(body, existing = {}) {
  const items = (Array.isArray(body.items) ? body.items : []).map(normalizeItem)
  const total_amount = items.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0)

  return {
    customer_id: body.customer_id ? Number(body.customer_id) : existing.customer_id || null,
    sale_date: body.sale_date || existing.sale_date || new Date().toISOString().slice(0, 10),
    seller_name: body.seller_name ?? existing.seller_name ?? '',
    customer_name: body.customer_name ?? existing.customer_name ?? '',
    customer_cpf_cnpj: body.customer_cpf_cnpj ?? existing.customer_cpf_cnpj ?? '',
    address: body.address ?? existing.address ?? '',
    city: body.city ?? existing.city ?? '',
    state: body.state ?? existing.state ?? '',
    cep: body.cep ?? existing.cep ?? '',
    phone: body.phone ?? existing.phone ?? '',
    email: body.email ?? existing.email ?? '',
    horario: body.horario ?? existing.horario ?? '',
    payment_method: body.payment_method ?? existing.payment_method ?? '',
    notes: body.notes ?? existing.notes ?? '',
    items,
    total_amount,
  }
}

function mapPaymentMethod(method) {
  const normalized = String(method || '').trim().toLowerCase()
  const aliases = {
    cash: ['cash', 'dinheiro', 'money'],
    pix: ['pix'],
    debit_card: ['debit_card', 'debito', 'cartão de débito', 'cartao de debito', 'cartao debito', 'cartão débito'],
    credit_card: ['credit_card', 'credito', 'crédito', 'cartão de crédito', 'cartao de credito', 'cartao credito', 'cartão crédito'],
  }

  for (const [finalMethod, values] of Object.entries(aliases)) {
    if (values.includes(normalized)) return finalMethod
  }

  if (normalized.includes('pix')) return 'pix'
  if (normalized.includes('deb')) return 'debit_card'
  if (normalized.includes('cred') || normalized.includes('cartao') || normalized.includes('cartão')) return 'credit_card'
  return 'cash'
}

function generateStoreSaleNumber(storeId) { return require('../services/settings').nextNumber('sale', storeId); }

function ensureCustomerForDeviceSale(payload, storeId = 1) {
  const name = String(payload.customer_name || '').trim()
  if (!name) return null

  const normalizedPhone = String(payload.phone || '').replace(/\D/g, '')
  const normalizedCpf = String(payload.customer_cpf_cnpj || '').replace(/\D/g, '')

  const existingCustomer = db.prepare(`
    SELECT *
    FROM customers
    WHERE store_id = ? AND ((? != '' AND phone = ?) OR (? != '' AND REPLACE(REPLACE(REPLACE(phone, '(', ''), ')', ''), ' ', '') = ?))
  `).get(
    storeId,
    normalizedPhone,
    normalizedPhone,
    normalizedPhone,
    normalizedPhone,
  )

  if (existingCustomer) return existingCustomer

  const customer = db.prepare(`
    SELECT *
    FROM customers
    WHERE store_id = ? AND ? != '' AND LOWER(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) = LOWER(?)
  `).get(storeId, name, name)

  if (customer) return customer

  const fullName = String(name || '').trim()
  const parts = fullName.split(/\s+/).filter(Boolean)
  const first_name = parts.shift() || 'Cliente'
  const last_name = parts.join(' ') || 'Device Sale'

  const insert = db.prepare(`
    INSERT INTO customers (store_id, first_name, last_name, address, phone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(storeId, first_name, last_name, payload.address || null, payload.phone || null)

  return db.prepare('SELECT * FROM customers WHERE id = ? AND store_id = ?').get(insert.lastInsertRowid, storeId)
}

function findMatchingStockProduct(productLabel, storeId = 1) {
  const label = String(productLabel || '').trim().toLowerCase()
  if (!label) return null

  return db.prepare(`
    SELECT p.id, p.name, p.model, p.code, COALESCE(l.quantity, 0) AS quantity
    FROM stock_products p
    LEFT JOIN stock_levels l ON l.product_id = p.id
    WHERE p.is_active = 1
      AND p.store_id = ?
      AND (
        LOWER(COALESCE(p.name, '')) = ?
        OR LOWER(COALESCE(p.model, '')) = ?
        OR LOWER(COALESCE(p.name, '')) LIKE ?
        OR LOWER(COALESCE(p.model, '')) LIKE ?
        OR LOWER(COALESCE(p.code, '')) LIKE ?
      )
    ORDER BY CASE
      WHEN LOWER(COALESCE(p.name, '')) = ? THEN 0
      WHEN LOWER(COALESCE(p.model, '')) = ? THEN 1
      ELSE 2
    END, p.id ASC
    LIMIT 1
  `).get(
    storeId,
    label,
    label,
    `%${label}%`,
    `%${label}%`,
    `%${label}%`,
    label,
    label
  )
}

function createOrUpdateStoreSaleReference({ deviceSaleId, paymentMethod, totalAmount, saleDate, items, userId, trustedNow, createdByCustomerName, storeId = 1 }) {
  const notes = `device_sale:${deviceSaleId}`
  const existingStoreSale = db.prepare('SELECT * FROM store_sales WHERE notes = ? AND store_id = ?').get(notes, storeId)

  const itemRows = (Array.isArray(items) ? items : [])
    .map((item) => {
      const product = findMatchingStockProduct(String(item.product || '').trim(), storeId)
      const quantity = Number(item.quantity) || 0
      const unitPrice = Number(item.unit_price) || 0
      const subtotal = quantity * unitPrice

      if (!product || quantity <= 0) return null

      return {
        product_id: product.id,
        product_name: String(product.name || item.product || '').trim() || 'Aparelho',
        product_code: String(product.code || ''),
        quantity,
        unit_price: unitPrice,
        subtotal,
      }
    })
    .filter(Boolean)

  if (existingStoreSale) {
    const subtotal = itemRows.reduce((sum, item) => sum + item.subtotal, 0)

    db.prepare(`
      UPDATE store_sales SET
        subtotal = ?,
        total_amount = ?,
        payment_method = ?,
        notes = ?,
        updated_at = datetime('now')
      WHERE id = ? AND store_id = ?
    `).run(subtotal, totalAmount, paymentMethod, notes, existingStoreSale.id, storeId)

    db.prepare('DELETE FROM store_sale_items WHERE sale_id = ?').run(existingStoreSale.id)

    for (const item of itemRows) {
      db.prepare(`
        INSERT INTO store_sale_items (store_id, sale_id, product_id, product_name, product_code, cost_price, unit_price, quantity, subtotal, is_canceled)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 0)
      `).run(storeId, existingStoreSale.id, item.product_id, item.product_name, item.product_code, item.unit_price, item.quantity, item.subtotal)
    }

    return existingStoreSale.id
  }

  const saleNumber = generateStoreSaleNumber(storeId)
  const saleInfo = db.prepare(`
    INSERT INTO store_sales (
      store_id, sale_number, subtotal, discount_type, discount_value, discount_amount,
      total_amount, payment_method, notes, is_canceled, created_by, created_at
    ) VALUES (?, ?, ?, NULL, 0, 0, ?, ?, ?, 0, ?, ?)
  `).run(
    storeId,
    saleNumber,
    totalAmount,
    totalAmount,
    paymentMethod,
    notes,
    userId,
    trustedNow
  )

  for (const item of itemRows) {
    db.prepare(`
      INSERT INTO store_sale_items (
        store_id, sale_id, product_id, product_name, product_code, cost_price, unit_price, quantity, subtotal, is_canceled
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 0)
    `).run(storeId, saleInfo.lastInsertRowid, item.product_id, item.product_name, item.product_code, item.unit_price, item.quantity, item.subtotal)
  }

  return saleInfo.lastInsertRowid
}

function syncRelatedStockAdjustments({ items, deviceSaleId, userId, trustedNow, storeId = 1 }) {
  const sync = db.transaction(() => {
    const previousMovements = db.prepare(`
      SELECT * FROM stock_movements
      WHERE reference_type = 'device_sale' AND reference_id = ? AND store_id = ?
      ORDER BY id ASC
    `).all(deviceSaleId, storeId)

    for (const movement of previousMovements) {
      const level = db.prepare('SELECT quantity FROM stock_levels WHERE product_id = ?').get(movement.product_id)
      if (!level) continue

      const previousQuantity = Number(level.quantity) || 0
      const restoredQuantity = previousQuantity - (Number(movement.quantity_delta) || 0)
      db.prepare('UPDATE stock_levels SET quantity = ?, updated_at = ? WHERE product_id = ?')
        .run(restoredQuantity, trustedNow, movement.product_id)
      db.prepare(`
        INSERT INTO stock_movements (
          store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity,
          reason, reference_type, reference_id, user_id, user_name, created_at
        ) VALUES (?, ?, 'adjustment', ?, ?, ?, ?, 'device_sale_reversal', ?, ?, ?, ?)
      `).run(
        storeId,
        movement.product_id,
        restoredQuantity - previousQuantity,
        previousQuantity,
        restoredQuantity,
        `Estorno da venda de aparelho ${deviceSaleId}`,
        movement.id,
        userId,
        'Sistema',
        trustedNow
      )
    }

    if (previousMovements.length) {
      db.prepare("DELETE FROM stock_movements WHERE reference_type = 'device_sale' AND reference_id = ? AND store_id = ?").run(deviceSaleId, storeId)
    }

    const quantitiesByProduct = new Map()
    for (const item of items || []) {
      const product = findMatchingStockProduct(item.product, storeId)
      if (!product) continue
      quantitiesByProduct.set(product.id, {
        product,
        quantity: (quantitiesByProduct.get(product.id)?.quantity || 0) + (Number(item.quantity) || 0),
      })
    }

    for (const { product, quantity } of quantitiesByProduct.values()) {
      if (quantity <= 0) continue
      const level = db.prepare('SELECT quantity FROM stock_levels WHERE product_id = ?').get(product.id)
      const previousQuantity = Number(level?.quantity) || 0
      if (quantity > previousQuantity) {
        const error = new Error(`Estoque insuficiente para ${product.name}.`)
        error.statusCode = 400
        throw error
      }

      const newQuantity = previousQuantity - quantity
      db.prepare('UPDATE stock_levels SET quantity = ?, updated_at = ? WHERE product_id = ?')
        .run(newQuantity, trustedNow, product.id)
      db.prepare(`
        INSERT INTO stock_movements (
          store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity,
          reason, reference_type, reference_id, user_id, user_name, created_at
        ) VALUES (?, ?, 'sale', ?, ?, ?, ?, 'device_sale', ?, ?, ?, ?)
      `).run(
        storeId,
        product.id,
        -quantity,
        previousQuantity,
        newQuantity,
        `Venda de aparelho ${deviceSaleId}`,
        deviceSaleId,
        userId,
        'Sistema',
        trustedNow
      )
    }
  })

  sync()
}

function nextOrderNumber(storeId) { return require('../services/settings').nextNumber('device', storeId); }

function getSaleById(id, storeId = 1) {
  const sale = db.prepare(`
    SELECT ds.*, c.first_name, c.last_name
    FROM device_sales ds
    LEFT JOIN customers c ON c.id = ds.customer_id
    WHERE ds.id = ? AND ds.store_id = ?
  `).get(id, storeId)

  if (!sale) return null
  return { ...sale, items: parseItems(sale.items_json) }
}

router.get('/', (req, res) => {
  const storeId = req.user.store_id || 1
  const { q } = req.query
  let sql = `
    SELECT ds.*, c.first_name, c.last_name
    FROM device_sales ds
    LEFT JOIN customers c ON c.id = ds.customer_id
    WHERE ds.store_id = ?
  `
  const params = [storeId]
  if (q) {
    const like = `%${q}%`
    sql += ` AND (ds.order_number LIKE ? OR ds.customer_name LIKE ? OR ds.customer_cpf_cnpj LIKE ? OR ds.phone LIKE ? OR ds.email LIKE ? OR ds.seller_name LIKE ?)`
    params.push(like, like, like, like, like, like)
  }
  sql += ' ORDER BY ds.sale_date DESC, ds.id DESC LIMIT 200'

  const sales = db.prepare(sql).all(...params).map((sale) => ({ ...sale, items: parseItems(sale.items_json) }))
  res.json(sales)
})

router.get('/:id', (req, res) => {
  const storeId = req.user.store_id || 1
  const sale = getSaleById(req.params.id, storeId)
  if (!sale) return res.status(404).json({ error: 'Venda não encontrada.' })
  res.json(sale)
})

router.post('/email', async (req, res) => {
  const { to, subject, text, fileName, pdfBase64 } = req.body || {}
  if (!to || !pdfBase64) {
    return res.status(400).json({ error: 'Destinatário e PDF são obrigatórios.' })
  }

  const mail = getMailTransport()
  if (!mail) {
    return res.status(400).json({ error: 'SMTP não configurado no servidor.' })
  }

  try {
    const base64 = String(pdfBase64).replace(/^data:application\/pdf;base64,/, '')
    const attachmentBuffer = Buffer.from(base64, 'base64')

    await mail.transporter.sendMail({
      from: mail.from,
      to,
      subject: subject || 'Venda de Aparelho',
      text: text || 'Segue em anexo o documento da venda de aparelho.',
      attachments: [
        {
          filename: fileName || 'venda-aparelho.pdf',
          content: attachmentBuffer,
          contentType: 'application/pdf',
        },
      ],
    })

    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('Erro ao enviar e-mail de venda de aparelho:', error)
    return res.status(500).json({ error: 'Falha ao enviar e-mail.' })
  }
})

async function persistDeviceSale({ user, payload, existing = null }) {
  const storeId = user.store_id || 1
  const normalizedPayload = normalizeSale(payload, existing || {})

  if (!normalizedPayload.customer_name || !normalizedPayload.customer_name.trim()) {
    const error = new Error('O nome do cliente é obrigatório.')
    error.statusCode = 400
    throw error
  }

  if (!Array.isArray(normalizedPayload.items) || normalizedPayload.items.length === 0) {
    const error = new Error('Adicione pelo menos um aparelho para salvar a venda.')
    error.statusCode = 400
    throw error
  }

  if (!normalizedPayload.total_amount || Number(normalizedPayload.total_amount) <= 0) {
    const error = new Error('O valor total da venda deve ser maior que zero.')
    error.statusCode = 400
    throw error
  }

  const trustedNow = await getTrustedNowSqlite()
  const customer = ensureCustomerForDeviceSale(normalizedPayload, storeId)
  if (!customer) {
    const error = new Error('Não foi possível registrar o cliente da venda.')
    error.statusCode = 400
    throw error
  }

  const paymentMethod = mapPaymentMethod(normalizedPayload.payment_method)
  const saleRecord = existing || {}
  const deviceSaleId = Number(existing?.id || saleRecord.id || 0)

  if (deviceSaleId) {
    db.prepare(`
      UPDATE device_sales SET
        customer_id = ?, sale_date = ?, seller_name = ?, customer_name = ?, customer_cpf_cnpj = ?, address = ?,
        city = ?, state = ?, cep = ?, phone = ?, email = ?, horario = ?, payment_method = ?, notes = ?,
        items_json = ?, total_amount = ?, updated_at = datetime('now')
      WHERE id = ? AND store_id = ?
    `).run(
      customer.id,
      normalizedPayload.sale_date,
      normalizedPayload.seller_name,
      normalizedPayload.customer_name,
      normalizedPayload.customer_cpf_cnpj,
      normalizedPayload.address,
      normalizedPayload.city,
      normalizedPayload.state,
      normalizedPayload.cep,
      normalizedPayload.phone,
      normalizedPayload.email,
      normalizedPayload.horario,
      paymentMethod,
      normalizedPayload.notes,
      JSON.stringify(normalizedPayload.items),
      normalizedPayload.total_amount,
      deviceSaleId,
      storeId
    )
  } else {
    const orderNumber = nextOrderNumber(storeId)
    const info = db.prepare(`
      INSERT INTO device_sales (
        store_id, order_number, customer_id, sale_date, seller_name, customer_name, customer_cpf_cnpj, address,
        city, state, cep, phone, email, horario, payment_method, notes, items_json, total_amount, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      storeId,
      orderNumber,
      customer.id,
      normalizedPayload.sale_date,
      normalizedPayload.seller_name,
      normalizedPayload.customer_name,
      normalizedPayload.customer_cpf_cnpj,
      normalizedPayload.address,
      normalizedPayload.city,
      normalizedPayload.state,
      normalizedPayload.cep,
      normalizedPayload.phone,
      normalizedPayload.email,
      normalizedPayload.horario,
      paymentMethod,
      normalizedPayload.notes,
      JSON.stringify(normalizedPayload.items),
      normalizedPayload.total_amount,
      user.id
    )

    const created = getSaleById(info.lastInsertRowid, storeId)
    const storeSaleId = createOrUpdateStoreSaleReference({
      deviceSaleId: info.lastInsertRowid,
      paymentMethod,
      totalAmount: Number(normalizedPayload.total_amount),
      saleDate: normalizedPayload.sale_date,
      items: normalizedPayload.items,
      userId: user.id,
      trustedNow,
      storeId,
    })

    syncRelatedStockAdjustments({ items: normalizedPayload.items, deviceSaleId: info.lastInsertRowid, userId: user.id, trustedNow, storeId })

    emitDashboardRefresh({ source: 'device_sale', saleId: info.lastInsertRowid, saleNumber: created.order_number })
    emitInventoryRefresh({ source: 'device_sale', saleId: info.lastInsertRowid, saleNumber: created.order_number, storeSaleId })
    return created
  }

  const updatedSale = getSaleById(deviceSaleId, storeId)
  const storeSaleId = createOrUpdateStoreSaleReference({
    deviceSaleId,
    paymentMethod,
    totalAmount: Number(normalizedPayload.total_amount),
    saleDate: normalizedPayload.sale_date,
    items: normalizedPayload.items,
    userId: user.id,
    trustedNow,
    storeId,
  })

  syncRelatedStockAdjustments({ items: normalizedPayload.items, deviceSaleId, userId: user.id, trustedNow, storeId })

  emitDashboardRefresh({ source: 'device_sale_update', saleId: deviceSaleId, saleNumber: updatedSale.order_number })
  emitInventoryRefresh({ source: 'device_sale_update', saleId: deviceSaleId, saleNumber: updatedSale.order_number, storeSaleId })
  return updatedSale
}

router.post('/', async (req, res, next) => {
  try {
    const saved = await persistDeviceSale({ user: req.user, payload: req.body })
    res.status(201).json(saved)
  } catch (error) {
    next(error)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1
    const existing = getSaleById(req.params.id, storeId)
    if (!existing) return res.status(404).json({ error: 'Venda não encontrada.' })

    const saved = await persistDeviceSale({ user: req.user, payload: req.body, existing })
    res.json(saved)
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1
    const existing = getSaleById(req.params.id, storeId)
    if (!existing) return res.status(404).json({ error: 'Venda não encontrada.' })

    const trustedNow = await getTrustedNowSqlite()
    syncRelatedStockAdjustments({ items: [], deviceSaleId: existing.id, userId: req.user.id, trustedNow, storeId })
    db.prepare(`
      UPDATE store_sales
      SET is_canceled = 1, canceled_at = ?, canceled_by = ?, cancel_reason = ?
      WHERE notes = ? AND store_id = ?
    `).run(trustedNow, req.user.id, 'Venda de aparelho excluída', `device_sale:${existing.id}`, storeId)
    db.prepare('DELETE FROM device_sales WHERE id = ? AND store_id = ?').run(existing.id, storeId)
    emitDashboardRefresh({ source: 'device_sale_delete', saleId: existing.id, saleNumber: existing.order_number })
    emitInventoryRefresh({ source: 'device_sale_delete', saleId: existing.id, saleNumber: existing.order_number })
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

router.persistDeviceSale = persistDeviceSale
module.exports = router
