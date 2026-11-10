const express = require('express')
const nodemailer = require('nodemailer')
const db = require('../db/database')
const { authenticate, requireRole } = require('../middleware/auth')
const { getTrustedNowSqlite } = require('../utils/time')
const { emitDashboardRefresh, emitInventoryRefresh } = require('../utils/events')
const { dispatchNotification } = require('../services/notificationService')
const { nextNumber } = require('../services/settings')

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
    return typeof itemsJson === 'string' ? JSON.parse(itemsJson || '[]') : (itemsJson || [])
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

async function ensureCustomerForDeviceSale(payload, storeId = 1) {
  const name = String(payload.customer_name || '').trim()
  if (!name) return null

  const normalizedPhone = String(payload.phone || '').replace(/\D/g, '')

  const existingCustomer = await db.queryOne(`
    SELECT *
    FROM customers
    WHERE store_id = $1 AND (($2 != '' AND phone = $2) OR ($2 != '' AND REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $2))
  `, [storeId, normalizedPhone])

  if (existingCustomer) return existingCustomer

  const customer = await db.queryOne(`
    SELECT *
    FROM customers
    WHERE store_id = $1 AND $2 != '' AND LOWER(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) = LOWER($2)
  `, [storeId, name])

  if (customer) return customer

  const fullName = String(name || '').trim()
  const parts = fullName.split(/\s+/).filter(Boolean)
  const first_name = parts.shift() || 'Cliente'
  const last_name = parts.join(' ') || 'Device Sale'

  const insert = await db.execute(`
    INSERT INTO customers (store_id, first_name, last_name, address, phone, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id
  `, [storeId, first_name, last_name, payload.address || null, payload.phone || null])

  return db.queryOne('SELECT * FROM customers WHERE id = $1 AND store_id = $2', [insert.id, storeId])
}

async function findMatchingStockProduct(productLabel, storeId = 1, client = db) {
  const label = String(productLabel || '').trim().toLowerCase()
  if (!label) return null

  return client.queryOne(`
    SELECT p.id, p.name, p.model, p.code, COALESCE(l.quantity, 0) AS quantity
    FROM stock_products p
    LEFT JOIN stock_levels l ON l.product_id = p.id
    WHERE p.is_active = 1
      AND p.store_id = $1
      AND (
        LOWER(COALESCE(p.name, '')) = $2
        OR LOWER(COALESCE(p.model, '')) = $2
        OR LOWER(COALESCE(p.name, '')) LIKE $3
        OR LOWER(COALESCE(p.model, '')) LIKE $3
        OR LOWER(COALESCE(p.code, '')) LIKE $3
      )
    ORDER BY CASE
      WHEN LOWER(COALESCE(p.name, '')) = $2 THEN 0
      WHEN LOWER(COALESCE(p.model, '')) = $2 THEN 1
      ELSE 2
    END, p.id ASC
    LIMIT 1
  `, [storeId, label, `%${label}%`])
}

async function createOrUpdateStoreSaleReference({ deviceSaleId, paymentMethod, totalAmount, saleDate, items, userId, trustedNow, storeId = 1 }) {
  const notes = `device_sale:${deviceSaleId}`
  const existingStoreSale = await db.queryOne('SELECT * FROM store_sales WHERE notes = $1 AND store_id = $2', [notes, storeId])

  const itemRows = []
  for (const item of (Array.isArray(items) ? items : [])) {
    const product = await findMatchingStockProduct(String(item.product || '').trim(), storeId)
    const quantity = Number(item.quantity) || 0
    const unitPrice = Number(item.unit_price) || 0
    const subtotal = quantity * unitPrice

    if (!product || quantity <= 0) continue

    itemRows.push({
      product_id: product.id,
      product_name: String(product.name || item.product || '').trim() || 'Aparelho',
      product_code: String(product.code || ''),
      quantity,
      unit_price: unitPrice,
      subtotal,
    })
  }

  if (existingStoreSale) {
    const subtotal = itemRows.reduce((sum, item) => sum + item.subtotal, 0)

    await db.execute(`
      UPDATE store_sales SET
        subtotal = $1,
        total_amount = $2,
        payment_method = $3,
        notes = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 AND store_id = $6
    `, [subtotal, totalAmount, paymentMethod, notes, existingStoreSale.id, storeId])

    await db.execute('DELETE FROM store_sale_items WHERE sale_id = $1', [existingStoreSale.id])

    for (const item of itemRows) {
      await db.execute(`
        INSERT INTO store_sale_items (store_id, sale_id, product_id, product_name, product_code, cost_price, unit_price, quantity, subtotal, is_canceled)
        VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, 0)
      `, [storeId, existingStoreSale.id, item.product_id, item.product_name, item.product_code, item.unit_price, item.quantity, item.subtotal])
    }

    return existingStoreSale.id
  }

  const saleNumber = await nextNumber('sale', storeId)
  const saleInfo = await db.execute(`
    INSERT INTO store_sales (
      store_id, sale_number, subtotal, discount_type, discount_value, discount_amount,
      total_amount, payment_method, notes, is_canceled, created_by, created_at
    ) VALUES ($1, $2, $3, NULL, 0, 0, $4, $5, $6, 0, $7, $8)
    RETURNING id
  `, [
    storeId,
    saleNumber,
    totalAmount,
    totalAmount,
    paymentMethod,
    notes,
    userId,
    trustedNow
  ])

  for (const item of itemRows) {
    await db.execute(`
      INSERT INTO store_sale_items (
        store_id, sale_id, product_id, product_name, product_code, cost_price, unit_price, quantity, subtotal, is_canceled
      ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, 0)
    `, [storeId, saleInfo.id, item.product_id, item.product_name, item.product_code, item.unit_price, item.quantity, item.subtotal])
  }

  return saleInfo.id
}

