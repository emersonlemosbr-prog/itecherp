const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { emitInventoryRefresh, emitDashboardRefresh } = require('../utils/events');

const router = express.Router();

// Strict security: all Danger Zone routes require valid session and admin role
router.use(authenticate, requireRole('admin'));

const clearingOperationsInProgress = new Set();

function placeholders(arr) {
  return arr.map(() => '?').join(',');
}

// GET /api/danger-zone/stats
// Returns counts, dependencies, and protection status for all manageable entities
router.get('/stats', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;

    // 1. Clientes
    const customersRow = await db.queryOne(
      'SELECT COUNT(*) AS n FROM customers WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND is_system = 0',
      [storeId, storeId]
    );
    const customersCount = parseInt(customersRow?.n, 10) || 0;

    const [soCustRow, dsCustRow, caCustRow, wCustRow] = await Promise.all([
      db.queryOne(
        'SELECT COUNT(*) AS n FROM service_orders WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND customer_id IN (SELECT id FROM customers WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND is_system = 0)',
        [storeId, storeId, storeId, storeId]
      ),
      db.queryOne(
        'SELECT COUNT(*) AS n FROM device_sales WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND customer_id IN (SELECT id FROM customers WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND is_system = 0)',
        [storeId, storeId, storeId, storeId]
      ),
      db.queryOne(
        'SELECT COUNT(*) AS n FROM credit_accounts WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND customer_id IN (SELECT id FROM customers WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND is_system = 0)',
        [storeId, storeId, storeId, storeId]
      ),
      db.queryOne(
        'SELECT COUNT(*) AS n FROM warranties WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND customer_id IN (SELECT id FROM customers WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND is_system = 0)',
        [storeId, storeId, storeId, storeId]
      ),
    ]);

    const customerDeps = {
      service_orders: parseInt(soCustRow?.n, 10) || 0,
      device_sales: parseInt(dsCustRow?.n, 10) || 0,
      credit_accounts: parseInt(caCustRow?.n, 10) || 0,
      warranties: parseInt(wCustRow?.n, 10) || 0,
    };
    customerDeps.hasDependencies = (
      customerDeps.service_orders > 0 ||
      customerDeps.device_sales > 0 ||
      customerDeps.credit_accounts > 0 ||
      customerDeps.warranties > 0
    );

    // 2. Ordens de Serviço
    const soRow = await db.queryOne(
      'SELECT COUNT(*) AS n FROM service_orders WHERE store_id = ? OR (? = 1 AND store_id IS NULL)',
      [storeId, storeId]
    );
    const soCount = parseInt(soRow?.n, 10) || 0;

    const [soPhotosRow, soWarrRow, soWithRow, soCredRow] = await Promise.all([
      db.queryOne(
        'SELECT COUNT(*) AS n FROM service_order_photos WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = ? OR (? = 1 AND store_id IS NULL))',
        [storeId, storeId]
      ),
      db.queryOne(
        'SELECT COUNT(*) AS n FROM warranties WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = ? OR (? = 1 AND store_id IS NULL))',
        [storeId, storeId]
      ),
      db.queryOne(
        'SELECT COUNT(*) AS n FROM cash_withdrawals WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = ? OR (? = 1 AND store_id IS NULL))',
        [storeId, storeId]
      ),
      db.queryOne(
        'SELECT COUNT(*) AS n FROM credit_accounts WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = ? OR (? = 1 AND store_id IS NULL))',
        [storeId, storeId]
      ),
    ]);

    const soDetails = {
      photos: parseInt(soPhotosRow?.n, 10) || 0,
      warranties: parseInt(soWarrRow?.n, 10) || 0,
      linked_withdrawals: parseInt(soWithRow?.n, 10) || 0,
      linked_credit: parseInt(soCredRow?.n, 10) || 0,
    };

    // 3. Estoque e Produtos
    const [totalProdRow, activeProdRow, stockQtyRow, stockMovRow] = await Promise.all([
      db.queryOne(
        'SELECT COUNT(*) AS n FROM stock_products WHERE store_id = ? OR (? = 1 AND store_id IS NULL)',
        [storeId, storeId]
      ),
      db.queryOne(
        'SELECT COUNT(*) AS n FROM stock_products WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND is_active = 1',
        [storeId, storeId]
      ),
      db.queryOne(
        'SELECT COALESCE(SUM(l.quantity), 0) AS n FROM stock_levels l JOIN stock_products p ON p.id = l.product_id WHERE (p.store_id = ? OR (? = 1 AND p.store_id IS NULL)) AND p.is_active = 1',
        [storeId, storeId]
      ),
      db.queryOne(`
        SELECT COUNT(*) AS n
        FROM stock_movements sm
        WHERE (sm.store_id = ? OR (? = 1 AND sm.store_id IS NULL))
           OR sm.product_id IN (SELECT id FROM stock_products WHERE store_id = ? OR (? = 1 AND store_id IS NULL))
      `, [storeId, storeId, storeId, storeId]),
    ]);

    const totalProductsCount = parseInt(totalProdRow?.n, 10) || 0;
    const activeProductsCount = parseInt(activeProdRow?.n, 10) || 0;
    const inactiveProductsCount = Math.max(0, totalProductsCount - activeProductsCount);
    const stockQtyTotal = parseFloat(stockQtyRow?.n) || 0;
    const stockMovementsCount = parseInt(stockMovRow?.n, 10) || 0;

    const salesItemsRow = await db.queryOne(
      'SELECT COUNT(*) AS n FROM store_sale_items ssi JOIN stock_products p ON p.id = ssi.product_id WHERE p.store_id = ? OR (? = 1 AND p.store_id IS NULL)',
      [storeId, storeId]
    );
    const salesItemsCount = parseInt(salesItemsRow?.n, 10) || 0;

    const inventoryDeps = {
      sales_items: salesItemsCount,
      movements: stockMovementsCount,
      hasDependencies: (salesItemsCount > 0 || stockMovementsCount > 0),
    };

    // 4. Fornecedores
    const suppRow = await db.queryOne(
      'SELECT COUNT(*) AS n FROM stock_suppliers WHERE store_id = ? OR (? = 1 AND store_id IS NULL)',
      [storeId, storeId]
    );
    const suppliersCount = parseInt(suppRow?.n, 10) || 0;

    const [suppProdRow, suppSoRow, suppWithRow] = await Promise.all([
      db.queryOne(
        'SELECT COUNT(*) AS n FROM stock_products WHERE supplier_id IS NOT NULL AND (store_id = ? OR (? = 1 AND store_id IS NULL))',
        [storeId, storeId]
      ),
      db.queryOne(
        'SELECT COUNT(*) AS n FROM service_orders WHERE supplier_id IS NOT NULL AND (store_id = ? OR (? = 1 AND store_id IS NULL))',
        [storeId, storeId]
      ),
      db.queryOne(
        'SELECT COUNT(*) AS n FROM cash_withdrawals WHERE supplier_id IS NOT NULL AND (store_id = ? OR (? = 1 AND store_id IS NULL))',
        [storeId, storeId]
      ),
    ]);

    const supplierDeps = {
      products: parseInt(suppProdRow?.n, 10) || 0,
      service_orders: parseInt(suppSoRow?.n, 10) || 0,
      withdrawals: parseInt(suppWithRow?.n, 10) || 0,
    };
    supplierDeps.hasDependencies = (
      supplierDeps.products > 0 ||
      supplierDeps.service_orders > 0 ||
      supplierDeps.withdrawals > 0
    );

    // 5. Categorias
    const catRow = await db.queryOne(
      'SELECT COUNT(*) AS n FROM stock_categories WHERE store_id = ? OR (? = 1 AND store_id IS NULL)',
      [storeId, storeId]
    );
    const categoriesCount = parseInt(catRow?.n, 10) || 0;

    const catProdRow = await db.queryOne(
      'SELECT COUNT(*) AS n FROM stock_products WHERE category_id IS NOT NULL AND (store_id = ? OR (? = 1 AND store_id IS NULL))',
      [storeId, storeId]
    );
    const categoryDeps = {
      products: parseInt(catProdRow?.n, 10) || 0,
      hasDependencies: (parseInt(catProdRow?.n, 10) || 0) > 0,
    };

    // 6. Usuários e Funcionários
    const allUsers = await db.query(
      'SELECT id, full_name, username, role, is_master, active FROM users WHERE store_id = ? OR (? = 1 AND store_id IS NULL) ORDER BY LOWER(full_name)',
      [storeId, storeId]
    );

    const activeAdminsCount = allUsers.filter(u => u.role === 'admin' && u.active).length;

    const usersList = allUsers.map(u => {
      const isSelf = u.id === req.user.id;
      const isMaster = Boolean(u.is_master);
      const isLastAdmin = u.role === 'admin' && activeAdminsCount <= 1;
      const canDelete = !isSelf && !isMaster && !isLastAdmin;

      let protectionReason = '';
      if (isSelf) protectionReason = 'Sua conta conectada';
      else if (isMaster) protectionReason = 'ADM Master protegido';
      else if (isLastAdmin) protectionReason = 'Único administrador ativo';

      return {
        id: u.id,
        full_name: u.full_name,
        username: u.username,
        role: u.role,
        is_master: isMaster,
        is_self: isSelf,
        is_last_admin: isLastAdmin,
        can_delete: canDelete,
        protection_reason: protectionReason,
      };
    });

    const removableUsersCount = usersList.filter(u => u.can_delete).length;

    // 7. Entidades auxiliares existentes (Modelos e Marcas, Anotações)
    let partsModelsCount = 0;
    let partsBrandsCount = 0;
    try {
      const pmRow = await db.queryOne('SELECT COUNT(*) AS n FROM parts_models');
      const pbRow = await db.queryOne("SELECT COUNT(*) AS n FROM parts_options WHERE kind = 'brand'");
      partsModelsCount = parseInt(pmRow?.n, 10) || 0;
      partsBrandsCount = parseInt(pbRow?.n, 10) || 0;
    } catch (_) {}

    let notesCount = 0;
    try {
      const nRow = await db.queryOne('SELECT COUNT(*) AS n FROM notes WHERE store_id = ? OR (? = 1 AND store_id IS NULL)', [storeId, storeId]);
      notesCount = parseInt(nRow?.n, 10) || 0;
    } catch (_) {}

    // 8. Informações de backup
    let lastBackup = null;
    try {
      const settingsRow = await db.queryOne('SELECT last_backup FROM system_settings WHERE store_id = ? OR (? = 1 AND store_id IS NULL)', [storeId, storeId]);
      lastBackup = settingsRow?.last_backup || null;
    } catch (_) {}

    // Nome da loja associada
    let storeName = 'Loja Principal';
    try {
      const storeRow = await db.queryOne('SELECT name FROM stores WHERE id = ?', [storeId]);
      if (storeRow?.name) storeName = storeRow.name;
    } catch (_) {}

    res.json({
      store: {
        id: storeId,
        name: storeName,
      },
      customers: {
        count: customersCount,
        dependencies: customerDeps,
      },
      service_orders: {
        count: soCount,
        details: soDetails,
      },
      inventory: {
        count: activeProductsCount,
        active_count: activeProductsCount,
        total_count: totalProductsCount,
        inactive_count: inactiveProductsCount,
        stock_qty_total: stockQtyTotal,
        dependencies: inventoryDeps,
      },
      stock_movements: {
        count: stockMovementsCount,
      },
      suppliers: {
        count: suppliersCount,
        dependencies: supplierDeps,
      },
      categories: {
        count: categoriesCount,
        dependencies: categoryDeps,
      },
      users: {
        total: allUsers.length,
        removable_count: removableUsersCount,
        list: usersList,
      },
      parts_catalog: {
        models_count: partsModelsCount,
        brands_count: partsBrandsCount,
      },
      notes: {
        count: notesCount,
      },
      backup: {
        last_backup: lastBackup,
        has_system_backup: true,
      },
    });
  } catch (error) {
    console.error('[DANGER_ZONE_STATS_ERROR]', {
      storeId: req.user?.store_id,
      userId: req.user?.id,
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      error: 'Falha ao consultar os registros do banco de dados na Zona de Perigo.',
      message: error.message,
    });
  }
});

