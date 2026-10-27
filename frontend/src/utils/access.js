export const permissionLabels = { customers: 'Clientes', create_customer: 'Criar cliente', edit_customer: 'Editar cliente', orders: 'Ordens de Serviço', create_order: 'Criar OS', edit_order: 'Editar OS', finish_order: 'Finalizar OS', warranties: 'Garantias', inventory: 'Estoque', store_sales: 'Venda de Balcão', device_sales: 'Venda de Aparelho', credits: 'Fiados', android: 'Diagnóstico Android', notes: 'Bloco de Notas', printing: 'Impressões' }
export function canAccess(user, path) {
  if (user?.role === 'admin') return true
  const p = user?.permissions || {}
  if (/imprimir/.test(path) && !p.printing) return false
  if (path === '/ordens/nova') return p.orders && p.create_order
  if (/\/ordens\/[^/]+\/editar/.test(path)) return p.orders && p.edit_order
  const map = { clientes: 'customers', ordens: 'orders', garantias: 'warranties', estoque: 'inventory', vendas: 'store_sales', 'venda-aparelho': 'device_sales', fiados: 'credits', 'removedor-virus': 'android', anotacoes: 'notes' }
  return !!p[map[path.split('/')[1]]]
}