async function syncRelatedStockAdjustments({ items, deviceSaleId, userId, trustedNow, storeId = 1 }) {
  await db.transaction(async (tx) => {
    const previousMovements = await tx.query(`
      SELECT * FROM stock_movements
      WHERE reference_type = 'device_sale' AND reference_id = $1 AND store_id = $2
      ORDER BY id ASC
    `, [deviceSaleId, storeId])

    for (const movement of previousMovements) {
      const level = await tx.queryOne('SELECT quantity FROM stock_levels WHERE product_id = $1', [movement.product_id])
      if (!level) continue

      const previousQuantity = Number(level.quantity) || 0
      const restoredQuantity = previousQuantity - (Number(movement.quantity_delta) || 0)
      await tx.execute('UPDATE stock_levels SET quantity = $1, updated_at = $2 WHERE product_id = $3', [restoredQuantity, trustedNow, movement.product_id])
      await tx.execute(`
        INSERT INTO stock_movements (
          store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity,
          reason, reference_type, reference_id, user_id, user_name, created_at
        ) VALUES ($1, $2, 'adjustment', $3, $4, $5, $6, 'device_sale_reversal', $7, $8, $9, $10)
      `, [
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
      ])
    }

    if (previousMovements.length) {
      await tx.execute("DELETE FROM stock_movements WHERE reference_type = 'device_sale' AND reference_id = $1 AND store_id = $2", [deviceSaleId, storeId])
    }

    const quantitiesByProduct = new Map()
    for (const item of items || []) {
      const product = await findMatchingStockProduct(item.product, storeId, tx)
      if (!product) continue
      quantitiesByProduct.set(product.id, {
        product,
        quantity: (quantitiesByProduct.get(product.id)?.quantity || 0) + (Number(item.quantity) || 0),
      })
    }

    for (const { product, quantity } of quantitiesByProduct.values()) {
      if (quantity <= 0) continue
      const level = await tx.queryOne('SELECT quantity FROM stock_levels WHERE product_id = $1', [product.id])
      const previousQuantity = Number(level?.quantity) || 0
      if (quantity > previousQuantity) {
        const error = new Error(`Estoque insuficiente para ${product.name}.`)
        error.statusCode = 400
        throw error
      }

      const newQuantity = previousQuantity - quantity
      await tx.execute('UPDATE stock_levels SET quantity = $1, updated_at = $2 WHERE product_id = $3', [newQuantity, trustedNow, product.id])
      await tx.execute(`
        INSERT INTO stock_movements (
          store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity,
          reason, reference_type, reference_id, user_id, user_name, created_at
        ) VALUES ($1, $2, 'sale', $3, $4, $5, $6, 'device_sale', $7, $8, $9, $10)
      `, [
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
      ])
    }
  })
}

async function getSaleById(id, storeId = 1) {
  const sale = await db.queryOne(`
    SELECT ds.*, c.first_name, c.last_name
    FROM device_sales ds
    LEFT JOIN customers c ON c.id = ds.customer_id
    WHERE ds.id = $1 AND ds.store_id = $2
  `, [id, storeId])

  if (!sale) return null
  return { ...sale, items: parseItems(sale.items_json) }
}

