export const permissionLabels = { customers: 'Clientes', create_customer: 'Criar cliente', edit_customer: 'Editar cliente', orders: 'Ordens de Serviço', create_order: 'Criar OS', edit_order: 'Editar OS', finish_order: 'Finalizar OS', warranties: 'Garantias', inventory: 'Estoque', store_sales: 'Venda de Balcão', device_sales: 'Venda de Aparelho', credits: 'Fiados', android: 'Diagnóstico Android', notes: 'Bloco de Notas', printing: 'Impressões' }
export function canAccess(user, path) {
  if (!user) return false
  if (user?.role === 'admin') return true
  const p = user?.permissions || {}

  const cleanPath = (path || '').split('?')[0].replace(/\/+$/, '') || '/'

  // Rotas comuns e ferramentas operacionais acessíveis a qualquer usuário autenticado
  if (cleanPath === '' || cleanPath === '/' || cleanPath === '/dashboard') return true
  if (cleanPath === '/historico-financeiro') return true
  if (cleanPath === '/calculadora-maquininha' || cleanPath === '/pagbank-calculadora') return true
  if (cleanPath === '/valor-frontais' || cleanPath === '/calculo-peca') return true
  if (cleanPath === '/peliculas-compativeis') return true

  // Verificações específicas de impressão e edição
  if (/imprimir/.test(cleanPath) && !p.printing) return false
  if (cleanPath === '/ordens/nova') return !!(p.orders && p.create_order)
  if (/\/ordens\/[^/]+\/editar/.test(cleanPath)) return !!(p.orders && p.edit_order)

  const map = {
    clientes: 'customers',
    ordens: 'orders',
    garantias: 'warranties',
    estoque: 'inventory',
    vendas: 'store_sales',
    'venda-aparelho': 'device_sales',
    fiados: 'credits',
    'removedor-virus': 'android',
    anotacoes: 'notes'
  }

  const segment = cleanPath.split('/')[1]
  if (segment && map[segment]) {
    return !!p[map[segment]]
  }

  return false
}
