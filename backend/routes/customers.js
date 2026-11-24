// routes/customers.js
const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { dispatchNotification } = require('../services/notificationService');
const { cleanDigits, isValidCPF } = require('../utils/validators');

const router = express.Router();
router.use(authenticate);

/**
 * Normaliza campos de endereço concatenando em string para compatibilidade retroativa
 */
function buildLegacyAddress({ street, number, complement, neighborhood, city, state, postal_code, address }) {
  if (street || number || city) {
    const parts = [
      street ? (number ? `${street}, ${number}` : street) : '',
      complement ? `(${complement})` : '',
      neighborhood || '',
      city ? (state ? `${city} - ${state}` : city) : '',
      postal_code ? `CEP: ${postal_code}` : ''
    ].filter(Boolean);
    return parts.join(', ');
  }
  return address || null;
}

// 1. Verificação prévia de duplicidade (Nome, Telefone, CPF)
router.get('/check-duplicate', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const { name, phone, cpf, exclude_id } = req.query;

    const cleanCpfVal = cleanDigits(cpf);
    const cleanPhoneVal = cleanDigits(phone);
    const trimmedName = String(name || '').trim();

    if (!cleanCpfVal && !cleanPhoneVal && !trimmedName) {
      return res.json({ found: false, matches: [] });
    }

    let sql = `
      SELECT id, first_name, last_name, phone, cpf, email, created_at
      FROM customers
      WHERE store_id = $1 AND is_system = 0
    `;
    const params = [storeId];
    let paramIndex = 2;

    if (exclude_id) {
      sql += ` AND id != $${paramIndex++}`;
      params.push(exclude_id);
    }

    const conditions = [];
    if (cleanCpfVal && cleanCpfVal.length >= 11) {
      conditions.push(`REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = $${paramIndex++}`);
      params.push(cleanCpfVal);
    }
    if (cleanPhoneVal && cleanPhoneVal.length >= 8) {
      conditions.push(`REPLACE(REPLACE(REPLACE(REPLACE(phone, '(', ''), ')', ''), '-', ''), ' ', '') LIKE $${paramIndex++}`);
      params.push(`%${cleanPhoneVal.slice(-8)}%`);
    }
    if (trimmedName && trimmedName.length >= 3) {
      conditions.push(`LOWER(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))) = LOWER($${paramIndex++})`);
      params.push(trimmedName);
    }

    if (conditions.length === 0) {
      return res.json({ found: false, matches: [] });
    }

    sql += ` AND (${conditions.join(' OR ')}) LIMIT 5`;

    const rows = await db.query(sql, ...params);
    res.json({
      found: rows.length > 0,
      matches: rows
    });
  } catch (err) {
    next(err);
  }
});

