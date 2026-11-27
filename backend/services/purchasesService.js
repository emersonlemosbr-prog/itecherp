const { logAction } = require('../utils/audit');
const { emitDashboardRefresh } = require('../utils/events');
const { dispatchNotification } = require('./notificationService');
const { ensureFinancialHistoryUpToDate } = require('../utils/financialHistory');
const { getTrustedNowSqlite } = require('../utils/time');

function toCents(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return NaN;
  return Math.round(num * 100);
}

function fromCents(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

function createHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function generateNextPurchaseNumber(tx, storeId) {
  const sql = tx.isSqlite
    ? "SELECT MAX(CAST(REPLACE(purchase_number, 'CMP-', '') AS INTEGER)) AS max_num FROM purchases WHERE store_id = $1"
    : "SELECT MAX(CAST(REGEXP_REPLACE(purchase_number, '[^0-9]', '', 'g') AS BIGINT)) AS max_num FROM purchases WHERE store_id = $1 AND purchase_number ~ '[0-9]'";
  const row = await tx.queryOne(sql, [storeId]);
  const next = (Number(row?.max_num) || 0) + 1;
  return `CMP-${String(next).padStart(4, '0')}`;
}

async function createPurchase(db, storeId, user, payload) {
  const b = payload || {};
  const idempotencyKey = b.idempotency_key ? String(b.idempotency_key).trim().slice(0, 128) : null;
  const originType = b.origin_type === 'customer_trade' ? 'customer_trade' : 'supplier';
  const purchaseDate = String(b.purchase_date || '').slice(0, 10);
  const invoiceNumber = b.invoice_number ? String(b.invoice_number).trim().slice(0, 120) : null;
  const notes = b.notes ? String(b.notes).trim() : null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
    throw createHttpError(400, 'Data da compra inválida (use AAAA-MM-DD).');
  }

  const rawItems = Array.isArray(b.items) ? b.items : [];
  if (rawItems.length === 0) {
    throw createHttpError(400, 'Adicione pelo menos um item à compra.');
  }

  const discountCents = toCents(b.discount ?? 0);
  const freightCents = toCents(b.freight ?? 0);
  if (!Number.isFinite(discountCents) || discountCents < 0) {
    throw createHttpError(400, 'Desconto inválido.');
  }
  if (!Number.isFinite(freightCents) || freightCents < 0) {
    throw createHttpError(400, 'Frete inválido.');
  }

  let subtotalCents = 0;
  const normalizedItems = rawItems.map((item, idx) => {
    const itemType = item.item_type;
    if (!['device', 'existing_accessory', 'new_accessory'].includes(itemType)) {
      throw createHttpError(400, `Tipo de item inválido na linha ${idx + 1}.`);
    }
    if (originType === 'customer_trade' && itemType !== 'device') {
      throw createHttpError(400, 'Compras de aparelho de cliente aceitam apenas itens do tipo Aparelho.');
    }

    const quantity = itemType === 'device' ? 1 : parseInt(item.quantity, 10);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw createHttpError(400, `Quantidade inválida na linha ${idx + 1}.`);
    }

    const unitCostCents = toCents(item.unit_cost);
    if (!Number.isFinite(unitCostCents) || unitCostCents < 0) {
      throw createHttpError(400, `Custo unitário inválido na linha ${idx + 1}.`);
    }

    const lineTotalCents = unitCostCents * quantity;
    subtotalCents += lineTotalCents;

    const description = String(item.description || item.name || `${item.brand || ''} ${item.model || ''}`).trim();
    if (!description) {
      throw createHttpError(400, `Descrição do item obrigatória na linha ${idx + 1}.`);
    }

    return {
      ...item,
      item_type: itemType,
      quantity,
      unit_cost_cents: unitCostCents,
      total_cost_cents: lineTotalCents,
      sale_price_cents: Math.max(0, toCents(item.sale_price ?? 0) || 0),
      description,
    };
  });

  const totalCents = subtotalCents - discountCents + freightCents;
  if (totalCents <= 0) {
    throw createHttpError(400, 'O total da compra deve ser maior que zero.');
  }

  const paymentCondition = b.payment_condition === 'installments' ? 'installments' : 'cash';
  const paymentMethod = b.payment_method ? String(b.payment_method).trim() : null;
  const paymentDate = String(b.payment_date || purchaseDate).slice(0, 10);

  let downPaymentCents = 0;
  let normalizedInstallments = [];

  if (paymentCondition === 'cash') {
    if (!paymentMethod) {
      throw createHttpError(400, 'Selecione a forma de pagamento para compra à vista.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      throw createHttpError(400, 'Data efetiva do pagamento inválida.');
    }
    downPaymentCents = totalCents;
  } else {
    downPaymentCents = toCents(b.down_payment ?? 0);
    if (!Number.isFinite(downPaymentCents) || downPaymentCents < 0 || downPaymentCents >= totalCents) {
      throw createHttpError(400, 'Entrada inválida para compra a prazo.');
    }
    if (downPaymentCents > 0) {
      if (!paymentMethod) {
        throw createHttpError(400, 'Selecione a forma de pagamento da entrada.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
        throw createHttpError(400, 'Data do pagamento da entrada inválida.');
      }
    }

    const rawInstallments = Array.isArray(b.installments) ? b.installments : [];
    if (rawInstallments.length === 0) {
      throw createHttpError(400, 'Informe as parcelas da compra a prazo.');
    }

    let installmentsSumCents = 0;
    normalizedInstallments = rawInstallments.map((inst, idx) => {
      const amountCents = toCents(inst.amount);
      const dueDate = String(inst.due_date || '').slice(0, 10);
      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        throw createHttpError(400, `Valor inválido na parcela ${idx + 1}.`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        throw createHttpError(400, `Data de vencimento inválida na parcela ${idx + 1}.`);
      }
      installmentsSumCents += amountCents;
      return {
        installment_number: idx + 1,
        amount_cents: amountCents,
        due_date: dueDate,
      };
    });

    if (downPaymentCents + installmentsSumCents !== totalCents) {
      throw createHttpError(
        400,
        `A soma da entrada (${fromCents(downPaymentCents)}) e das parcelas (${fromCents(installmentsSumCents)}) deve ser igual ao total da compra (${fromCents(totalCents)}).`
      );
    }
  }

  const trustedNow = await getTrustedNowSqlite();

  const result = await db.transaction(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.queryOne(
        'SELECT * FROM purchases WHERE store_id = $1 AND idempotency_key = $2',
        [storeId, idempotencyKey]
      );
      if (existing) {
        return { purchase: existing, idempotentReplay: true };
      }
    }

    let supplierId = null;
    let supplierName = null;
    let customerId = null;
    let customerName = null;

    if (originType === 'supplier') {
      supplierId = Number(b.supplier_id);
      if (!Number.isInteger(supplierId) || supplierId < 1) {
        throw createHttpError(400, 'Selecione um fornecedor válido.');
      }
      const supplier = await tx.queryOne(
        'SELECT id, name FROM stock_suppliers WHERE id = $1 AND store_id = $2',
        [supplierId, storeId]
      );
      if (!supplier) {
        throw createHttpError(404, 'Fornecedor não encontrado nesta loja.');
      }
      supplierName = supplier.name;
    } else {
      customerId = Number(b.customer_id);
      if (!Number.isInteger(customerId) || customerId < 1) {
        throw createHttpError(400, 'Selecione o cliente vendedor do aparelho.');
      }
      const customer = await tx.queryOne(
        'SELECT id, first_name, last_name FROM customers WHERE id = $1 AND store_id = $2',
        [customerId, storeId]
      );
      if (!customer) {
        throw createHttpError(404, 'Cliente não encontrado nesta loja.');
      }
      customerName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
    }

    const purchaseNumber = await generateNextPurchaseNumber(tx, storeId);

    const purchaseInsert = await tx.queryOne(`
      INSERT INTO purchases (
        store_id, purchase_number, origin_type, supplier_id, supplier_name,
        customer_id, customer_name, invoice_number, purchase_date,
        subtotal, discount, freight, total_amount,
        payment_condition, payment_method, down_payment, installments_count,
        status, notes, idempotency_key, created_by, created_by_name_snapshot
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, $17,
        'confirmed', $18, $19, $20, $21
      )
      RETURNING *
    `, [
      storeId, purchaseNumber, originType, supplierId, supplierName,
      customerId, customerName, invoiceNumber, purchaseDate,
      fromCents(subtotalCents), fromCents(discountCents), fromCents(freightCents), fromCents(totalCents),
      paymentCondition, paymentMethod, fromCents(downPaymentCents), normalizedInstallments.length,
      notes, idempotencyKey, user?.id || null, user?.full_name || user?.username || null
    ]);

    const purchaseId = purchaseInsert.id;

    for (const item of normalizedItems) {
      let productId = null;
      let deviceId = null;

      if (item.item_type === 'existing_accessory') {
        productId = Number(item.product_id);
        if (!Number.isInteger(productId) || productId < 1) {
          throw createHttpError(400, `Produto inválido para o item "${item.description}".`);
        }
        const product = await tx.queryOne(`
          SELECT p.id, p.name, p.cost_price, p.is_active, COALESCE(l.quantity, 0) AS quantity
          FROM stock_products p
          LEFT JOIN stock_levels l ON l.product_id = p.id
          WHERE p.id = $1 AND p.store_id = $2
        `, [productId, storeId]);
        if (!product || !product.is_active) {
          throw createHttpError(404, `Produto "${item.description}" não encontrado ou inativo nesta loja.`);
        }

        const prevQty = parseInt(product.quantity || 0, 10);
        const newQty = prevQty + item.quantity;
        const prevCostCents = toCents(product.cost_price || 0);
        const avgCostCents = newQty > 0
          ? Math.round(((prevQty * prevCostCents) + item.total_cost_cents) / newQty)
          : item.unit_cost_cents;

        await tx.execute(
          'UPDATE stock_products SET cost_price = $1, updated_at = $2 WHERE id = $3 AND store_id = $4',
          [fromCents(avgCostCents), trustedNow, productId, storeId]
        );
        await tx.execute(
          'UPDATE stock_levels SET quantity = $1, updated_at = $2 WHERE product_id = $3',
          [newQty, trustedNow, productId]
        );
        await tx.execute(`
          INSERT INTO stock_movements (
            store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity,
            reason, reference_type, reference_id, user_id, user_name, created_at
          ) VALUES ($1, $2, 'entry', $3, $4, $5, $6, 'purchase', $7, $8, $9, $10)
        `, [
          storeId, productId, item.quantity, prevQty, newQty,
          `Entrada via Compra ${purchaseNumber}`, purchaseId,
          user?.id || null, user?.full_name || user?.username || null, trustedNow
        ]);
      } else if (item.item_type === 'new_accessory') {
        const cleanName = item.description.trim();
        const dupName = await tx.queryOne(
          'SELECT id FROM stock_products WHERE store_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
          [storeId, cleanName]
        );
        if (dupName) {
          throw createHttpError(409, `Já existe um produto cadastrado com o nome "${cleanName}". Selecione-o como acessório existente.`);
        }

        const rawCode = String(item.identifier || item.code || `CMP-${purchaseId}-${Date.now().toString().slice(-4)}`).trim().toUpperCase();
        const dupCode = await tx.queryOne(
          'SELECT id FROM stock_products WHERE store_id = $1 AND code = $2',
          [storeId, rawCode]
        );
        if (dupCode) {
          throw createHttpError(409, `Já existe um produto cadastrado com o código "${rawCode}".`);
        }

        let categoryId = item.category_id ? Number(item.category_id) : null;
        if (!categoryId && item.category_name) {
          const catName = String(item.category_name).trim();
          const existingCat = await tx.queryOne(
            'SELECT id FROM stock_categories WHERE store_id = $1 AND LOWER(name) = LOWER($2)',
            [storeId, catName]
          );
          if (existingCat) {
            categoryId = existingCat.id;
          } else {
            const newCat = await tx.queryOne(
              'INSERT INTO stock_categories (store_id, name, is_active) VALUES ($1, $2, 1) RETURNING id',
              [storeId, catName]
            );
            categoryId = newCat.id;
          }
        }

        const newProd = await tx.queryOne(`
          INSERT INTO stock_products (
            store_id, name, model, code, category_id, supplier_id,
            cost_price, sale_price, min_stock, is_active, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 1, $9)
          RETURNING id
        `, [
          storeId, cleanName, item.model || null, rawCode, categoryId, supplierId,
          fromCents(item.unit_cost_cents), fromCents(item.sale_price_cents), user?.id || null
        ]);
        productId = newProd.id;

        await tx.execute(
          'INSERT INTO stock_levels (product_id, quantity, updated_at) VALUES ($1, $2, $3)',
          [productId, item.quantity, trustedNow]
        );
        await tx.execute(`
          INSERT INTO stock_movements (
            store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity,
            reason, reference_type, reference_id, user_id, user_name, created_at
          ) VALUES ($1, $2, 'entry', $3, 0, $3, $4, 'purchase', $5, $6, $7, $8)
        `, [
          storeId, productId, item.quantity,
          `Cadastro e entrada via Compra ${purchaseNumber}`, purchaseId,
          user?.id || null, user?.full_name || user?.username || null, trustedNow
        ]);
      } else if (item.item_type === 'device') {
        const imei1 = item.imei1 ? String(item.imei1).replace(/\s+/g, '').trim() : (item.identifier ? String(item.identifier).trim() : null);
        const serialNumber = item.serial_number ? String(item.serial_number).trim() : null;

        if (imei1) {
          const dupImei = await tx.queryOne(
            "SELECT id FROM devices WHERE store_id = $1 AND imei1 = $2 AND status != 'archived'",
            [storeId, imei1]
          );
          if (dupImei) {
            throw createHttpError(409, `Já existe um aparelho ativo cadastrado com o IMEI/identificação "${imei1}".`);
          }
        }
        if (serialNumber) {
          const dupSerial = await tx.queryOne(
            "SELECT id FROM devices WHERE store_id = $1 AND serial_number = $2 AND status != 'archived'",
            [storeId, serialNumber]
          );
          if (dupSerial) {
            throw createHttpError(409, `Já existe um aparelho ativo cadastrado com o número de série "${serialNumber}".`);
          }
        }

        const deviceBrand = String(item.brand || 'Outra').trim();
        const deviceModel = String(item.model || item.description).trim();
        const originDesc = originType === 'customer_trade'
          ? `Aquisição de cliente: ${customerName} (Compra ${purchaseNumber})`
          : `Compra de fornecedor: ${supplierName} (Compra ${purchaseNumber})`;

        const devInsert = await tx.queryOne(`
          INSERT INTO devices (
            store_id, brand, model, storage, color, category,
            imei1, serial_number, condition, cost_price, sell_price,
            supplier_id, supplier_name, entry_date, status, notes, created_by
          ) VALUES (
            $1, $2, $3, $4, $5, 'Smartphone',
            $6, $7, $8, $9, $10,
            $11, $12, $13, 'in_stock', $14, $15
          )
          RETURNING id
        `, [
          storeId, deviceBrand, deviceModel, item.storage || null, item.color || null,
          imei1, serialNumber, item.condition || 'Seminovo',
          fromCents(item.unit_cost_cents), fromCents(item.sale_price_cents),
          supplierId, originType === 'customer_trade' ? `Cliente: ${customerName}` : supplierName,
          purchaseDate, originDesc, user?.id || null
        ]);
        deviceId = devInsert.id;

        await tx.execute(`
          INSERT INTO device_history (
            device_id, store_id, user_id, user_name, action_type, description, details
          ) VALUES ($1, $2, $3, $4, 'purchase_entry', $5, $6)
        `, [
          deviceId, storeId, user?.id || null, user?.full_name || user?.username || null,
          originDesc, JSON.stringify({ purchase_id: purchaseId, purchase_number: purchaseNumber, origin_type: originType })
        ]);
      }

      await tx.execute(`
        INSERT INTO purchase_items (
          store_id, purchase_id, item_type, product_id, device_id,
          description, identifier, brand, model, storage, color, condition,
          category_id, category_name, quantity, unit_cost, total_cost, sale_price
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18
        )
      `, [
        storeId, purchaseId, item.item_type, productId, deviceId,
        item.description, item.identifier || item.imei1 || item.serial_number || null,
        item.brand || null, item.model || null, item.storage || null, item.color || null, item.condition || null,
        item.category_id || null, item.category_name || null,
        item.quantity, fromCents(item.unit_cost_cents), fromCents(item.total_cost_cents), fromCents(item.sale_price_cents)
      ]);
    }

    const originLabel = originType === 'customer_trade' ? `Cliente ${customerName}` : supplierName;

    if (downPaymentCents > 0) {
      const reasonPrefix = paymentCondition === 'cash'
        ? `Compra ${purchaseNumber} à vista`
        : `Entrada da Compra ${purchaseNumber}`;
      await tx.execute(`
        INSERT INTO cash_withdrawals (
          store_id, amount, reason, withdrawal_date, notes,
          source_type, supplier_id, supplier_name, created_by, created_by_name_snapshot
        ) VALUES ($1, $2, $3, $4, $5, 'purchase_payment', $6, $7, $8, $9)
      `, [
        storeId, fromCents(downPaymentCents),
        `${reasonPrefix} (${originLabel}) [${paymentMethod}]`,
        paymentDate, notes, supplierId, originLabel,
        user?.id || null, user?.full_name || user?.username || null
      ]);
    }

    if (paymentCondition === 'installments') {
      const financedCents = totalCents - downPaymentCents;
      const payableRow = await tx.queryOne(`
        INSERT INTO accounts_payable (
          store_id, purchase_id, supplier_id, supplier_name, origin_type,
          category, description, total_amount, paid_amount, status, due_date, notes, created_by
        ) VALUES ($1, $2, $3, $4, 'purchase', 'Compra', $5, $6, 0, 'open', $7, $8, $9)
        RETURNING id
      `, [
        storeId, purchaseId, supplierId, originLabel,
        `Compra ${purchaseNumber}${invoiceNumber ? ` (NF ${invoiceNumber})` : ''}`,
        fromCents(financedCents), normalizedInstallments[0].due_date, notes, user?.id || null
      ]);

      for (const inst of normalizedInstallments) {
        await tx.execute(`
          INSERT INTO payable_installments (
            store_id, payable_id, installment_number, total_installments,
            amount, paid_amount, due_date, status
          ) VALUES ($1, $2, $3, $4, $5, 0, $6, 'open')
        `, [
          storeId, payableRow.id, inst.installment_number, normalizedInstallments.length,
          fromCents(inst.amount_cents), inst.due_date
        ]);
      }
    }

    return { purchase: purchaseInsert, idempotentReplay: false };
  });

  if (!result.idempotentReplay) {
    await logAction({
      user,
      action: 'create_purchase',
      recordType: 'purchase',
      recordId: result.purchase.id,
      details: {
        purchase_number: result.purchase.purchase_number,
        total_amount: result.purchase.total_amount,
        payment_condition: paymentCondition,
      },
      storeId
    });
    emitDashboardRefresh({ source: 'purchase_create', purchaseId: result.purchase.id });
    if (downPaymentCents > 0) {
      dispatchNotification({
        storeId,
        actorId: user?.id,
        eventKey: 'finance_expense',
        title: 'Pagamento de Compra Registrado',
        description: `Saída de R$ ${fromCents(downPaymentCents).toFixed(2)} referente à ${result.purchase.purchase_number}.`,
        link: '/caixa',
        metadata: { purchaseId: result.purchase.id, amount: fromCents(downPaymentCents) }
      }).catch(() => {});
      await ensureFinancialHistoryUpToDate(trustedNow, storeId);
    }
  }

  return result;
}

