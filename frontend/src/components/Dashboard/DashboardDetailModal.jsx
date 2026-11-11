import React, { useState, useEffect, useMemo } from 'react'
import {
  X, Trash2, AlertCircle, RefreshCw, ChevronRight, Search,
  Calendar, DollarSign, Package, User, Wrench, ShoppingCart, ArrowUpRight
} from 'lucide-react'
import ModalFrame from '../UI/ModalFrame'
import PermanentDeleteDialog from '../UI/PermanentDeleteDialog'
import api from '../../api/client'
import {
  formatCurrency, formatDate, STATUS_LABELS, STATUS_BADGE,
  PAYMENT_STATUS_LABELS, PAYMENT_STATUS_BADGE, PAYMENT_METHOD_LABELS
} from '../../utils/format'

const PAGE_SIZE = 15

export default function DashboardDetailModal({
  indicator,
  onClose,
  isAdmin = false,
  valuesVisible = true,
  periodParams = {},
  onRecordDeleted = () => {}
}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)

  // Estado para exclusão com confirmação
  const [deletingRecord, setDeletingRecord] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const displayCurrency = value => valuesVisible ? formatCurrency(value) : 'R$ ••••••'

  async function loadDetails() {
    if (!indicator) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/dashboard/details/${indicator}`, { params: periodParams })
      setData(res.data)
      setPage(1)
    } catch (err) {
      console.error('[DASHBOARD_DETAIL_LOAD_ERROR]', err)
      setError(err?.response?.data?.error || err.message || 'Erro ao carregar detalhes do indicador.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDetails()
  }, [indicator])

  // Filtragem local por termo de busca
  const filteredRecords = useMemo(() => {
    if (!data?.records) return []
    if (!searchTerm.trim()) return data.records

    const term = searchTerm.toLowerCase().trim()
    return data.records.filter((rec) => {
      const title = (rec.title || '').toLowerCase()
      const desc = (rec.description || '').toLowerCase()
      const name = (rec.name || rec.customer_name || rec.seller_name || '').toLowerCase()
      const code = (rec.code || rec.order_number || rec.sale_number || '').toLowerCase()
      const model = (rec.model || '').toLowerCase()
      return title.includes(term) || desc.includes(term) || name.includes(term) || code.includes(term) || model.includes(term)
    })
  }, [data?.records, searchTerm])

  const totalPages = Math.ceil(filteredRecords.length / PAGE_SIZE) || 1
  const paginatedRecords = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredRecords.slice(start, start + PAGE_SIZE)
  }, [filteredRecords, page])

  // Processo de exclusão de acordo com o tipo de registro
  async function handleConfirmDelete() {
    if (!deletingRecord || !isAdmin) return
    setIsDeleting(true)
    setDeleteError(null)

    try {
      const { origin_type, id } = deletingRecord

      if (origin_type === 'service_order') {
        await api.delete(`/service-orders/${id}`)
      } else if (origin_type === 'store_sale') {
        await api.delete(`/store-sales/${id}`, { data: { reason: 'Exclusão solicitada pela Dashboard' } })
      } else if (origin_type === 'credit_account') {
        await api.delete(`/credit-accounts/${id}`)
      } else if (origin_type === 'stock_product') {
        await api.delete(`/inventory/products/${id}`)
      } else {
        throw new Error('Tipo de registro desconhecido para exclusão.')
      }

      setDeletingRecord(null)
      // Recarrega os dados do modal e notifica a dashboard para sincronizar os cards
      await loadDetails()
      onRecordDeleted()
    } catch (err) {
      console.error('[DASHBOARD_DELETE_ERROR]', err)
      setDeleteError(err?.response?.data?.error || err.message || 'Falha ao excluir o registro.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <ModalFrame className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-2 sm:p-4 flex items-center justify-center" onClick={onClose}>
        <div
          className="modal-panel w-full max-w-4xl max-h-[calc(100dvh-1.5rem)] flex flex-col p-4 sm:p-6"
          onClick={e => e.stopPropagation()}
        >
          {/* Cabeçalho */}
          <div className="flex items-start justify-between pb-3 mb-3 border-b border-[var(--border-soft)] shrink-0 gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent-yellow)]">
                  Indicador da Dashboard
                </span>
              </div>
              <h3 className="font-display font-bold text-lg sm:text-xl text-[var(--text-main)] mt-0.5">
                {data?.title || 'Detalhes do Indicador'}
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {data?.subtitle || 'Carregando informações detalhadas...'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost !px-2 !py-1.5 shrink-0"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>

          {/* Resumo Quantidade / Valor Financeiro */}
          {data && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3 p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-[var(--border-soft)] shrink-0">
              <div>
                <span className="text-[11px] uppercase font-semibold text-[var(--text-muted)] block">Total de registros</span>
                <strong className="text-lg font-bold text-[var(--text-main)]">{data.total_count}</strong>
              </div>
              {data.has_financial && (
                <div>
                  <span className="text-[11px] uppercase font-semibold text-[var(--text-muted)] block">Valor total</span>
                  <strong className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {displayCurrency(data.total_amount)}
                  </strong>
                </div>
              )}
              {data.total_quantity !== undefined && (
                <div>
                  <span className="text-[11px] uppercase font-semibold text-[var(--text-muted)] block">Estoque total</span>
                  <strong className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {data.total_quantity} un.
                  </strong>
                </div>
              )}
              <div className="col-span-2 sm:col-span-1 flex items-center justify-end sm:justify-end">
                <div className="relative w-full">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    className="input !py-1 !pl-8 !text-xs w-full"
                    placeholder="Filtrar nesta lista..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value)
                      setPage(1)
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Feedback de Erro de Exclusão */}
          {deleteError && (
            <div className="mb-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2 shrink-0">
              <AlertCircle size={15} className="shrink-0" />
              <span>{deleteError}</span>
            </div>
          )}

          {/* Conteúdo com Scroll Interno */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2.5">
            {loading && (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                <RefreshCw size={24} className="animate-spin text-[var(--accent-yellow)]" />
                <span className="text-sm">Carregando registros detalhados...</span>
              </div>
            )}

            {error && !loading && (
              <div className="p-6 text-center space-y-3">
                <AlertCircle size={32} className="mx-auto text-rose-500" />
                <p className="text-sm text-rose-500">{error}</p>
                <button type="button" onClick={loadDetails} className="btn-secondary !text-xs">
                  Tentar novamente
                </button>
              </div>
            )}

            {!loading && !error && filteredRecords.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-sm">
                Nenhum registro encontrado para este indicador no período.
              </div>
            )}

            {!loading && !error && paginatedRecords.map((item, idx) => (
              <div
                key={`${item.origin_type}-${item.id || idx}`}
                className="p-3.5 rounded-xl border border-[var(--border-soft)] bg-white dark:bg-[#1f1f22] hover:border-slate-300 dark:hover:border-white/20 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="font-semibold text-[var(--text-main)] truncate">
                      {item.title || item.name}
                    </strong>
                    {item.order_status && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${STATUS_BADGE[item.order_status] || 'bg-slate-100 text-slate-700'}`}>
                        {STATUS_LABELS[item.order_status] || item.order_status}
                      </span>
                    )}
                    {item.payment_status && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${PAYMENT_STATUS_BADGE[item.payment_status] || 'bg-slate-100 text-slate-700'}`}>
                        {PAYMENT_STATUS_LABELS[item.payment_status] || item.payment_status}
                      </span>
                    )}
                    {item.status && item.origin_type === 'credit_account' && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${item.status === 'open' ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'}`}>
                        {item.status === 'open' ? 'Em aberto' : 'Pago'}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[var(--text-muted)] line-clamp-2">
                    {item.description || (item.model ? `Modelo: ${item.model}` : '')}
                  </p>

                  {/* Informações detalhadas do registro */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)] pt-0.5">
                    {item.customer_name && (
                      <span className="inline-flex items-center gap-1">
                        <User size={13} className="text-slate-400" />
                        <span className="text-[var(--text-main)] font-medium">{item.customer_name}</span>
                      </span>
                    )}
                    {item.date && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={13} className="text-slate-400" />
                        <span>{new Date(item.date).toLocaleString('pt-BR')}</span>
                      </span>
                    )}
                    {item.payment_method && (
                      <span className="text-xs">
                        Forma: <strong className="text-[var(--text-main)]">{PAYMENT_METHOD_LABELS[item.payment_method] || item.payment_method}</strong>
                      </span>
                    )}
                    {item.code && (
                      <span className="text-xs">
                        Código: <strong className="text-[var(--text-main)] font-mono">{item.code}</strong>
                      </span>
                    )}
                    {item.quantity !== undefined && (
                      <span className="text-xs">
                        Estoque: <strong className="text-blue-500 font-bold">{item.quantity} un.</strong>
                      </span>
                    )}
                    {item.sale_price !== undefined && (
                      <span className="text-xs">
                        Venda: <strong className="text-emerald-500">{displayCurrency(item.sale_price)}</strong>
                      </span>
                    )}
                    {item.cost_price !== undefined && isAdmin && (
                      <span className="text-xs">
                        Custo: <strong className="text-[var(--text-muted)]">{displayCurrency(item.cost_price)}</strong>
                      </span>
                    )}
                  </div>

                  {/* Detalhe dos itens em caso de Venda */}
                  {Array.isArray(item.items) && item.items.length > 0 && (
                    <div className="mt-1.5 pt-1.5 border-t border-[var(--border-soft)] text-xs text-[var(--text-muted)] space-y-0.5">
                      <span className="font-semibold text-[11px] text-[var(--text-main)] block">Itens da venda:</span>
                      {item.items.map((sub, sIdx) => (
                        <div key={sub.id || sIdx} className="flex justify-between">
                          <span>{sub.quantity}x {sub.product_name}</span>
                          <span className="font-medium text-[var(--text-main)]">{displayCurrency(sub.total_price)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bloco de Valor e Ações */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border-soft)] shrink-0">
                  {item.amount !== undefined && (
                    <strong className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                      {displayCurrency(item.amount)}
                    </strong>
                  )}

                  {/* Botão de Exclusão (Exclusivo Administrador) */}
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn-ghost !text-rose-500 hover:!bg-rose-500/10 !px-2.5 !py-1 text-xs inline-flex items-center gap-1.5"
                      title="Excluir este registro permanentemente"
                      onClick={() => setDeletingRecord(item)}
                    >
                      <Trash2 size={14} />
                      <span>Excluir</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-[var(--border-soft)] text-xs text-[var(--text-muted)] shrink-0">
              <span>
                Página {page} de {totalPages} ({filteredRecords.length} itens)
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className="btn-secondary !px-2.5 !py-1"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="btn-secondary !px-2.5 !py-1"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      </ModalFrame>

      {/* Janela de Confirmação de Exclusão (PermanentDeleteDialog) */}
      {deletingRecord && (
        <PermanentDeleteDialog
          subject={deletingRecord.title || deletingRecord.name || 'registro'}
          description={`Tem certeza que deseja excluir permanentemente "${deletingRecord.title || deletingRecord.name}"? Esta ação removerá o registro e atualizará os indicadores financeiros da Dashboard.`}
          busy={isDeleting}
          onCancel={() => setDeletingRecord(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  )
}