// 2. Listar / buscar (Busca inteligente com filtros e paginação)
router.get('/', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const { q, page, limit = 50, sort_by = 'first_name', sort_order = 'asc' } = req.query;

    let sql = `
      SELECT id, store_id, first_name, last_name, phone, phone_secondary, email, cpf,
             address, postal_code, street, number, complement, neighborhood, city, state,
             birth_date, notes, created_at, updated_at
      FROM customers
      WHERE store_id = $1 AND is_system = 0
    `;
    const params = [storeId];
    let paramIndex = 2;

    if (q) {
      const rawQ = String(q).trim();
      const digitsQ = cleanDigits(rawQ);
      const isIdQuery = /^\d+$/.test(rawQ) && rawQ.length <= 8;

      const subClauses = [];

      // A. ID exato do cliente
      if (isIdQuery) {
        subClauses.push(`id = $${paramIndex++}`);
        params.push(Number(rawQ));
      }

      // B. Nome completo ou termos de nome
      const nameTerms = rawQ.toLowerCase().split(/\s+/).filter(Boolean);
      if (nameTerms.length > 0) {
        const nameConditions = nameTerms.map(term => {
          params.push(`%${term}%`);
          return `(LOWER(first_name) LIKE $${paramIndex++} OR LOWER(last_name) LIKE $${paramIndex++})`;
        });
        subClauses.push(`(${nameConditions.join(' AND ')})`);
      }

      // C. Telefone (com ou sem máscara)
      if (digitsQ.length >= 4) {
        subClauses.push(`(REPLACE(REPLACE(REPLACE(REPLACE(phone, '(', ''), ')', ''), '-', ''), ' ', '') LIKE $${paramIndex++} OR REPLACE(REPLACE(REPLACE(REPLACE(phone_secondary, '(', ''), ')', ''), '-', ''), ' ', '') LIKE $${paramIndex++})`);
        params.push(`%${digitsQ}%`, `%${digitsQ}%`);
      }

      // D. CPF (com ou sem máscara)
      if (digitsQ.length >= 4) {
        subClauses.push(`REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') LIKE $${paramIndex++}`);
        params.push(`%${digitsQ}%`);
      }

      // E. E-mail
      if (rawQ.includes('@') || rawQ.length >= 3) {
        subClauses.push(`LOWER(email) LIKE $${paramIndex++}`);
        params.push(`%${rawQ.toLowerCase()}%`);
      }

      if (subClauses.length > 0) {
        sql += ` AND (${subClauses.join(' OR ')})`;
      }
    }

    // Ordenação segura
    const allowedSort = {
      first_name: 'LOWER(first_name)',
      created_at: 'created_at',
      id: 'id'
    };
    const orderColumn = allowedSort[sort_by] || 'LOWER(first_name)';
    const orderDirection = String(sort_order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    sql += ` ORDER BY ${orderColumn} ${orderDirection}, id DESC`;

    // Paginação opcional
    if (page) {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
      const offset = (pageNum - 1) * limitNum;

      // Conta total
      const countSql = `SELECT COUNT(*) AS total FROM (${sql}) AS filtered_customers`;
      const countRow = await db.queryOne(countSql, ...params);
      const total = Number(countRow?.total || 0);

      sql += ` LIMIT ${limitNum} OFFSET ${offset}`;
      const rows = await db.query(sql, ...params);

      return res.json({
        data: rows,
        page: pageNum,
        limit: limitNum,
        total,
        total_pages: Math.max(1, Math.ceil(total / limitNum))
      });
    }

    // Caso padrão para seletores e compatibilidade legada
    sql += ` LIMIT 200`;
    const rows = await db.query(sql, ...params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// 3. Obter cliente por ID
router.get('/:id', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const customer = await db.queryOne(
      'SELECT * FROM customers WHERE id = $1 AND store_id = $2',
      [req.params.id, storeId]
    );
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado nesta loja.' });
    res.json(customer);
  } catch (err) {
    next(err);
  }
});

// 4. Perfil CRM Completo (Métricas + Abas de OS, Vendas, Garantias, Pendências e Histórico)
router.get('/:id/crm-profile', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const customerId = req.params.id;

    const customer = await db.queryOne(
      'SELECT * FROM customers WHERE id = $1 AND store_id = $2',
      [customerId, storeId]
    );
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado nesta loja.' });

    // A. Ordens de Serviço
    const orders = await db.query(`
      SELECT so.id, so.order_number, so.entry_date, so.delivery_date, so.brand, so.model,
             so.description, so.service_price, so.status, so.payment_status, so.created_at,
             w.warranty_end, w.id AS warranty_id
      FROM service_orders so
      LEFT JOIN warranties w ON w.service_order_id = so.id
      WHERE so.customer_id = $1 AND so.store_id = $2
      ORDER BY so.entry_date DESC, so.id DESC
    `, [customerId, storeId]);

    // B. Vendas de Aparelhos vinculadas ao cliente
    let deviceSales = [];
    try {
      deviceSales = await db.query(`
        SELECT ds.id, ds.order_number, ds.sale_date, ds.seller_name, ds.total_amount,
               ds.payment_method, ds.items_json, ds.created_at
        FROM device_sales ds
        WHERE ds.customer_id = $1 AND ds.store_id = $2
        ORDER BY ds.sale_date DESC, ds.id DESC
      `, [customerId, storeId]);
    } catch (_) {
      deviceSales = [];
    }

    // C. Garantias ativas ou concluídas do cliente
    let warranties = [];
    try {
      warranties = await db.query(`
        SELECT w.id, w.service_order_id, w.warranty_start, w.warranty_end, w.brand, w.model,
               w.amount_paid, w.description, w.created_at, so.order_number
        FROM warranties w
        LEFT JOIN service_orders so ON so.id = w.service_order_id
        WHERE w.customer_id = $1 AND w.store_id = $2
        ORDER BY w.warranty_end DESC, w.id DESC
      `, [customerId, storeId]);
    } catch (_) {
      warranties = [];
    }

    // D. Contas a Receber / Pendências / Fiados
    let creditAccounts = [];
    try {
      creditAccounts = await db.query(`
        SELECT ca.id, ca.service_order_id, ca.description, ca.amount, ca.pickup_date,
               ca.status, ca.paid_at, ca.created_at, so.order_number
        FROM credit_accounts ca
        LEFT JOIN service_orders so ON so.id = ca.service_order_id
        WHERE ca.customer_id = $1 AND ca.store_id = $2
        ORDER BY ca.created_at DESC, ca.id DESC
      `, [customerId, storeId]);
    } catch (_) {
      creditAccounts = [];
    }

    // E. Indicadores Agregados
    const totalOrdersCount = orders.length;
    const totalSalesCount = deviceSales.length;
    const totalWarrantiesCount = warranties.length;

    // Pendências em aberto
    const openCredits = creditAccounts.filter(ca => ca.status === 'open');
    const totalPendingAmount = openCredits.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    // Total histórico investido pelo cliente (Serviços + Vendas pagas)
    const totalOrdersSpent = orders
      .filter(o => o.status !== 'cancelled' && o.payment_status !== 'not_performed')
      .reduce((sum, o) => sum + Number(o.service_price || 0), 0);
    const totalSalesSpent = deviceSales
      .reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    const totalLifetimeValue = totalOrdersSpent + totalSalesSpent;

    // Últimas atividades
    const lastOrder = orders[0] || null;
    const lastSale = deviceSales[0] || null;
    const lastActivityDate = [
      lastOrder?.entry_date,
      lastSale?.sale_date,
      customer.created_at
    ].filter(Boolean).sort().reverse()[0] || null;

    // F. Linha do Tempo Unificada (Timeline)
    const timeline = [];

    orders.forEach(o => {
      timeline.push({
        type: 'service_order',
        id: `so-${o.id}`,
        record_id: o.id,
        date: o.entry_date || o.created_at,
        title: `Ordem de Serviço #${o.order_number}`,
        subtitle: `${o.brand || ''} ${o.model || ''}`.trim() || 'Aparelho em reparo',
        status: o.status,
        amount: o.service_price,
        description: o.description,
        link: `/ordens/${o.id}`
      });
    });

    deviceSales.forEach(s => {
      timeline.push({
        type: 'sale',
        id: `sale-${s.id}`,
        record_id: s.id,
        date: s.sale_date || s.created_at,
        title: `Venda de Aparelho #${s.order_number}`,
        subtitle: s.payment_method ? `Pagamento: ${s.payment_method}` : 'Venda realizada',
        status: 'completed',
        amount: s.total_amount,
        description: `Venda realizada por ${s.seller_name || 'Vendedor'}`,
        link: `/venda-aparelho/${s.id}`
      });
    });

    creditAccounts.forEach(c => {
      timeline.push({
        type: 'credit',
        id: `credit-${c.id}`,
        record_id: c.id,
        date: c.created_at,
        title: c.status === 'open' ? 'Pendência Financeira Aberta' : 'Pendência Quitada',
        subtitle: c.description || 'Fiado / Prazo',
        status: c.status,
        amount: c.amount,
        description: c.order_number ? `Vinculado à OS #${c.order_number}` : 'Lançamento avulso'
      });
    });

    // Ordenação decrescente por data
    timeline.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    res.json({
      customer,
      metrics: {
        total_orders: totalOrdersCount,
        total_sales: totalSalesCount,
        total_warranties: totalWarrantiesCount,
        total_pending: totalPendingAmount,
        total_spent: totalLifetimeValue,
        last_visit: lastActivityDate,
        last_order: lastOrder,
        last_sale: lastSale
      },
      orders,
      sales: deviceSales,
      warranties,
      credit_accounts: creditAccounts,
      timeline
    });
  } catch (err) {
    next(err);
  }
});

