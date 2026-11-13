import { confirmRecordDeletion } from '../utils/confirmDeletion'
import Access from '../components/UI/Access'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import ModalFrame from '../components/UI/ModalFrame'
import React, { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Pencil, Printer, MessageCircle, Trash2, X, KeyRound, Eye, EyeOff, CheckSquare, Package, Battery, ShieldCheck } from 'lucide-react'
import TrackingPanel from '../components/UI/TrackingPanel'
import PatternLockCanvas from '../components/ServiceOrder/PatternLockCanvas'
import { GENERAL_CONDITION_OPTIONS, formatChecklistSummary, formatAccessoriesSummary } from '../data/checklistDefinition'
import api from '../api/client'
import {
  STATUS_LABELS, STATUS_BADGE, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_BADGE,
  PAYMENT_METHOD_LABELS, formatCurrency, formatDate, onlyDigits
} from '../utils/format'

export default function ServiceOrderDetail() {
  const { settings } = useSettings()
  const { isAdmin, user, isSuspended } = useAuth()
  const { id } = useParams()
  const [order, setOrder] = useState(null)
  const [photos, setPhotos] = useState([])
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [virusHistory, setVirusHistory] = useState([])
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const parsedChecklist = useMemo(() => {
    if (!order?.checklist_json) return {}
    try {
      if (typeof order.checklist_json === 'string') return JSON.parse(order.checklist_json)
      return order.checklist_json
    } catch {
      return {}
    }
  }, [order?.checklist_json])

  const parsedAccessories = useMemo(() => {
    if (!order?.accessories_json) return { items: [], other: '' }
    try {
      if (typeof order.accessories_json === 'string') return JSON.parse(order.accessories_json)
      return order.accessories_json
    } catch {
      return { items: [], other: '' }
    }
  }, [order?.accessories_json])

  const checklistItems = useMemo(() => formatChecklistSummary(parsedChecklist), [parsedChecklist])
  const accessoryItems = useMemo(() => formatAccessoriesSummary(parsedAccessories), [parsedAccessories])

  const conditionOption = useMemo(() => {
    return GENERAL_CONDITION_OPTIONS.find((o) => o.id === order?.device_condition)
  }, [order?.device_condition])

  const loadOrder = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const orderData = await api.get(`/service-orders/${id}`)
      setOrder(orderData.data)
      setPhotos(orderData.data.photos || [])
    } catch (err) {
      const status = err.response?.status
      const msg = err.response?.data?.error || (status === 404 ? 'Ordem de serviço não encontrada.' : 'Não foi possível carregar a ordem de serviço.')
      setLoadError({ status, message: msg })
      setOrder(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrder()
    if (isAdmin || user?.permissions?.android) {
      api.get('/virus-agent/history', { params: { service_order_id: id } })
        .then((r) => setVirusHistory(r.data?.scans || []))
        .catch(() => setVirusHistory([]))
    }
  }, [id])

  async function handleDeletePhoto(photoId) {
    if (!confirmRecordDeletion('Excluir esta foto? Essa ação removerá o registro da Ordem de Serviço.')) return
    try {
      await api.delete(`/service-orders/${id}/photos/${photoId}`)
      setPhotos((current) => current.filter((photo) => photo.id !== photoId))
      setSelectedPhoto((current) => current?.id === photoId ? null : current)
    } catch (error) {
      window.alert(error.response?.data?.error || 'Não foi possível excluir a foto.')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-slate-400 gap-3">
        <div className="w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Carregando Ordem de Serviço...</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="space-y-4 max-w-xl mx-auto py-8 text-center">
        <div className="card p-6 space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto text-xl font-bold">
            !
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100">
            {loadError.status === 404 ? 'Ordem de Serviço Não Encontrada' : 'Erro ao Carregar Ordem de Serviço'}
          </h3>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            {loadError.message}
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button type="button" onClick={loadOrder} className="btn-primary">
              Tentar Novamente
            </button>
            <Link to="/ordens" className="btn-secondary">
              Voltar para Ordens de Serviço
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!order) return null

  function whatsappLink() {
    if (!order.phone) return null
    const phone = onlyDigits(order.phone)
    const fullPhone = phone.length <= 11 ? `55${phone}` : phone
    const msg = `Olá, ${order.first_name}!\n\nSeu ${order.brand} ${order.model} já está pronto para retirada na *${settings.store.name}*.\n\nValor total: ${formatCurrency(order.service_price)}\n\nObrigado por escolher nossos serviços!`
    return `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`
  }

  const Row = ({ label, value }) => (
    <div className="flex justify-between py-2 border-b border-slate-50 dark:border-ink-700/50 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-right">{value ?? '—'}</span>
    </div>
  )

  return (
    <div className="space-y-4 max-w-3xl">
      <Link to="/ordens" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft size={15} /> Voltar às ordens de serviço
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-xl">{order.order_number}</h2>
          <p className="text-sm text-slate-400">{order.first_name} {order.last_name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {order.status === 'ready' && order.phone && (
            <a href={whatsappLink()} target="_blank" rel="noreferrer" className="btn-secondary !bg-emerald-50 !text-emerald-700 dark:!bg-emerald-500/10 dark:!text-emerald-400">
              <MessageCircle size={16} /> WhatsApp
            </a>
          )}
          <Access permission="printing"><Link to={`/ordens/${id}/imprimir`} className="btn-secondary"><Printer size={16} /> Imprimir</Link></Access>
          <Link to={`/removedor-virus?serviceOrderId=${id}`} className="btn-secondary">Remover Vírus</Link>
          {isSuspended && (order.status === 'delivered' || order.status === 'not_performed') ? (
            <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20" title="Ordens de serviço encerradas não podem ser reabertas durante a suspensão.">
              OS Encerrada
            </span>
          ) : (
            <Access permission="edit_order"><Link to={`/ordens/${id}/editar`} className="btn-primary"><Pencil size={16} /> Editar</Link></Access>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card p-5">
          <p className="font-semibold text-sm mb-2">Aparelho</p>
          <Row label="Marca" value={order.brand} />
          <Row label="Modelo" value={order.model} />
          <Row label="IMEI 1" value={order.imei1} />
          <Row label="IMEI 2" value={order.imei2} />
        </div>
        <TrackingPanel key={id} order={order} />
        <div className="card p-5">
          <p className="font-semibold text-sm mb-2">Datas</p>
          <Row label="Entrada" value={formatDate(order.entry_date)} />
          <Row label="Previsão de Entrega" value={formatDate(order.expected_delivery_date)} />
          <Row label="Entrega" value={formatDate(order.delivery_date)} />
        </div>
        {isAdmin && <div className="card p-5">
          <p className="font-semibold text-sm mb-2">Financeiro</p>
          <Row label="Preço do Serviço" value={formatCurrency(order.service_price)} />
          {isAdmin && <Row label="Custo de Peças" value={formatCurrency(order.parts_cost)} />}
          {isAdmin && <Row label="Fornecedor da Peça" value={order.supplier_name || 'Não informado'} />}
          {isAdmin && <Row label="Custos Adicionais" value={formatCurrency(order.additional_costs)} />}
          {isAdmin && <Row label="Lucro" value={formatCurrency(order.profit)} />}
          <Row label="Forma de Pagamento" value={PAYMENT_METHOD_LABELS[order.payment_method]} />
        </div>}
        <div className="card p-5">
          <p className="font-semibold text-sm mb-2">Status</p>
          <div className="flex gap-2 py-1">
            <span className={STATUS_BADGE[order.status]}>{STATUS_LABELS[order.status]}</span>
            <span className={PAYMENT_STATUS_BADGE[order.payment_status]}>{PAYMENT_STATUS_LABELS[order.payment_status]}</span>
          </div>
          <p className="text-sm text-slate-500 mt-3 whitespace-pre-wrap">{order.description}</p>
          {order.notes && <p className="text-xs text-slate-400 mt-2 whitespace-pre-wrap">Obs: {order.notes}</p>}
        </div>
      </div>

      {/* Senha do Aparelho & Checklist de Entrada */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Card Senha do Aparelho */}
        <div className="card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <KeyRound size={16} className="text-amber-500" />
                <p className="font-semibold text-sm">Senha do Aparelho</p>
              </div>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                {order.unlock_type === 'pin' ? 'PIN numérico'
                  : order.unlock_type === 'password' ? 'Senha alfanumérica'
                  : order.unlock_type === 'pattern' ? 'Padrão de desenho'
                  : 'Sem senha'}
              </span>
            </div>

            {(!order.unlock_type || order.unlock_type === 'none') && (
              <p className="text-xs text-slate-400 py-3">
                Nenhuma senha informada para este aparelho.
              </p>
            )}

            {(order.unlock_type === 'pin' || order.unlock_type === 'password') && (
              <div className="my-2 p-3 rounded-xl bg-slate-100 dark:bg-[#252525] border border-slate-200/60 dark:border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">
                    {order.unlock_type === 'pin' ? 'PIN' : 'Senha'}
                  </p>
                  <p className="font-mono text-base font-semibold tracking-wider text-slate-900 dark:text-white">
                    {showPassword ? (order.unlock_password || '(vazia)') : '••••••••'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="btn-ghost !p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label={showPassword ? 'Ocultar senha' : 'Ver senha'}
                  title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            )}

            {order.unlock_type === 'pattern' && (
              <div className="flex flex-col items-center py-2">
                {order.unlock_pattern ? (
                  <PatternLockCanvas
                    value={order.unlock_pattern}
                    readOnly={true}
                    size={170}
                    showClearButton={false}
                  />
                ) : (
                  <p className="text-xs text-slate-400 py-2">Nenhum padrão desenhado.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Card Condições e Checklist de Entrada */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare size={16} className="text-amber-500" />
              <p className="font-semibold text-sm">Checklist de Entrada</p>
            </div>
            {conditionOption && (
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${conditionOption.badgeClass}`}>
                {conditionOption.label}
              </span>
            )}
          </div>

          {order.battery_health && (
            <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-white/5">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Battery size={14} className="text-emerald-500" /> Saúde da Bateria
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {order.battery_health}%
              </span>
            </div>
          )}

          {accessoryItems.length > 0 && (
            <div className="py-1 border-b border-slate-100 dark:border-white/5 text-xs">
              <span className="text-slate-400 flex items-center gap-1.5 mb-1">
                <Package size={13} className="text-amber-500" /> Acessórios recebidos:
              </span>
              <div className="flex flex-wrap gap-1">
                {accessoryItems.map((acc, idx) => (
                  <span key={idx} className="rounded-md bg-slate-100 dark:bg-white/10 px-2 py-0.5 text-[11px] text-slate-700 dark:text-slate-300">
                    {acc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {checklistItems.length > 0 ? (
            <div className="space-y-1 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Itens verificados ({checklistItems.length})
              </p>
              <div className="max-h-48 overflow-y-auto pr-1 flex flex-wrap gap-1.5">
                {checklistItems.map((item, idx) => (
                  <span
                    key={idx}
                    className="inline-block rounded-lg px-2 py-1 text-[11px] font-medium bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200/50 dark:border-white/5"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-1">
              Nenhum item do checklist apontado.
            </p>
          )}

          {order.checklist_notes && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-slate-700 dark:text-slate-300 mt-2">
              <p className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 mb-0.5">Observações do checklist:</p>
              <p className="whitespace-pre-wrap">{order.checklist_notes}</p>
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">📷 Fotos de entrada</p>
            <h3 className="font-display font-bold text-xl">Fotos de entrada do aparelho</h3>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-200">
            {photos.length} foto(s)
          </span>
        </div>

        <Access permission="edit_order"><Link to={`/ordens/${id}/editar`} className="btn-secondary mb-4">Adicionar fotos / Tirar foto</Link></Access>
        {photos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-[#171717] dark:text-slate-300">
            Nenhuma foto registrada para esta ordem.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {photos.map((photo) => (
              <div key={photo.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-[#171717]">
                <button type="button" className="block w-full text-left" onClick={() => photo.url && setSelectedPhoto(photo)}>
                  <div className="aspect-square bg-slate-200 dark:bg-[#232323]">
                    {photo.url ? <img src={photo.url} alt={photo.original_name || 'Foto da entrada'} className="h-full w-full object-cover" /> : <p className="p-3 text-sm">Foto antiga: migração pendente</p>}
                  </div>
                </button>
                <div className="space-y-1 p-3">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-300">{photo.photo_type || 'Sem classificação'}</p>
                  {photo.description && <p className="text-xs text-slate-400">{photo.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedPhoto && (
        <ModalFrame className="photo-lightbox fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={() => setSelectedPhoto(null)}>
          <div className="relative max-h-[90dvh] w-full max-w-3xl overflow-hidden rounded-2xl bg-slate-900 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setSelectedPhoto(null)} aria-label="Fechar foto" className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white hover:bg-black/70">
              <X size={18} />
            </button>
            <img src={selectedPhoto.url} alt={selectedPhoto.original_name || 'Foto ampliada'} className="max-h-[65dvh] w-full object-contain" />
            <div className="flex items-center justify-between gap-3 border-t border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
              <div>
                <p className="font-semibold">{selectedPhoto.photo_type || 'Sem classificação'}</p>
                {selectedPhoto.description && <p className="text-xs text-slate-400">{selectedPhoto.description}</p>}
              </div>
              <button type="button" onClick={() => handleDeletePhoto(selectedPhoto.id)} className="btn-secondary !border-rose-600/30 !text-rose-300">
                <Trash2 size={14} /> Excluir
              </button>
            </div>
          </div>
        </ModalFrame>
      )}

      {virusHistory.length > 0 && (
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Segurança</p>
              <h3 className="font-display font-bold text-xl">Histórico de malware</h3>
            </div>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
              {virusHistory.length} varredura(s)
            </span>
          </div>

          <div className="space-y-4">
            {virusHistory.map((scan) => (
              <div key={scan.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-[#4A4A4A] dark:bg-[#232323]">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{scan.manufacturer || 'Dispositivo'} {scan.model || ''}</p>
                    <p className="text-xs text-slate-400">{scan.device_serial || 'Serial não informado'} • {formatDate(scan.created_at)}</p>
                  </div>
                  <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    {scan.threats_found || 0} ameaça(s)
                  </span>
                </div>

                <div className="space-y-2">
                  {(scan.results || []).slice(0, 5).map((item, index) => (
                    <div key={`${scan.id}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-[#4A4A4A] dark:bg-[#1f1f1f]">
                      <div>
                        <p className="font-medium">{item.app_name || item.package_name}</p>
                        <p className="text-xs text-slate-400">{item.package_name}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                        item.risk_level === 'threat' || item.risk_level === 'high'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400'
                          : item.risk_level === 'medium'
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400'
                            : item.risk_level === 'low'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                      }`}>
                        {item.risk_label || item.risk_level || 'Seguro'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