router.get('/', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1
    const { q } = req.query
    let sql = `
      SELECT ds.*, c.first_name, c.last_name
      FROM device_sales ds
      LEFT JOIN customers c ON c.id = ds.customer_id
      WHERE ds.store_id = $1
    `
    const params = [storeId]
    let paramIndex = 2
    if (q) {
      const like = `%${q}%`
      sql += ` AND (ds.order_number ILIKE $${paramIndex} OR ds.customer_name ILIKE $${paramIndex} OR ds.customer_cpf_cnpj ILIKE $${paramIndex} OR ds.phone ILIKE $${paramIndex} OR ds.email ILIKE $${paramIndex} OR ds.seller_name ILIKE $${paramIndex})`
      params.push(like)
      paramIndex++
    }
    sql += ' ORDER BY ds.sale_date DESC, ds.id DESC LIMIT 200'

    const rows = await db.query(sql, ...params)
    const sales = rows.map((sale) => ({ ...sale, items: parseItems(sale.items_json) }))
    res.json(sales)
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar vendas de aparelhos: ' + err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1
    const sale = await getSaleById(req.params.id, storeId)
    if (!sale) return res.status(404).json({ error: 'Venda não encontrada.' })
    res.json(sale)
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar venda: ' + err.message })
  }
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
  const customer = await ensureCustomerForDeviceSale(normalizedPayload, storeId)
  if (!customer) {
    const error = new Error('Não foi possível registrar o cliente da venda.')
    error.statusCode = 400
    throw error
  }

  const paymentMethod = mapPaymentMethod(normalizedPayload.payment_method)
  const saleRecord = existing || {}
  const deviceSaleId = Number(existing?.id || saleRecord.id || 0)

  if (deviceSaleId) {
    await db.execute(`
      UPDATE device_sales SET
        customer_id = $1, sale_date = $2, seller_name = $3, customer_name = $4, customer_cpf_cnpj = $5, address = $6,
        city = $7, state = $8, cep = $9, phone = $10, email = $11, horario = $12, payment_method = $13, notes = $14,
        items_json = $15, total_amount = $16, updated_at = CURRENT_TIMESTAMP
      WHERE id = $17 AND store_id = $18
    `, [
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
    ])
  } else {
    const orderNumber = await nextNumber('device', storeId)
    const info = await db.execute(`
      INSERT INTO device_sales (
        store_id, order_number, customer_id, sale_date, seller_name, customer_name, customer_cpf_cnpj, address,
        city, state, cep, phone, email, horario, payment_method, notes, items_json, total_amount, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id
    `, [
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
    ])

    const created = await getSaleById(info.id, storeId)
    const storeSaleId = await createOrUpdateStoreSaleReference({
      deviceSaleId: info.id,
      paymentMethod,
      totalAmount: Number(normalizedPayload.total_amount),
      saleDate: normalizedPayload.sale_date,
      items: normalizedPayload.items,
      userId: user.id,
      trustedNow,
      storeId,
    })

    await syncRelatedStockAdjustments({ items: normalizedPayload.items, deviceSaleId: info.id, userId: user.id, trustedNow, storeId })

    emitDashboardRefresh({ source: 'device_sale', saleId: info.id, saleNumber: created.order_number })
    emitInventoryRefresh({ source: 'device_sale', saleId: info.id, saleNumber: created.order_number, storeSaleId })

    dispatchNotification({
      storeId,
      actorId: user.id,
      eventKey: 'sale_device_completed',
      title: `Aparelho Vendido — ${created.order_number}`,
      description: `Venda de aparelho ${created.brand || ''} ${created.model || ''} para ${created.customer_name || 'Cliente'}.`,
      link: `/venda-aparelho/${info.id}`,
      metadata: { saleId: info.id, saleNumber: created.order_number }
    }).catch(err => console.error('[NOTIF_ERROR]', err.message));
    return created
  }

  const updatedSale = await getSaleById(deviceSaleId, storeId)
  const storeSaleId = await createOrUpdateStoreSaleReference({
    deviceSaleId,
    paymentMethod,
    totalAmount: Number(normalizedPayload.total_amount),
    saleDate: normalizedPayload.sale_date,
    items: normalizedPayload.items,
    userId: user.id,
    trustedNow,
    storeId,
  })

  await syncRelatedStockAdjustments({ items: normalizedPayload.items, deviceSaleId, userId: user.id, trustedNow, storeId })

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
    const existing = await getSaleById(req.params.id, storeId)
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
    const existing = await getSaleById(req.params.id, storeId)
    if (!existing) return res.status(404).json({ error: 'Venda não encontrada.' })

    const trustedNow = await getTrustedNowSqlite()
    await syncRelatedStockAdjustments({ items: [], deviceSaleId: existing.id, userId: req.user.id, trustedNow, storeId })
    await db.execute(`
      UPDATE store_sales
      SET is_canceled = 1, canceled_at = $1, canceled_by = $2, cancel_reason = $3
      WHERE notes = $4 AND store_id = $5
    `, [trustedNow, req.user.id, 'Venda de aparelho excluída', `device_sale:${existing.id}`, storeId])
    await db.execute('DELETE FROM device_sales WHERE id = $1 AND store_id = $2', [existing.id, storeId])
    emitDashboardRefresh({ source: 'device_sale_delete', saleId: existing.id, saleNumber: existing.order_number })
    emitInventoryRefresh({ source: 'device_sale_delete', saleId: existing.id, saleNumber: existing.order_number })
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

router.persistDeviceSale = persistDeviceSale
module.exports = router