// Compatibilidade retroativa com /:id/history
router.get('/:id/history', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const customer = await db.queryOne('SELECT * FROM customers WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado nesta loja.' });

    const orders = await db.query(`
      SELECT so.*, w.warranty_end
      FROM service_orders so
      LEFT JOIN warranties w ON w.service_order_id = so.id
      WHERE so.customer_id = $1 AND so.store_id = $2
      ORDER BY so.entry_date DESC
    `, [req.params.id, storeId]);

    const totals = await db.queryOne(`
      SELECT COUNT(*) as total_repairs, COALESCE(SUM(service_price), 0) as total_spent, MAX(entry_date) as last_visit
      FROM service_orders WHERE customer_id = $1 AND store_id = $2
    `, [req.params.id, storeId]);

    res.json({ customer, orders, totals: totals || { total_repairs: 0, total_spent: 0, last_visit: null } });
  } catch (err) {
    next(err);
  }
});

// 5. Criar cliente (Clientes 2.0 com validações e proteção contra duplicidade)
router.post('/', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    let {
      first_name, last_name, birth_date, phone, phone_secondary, email, cpf, rg, gender,
      postal_code, street, number, complement, neighborhood, city, state, notes, address,
      allow_duplicate
    } = req.body;

    // Normalização de Nome (Permite preencher apenas "Nome completo" em first_name se last_name vier vazio)
    first_name = String(first_name || '').trim();
    last_name = String(last_name || '').trim();

    if (!first_name) {
      return res.status(400).json({ error: 'O nome do cliente é obrigatório.' });
    }
    if (!last_name) {
      // Se tiver mais de uma palavra no first_name, separa
      const parts = first_name.split(/\s+/);
      if (parts.length > 1) {
        first_name = parts[0];
        last_name = parts.slice(1).join(' ');
      } else {
        last_name = '';
      }
    }

    // Telefone principal é obrigatório
    const cleanPhone = cleanDigits(phone);
    if (!cleanPhone || cleanPhone.length < 8) {
      return res.status(400).json({ error: 'Telefone principal com DDD é obrigatório.' });
    }

    // Validação de CPF se preenchido
    const cleanCpf = cleanDigits(cpf);
    if (cleanCpf && !isValidCPF(cleanCpf)) {
      return res.status(400).json({ error: 'O CPF informado é inválido.' });
    }

    // Checagem de duplicidade por CPF ou Telefone na mesma loja
    if (!allow_duplicate) {
      if (cleanCpf && cleanCpf.length === 11) {
        const dupCpf = await db.queryOne(`
          SELECT id, first_name, last_name FROM customers
          WHERE store_id = $1 AND is_system = 0
            AND REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = $2
        `, [storeId, cleanCpf]);
        if (dupCpf) {
          return res.status(409).json({
            error: `Já existe um cliente cadastrado com este CPF: ${dupCpf.first_name} ${dupCpf.last_name} (Cód. #${dupCpf.id}).`,
            existing_id: dupCpf.id,
            duplicate_field: 'cpf'
          });
        }
      }

      const dupPhone = await db.queryOne(`
        SELECT id, first_name, last_name FROM customers
        WHERE store_id = $1 AND is_system = 0
          AND REPLACE(REPLACE(REPLACE(REPLACE(phone, '(', ''), ')', ''), '-', ''), ' ', '') = $2
      `, [storeId, cleanPhone]);
      if (dupPhone) {
        return res.status(409).json({
          error: `Já existe um cliente com este telefone: ${dupPhone.first_name} ${dupPhone.last_name} (Cód. #${dupPhone.id}).`,
          existing_id: dupPhone.id,
          duplicate_field: 'phone'
        });
      }
    }

    const legacyAddress = buildLegacyAddress({ street, number, complement, neighborhood, city, state, postal_code, address });

    const info = await db.queryOne(`
      INSERT INTO customers (
        store_id, first_name, last_name, birth_date, address, phone,
        cpf, rg, gender, phone_secondary, email, postal_code, street, number,
        complement, neighborhood, city, state, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id
    `, [
      storeId, first_name, last_name, birth_date || null, legacyAddress, phone || null,
      cpf || null, rg || null, gender || null, phone_secondary || null, email || null,
      postal_code || null, street || null, number || null, complement || null,
      neighborhood || null, city || null, state || null, notes || null
    ]);

    const customerId = info.id;
    await logAction({ user: req.user, action: 'create_customer', recordType: 'customer', recordId: customerId, storeId });

    dispatchNotification({
      storeId,
      actorId: req.user.id,
      eventKey: 'customer_created',
      title: 'Novo Cliente Cadastrado',
      description: `Cliente ${first_name} ${last_name} cadastrado no sistema (Cód. #${customerId}).`,
      link: `/clientes/${customerId}`,
      metadata: { customerId, name: `${first_name} ${last_name}` }
    }).catch(err => console.error('[NOTIF_ERROR]', err.message));

    res.status(201).json({ id: customerId, success: true });
  } catch (err) {
    next(err);
  }
});