// POST /api/danger-zone/clear/customers
router.post('/clear/customers', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;

    // Verificar dependências
    const [loRow, lsRow, lcRow, lwRow] = await Promise.all([
      db.queryOne(
        'SELECT COUNT(*) AS n FROM service_orders WHERE (store_id = ? OR store_id IS NULL) AND customer_id IN (SELECT id FROM customers WHERE (store_id = ? OR store_id IS NULL) AND is_system = 0)',
        [storeId, storeId]
      ),
      db.queryOne(
        'SELECT COUNT(*) AS n FROM device_sales WHERE (store_id = ? OR store_id IS NULL) AND customer_id IN (SELECT id FROM customers WHERE (store_id = ? OR store_id IS NULL) AND is_system = 0)',
        [storeId, storeId]
      ),
      db.queryOne(
        'SELECT COUNT(*) AS n FROM credit_accounts WHERE (store_id = ? OR store_id IS NULL) AND customer_id IN (SELECT id FROM customers WHERE (store_id = ? OR store_id IS NULL) AND is_system = 0)',
        [storeId, storeId]
      ),
      db.queryOne(
        'SELECT COUNT(*) AS n FROM warranties WHERE (store_id = ? OR store_id IS NULL) AND customer_id IN (SELECT id FROM customers WHERE (store_id = ? OR store_id IS NULL) AND is_system = 0)',
        [storeId, storeId]
      ),
    ]);

    const linkedOrders = parseInt(loRow?.n, 10) || 0;
    const linkedSales = parseInt(lsRow?.n, 10) || 0;
    const linkedCredit = parseInt(lcRow?.n, 10) || 0;
    const linkedWarranties = parseInt(lwRow?.n, 10) || 0;

    if (linkedOrders > 0 || linkedSales > 0 || linkedCredit > 0 || linkedWarranties > 0) {
      const parts = [];
      if (linkedOrders > 0) parts.push(`${linkedOrders} ordem(ns) de serviço`);
      if (linkedSales > 0) parts.push(`${linkedSales} venda(s) de aparelhos`);
      if (linkedCredit > 0) parts.push(`${linkedCredit} conta(s) de fiado`);
      if (linkedWarranties > 0) parts.push(`${linkedWarranties} garantia(s)`);

      return res.status(409).json({
        error: 'Não foi possível excluir os clientes: existem registros vinculados.',
        blocked: true,
        dependencies: {
          service_orders: linkedOrders,
          device_sales: linkedSales,
          credit_accounts: linkedCredit,
          warranties: linkedWarranties,
        },
        message: `Não foi possível excluir os clientes porque existem registros vinculados: ${parts.join(', ')}. Para evitar registros órfãos ou inconsistências no histórico, exclua primeiro as ordens de serviço ou desvincule os registros.`,
      });
    }

    const totalBeforeRow = await db.queryOne(
      'SELECT COUNT(*) AS n FROM customers WHERE (store_id = ? OR store_id IS NULL) AND is_system = 0',
      [storeId]
    );
    const totalBefore = parseInt(totalBeforeRow?.n, 10) || 0;

    if (totalBefore === 0) {
      return res.json({ success: true, count: 0, message: 'Nenhum cliente cadastrado para excluir.' });
    }

    const result = await db.transaction(async (tx) => {
      const del = await tx.execute('DELETE FROM customers WHERE (store_id = ? OR store_id IS NULL) AND is_system = 0', [storeId]);
      await logAction({
        user: req.user,
        action: 'danger_zone_clear_customers',
        recordType: 'danger_zone',
        recordId: 'customers',
        details: { count: del.changes, store_id: storeId },
      });
      return del.changes;
    });

    res.json({
      success: true,
      count: result,
      message: `Limpeza concluída. ${result} cliente(s) foram excluídos com sucesso.`,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/danger-zone/clear/service-orders
router.post('/clear/service-orders', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;

    const orders = await db.query(
      'SELECT id FROM service_orders WHERE store_id = ? OR store_id IS NULL',
      [storeId]
    );

    if (orders.length === 0) {
      return res.json({ success: true, count: 0, message: 'Nenhuma ordem de serviço cadastrada para excluir.' });
    }

    const orderIds = orders.map(o => o.id);
    const inClause = placeholders(orderIds);

    const result = await db.transaction(async (tx) => {
      // 1. Limpar histórico de status das ordens
      await tx.execute(`DELETE FROM service_order_status_history WHERE service_order_id IN (${inClause})`, orderIds);

      // 2. Limpar fotos vinculadas às ordens (registros no banco)
      await tx.execute(`DELETE FROM service_order_photos WHERE service_order_id IN (${inClause})`, orderIds);

      // 3. Desvincular verificações de vírus sem apagar relatórios de segurança
      try {
        await tx.execute(`UPDATE virus_scans SET service_order_id = NULL WHERE service_order_id IN (${inClause})`, orderIds);
      } catch (_) {}

      // 4. Limpar garantias criadas a partir destas ordens
      await tx.execute(`DELETE FROM warranties WHERE service_order_id IN (${inClause})`, orderIds);

      // 5. Preservação de caixa e fiados
      await tx.execute(`UPDATE cash_withdrawals SET service_order_id = NULL WHERE service_order_id IN (${inClause})`, orderIds);
      await tx.execute(`UPDATE credit_accounts SET service_order_id = NULL WHERE service_order_id IN (${inClause})`, orderIds);

      // 6. Excluir as ordens de serviço
      const del = await tx.execute(`DELETE FROM service_orders WHERE id IN (${inClause})`, orderIds);

      await logAction({
        user: req.user,
        action: 'danger_zone_clear_service_orders',
        recordType: 'danger_zone',
        recordId: 'service_orders',
        details: { count: del.changes, store_id: storeId },
      });

      return del.changes;
    });

    res.json({
      success: true,
      count: result,
      message: `Limpeza concluída. ${result} ordem(ns) de serviço excluída(s). Os registros de retiradas de caixa e lançamentos financeiros foram preservados.`,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/danger-zone/clear/inventory
router.post('/clear/inventory', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const action = req.body?.action || 'delete'; // 'delete' | 'zero_stock' | 'deactivate'

    // Alternativa segura 1: Zerar quantidades em estoque
    if (action === 'zero_stock') {
      const updated = await db.transaction(async (tx) => {
        const stmt = await tx.execute(`
          UPDATE stock_levels
          SET quantity = 0, updated_at = CURRENT_TIMESTAMP
          WHERE product_id IN (SELECT id FROM stock_products WHERE store_id = ? OR store_id IS NULL)
        `, [storeId]);

        await logAction({
          user: req.user,
          action: 'danger_zone_zero_stock',
          recordType: 'danger_zone',
          recordId: 'stock_levels',
          details: { count: stmt.changes, store_id: storeId },
        });
        return stmt.changes;
      });

      return res.json({
        success: true,
        mode: 'zero_stock',
        count: updated,
        message: `Estoque zerado com sucesso para ${updated} produto(s). Históricos e cadastros foram preservados.`,
      });
    }

    // Alternativa segura 2: Desativar produtos
    if (action === 'deactivate') {
      const updated = await db.transaction(async (tx) => {
        const stmt = await tx.execute(`
          UPDATE stock_products
          SET is_active = 0, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE (store_id = ? OR store_id IS NULL) AND is_active = 1
        `, [storeId]);

        await logAction({
          user: req.user,
          action: 'danger_zone_deactivate_products',
          recordType: 'danger_zone',
          recordId: 'stock_products',
          details: { count: stmt.changes, store_id: storeId },
        });
        return stmt.changes;
      });

      return res.json({
        success: true,
        mode: 'deactivate',
        count: updated,
        message: `${updated} produto(s) foram desativados com sucesso. O histórico de movimentações foi preservado.`,
      });
    }

    // Ação: Exclusão física de produtos
    const salesRow = await db.queryOne(`
      SELECT COUNT(*) AS n
      FROM store_sale_items ssi
      JOIN stock_products p ON p.id = ssi.product_id
      WHERE p.store_id = ? OR p.store_id IS NULL
    `, [storeId]);

    const movRow = await db.queryOne(`
      SELECT COUNT(*) AS n
      FROM stock_movements sm
      JOIN stock_products p ON p.id = sm.product_id
      WHERE p.store_id = ? OR p.store_id IS NULL
    `, [storeId]);

    const salesCount = parseInt(salesRow?.n, 10) || 0;
    const movementsCount = parseInt(movRow?.n, 10) || 0;

    if (salesCount > 0 || movementsCount > 0) {
      return res.status(409).json({
        error: 'Não foi possível excluir fisicamente os produtos.',
        blocked: true,
        dependencies: {
          sales: salesCount,
          movements: movementsCount,
        },
        message: `Não foi possível excluir os produtos porque existem registros vinculados (${salesCount} itens de vendas e ${movementsCount} movimentações de estoque). Para proteger a integridade do histórico financeiro e fiscal, utilize as alternativas seguras de zerar o estoque ou desativar os produtos.`,
      });
    }

    const totalProductsRow = await db.queryOne(
      'SELECT COUNT(*) AS n FROM stock_products WHERE store_id = ? OR store_id IS NULL',
      [storeId]
    );
    const totalProducts = parseInt(totalProductsRow?.n, 10) || 0;

    if (totalProducts === 0) {
      return res.json({ success: true, count: 0, message: 'Nenhum produto cadastrado para excluir.' });
    }

    const result = await db.transaction(async (tx) => {
      // Excluir níveis de estoque
      await tx.execute(`
        DELETE FROM stock_levels
        WHERE product_id IN (SELECT id FROM stock_products WHERE store_id = ? OR store_id IS NULL)
      `, [storeId]);

      // Excluir produtos
      const del = await tx.execute('DELETE FROM stock_products WHERE store_id = ? OR store_id IS NULL', [storeId]);

      await logAction({
        user: req.user,
        action: 'danger_zone_clear_inventory',
        recordType: 'danger_zone',
        recordId: 'stock_products',
        details: { count: del.changes, store_id: storeId },
      });

      return del.changes;
    });

    res.json({
      success: true,
      count: result,
      message: `Limpeza concluída. ${result} produto(s) excluído(s) com sucesso.`,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/danger-zone/clear/stock-movements
router.post('/clear/stock-movements', async (req, res, next) => {
  const storeId = req.user.store_id || 1;
  const opKey = `stock_movements:${storeId}`;

  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores autorizados.' });
  }

  if (clearingOperationsInProgress.has(opKey)) {
    return res.status(409).json({
      error: 'Uma operação de limpeza de movimentações de estoque já está em processamento para esta loja.',
      blocked: true,
    });
  }

  clearingOperationsInProgress.add(opKey);

  try {
    const countRow = await db.queryOne(`
      SELECT COUNT(*) AS n
      FROM stock_movements sm
      WHERE (sm.store_id = ? OR (? = 1 AND sm.store_id IS NULL))
         OR sm.product_id IN (SELECT id FROM stock_products WHERE store_id = ? OR (? = 1 AND store_id IS NULL))
    `, [storeId, storeId, storeId, storeId]);

    const totalMovements = parseInt(countRow?.n, 10) || 0;

    if (totalMovements === 0) {
      return res.json({
        success: true,
        count: 0,
        message: 'Nenhuma movimentação de estoque registrada para exclusão no sistema.',
      });
    }

    const deletedCount = await db.transaction(async (tx) => {
      const del = await tx.execute(`
        DELETE FROM stock_movements
        WHERE (store_id = ? OR (? = 1 AND store_id IS NULL))
           OR product_id IN (SELECT id FROM stock_products WHERE store_id = ? OR (? = 1 AND store_id IS NULL))
      `, [storeId, storeId, storeId, storeId]);

      await logAction({
        user: req.user,
        action: 'danger_zone_clear_stock_movements',
        recordType: 'danger_zone',
        recordId: 'stock_movements',
        details: {
          admin_id: req.user.id,
          admin_name: req.user.full_name,
          admin_username: req.user.username,
          store_id: storeId,
          affected_records: del.changes,
          result: 'success',
          executed_at: new Date().toISOString(),
        },
      });

      return del.changes;
    });

    emitInventoryRefresh({ store_id: storeId, action: 'clear_stock_movements', count: deletedCount });
    emitDashboardRefresh({ store_id: storeId });

    return res.json({
      success: true,
      count: deletedCount,
      message: `Limpeza concluída. ${deletedCount} movimentação(ões) de estoque excluída(s) com sucesso. O cadastro e saldo dos produtos foram preservados.`,
    });
  } catch (error) {
    console.error('[DANGER_ZONE_CLEAR_STOCK_MOVEMENTS_ERROR]', {
      storeId,
      userId: req.user?.id,
      message: error.message,
    });
    return next(error);
  } finally {
    clearingOperationsInProgress.delete(opKey);
  }
});

// POST /api/danger-zone/clear/suppliers
router.post('/clear/suppliers', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;

    const [spRow, soRow, cwRow] = await Promise.all([
      db.queryOne(
        'SELECT COUNT(*) AS n FROM stock_products WHERE supplier_id IS NOT NULL AND (store_id = ? OR store_id IS NULL)',
        [storeId]
      ),
      db.queryOne(
        'SELECT COUNT(*) AS n FROM service_orders WHERE supplier_id IS NOT NULL AND (store_id = ? OR store_id IS NULL)',
        [storeId]
      ),
      db.queryOne(
        'SELECT COUNT(*) AS n FROM cash_withdrawals WHERE supplier_id IS NOT NULL AND (store_id = ? OR store_id IS NULL)',
        [storeId]
      ),
    ]);

    const linkedProducts = parseInt(spRow?.n, 10) || 0;
    const linkedOrders = parseInt(soRow?.n, 10) || 0;
    const linkedWithdrawals = parseInt(cwRow?.n, 10) || 0;

    if (linkedProducts > 0 || linkedOrders > 0 || linkedWithdrawals > 0) {
      const parts = [];
      if (linkedProducts > 0) parts.push(`${linkedProducts} produto(s)`);
      if (linkedOrders > 0) parts.push(`${linkedOrders} ordem(ns) de serviço`);
      if (linkedWithdrawals > 0) parts.push(`${linkedWithdrawals} retirada(s) de caixa`);

      return res.status(409).json({
        error: 'Não foi possível excluir os fornecedores: existem vínculos ativos.',
        blocked: true,
        dependencies: {
          products: linkedProducts,
          service_orders: linkedOrders,
          cash_withdrawals: linkedWithdrawals,
        },
        message: `Não foi possível excluir os fornecedores porque existem vínculos ativos: ${parts.join(', ')}. Para preservar o histórico de compras e custos operacionais, a exclusão foi bloqueada.`,
      });
    }

    const totalSuppliersRow = await db.queryOne(
      'SELECT COUNT(*) AS n FROM stock_suppliers WHERE store_id = ? OR store_id IS NULL',
      [storeId]
    );
    const totalSuppliers = parseInt(totalSuppliersRow?.n, 10) || 0;

    if (totalSuppliers === 0) {
      return res.json({ success: true, count: 0, message: 'Nenhum fornecedor cadastrado para excluir.' });
    }

    const result = await db.transaction(async (tx) => {
      const del = await tx.execute('DELETE FROM stock_suppliers WHERE store_id = ? OR store_id IS NULL', [storeId]);
      await logAction({
        user: req.user,
        action: 'danger_zone_clear_suppliers',
        recordType: 'danger_zone',
        recordId: 'stock_suppliers',
        details: { count: del.changes, store_id: storeId },
      });
      return del.changes;
    });

    res.json({
      success: true,
      count: result,
      message: `Limpeza concluída. ${result} fornecedor(es) excluído(s) com sucesso.`,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/danger-zone/clear/categories
router.post('/clear/categories', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;

    const prodRow = await db.queryOne(
      'SELECT COUNT(*) AS n FROM stock_products WHERE category_id IS NOT NULL AND (store_id = ? OR store_id IS NULL)',
      [storeId]
    );
    const linkedProducts = parseInt(prodRow?.n, 10) || 0;

    if (linkedProducts > 0) {
      return res.status(409).json({
        error: 'Não foi possível excluir as categorias: existem produtos vinculados.',
        blocked: true,
        dependencies: { products: linkedProducts },
        message: `Não foi possível excluir as categorias porque existem ${linkedProducts} produto(s) vinculados a elas. Desvincule ou remova os produtos antes de continuar.`,
      });
    }

    const totalCatRow = await db.queryOne(
      'SELECT COUNT(*) AS n FROM stock_categories WHERE store_id = ? OR store_id IS NULL',
      [storeId]
    );
    const totalCategories = parseInt(totalCatRow?.n, 10) || 0;

    if (totalCategories === 0) {
      return res.json({ success: true, count: 0, message: 'Nenhuma categoria cadastrada para excluir.' });
    }

    const result = await db.transaction(async (tx) => {
      const del = await tx.execute('DELETE FROM stock_categories WHERE store_id = ? OR store_id IS NULL', [storeId]);
      await logAction({
        user: req.user,
        action: 'danger_zone_clear_categories',
        recordType: 'danger_zone',
        recordId: 'stock_categories',
        details: { count: del.changes, store_id: storeId },
      });
      return del.changes;
    });

    res.json({
      success: true,
      count: result,
      message: `Limpeza concluída. ${result} categoria(s) excluída(s) com sucesso.`,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/danger-zone/clear/users
router.post('/clear/users', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const userIds = Array.isArray(req.body?.user_ids)
      ? req.body.user_ids.map(id => parseInt(id, 10)).filter(Number.isFinite)
      : [];

    if (userIds.length === 0) {
      return res.status(400).json({ error: 'Nenhum usuário foi selecionado para exclusão.' });
    }

    // 1. Proibição: Excluir a própria conta
    if (userIds.includes(req.user.id)) {
      return res.status(400).json({ error: 'Você não pode excluir a sua própria conta conectada.' });
    }

    // 2. Verificar cada usuário selecionado
    const selectedUsers = await db.query(
      `SELECT * FROM users WHERE id IN (${placeholders(userIds)}) AND (store_id = ? OR store_id IS NULL)`,
      [...userIds, storeId]
    );

    if (selectedUsers.length !== userIds.length) {
      return res.status(404).json({ error: 'Um ou mais usuários selecionados não pertencem a esta loja.' });
    }

    // 3. Proibição: Excluir ADM Master
    const hasMaster = selectedUsers.some(u => Boolean(u.is_master));
    if (hasMaster) {
      return res.status(400).json({ error: 'Usuários com privilégio de ADM Master não podem ser excluídos pela Zona de Perigo.' });
    }

    // 4. Proibição: Deixar a loja sem administrador ativo
    const remainingAdminsRow = await db.queryOne(`
      SELECT COUNT(*) AS n FROM users
      WHERE (store_id = ? OR store_id IS NULL)
        AND role = 'admin'
        AND active = 1
        AND id NOT IN (${placeholders(userIds)})
    `, [storeId, ...userIds]);

    const remainingAdmins = parseInt(remainingAdminsRow?.n, 10) || 0;

    if (remainingAdmins <= 0) {
      return res.status(400).json({
        error: 'A operação não pode ser concluída: a loja não pode ficar sem nenhum administrador ativo.',
      });
    }

    // 5. Exclusão segura com preservação de snapshots de autoria
    await db.transaction(async (tx) => {
      for (const target of selectedUsers) {
        const name = target.full_name;

        // Preservar autoria histórica em snapshots
        await tx.execute('UPDATE service_orders SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, ?), created_by = NULL WHERE created_by = ?', [name, target.id]);
        await tx.execute('UPDATE cash_withdrawals SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, ?), created_by = NULL WHERE created_by = ?', [name, target.id]);
        await tx.execute('UPDATE audit_log SET user_name = COALESCE(user_name, ?), user_id = NULL WHERE user_id = ?', [name, target.id]);
        await tx.execute('UPDATE device_sales SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, ?), created_by = NULL WHERE created_by = ?', [name, target.id]);
        await tx.execute('UPDATE stock_products SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, ?), created_by = NULL WHERE created_by = ?', [name, target.id]);
        await tx.execute('UPDATE stock_movements SET user_name = COALESCE(user_name, ?), user_id = NULL WHERE user_id = ?', [name, target.id]);
        await tx.execute('UPDATE store_sales SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, ?), created_by = NULL WHERE created_by = ?', [name, target.id]);
        await tx.execute('UPDATE store_sales SET canceled_by_name_snapshot = COALESCE(canceled_by_name_snapshot, ?), canceled_by = NULL WHERE canceled_by = ?', [name, target.id]);
        await tx.execute('UPDATE service_order_photos SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, ?), created_by = NULL WHERE created_by = ?', [name, target.id]);

        try {
          await tx.execute('UPDATE screen_protector_groups SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, ?), created_by = NULL WHERE created_by = ?', [name, target.id]);
        } catch (_) {}

        // Limpar dados pessoais auxiliares do usuário
        try {
          await tx.execute('DELETE FROM notes WHERE user_id = ?', [target.id]);
          await tx.execute('DELETE FROM labels WHERE user_id = ?', [target.id]);
          for (const table of ['pagbank_calculator', 'piece_calculator', 'frontals_calculator', 'frontals_price_list', 'favorite_notes', 'pinned_notes']) {
            await tx.execute(`DELETE FROM ${table} WHERE user_id = ?`, [target.id]);
          }
        } catch (_) {}

        // Excluir da tabela users
        await tx.execute('DELETE FROM users WHERE id = ? AND (store_id = ? OR store_id IS NULL)', [target.id, storeId]);

        await logAction({
          user: req.user,
          action: 'danger_zone_delete_user',
          recordType: 'user',
          recordId: target.id,
          details: { username: target.username, full_name: target.full_name, store_id: storeId },
        });
      }
    });

    res.json({
      success: true,
      count: userIds.length,
      message: `Limpeza concluída. ${userIds.length} usuário(s) removido(s) com sucesso.`,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/danger-zone/clear/parts-catalog (Entidade auxiliar)
router.post('/clear/parts-catalog', async (req, res, next) => {
  try {
    const totalRow = await db.queryOne('SELECT COUNT(*) AS n FROM parts_models');
    const totalModels = parseInt(totalRow?.n, 10) || 0;
    if (totalModels === 0) {
      return res.json({ success: true, count: 0, message: 'Nenhum modelo cadastrado para excluir.' });
    }

    const result = await db.transaction(async (tx) => {
      const del = await tx.execute('DELETE FROM parts_models');
      await logAction({
        user: req.user,
        action: 'danger_zone_clear_parts_models',
        recordType: 'danger_zone',
        recordId: 'parts_models',
        details: { count: del.changes },
      });
      return del.changes;
    });

    res.json({
      success: true,
      count: result,
      message: `Limpeza concluída. ${result} modelo(s) de peças excluído(s) com sucesso.`,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/danger-zone/clear/notes (Entidade auxiliar)
router.post('/clear/notes', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const totalRow = await db.queryOne('SELECT COUNT(*) AS n FROM notes WHERE store_id = ? OR store_id IS NULL', [storeId]);
    const totalNotes = parseInt(totalRow?.n, 10) || 0;

    if (totalNotes === 0) {
      return res.json({ success: true, count: 0, message: 'Nenhuma anotação cadastrada para excluir.' });
    }

    const result = await db.transaction(async (tx) => {
      const del = await tx.execute('DELETE FROM notes WHERE store_id = ? OR store_id IS NULL', [storeId]);
      await logAction({
        user: req.user,
        action: 'danger_zone_clear_notes',
        recordType: 'danger_zone',
        recordId: 'notes',
        details: { count: del.changes, store_id: storeId },
      });
      return del.changes;
    });

    res.json({
      success: true,
      count: result,
      message: `Limpeza concluída. ${result} anotação(ões) do bloco de notas excluída(s) com sucesso.`,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
