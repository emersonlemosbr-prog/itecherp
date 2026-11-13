// middleware/suspension.js
const db = require('../db/database');

/**
 * Middleware centralizado de restrição de acesso para lojas suspensas
 * Quando a loja associada à requisição está com status 'suspended',
 * permite apenas:
 * 1. Consultas de leitura (GET, HEAD, OPTIONS)
 * 2. Operações de finalização e atualização de Ordens de Serviço abertas ANTES da suspensão
 * 3. Gerenciamento de notificações do usuário (marcar como lida, preferências)
 * 4. Logout / encerramento de sessão
 * Todas as outras operações comerciais de escrita (POST, PUT, DELETE, PATCH) são bloqueadas com 403.
 */
async function enforceStoreSuspension(req, res, next) {
  // Se não houver loja ou a loja não estiver suspensa, prossegue normalmente
  if (!req.store || req.store.status !== 'suspended') {
    return next();
  }

  // 1. Métodos idempotentes de leitura são 100% permitidos
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const path = req.originalUrl || req.url || '';

  // 2. Notificações do usuário (marcar como lida, preferências do usuário)
  if (path.includes('/notifications')) {
    if (req.method === 'PATCH' || req.method === 'POST') {
      return next();
    }
  }

  // 3. Logout
  if (path.includes('/auth/logout')) {
    return next();
  }

  // 4. EXCEÇÃO ESPECIAL PARA ORDENS DE SERVIÇO ABERTAS ANTES DA SUSPENSÃO
  const isServiceOrders = req.baseUrl === '/api/service-orders' ||
    path.startsWith('/api/service-orders') ||
    path.startsWith('/service-orders');

  if (isServiceOrders) {
    // 4.1. Bloquear estritamente criação de novas OS
    const isNewOs = req.method === 'POST' && (
      req.path === '/' ||
      req.path === '' ||
      path === '/api/service-orders' ||
      path === '/api/service-orders/' ||
      path === '/service-orders' ||
      path === '/service-orders/'
    );

    if (isNewOs) {
      return res.status(403).json({
        error: 'Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa. Abertura de novas ordens de serviço bloqueada.',
        code: 'STORE_SUSPENDED',
        reason: req.store.suspension_reason || 'Mensalidade pendente.',
        suspended: true
      });
    }

    // 4.2. Bloquear exclusão física de OS
    if (req.method === 'DELETE' && !path.includes('/photos/')) {
      return res.status(403).json({
        error: 'Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa. Exclusão de ordens de serviço bloqueada.',
        code: 'STORE_SUSPENDED',
        reason: req.store.suspension_reason || 'Mensalidade pendente.',
        suspended: true
      });
    }

    // 4.3. Modificações em OS existente (PUT /:id, POST /:id/tracking, POST /:id/photos, DELETE /:id/photos/:photoId)
    const match = path.match(/service-orders\/(\d+)/);
    if (match) {
      const orderId = Number(match[1]);
      const order = await db.queryOne(
        'SELECT id, status, created_at FROM service_orders WHERE id = $1 AND (store_id = $2 OR store_id IS NULL)',
        [orderId, req.store.id]
      );

      if (!order) {
        return res.status(404).json({ error: 'Ordem de serviço não encontrada nesta loja.' });
      }

      // Limite 1: A OS deve ter sido aberta ANTES da data e hora da suspensão da loja
      if (req.store.suspended_at) {
        const orderDate = new Date(order.created_at);
        const suspendedDate = new Date(req.store.suspended_at);
        if (orderDate > suspendedDate) {
          return res.status(403).json({
            error: 'Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa. Esta ordem de serviço foi aberta após a suspensão e não pode ser modificada.',
            code: 'STORE_SUSPENDED',
            reason: req.store.suspension_reason || 'Mensalidade pendente.',
            suspended: true
          });
        }
      }

      // Limite 2: Ordens de serviço já finalizadas (entregues ou não realizadas) não podem ser reabertas
      const FINISHED_STATUSES = ['delivered', 'not_performed'];
      if (FINISHED_STATUSES.includes(order.status)) {
        return res.status(403).json({
          error: 'Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa. Ordens de serviço finalizadas não podem ser reabertas.',
          code: 'STORE_SUSPENDED',
          reason: req.store.suspension_reason || 'Mensalidade pendente.',
          suspended: true
        });
      }

      // A OS estava aberta antes da suspensão e continua aberta:
      // Pode ser atualizada, peças adicionadas, pagamento registrado, finalizada e entregue!
      return next();
    }
  }

  // 5. Bloqueio padrão para todas as outras operações de escrita no ERP
  return res.status(403).json({
    error: 'Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.',
    code: 'STORE_SUSPENDED',
    reason: req.store.suspension_reason || 'Mensalidade pendente.',
    suspended: true
  });
}

module.exports = { enforceStoreSuspension };