// 6. Atualizar cliente
router.put('/:id', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const customerId = req.params.id;

    const existing = await db.queryOne('SELECT * FROM customers WHERE id = $1 AND store_id = $2', [customerId, storeId]);
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado nesta loja.' });

    let {
      first_name, last_name, birth_date, phone, phone_secondary, email, cpf, rg, gender,
      postal_code, street, number, complement, neighborhood, city, state, notes, address,
      allow_duplicate
    } = req.body;

    first_name = first_name !== undefined ? String(first_name).trim() : existing.first_name;
    last_name = last_name !== undefined ? String(last_name).trim() : existing.last_name;

    if (!first_name) {
      return res.status(400).json({ error: 'O nome do cliente é obrigatório.' });
    }

    const cleanPhone = phone !== undefined ? cleanDigits(phone) : cleanDigits(existing.phone);
    if (!cleanPhone || cleanPhone.length < 8) {
      return res.status(400).json({ error: 'Telefone principal com DDD é obrigatório.' });
    }

    const cleanCpf = cpf !== undefined ? cleanDigits(cpf) : cleanDigits(existing.cpf);
    if (cleanCpf && !isValidCPF(cleanCpf)) {
      return res.status(400).json({ error: 'O CPF informado é inválido.' });
    }

    // Checagem de duplicidade ao alterar
    if (!allow_duplicate) {
      if (cleanCpf && cleanCpf.length === 11) {
        const dupCpf = await db.queryOne(`
          SELECT id, first_name, last_name FROM customers
          WHERE store_id = $1 AND id != $2 AND is_system = 0
            AND REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = $3
        `, [storeId, customerId, cleanCpf]);
        if (dupCpf) {
          return res.status(409).json({
            error: `Outro cliente já utiliza este CPF: ${dupCpf.first_name} ${dupCpf.last_name} (Cód. #${dupCpf.id}).`,
            existing_id: dupCpf.id
          });
        }
      }
    }

    const legacyAddress = buildLegacyAddress({
      street: street ?? existing.street,
      number: number ?? existing.number,
      complement: complement ?? existing.complement,
      neighborhood: neighborhood ?? existing.neighborhood,
      city: city ?? existing.city,
      state: state ?? existing.state,
      postal_code: postal_code ?? existing.postal_code,
      address: address ?? existing.address
    });

    await db.query(`
      UPDATE customers SET
        first_name = $1, last_name = $2, birth_date = $3, address = $4, phone = $5,
        cpf = $6, rg = $7, gender = $8, phone_secondary = $9, email = $10,
        postal_code = $11, street = $12, number = $13, complement = $14,
        neighborhood = $15, city = $16, state = $17, notes = $18, updated_at = CURRENT_TIMESTAMP
      WHERE id = $19 AND store_id = $20
    `, [
      first_name,
      last_name,
      birth_date !== undefined ? birth_date : existing.birth_date,
      legacyAddress,
      phone !== undefined ? phone : existing.phone,
      cpf !== undefined ? cpf : existing.cpf,
      rg !== undefined ? rg : existing.rg,
      gender !== undefined ? gender : existing.gender,
      phone_secondary !== undefined ? phone_secondary : existing.phone_secondary,
      email !== undefined ? email : existing.email,
      postal_code !== undefined ? postal_code : existing.postal_code,
      street !== undefined ? street : existing.street,
      number !== undefined ? number : existing.number,
      complement !== undefined ? complement : existing.complement,
      neighborhood !== undefined ? neighborhood : existing.neighborhood,
      city !== undefined ? city : existing.city,
      state !== undefined ? state : existing.state,
      notes !== undefined ? notes : existing.notes,
      customerId,
      storeId
    ]);

    await logAction({ user: req.user, action: 'update_customer', recordType: 'customer', recordId: customerId, storeId });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// 7. Excluir cliente
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const customer = await db.queryOne('SELECT * FROM customers WHERE id = $1 AND (store_id = $2 OR store_id IS NULL) AND is_system = 0', [req.params.id, storeId]);
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado nesta loja.' });

    let historicalCustomer = await db.queryOne('SELECT id FROM customers WHERE is_system = 1 AND (store_id = $1 OR store_id IS NULL)', [storeId]);
    if (!historicalCustomer) {
      const ins = await db.queryOne("INSERT INTO customers (store_id, first_name, last_name, is_system) VALUES ($1, 'Histórico', 'Excluído', 1) RETURNING id", [storeId]);
      historicalCustomer = { id: ins.id };
    }

    const fullName = `${customer.first_name} ${customer.last_name || ''}`.trim();
    const usage = await db.transaction(async (tx) => {
      const counts = {
        service_orders: Number((await tx.queryOne('SELECT COUNT(*) AS n FROM service_orders WHERE customer_id = $1 AND (store_id = $2 OR store_id IS NULL)', [customer.id, storeId]))?.n || 0),
        warranties: Number((await tx.queryOne('SELECT COUNT(*) AS n FROM warranties WHERE customer_id = $1 AND (store_id = $2 OR store_id IS NULL)', [customer.id, storeId]))?.n || 0),
        credit_accounts: Number((await tx.queryOne('SELECT COUNT(*) AS n FROM credit_accounts WHERE customer_id = $1 AND (store_id = $2 OR store_id IS NULL)', [customer.id, storeId]))?.n || 0),
        device_sales: Number((await tx.queryOne('SELECT COUNT(*) AS n FROM device_sales WHERE customer_id = $1 AND (store_id = $2 OR store_id IS NULL)', [customer.id, storeId]))?.n || 0),
      };
      await tx.query('UPDATE service_orders SET customer_name_snapshot = COALESCE(customer_name_snapshot, $1), customer_phone_snapshot = COALESCE(customer_phone_snapshot, $2), customer_address_snapshot = COALESCE(customer_address_snapshot, $3), customer_id = $4 WHERE customer_id = $5 AND (store_id = $6 OR store_id IS NULL)', [fullName, customer.phone, customer.address, historicalCustomer.id, customer.id, storeId]);
      await tx.query('UPDATE warranties SET customer_name_snapshot = COALESCE(customer_name_snapshot, $1), customer_id = $2 WHERE customer_id = $3 AND (store_id = $4 OR store_id IS NULL)', [fullName, historicalCustomer.id, customer.id, storeId]);
      await tx.query('UPDATE credit_accounts SET customer_name_snapshot = COALESCE(customer_name_snapshot, $1), customer_id = $2 WHERE customer_id = $3 AND (store_id = $4 OR store_id IS NULL)', [fullName, historicalCustomer.id, customer.id, storeId]);
      await tx.query('UPDATE device_sales SET customer_id = NULL WHERE customer_id = $1 AND (store_id = $2 OR store_id IS NULL)', [customer.id, storeId]);
      await tx.query('DELETE FROM customers WHERE id = $1 AND (store_id = $2 OR store_id IS NULL)', [customer.id, storeId]);
      return counts;
    });

    await logAction({ user: req.user, action: 'delete_customer', recordType: 'customer', recordId: req.params.id, storeId });
    res.json({ success: true, mode: 'deleted', preserved: usage });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