async function updatePurchase(db, storeId, user, purchaseId, payload) {
  const b = payload || {};
  const trustedNow = await getTrustedNowSqlite();

  const result = await db.transaction(async (tx) => {
    const lockSql = tx.isSqlite
      ? 'SELECT * FROM purchases WHERE id = $1 AND store_id = $2'
      : 'SELECT * FROM purchases WHERE id = $1 AND store_id = $2 FOR UPDATE';
    const existing = await tx.queryOne(lockSql, [purchaseId, storeId]);
    if (!existing) throw createHttpError(404, 'Compra não encontrada nesta loja.');
    if (existing.status === 'canceled') throw createHttpError(409, 'Compra cancelada não pode ser editada.');

    const payable = await tx.queryOne(
      'SELECT * FROM accounts_payable WHERE purchase_id = $1 AND store_id = $2',
      [existing.id, storeId]
    );
    const alreadyPaidCents = existing.payment_condition === 'cash'
      ? toCents(existing.total_amount)
      : (toCents(existing.down_payment || 0) + toCents(payable?.paid_amount || 0));
    const hasPayments = alreadyPaidCents > 0;

    let supplierId = existing.supplier_id;
    let supplierName = existing.supplier_name;
    if (existing.origin_type === 'supplier' && b.supplier_id) {
      const supp = await tx.queryOne(
        'SELECT id, name FROM stock_suppliers WHERE id = $1 AND store_id = $2',
        [Number(b.supplier_id), storeId]
      );
      if (!supp) throw createHttpError(404, 'Fornecedor não encontrado nesta loja.');
      supplierId = supp.id;
      supplierName = supp.name;
    }

    const invoiceNumber = b.invoice_number !== undefined ? (b.invoice_number ? String(b.invoice_number).trim().slice(0, 120) : null) : existing.invoice_number;
    const purchaseDate = b.purchase_date ? String(b.purchase_date).slice(0, 10) : String(existing.purchase_date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
      throw createHttpError(400, 'Data da compra inválida.');
    }
    let notes = b.notes !== undefined ? (b.notes ? String(b.notes).trim() : null) : existing.notes;

    const rawItems = Array.isArray(b.items) ? b.items : [];
    if (rawItems.length === 0) throw createHttpError(400, 'Adicione pelo menos um item à compra.');

    const discountCents = toCents(b.discount ?? 0);
    const freightCents = toCents(b.freight ?? 0);
    if (!Number.isFinite(discountCents) || discountCents < 0) throw createHttpError(400, 'Desconto inválido.');
    if (!Number.isFinite(freightCents) || freightCents < 0) throw createHttpError(400, 'Frete inválido.');

    let subtotalCents = 0;
    const normalizedItems = rawItems.map((item, idx) => {
      const itemType = item.item_type;
      if (!['device', 'existing_accessory', 'new_accessory'].includes(itemType)) {
        throw createHttpError(400, `Tipo de item inválido na linha ${idx + 1}.`);
      }
      const quantity = itemType === 'device' ? 1 : parseInt(item.quantity, 10);
      if (!Number.isInteger(quantity) || quantity < 1) throw createHttpError(400, `Quantidade inválida na linha ${idx + 1}.`);
      const unitCostCents = toCents(item.unit_cost);
      if (!Number.isFinite(unitCostCents) || unitCostCents < 0) throw createHttpError(400, `Custo unitário inválido na linha ${idx + 1}.`);
      const lineTotalCents = unitCostCents * quantity;
      subtotalCents += lineTotalCents;
      const description = String(item.description || item.name || `${item.brand || ''} ${item.model || ''}`).trim();
      if (!description) throw createHttpError(400, `Descrição obrigatória na linha ${idx + 1}.`);
      return {
        ...item,
        item_type: itemType,
        quantity,
        unit_cost_cents: unitCostCents,
        total_cost_cents: lineTotalCents,
        sale_price_cents: Math.max(0, toCents(item.sale_price ?? 0) || 0),
        description,
      };
    });

    const totalCents = subtotalCents - discountCents + freightCents;
    if (totalCents <= 0) throw createHttpError(400, 'O total da compra deve ser maior que zero.');

    const paymentCondition = hasPayments
      ? (totalCents > alreadyPaidCents ? 'installments' : existing.payment_condition)
      : (b.payment_condition === 'installments' ? 'installments' : 'cash');
    const paymentMethod = b.payment_method ? String(b.payment_method).trim() : existing.payment_method;
    const paymentDate = String(b.payment_date || purchaseDate).slice(0, 10);
    let downPaymentCents = hasPayments ? toCents(existing.down_payment || (existing.payment_condition === 'cash' ? existing.total_amount : 0)) : 0;
    let normalizedInstallments = [];

    if (!hasPayments) {
      if (paymentCondition === 'cash') {
        if (!paymentMethod) throw createHttpError(400, 'Selecione a forma de pagamento.');
        downPaymentCents = totalCents;
      } else {
        downPaymentCents = toCents(b.down_payment ?? 0);
        if (!Number.isFinite(downPaymentCents) || downPaymentCents < 0 || downPaymentCents >= totalCents) {
          throw createHttpError(400, 'Entrada inválida.');
        }
        const rawInsts = Array.isArray(b.installments) ? b.installments : [];
        if (rawInsts.length === 0) throw createHttpError(400, 'Informe as parcelas.');
        let sumCents = 0;
        normalizedInstallments = rawInsts.map((inst, idx) => {
          const amountCents = toCents(inst.amount);
          const dueDate = String(inst.due_date || '').slice(0, 10);
          if (!Number.isFinite(amountCents) || amountCents <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
            throw createHttpError(400, `Parcela ${idx + 1} inválida.`);
          }
          sumCents += amountCents;
          return { installment_number: idx + 1, amount_cents: amountCents, due_date: dueDate };
        });
        if (downPaymentCents + sumCents !== totalCents) {
          throw createHttpError(400, 'A soma da entrada e parcelas deve ser igual ao total da compra.');
        }
      }
    }

    // 1. Reverter movimentações anteriores desta compra
    const oldItems = await tx.query('SELECT * FROM purchase_items WHERE purchase_id = $1 AND store_id = $2', [existing.id, storeId]);
    for (const old of oldItems) {
      if (old.product_id) {
        const lvl = await tx.queryOne('SELECT quantity FROM stock_levels WHERE product_id = $1', [old.product_id]);
        const prevQty = parseInt(lvl?.quantity || 0, 10);
        const newQty = Math.max(0, prevQty - parseInt(old.quantity || 0, 10));
        await tx.execute('UPDATE stock_levels SET quantity = $1, updated_at = $2 WHERE product_id = $3', [newQty, trustedNow, old.product_id]);
        await tx.execute(`
          INSERT INTO stock_movements (
            store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity,
            reason, reference_type, reference_id, user_id, user_name, created_at
          ) VALUES ($1, $2, 'adjustment', $3, $4, $5, $6, 'purchase_edit_revert', $7, $8, $9, $10)
        `, [
          storeId, old.product_id, -(prevQty - newQty), prevQty, newQty,
          `Estorno por edição da Compra ${existing.purchase_number}`, existing.id,
          user?.id || null, user?.full_name || user?.username || null, trustedNow
        ]);
      } else if (old.device_id) {
        const dev = await tx.queryOne('SELECT id, status FROM devices WHERE id = $1 AND store_id = $2', [old.device_id, storeId]);
        if (dev && dev.status !== 'in_stock') {
          throw createHttpError(409, 'Um aparelho desta compra já foi vendido ou reservado e não pode ser removido.');
        }
        if (dev) {
          await tx.execute("UPDATE devices SET status = 'archived', updated_at = $1 WHERE id = $2 AND store_id = $3", [trustedNow, dev.id, storeId]);
        }
      }
    }
    await tx.execute('DELETE FROM purchase_items WHERE purchase_id = $1 AND store_id = $2', [existing.id, storeId]);

    // 2. Aplicar novos itens
    for (const item of normalizedItems) {
      let productId = null;
      let deviceId = null;
      if (item.item_type === 'existing_accessory') {
        productId = Number(item.product_id);
        const prod = await tx.queryOne(
          'SELECT p.id, p.cost_price, COALESCE(l.quantity, 0) AS quantity FROM stock_products p LEFT JOIN stock_levels l ON l.product_id = p.id WHERE p.id = $1 AND p.store_id = $2',
          [productId, storeId]
        );
        if (!prod) throw createHttpError(404, `Produto "${item.description}" não encontrado.`);
        const prevQty = parseInt(prod.quantity || 0, 10);
        const newQty = prevQty + item.quantity;
        const avgCostCents = newQty > 0
          ? Math.round(((prevQty * toCents(prod.cost_price || 0)) + item.total_cost_cents) / newQty)
          : item.unit_cost_cents;
        await tx.execute('UPDATE stock_products SET cost_price = $1, updated_at = $2 WHERE id = $3 AND store_id = $4', [fromCents(avgCostCents), trustedNow, productId, storeId]);
        await tx.execute('UPDATE stock_levels SET quantity = $1, updated_at = $2 WHERE product_id = $3', [newQty, trustedNow, productId]);
        await tx.execute(`
          INSERT INTO stock_movements (
            store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity,
            reason, reference_type, reference_id, user_id, user_name, created_at
          ) VALUES ($1, $2, 'entry', $3, $4, $5, $6, 'purchase', $7, $8, $9, $10)
        `, [
          storeId, productId, item.quantity, prevQty, newQty,
          `Entrada atualizada via Compra ${existing.purchase_number}`, existing.id,
          user?.id || null, user?.full_name || user?.username || null, trustedNow
        ]);
      } else if (item.item_type === 'device') {
        const imei1 = item.imei1 ? String(item.imei1).replace(/\s+/g, '').trim() : (item.identifier ? String(item.identifier).trim() : null);
        const devInsert = await tx.queryOne(`
          INSERT INTO devices (
            store_id, brand, model, storage, color, category, imei1, condition,
            cost_price, sell_price, supplier_id, supplier_name, entry_date, status, notes, created_by
          ) VALUES ($1, $2, $3, $4, $5, 'Smartphone', $6, $7, $8, $9, $10, $11, $12, 'in_stock', $13, $14)
          RETURNING id
        `, [
          storeId, item.brand || 'Outra', item.model || item.description, item.storage || null, item.color || null,
          imei1, item.condition || 'Seminovo', fromCents(item.unit_cost_cents), fromCents(item.sale_price_cents),
          supplierId, supplierName, purchaseDate, `Edição Compra ${existing.purchase_number}`, user?.id || null
        ]);
        deviceId = devInsert.id;
      }

      await tx.execute(`
        INSERT INTO purchase_items (
          store_id, purchase_id, item_type, product_id, device_id, description, identifier,
          brand, model, storage, color, condition, quantity, unit_cost, total_cost, sale_price
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [
        storeId, existing.id, item.item_type, productId, deviceId, item.description,
        item.identifier || item.imei1 || null, item.brand || null, item.model || null, item.storage || null,
        item.color || null, item.condition || null, item.quantity, fromCents(item.unit_cost_cents),
        fromCents(item.total_cost_cents), fromCents(item.sale_price_cents)
      ]);
    }

    // 3. Reconciliar contas a pagar / retiradas sem alterar pagamentos já realizados
    const originLabel = existing.origin_type === 'customer_trade' ? `Cliente ${existing.customer_name}` : supplierName;
    let remainingToPayCents = 0;
    let creditToCompensateCents = 0;

    if (!hasPayments) {
      if (payable) {
        await tx.execute('DELETE FROM payable_installments WHERE payable_id = $1 AND store_id = $2', [payable.id, storeId]);
        await tx.execute('DELETE FROM accounts_payable WHERE id = $1 AND store_id = $2', [payable.id, storeId]);
      }
      if (downPaymentCents > 0) {
        await tx.execute(`
          INSERT INTO cash_withdrawals (
            store_id, amount, reason, withdrawal_date, notes, source_type, supplier_id, supplier_name, created_by, created_by_name_snapshot
          ) VALUES ($1, $2, $3, $4, $5, 'purchase_payment', $6, $7, $8, $9)
        `, [
          storeId, fromCents(downPaymentCents), `Compra ${existing.purchase_number} (${originLabel}) [${paymentMethod}]`,
          paymentDate, notes, supplierId, originLabel, user?.id || null, user?.full_name || user?.username || null
        ]);
      }
      if (paymentCondition === 'installments') {
        const financedCents = totalCents - downPaymentCents;
        remainingToPayCents = financedCents;
        const newPayable = await tx.queryOne(`
          INSERT INTO accounts_payable (
            store_id, purchase_id, supplier_id, supplier_name, origin_type, category,
            description, total_amount, paid_amount, status, due_date, notes, created_by
          ) VALUES ($1, $2, $3, $4, 'purchase', 'Compra', $5, $6, 0, 'open', $7, $8, $9)
          RETURNING id
        `, [
          storeId, existing.id, supplierId, originLabel,
          `Compra ${existing.purchase_number}${invoiceNumber ? ` (NF ${invoiceNumber})` : ''}`,
          fromCents(financedCents), normalizedInstallments[0].due_date, notes, user?.id || null
        ]);
        for (const inst of normalizedInstallments) {
          await tx.execute(`
            INSERT INTO payable_installments (
              store_id, payable_id, installment_number, total_installments, amount, paid_amount, due_date, status
            ) VALUES ($1, $2, $3, $4, $5, 0, $6, 'open')
          `, [storeId, newPayable.id, inst.installment_number, normalizedInstallments.length, fromCents(inst.amount_cents), inst.due_date]);
        }
      }
    } else {
      // Compra já possui pagamentos realizados: preservar retiradas e pagamentos históricos
      const diffCents = totalCents - alreadyPaidCents;
      if (diffCents > 0) {
        remainingToPayCents = diffCents;
        const dueDate = String(b.installments?.[0]?.due_date || purchaseDate).slice(0, 10);
        if (payable) {
          await tx.execute(
            "DELETE FROM payable_installments WHERE payable_id = $1 AND store_id = $2 AND status IN ('open', 'canceled') AND paid_amount = 0",
            [payable.id, storeId]
          );
          await tx.execute(
            "UPDATE accounts_payable SET total_amount = $1, status = 'partial', updated_at = $2 WHERE id = $3 AND store_id = $4",
            [fromCents(toCents(payable.paid_amount || 0) + remainingToPayCents), trustedNow, payable.id, storeId]
          );
          const maxInst = await tx.queryOne(
            'SELECT COALESCE(MAX(installment_number), 0) AS max_num FROM payable_installments WHERE payable_id = $1',
            [payable.id]
          );
          const nextNum = Number(maxInst?.max_num || 0) + 1;
          await tx.execute(`
            INSERT INTO payable_installments (
              store_id, payable_id, installment_number, total_installments, amount, paid_amount, due_date, status
            ) VALUES ($1, $2, $3, $3, $4, 0, $5, 'open')
          `, [storeId, payable.id, nextNum, fromCents(remainingToPayCents), dueDate]);
        } else {
          const newPayable = await tx.queryOne(`
            INSERT INTO accounts_payable (
              store_id, purchase_id, supplier_id, supplier_name, origin_type, category,
              description, total_amount, paid_amount, status, due_date, notes, created_by
            ) VALUES ($1, $2, $3, $4, 'purchase', 'Compra', $5, $6, 0, 'open', $7, $8, $9)
            RETURNING id
          `, [
            storeId, existing.id, supplierId, originLabel,
            `Diferença Compra ${existing.purchase_number}${invoiceNumber ? ` (NF ${invoiceNumber})` : ''}`,
            fromCents(remainingToPayCents), dueDate, notes, user?.id || null
          ]);
          await tx.execute(`
            INSERT INTO payable_installments (
              store_id, payable_id, installment_number, total_installments, amount, paid_amount, due_date, status
            ) VALUES ($1, $2, 1, 1, $3, 0, $4, 'open')
          `, [storeId, newPayable.id, fromCents(remainingToPayCents), dueDate]);
        }
      } else {
        if (diffCents < 0) {
          creditToCompensateCents = Math.abs(diffCents);
          const creditTag = `[CRÉDITO A COMPENSAR: R$ ${fromCents(creditToCompensateCents).toFixed(2)}]`;
          notes = notes ? `${notes}\n${creditTag}` : creditTag;
        }
        if (payable) {
          await tx.execute(
            "UPDATE payable_installments SET status = 'canceled', updated_at = $1 WHERE payable_id = $2 AND store_id = $3 AND status = 'open' AND paid_amount = 0",
            [trustedNow, payable.id, storeId]
          );
          await tx.execute(
            "UPDATE accounts_payable SET status = 'paid', updated_at = $1 WHERE id = $2 AND store_id = $3",
            [trustedNow, payable.id, storeId]
          );
        }
      }
    }

    const updated = await tx.queryOne(`
      UPDATE purchases SET
        supplier_id = $1, supplier_name = $2, invoice_number = $3, purchase_date = $4,
        subtotal = $5, discount = $6, freight = $7, total_amount = $8,
        payment_condition = $9, payment_method = $10, down_payment = $11, installments_count = $12,
        notes = $13, updated_at = $14
      WHERE id = $15 AND store_id = $16
      RETURNING *
    `, [
      supplierId, supplierName, invoiceNumber, purchaseDate,
      fromCents(subtotalCents), fromCents(discountCents), fromCents(freightCents), fromCents(totalCents),
      paymentCondition, paymentMethod, fromCents(downPaymentCents),
      hasPayments ? (remainingToPayCents > 0 ? 1 : existing.installments_count) : normalizedInstallments.length,
      notes, trustedNow, existing.id, storeId
    ]);

    return {
      purchase: updated,
      before: existing,
      after: updated,
      reconciliation: {
        original_total: Number(existing.total_amount || 0),
        new_total: fromCents(totalCents),
        already_paid: fromCents(alreadyPaidCents),
        difference: fromCents(totalCents - toCents(existing.total_amount)),
        remaining_to_pay: fromCents(remainingToPayCents),
        credit_to_compensate: fromCents(creditToCompensateCents),
      }
    };
  });

  await logAction({
    user,
    action: 'update_purchase',
    recordType: 'purchase',
    recordId: result.purchase.id,
    details: { before_total: result.before.total_amount, after_total: result.after.total_amount, reconciliation: result.reconciliation },
    storeId
  });
  emitDashboardRefresh({ source: 'purchase_update', purchaseId: result.purchase.id });
  return result;
}

async function cancelPurchase(db, storeId, user, purchaseId, { reason = '' } = {}) {
  const cleanReason = String(reason || '').trim() || 'Cancelamento solicitado pelo administrador';
  const trustedNow = await getTrustedNowSqlite();

  const canceled = await db.transaction(async (tx) => {
    const lockSql = tx.isSqlite
      ? 'SELECT * FROM purchases WHERE id = $1 AND store_id = $2'
      : 'SELECT * FROM purchases WHERE id = $1 AND store_id = $2 FOR UPDATE';
    const existing = await tx.queryOne(lockSql, [purchaseId, storeId]);
    if (!existing) throw createHttpError(404, 'Compra não encontrada nesta loja.');
    if (existing.status === 'canceled') throw createHttpError(409, 'Esta compra já está cancelada.');

    const payable = await tx.queryOne('SELECT * FROM accounts_payable WHERE purchase_id = $1 AND store_id = $2', [existing.id, storeId]);
    const hasPayments =
      existing.payment_condition === 'cash' ||
      Number(existing.down_payment || 0) > 0 ||
      Number(payable?.paid_amount || 0) > 0;

    if (hasPayments) {
      throw createHttpError(409, 'Esta compra possui pagamentos realizados e não pode ser cancelada diretamente. Preserve os registros financeiros ou realize o estorno adequado.');
    }

    const oldItems = await tx.query('SELECT * FROM purchase_items WHERE purchase_id = $1 AND store_id = $2', [existing.id, storeId]);
    for (const old of oldItems) {
      if (old.product_id) {
        const lvl = await tx.queryOne('SELECT quantity FROM stock_levels WHERE product_id = $1', [old.product_id]);
        const prevQty = parseInt(lvl?.quantity || 0, 10);
        const newQty = Math.max(0, prevQty - parseInt(old.quantity || 0, 10));
        await tx.execute('UPDATE stock_levels SET quantity = $1, updated_at = $2 WHERE product_id = $3', [newQty, trustedNow, old.product_id]);
        await tx.execute(`
          INSERT INTO stock_movements (
            store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity,
            reason, reference_type, reference_id, user_id, user_name, created_at
          ) VALUES ($1, $2, 'adjustment', $3, $4, $5, $6, 'purchase_cancel', $7, $8, $9, $10)
        `, [
          storeId, old.product_id, -(prevQty - newQty), prevQty, newQty,
          `Cancelamento Compra ${existing.purchase_number}: ${cleanReason}`, existing.id,
          user?.id || null, user?.full_name || user?.username || null, trustedNow
        ]);
      } else if (old.device_id) {
        const dev = await tx.queryOne('SELECT id, status FROM devices WHERE id = $1 AND store_id = $2', [old.device_id, storeId]);
        if (dev && dev.status !== 'in_stock') {
          throw createHttpError(409, 'Um aparelho desta compra já foi vendido ou reservado; não é possível cancelar a compra.');
        }
        if (dev) {
          await tx.execute("UPDATE devices SET status = 'archived', updated_at = $1 WHERE id = $2 AND store_id = $3", [trustedNow, dev.id, storeId]);
        }
      }
    }

    if (payable) {
      await tx.execute("UPDATE accounts_payable SET status = 'canceled', updated_at = $1 WHERE id = $2 AND store_id = $3", [trustedNow, payable.id, storeId]);
      await tx.execute("UPDATE payable_installments SET status = 'canceled', updated_at = $1 WHERE payable_id = $2 AND store_id = $3 AND status IN ('open', 'partial')", [trustedNow, payable.id, storeId]);
    }

    const updatedNotes = existing.notes ? `${existing.notes}\n[CANCELADA]: ${cleanReason}` : `[CANCELADA]: ${cleanReason}`;
    return tx.queryOne(
      "UPDATE purchases SET status = 'canceled', notes = $1, updated_at = $2 WHERE id = $3 AND store_id = $4 RETURNING *",
      [updatedNotes, trustedNow, existing.id, storeId]
    );
  });

  await logAction({
    user,
    action: 'cancel_purchase',
    recordType: 'purchase',
    recordId: canceled.id,
    details: { purchase_number: canceled.purchase_number, reason: cleanReason },
    storeId
  });
  emitDashboardRefresh({ source: 'purchase_cancel', purchaseId: canceled.id });
  return canceled;
}

module.exports = {
  createPurchase,
  updatePurchase,
  cancelPurchase,
  toCents,
  fromCents,
};
