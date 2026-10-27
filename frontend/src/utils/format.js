export const STATUS_LABELS = {
  received: 'Recebido',
  diagnosis: 'Em Diagnóstico',
  waiting_parts: 'Aguardando Peças',
  repairing: 'Em Reparo',
  ready: 'Pronto para Retirada',
  delivered: 'Entregue',
  not_performed: 'Reparo Não Realizado',
}

export const STATUS_BADGE = {
  received: 'badge-blue',
  diagnosis: 'badge-blue',
  waiting_parts: 'badge-yellow',
  repairing: 'badge-blue',
  ready: 'badge-green',
  delivered: 'badge-slate',
  not_performed: 'badge-red',
}

export const PAYMENT_METHOD_LABELS = {
  pix: 'PIX',
  cash: 'Dinheiro',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  credit_account: 'Fiado',
  not_performed: 'Reparo Não Realizado',
  pending: 'Pendente',
}

export const PAYMENT_STATUS_BADGE = {
  paid: 'badge-green',
  pending: 'badge-yellow',
  credit_account: 'badge-blue',
  not_performed: 'badge-red',
}

export const PAYMENT_STATUS_LABELS = {
  paid: 'Pago',
  pending: 'Pendente',
  credit_account: 'Fiado',
  not_performed: 'Não Realizado',
}

export function formatCurrency(value) {
  const n = Number(value) || 0
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value.length === 10 ? value + 'T00:00:00' : value)
  if (isNaN(d)) return value
  return d.toLocaleDateString('pt-BR')
}

export function onlyDigits(value) {
  return (value || '').replace(/\D/g, '')
}
