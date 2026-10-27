const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { emitInventoryRefresh, emitDashboardRefresh } = require('../utils/events');

const router = express.Router();

// Strict security: all Danger Zone routes require valid session and admin role
router.use(authenticate, requireRole('admin'));

const clearingOperationsInProgress = new Set();

function ensureUserColumns() {
  try {
    const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    if (!cols.includes('active')) {
      db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
    }
    if (!cols.includes('session_version')) {
      db.exec('ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0');
    }
  } catch (_) {}
}
ensureUserColumns();

function placeholders(arr) {
  return arr.map(() => '?').join(',');
}

// GET /api/danger-zone/stats
// Returns counts, dependencies, and protection status for all manageable entities
router.get('/stats', (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;

    // 1. Clientes (idêntico ao módulo de Clientes: is_system = 0 e store_id da loja)
    const customersCount = db.prepare(
      'SELECT COUNT(*) n FROM customers WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND is_system = 0'
    ).get(storeId, storeId).n;

    const customerDeps = {
      service_orders: db.prepare(
        'SELECT COUNT(*) n FROM service_orders WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND customer_id IN (SELECT id FROM customers WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND is_system = 0)'
      ).get(storeId, storeId, storeId, storeId).n,
      device_sales: db.prepare(
        'SELECT COUNT(*) n FROM device_sales WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND customer_id IN (SELECT id FROM customers WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND is_system = 0)'
      ).get(storeId, storeId, storeId, storeId).n,
      credit_accounts: db.prepare(
        'SELECT COUNT(*) n FROM credit_accounts WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND customer_id IN (SELECT id FROM customers WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND is_system = 0)'
      ).get(storeId, storeId, storeId, storeId).n,
      warranties: db.prepare(
        'SELECT COUNT(*) n FROM warranties WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND customer_id IN (SELECT id FROM customers WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND is_system = 0)'
      ).get(storeId, storeId, storeId, storeId).n,
    };
    customerDeps.hasDependencies = (
      customerDeps.service_orders > 0 ||
      customerDeps.device_sales > 0 ||
      customerDeps.credit_accounts > 0 ||
      customerDeps.warranties > 0
    );

    // 2. Ordens de Serviço (idêntico ao módulo de OS: store_id da loja)
    const soCount = db.prepare(
      'SELECT COUNT(*) n FROM service_orders WHERE store_id = ? OR (? = 1 AND store_id IS NULL)'
    ).get(storeId, storeId).n;

    const soDetails = {
      photos: db.prepare(
        'SELECT COUNT(*) n FROM service_order_photos WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = ? OR (? = 1 AND store_id IS NULL))'
      ).get(storeId, storeId).n,
      warranties: db.prepare(
        'SELECT COUNT(*) n FROM warranties WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = ? OR (? = 1 AND store_id IS NULL))'
      ).get(storeId, storeId).n,
      linked_withdrawals: db.prepare(
        'SELECT COUNT(*) n FROM cash_withdrawals WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = ? OR (? = 1 AND store_id IS NULL))'
      ).get(storeId, storeId).n,
      linked_credit: db.prepare(
        'SELECT COUNT(*) n FROM credit_accounts WHERE service_order_id IN (SELECT id FROM service_orders WHERE store_id = ? OR (? = 1 AND store_id IS NULL))'
      ).get(storeId, storeId).n,
    };

    // 3. Estoque e Produtos (idêntico ao módulo de Estoque: produtos ativos e níveis de estoque)
    const totalProductsCount = db.prepare(
      'SELECT COUNT(*) n FROM stock_products WHERE store_id = ? OR (? = 1 AND store_id IS NULL)'
    ).get(storeId, storeId).n;

    const activeProductsCount = db.prepare(
      'SELECT COUNT(*) n FROM stock_products WHERE (store_id = ? OR (? = 1 AND store_id IS NULL)) AND is_active = 1'
    ).get(storeId, storeId).n;

    const inactiveProductsCount = Math.max(0, totalProductsCount - activeProductsCount);

    const stockQtyTotal = db.prepare(
      'SELECT COALESCE(SUM(l.quantity), 0) n FROM stock_levels l JOIN stock_products p ON p.id = l.product_id WHERE (p.store_id = ? OR (? = 1 AND p.store_id IS NULL)) AND p.is_active = 1'
    ).get(storeId, storeId).n;

    // Movimentações de Estoque (origem idêntica ao Controle de Estoque > Movimentações)
    const stockMovementsCount = db.prepare(`
      SELECT COUNT(*) n
      FROM stock_movements sm
      WHERE (sm.store_id = ? OR (? = 1 AND sm.store_id IS NULL))
         OR sm.product_id IN (SELECT id FROM stock_products WHERE store_id = ? OR (? = 1 AND store_id IS NULL))
    `).get(storeId, storeId, storeId, storeId).n;

    const inventoryDeps = {
      sales_items: db.prepare(
        'SELECT COUNT(*) n FROM store_sale_items ssi JOIN stock_products p ON p.id = ssi.product_id WHERE p.store_id = ? OR (? = 1 AND p.store_id IS NULL)'
      ).get(storeId, storeId).n,
      movements: stockMovementsCount,
    };
    inventoryDeps.hasDependencies = (inventoryDeps.sales_items > 0 || inventoryDeps.movements > 0);

    // 4. Fornecedores (idêntico ao módulo de Estoque > Fornecedores)
    const suppliersCount = db.prepare(
      'SELECT COUNT(*) n FROM stock_suppliers WHERE store_id = ? OR (? = 1 AND store_id IS NULL)'
    ).get(storeId, storeId).n;

    const supplierDeps = {
      products: db.prepare(
        'SELECT COUNT(*) n FROM stock_products WHERE supplier_id IS NOT NULL AND (store_id = ? OR (? = 1 AND store_id IS NULL))'
      ).get(storeId, storeId).n,
      service_orders: db.prepare(
        'SELECT COUNT(*) n FROM service_orders WHERE supplier_id IS NOT NULL AND (store_id = ? OR (? = 1 AND store_id IS NULL))'
      ).get(storeId, storeId).n,
      withdrawals: db.prepare(
        'SELECT COUNT(*) n FROM cash_withdrawals WHERE supplier_id IS NOT NULL AND (store_id = ? OR (? = 1 AND store_id IS NULL))'
      ).get(storeId, storeId).n,
    };
    supplierDeps.hasDependencies = (
      supplierDeps.products > 0 ||
      supplierDeps.service_orders > 0 ||
      supplierDeps.withdrawals > 0
    );

    // 5. Categorias (idêntico ao módulo de Estoque > Categorias)
    const categoriesCount = db.prepare(
      'SELECT COUNT(*) n FROM stock_categories WHERE store_id = ? OR (? = 1 AND store_id IS NULL)'
    ).get(storeId, storeId).n;

    const categoryDeps = {
      products: db.prepare(
        'SELECT COUNT(*) n FROM stock_products WHERE category_id IS NOT NULL AND (store_id = ? OR (? = 1 AND store_id IS NULL))'
      ).get(storeId, storeId).n,
    };
    categoryDeps.hasDependencies = (categoryDeps.products > 0);

    // 6. Usuários e Funcionários
    const allUsers = db.prepare(
      'SELECT id, full_name, username, role, is_master, active FROM users WHERE store_id = ? OR (? = 1 AND store_id IS NULL) ORDER BY full_name COLLATE NOCASE'
    ).all(storeId, storeId);

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
      partsModelsCount = db.prepare('SELECT COUNT(*) n FROM parts_models').get().n;
      partsBrandsCount = db.prepare("SELECT COUNT(*) n FROM parts_options WHERE kind = 'brand'").get().n;
    } catch (_) {}

    let notesCount = 0;
    try {
      notesCount = db.prepare('SELECT COUNT(*) n FROM notes WHERE store_id = ? OR (? = 1 AND store_id IS NULL)').get(storeId, storeId).n;
    } catch (_) {}

    // 8. Informações de backup existentes no sistema
    let lastBackup = null;
    try {
      const settingsRow = db.prepare('SELECT last_backup FROM system_settings WHERE store_id = ? OR (? = 1 AND store_id IS NULL)').get(storeId, storeId);
      lastBackup = settingsRow?.last_backup || null;
    } catch (_) {}

    // Nome da loja associada para identificação unívoca
    let storeName = 'Loja Principal';
    try {
      const storeRow = db.prepare('SELECT name FROM stores WHERE id = ?').get(storeId);
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
        count: activeProductsCount, // Contagem operacional ativa (idêntico ao módulo de Estoque)
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
router.post('/clear/customers', (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;

    // Verificar dependências
    const linkedOrders = db.prepare(
      'SELECT COUNT(*) n FROM service_orders WHERE (store_id = ? OR store_id IS NULL) AND customer_id IN (SELECT id FROM customers WHERE (store_id = ? OR store_id IS NULL) AND is_system = 0)'
    ).get(storeId, storeId).n;

    const linkedSales = db.prepare(
      'SELECT COUNT(*) n FROM device_sales WHERE (store_id = ? OR store_id IS NULL) AND customer_id IN (SELECT id FROM customers WHERE (store_id = ? OR store_id IS NULL) AND is_system = 0)'
    ).get(storeId, storeId).n;

    const linkedCredit = db.prepare(
      'SELECT COUNT(*) n FROM credit_accounts WHERE (store_id = ? OR store_id IS NULL) AND customer_id IN (SELECT id FROM customers WHERE (store_id = ? OR store_id IS NULL) AND is_system = 0)'
    ).get(storeId, storeId).n;

    const linkedWarranties = db.prepare(
      'SELECT COUNT(*) n FROM warranties WHERE (store_id = ? OR store_id IS NULL) AND customer_id IN (SELECT id FROM customers WHERE (store_id = ? OR store_id IS NULL) AND is_system = 0)'
    ).get(storeId, storeId).n;

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

    const totalBefore = db.prepare(
      'SELECT COUNT(*) n FROM customers WHERE (store_id = ? OR store_id IS NULL) AND is_system = 0'
    ).get(storeId).n;

    if (totalBefore === 0) {
      return res.json({ success: true, count: 0, message: 'Nenhum cliente cadastrado para excluir.' });
    }

    const result = db.transaction(() => {
      const del = db.prepare('DELETE FROM customers WHERE (store_id = ? OR store_id IS NULL) AND is_system = 0').run(storeId);
      logAction({
        user: req.user,
        action: 'danger_zone_clear_customers',
        recordType: 'danger_zone',
        recordId: 'customers',
        details: { count: del.changes, store_id: storeId },
      });
      return del.changes;
    })();

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
router.post('/clear/service-orders', (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;

    const orders = db.prepare(
      'SELECT id FROM service_orders WHERE store_id = ? OR store_id IS NULL'
    ).all(storeId);

    if (orders.length === 0) {
      return res.json({ success: true, count: 0, message: 'Nenhuma ordem de serviço cadastrada para excluir.' });
    }

    const orderIds = orders.map(o => o.id);
    const inClause = placeholders(orderIds);

    const result = db.transaction(() => {
      // 1. Limpar histórico de status das ordens
      db.prepare(`DELETE FROM service_order_status_history WHERE service_order_id IN (${inClause})`).run(...orderIds);

      // 2. Limpar fotos vinculadas às ordens (registros no banco)
      db.prepare(`DELETE FROM service_order_photos WHERE service_order_id IN (${inClause})`).run(...orderIds);

      // 3. Desvincular verificações de vírus sem apagar relatórios de segurança
      try {
        db.prepare(`UPDATE virus_scans SET service_order_id = NULL WHERE service_order_id IN (${inClause})`).run(...orderIds);
      } catch (_) {}

      // 4. Limpar garantias criadas a partir destas ordens
      db.prepare(`DELETE FROM warranties WHERE service_order_id IN (${inClause})`).run(...orderIds);

      // 5. PRESERVAÇÃO RIGOROSA DO HISTÓRICO FINANCEIRO:
      // Retiradas de caixa (cash_withdrawals) geradas para compras de peças de OS
      // NUNCA são apagadas; desvincula-se service_order_id para manter o livro caixa 100% íntegro.
      db.prepare(`UPDATE cash_withdrawals SET service_order_id = NULL WHERE service_order_id IN (${inClause})`).run(...orderIds);

      // Fiados (credit_accounts) vinculados às ordens são preservados como recebíveis
      db.prepare(`UPDATE credit_accounts SET service_order_id = NULL WHERE service_order_id IN (${inClause})`).run(...orderIds);

      // 6. Excluir as ordens de serviço
      const del = db.prepare(`DELETE FROM service_orders WHERE id IN (${inClause})`).run(...orderIds);

      logAction({
        user: req.user,
        action: 'danger_zone_clear_service_orders',
        recordType: 'danger_zone',
        recordId: 'service_orders',
        details: { count: del.changes, store_id: storeId },
      });

      return del.changes;
    })();

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
router.post('/clear/inventory', (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const action = req.body?.action || 'delete'; // 'delete' | 'zero_stock' | 'deactivate'

    // Alternativa segura 1: Zerar quantidades em estoque
    if (action === 'zero_stock') {
      const updated = db.transaction(() => {
        const stmt = db.prepare(`
          UPDATE stock_levels
          SET quantity = 0, updated_at = datetime('now')
          WHERE product_id IN (SELECT id FROM stock_products WHERE store_id = ? OR store_id IS NULL)
        `).run(storeId);

        logAction({
          user: req.user,
          action: 'danger_zone_zero_stock',
          recordType: 'danger_zone',
          recordId: 'stock_levels',
          details: { count: stmt.changes, store_id: storeId },
        });
        return stmt.changes;
      })();

      return res.json({
        success: true,
        mode: 'zero_stock',
        count: updated,
        message: `Estoque zerado com sucesso para ${updated} produto(s). Históricos e cadastros foram preservados.`,
      });
    }

    // Alternativa segura 2: Desativar produtos
    if (action === 'deactivate') {
      const updated = db.transaction(() => {
        const stmt = db.prepare(`
          UPDATE stock_products
          SET is_active = 0, deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE (store_id = ? OR store_id IS NULL) AND is_active = 1
        `).run(storeId);

        logAction({
          user: req.user,
          action: 'danger_zone_deactivate_products',
          recordType: 'danger_zone',
          recordId: 'stock_products',
          details: { count: stmt.changes, store_id: storeId },
        });
        return stmt.changes;
      })();

      return res.json({
        success: true,
        mode: 'deactivate',
        count: updated,
        message: `${updated} produto(s) foram desativados com sucesso. O histórico de movimentações foi preservado.`,
      });
    }

    // Ação: Exclusão física de produtos
    // Verificar dependências com vendas de produtos (store_sale_items) e movimentações (stock_movements)
    const salesCount = db.prepare(`
      SELECT COUNT(*) n
      FROM store_sale_items ssi
      JOIN stock_products p ON p.id = ssi.product_id
      WHERE p.store_id = ? OR p.store_id IS NULL
    `).get(storeId).n;

    const movementsCount = db.prepare(`
      SELECT COUNT(*) n
      FROM stock_movements sm
      JOIN stock_products p ON p.id = sm.product_id
      WHERE p.store_id = ? OR p.store_id IS NULL
    `).get(storeId).n;

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

    const totalProducts = db.prepare(
      'SELECT COUNT(*) n FROM stock_products WHERE store_id = ? OR store_id IS NULL'
    ).get(storeId).n;

    if (totalProducts === 0) {
      return res.json({ success: true, count: 0, message: 'Nenhum produto cadastrado para excluir.' });
    }

    const result = db.transaction(() => {
      // Excluir níveis de estoque
      db.prepare(`
        DELETE FROM stock_levels
        WHERE product_id IN (SELECT id FROM stock_products WHERE store_id = ? OR store_id IS NULL)
      `).run(storeId);

      // Excluir produtos
      const del = db.prepare('DELETE FROM stock_products WHERE store_id = ? OR store_id IS NULL').run(storeId);

      logAction({
        user: req.user,
        action: 'danger_zone_clear_inventory',
        recordType: 'danger_zone',
        recordId: 'stock_products',
        details: { count: del.changes, store_id: storeId },
      });

      return del.changes;
    })();

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
router.post('/clear/stock-movements', (req, res, next) => {
  const storeId = req.user.store_id || 1;
  const opKey = `stock_movements:${storeId}`;

  // Validação estrita de perfil administrativo no backend
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores autorizados.' });
  }

  // Prevenção de execuções concorrentes ou duplicadas
  if (clearingOperationsInProgress.has(opKey)) {
    return res.status(409).json({
      error: 'Uma operação de limpeza de movimentações de estoque já está em processamento para esta loja.',
      blocked: true,
    });
  }

  clearingOperationsInProgress.add(opKey);

  try {
    // 1. Contagem real das movimentações antes da limpeza
    const countRow = db.prepare(`
      SELECT COUNT(*) n
      FROM stock_movements sm
      WHERE (sm.store_id = ? OR (? = 1 AND sm.store_id IS NULL))
         OR sm.product_id IN (SELECT id FROM stock_products WHERE store_id = ? OR (? = 1 AND store_id IS NULL))
    `).get(storeId, storeId, storeId, storeId);

    const totalMovements = countRow ? countRow.n : 0;

    if (totalMovements === 0) {
      return res.json({
        success: true,
        count: 0,
        message: 'Nenhuma movimentação de estoque registrada para exclusão no sistema.',
      });
    }

    // 2. Exclusão atômica em transação SQLite (garante que falhas não causem exclusão parcial)
    const deletedCount = db.transaction(() => {
      const del = db.prepare(`
        DELETE FROM stock_movements
        WHERE (store_id = ? OR (? = 1 AND store_id IS NULL))
           OR product_id IN (SELECT id FROM stock_products WHERE store_id = ? OR (? = 1 AND store_id IS NULL))
      `).run(storeId, storeId, storeId, storeId);

      // 3. Auditoria do administrador com todos os detalhes obrigatórios
      logAction({
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
    })();

    // 4. Notificar em tempo real para atualização imediata das telas conectadas
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
router.post('/clear/suppliers', (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;

    // Verificar dependências
    const linkedProducts = db.prepare(
      'SELECT COUNT(*) n FROM stock_products WHERE supplier_id IS NOT NULL AND (store_id = ? OR store_id IS NULL)'
    ).get(storeId).n;

    const linkedOrders = db.prepare(
      'SELECT COUNT(*) n FROM service_orders WHERE supplier_id IS NOT NULL AND (store_id = ? OR store_id IS NULL)'
    ).get(storeId).n;

    const linkedWithdrawals = db.prepare(
      'SELECT COUNT(*) n FROM cash_withdrawals WHERE supplier_id IS NOT NULL AND (store_id = ? OR store_id IS NULL)'
    ).get(storeId).n;

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

    const totalSuppliers = db.prepare(
      'SELECT COUNT(*) n FROM stock_suppliers WHERE store_id = ? OR store_id IS NULL'
    ).get(storeId).n;

    if (totalSuppliers === 0) {
      return res.json({ success: true, count: 0, message: 'Nenhum fornecedor cadastrado para excluir.' });
    }

    const result = db.transaction(() => {
      const del = db.prepare('DELETE FROM stock_suppliers WHERE store_id = ? OR store_id IS NULL').run(storeId);
      logAction({
        user: req.user,
        action: 'danger_zone_clear_suppliers',
        recordType: 'danger_zone',
        recordId: 'stock_suppliers',
        details: { count: del.changes, store_id: storeId },
      });
      return del.changes;
    })();

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
router.post('/clear/categories', (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;

    // Verificar dependências: produtos vinculados a categorias
    const linkedProducts = db.prepare(
      'SELECT COUNT(*) n FROM stock_products WHERE category_id IS NOT NULL AND (store_id = ? OR store_id IS NULL)'
    ).get(storeId).n;

    if (linkedProducts > 0) {
      return res.status(409).json({
        error: 'Não foi possível excluir as categorias: existem produtos vinculados.',
        blocked: true,
        dependencies: { products: linkedProducts },
        message: `Não foi possível excluir as categorias porque existem ${linkedProducts} produto(s) vinculados a elas. Desvincule ou remova os produtos antes de continuar.`,
      });
    }

    const totalCategories = db.prepare(
      'SELECT COUNT(*) n FROM stock_categories WHERE store_id = ? OR store_id IS NULL'
    ).get(storeId).n;

    if (totalCategories === 0) {
      return res.json({ success: true, count: 0, message: 'Nenhuma categoria cadastrada para excluir.' });
    }

    const result = db.transaction(() => {
      const del = db.prepare('DELETE FROM stock_categories WHERE store_id = ? OR store_id IS NULL').run(storeId);
      logAction({
        user: req.user,
        action: 'danger_zone_clear_categories',
        recordType: 'danger_zone',
        recordId: 'stock_categories',
        details: { count: del.changes, store_id: storeId },
      });
      return del.changes;
    })();

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
router.post('/clear/users', (req, res, next) => {
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
    const selectedUsers = db.prepare(
      `SELECT * FROM users WHERE id IN (${placeholders(userIds)}) AND (store_id = ? OR store_id IS NULL)`
    ).all(...userIds, storeId);

    if (selectedUsers.length !== userIds.length) {
      return res.status(404).json({ error: 'Um ou mais usuários selecionados não pertencem a esta loja.' });
    }

    // 3. Proibição: Excluir ADM Master
    const hasMaster = selectedUsers.some(u => Boolean(u.is_master));
    if (hasMaster) {
      return res.status(400).json({ error: 'Usuários com privilégio de ADM Master não podem ser excluídos pela Zona de Perigo.' });
    }

    // 4. Proibição: Deixar a loja sem administrador ativo
    const remainingAdmins = db.prepare(`
      SELECT COUNT(*) n FROM users
      WHERE (store_id = ? OR store_id IS NULL)
        AND role = 'admin'
        AND active = 1
        AND id NOT IN (${placeholders(userIds)})
    `).get(storeId, ...userIds).n;

    if (remainingAdmins <= 0) {
      return res.status(400).json({
        error: 'A operação não pode ser concluída: a loja não pode ficar sem nenhum administrador ativo.',
      });
    }

    // 5. Exclusão segura com preservação de snapshots de autoria
    db.transaction(() => {
      for (const target of selectedUsers) {
        const name = target.full_name;

        // Preservar autoria histórica em snapshots
        db.prepare('UPDATE service_orders SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, ?), created_by = NULL WHERE created_by = ?').run(name, target.id);
        db.prepare('UPDATE cash_withdrawals SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, ?), created_by = NULL WHERE created_by = ?').run(name, target.id);
        db.prepare('UPDATE audit_log SET user_name = COALESCE(user_name, ?), user_id = NULL WHERE user_id = ?').run(name, target.id);
        db.prepare('UPDATE device_sales SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, ?), created_by = NULL WHERE created_by = ?').run(name, target.id);
        db.prepare('UPDATE stock_products SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, ?), created_by = NULL WHERE created_by = ?').run(name, target.id);
        db.prepare('UPDATE stock_movements SET user_name = COALESCE(user_name, ?), user_id = NULL WHERE user_id = ?').run(name, target.id);
        db.prepare('UPDATE store_sales SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, ?), created_by = NULL WHERE created_by = ?').run(name, target.id);
        db.prepare('UPDATE store_sales SET canceled_by_name_snapshot = COALESCE(canceled_by_name_snapshot, ?), canceled_by = NULL WHERE canceled_by = ?').run(name, target.id);
        db.prepare('UPDATE service_order_photos SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, ?), created_by = NULL WHERE created_by = ?').run(name, target.id);

        try {
          db.prepare('UPDATE screen_protector_groups SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, ?), created_by = NULL WHERE created_by = ?').run(name, target.id);
        } catch (_) {}

        // Limpar dados pessoais auxiliares do usuário
        try {
          db.prepare('DELETE FROM notes WHERE user_id = ?').run(target.id);
          db.prepare('DELETE FROM labels WHERE user_id = ?').run(target.id);
          for (const table of ['pagbank_calculator', 'piece_calculator', 'frontals_calculator', 'frontals_price_list', 'favorite_notes', 'pinned_notes']) {
            db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(target.id);
          }
        } catch (_) {}

        // Excluir da tabela users
        db.prepare('DELETE FROM users WHERE id = ? AND (store_id = ? OR store_id IS NULL)').run(target.id, storeId);

        logAction({
          user: req.user,
          action: 'danger_zone_delete_user',
          recordType: 'user',
          recordId: target.id,
          details: { username: target.username, full_name: target.full_name, store_id: storeId },
        });
      }
    })();

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
router.post('/clear/parts-catalog', (req, res, next) => {
  try {
    const totalModels = db.prepare('SELECT COUNT(*) n FROM parts_models').get().n;
    if (totalModels === 0) {
      return res.json({ success: true, count: 0, message: 'Nenhum modelo cadastrado para excluir.' });
    }

    const result = db.transaction(() => {
      const del = db.prepare('DELETE FROM parts_models').run();
      logAction({
        user: req.user,
        action: 'danger_zone_clear_parts_models',
        recordType: 'danger_zone',
        recordId: 'parts_models',
        details: { count: del.changes },
      });
      return del.changes;
    })();

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
router.post('/clear/notes', (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const totalNotes = db.prepare('SELECT COUNT(*) n FROM notes WHERE store_id = ? OR store_id IS NULL').get(storeId).n;

    if (totalNotes === 0) {
      return res.json({ success: true, count: 0, message: 'Nenhuma anotação cadastrada para excluir.' });
    }

    const result = db.transaction(() => {
      const del = db.prepare('DELETE FROM notes WHERE store_id = ? OR store_id IS NULL').run(storeId);
      logAction({
        user: req.user,
        action: 'danger_zone_clear_notes',
        recordType: 'danger_zone',
        recordId: 'notes',
        details: { count: del.changes, store_id: storeId },
      });
      return del.changes;
    })();

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
