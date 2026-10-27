import Access from '../components/UI/Access'
import DocumentHeader from '../components/UI/DocumentHeader'
import { useSettings } from '../context/SettingsContext'
import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import api from '../api/client'

import { PAYMENT_METHOD_LABELS, STATUS_LABELS, formatCurrency, formatDate } from '../utils/format'
import { GENERAL_CONDITION_OPTIONS, formatChecklistSummary, formatAccessoriesSummary } from '../data/checklistDefinition'

export default function ServiceOrderPrint() {
  const { settings } = useSettings()
  const d = settings.documents
  const { id } = useParams()
  const [order, setOrder] = useState(null)

  useEffect(() => {
    document.title = `Ordem de Serviço ${order?.order_number || ''}`.trim() || 'Ordem de Serviço'
    return () => {
      document.title = `${settings.store.name} — Painel`
    }
  }, [order?.order_number])

  useEffect(() => { api.get(`/service-orders/${id}`).then(r => setOrder(r.data)) }, [id])

  const parsedChecklist = React.useMemo(() => {
    if (!order?.checklist_json) return {}
    try {
      if (typeof order.checklist_json === 'string') return JSON.parse(order.checklist_json)
      return order.checklist_json
    } catch {
      return {}
    }
  }, [order?.checklist_json])

  const parsedAccessories = React.useMemo(() => {
    if (!order?.accessories_json) return { items: [], other: '' }
    try {
      if (typeof order.accessories_json === 'string') return JSON.parse(order.accessories_json)
      return order.accessories_json
    } catch {
      return { items: [], other: '' }
    }
  }, [order?.accessories_json])

  const checklistSummaryList = React.useMemo(() => formatChecklistSummary(parsedChecklist), [parsedChecklist])
  const accessoriesList = React.useMemo(() => formatAccessoriesSummary(parsedAccessories), [parsedAccessories])
  const conditionLabel = React.useMemo(() => {
    return GENERAL_CONDITION_OPTIONS.find((o) => o.id === order?.device_condition)?.label || null
  }, [order?.device_condition])

  const hasEntryConditions = checklistSummaryList.length > 0 || accessoriesList.length > 0 || conditionLabel || order?.battery_health || order?.checklist_notes

  if (!order) return <div className="text-slate-400 text-sm">Carregando...</div>

  return (
    <div>
      <div className="no-print flex items-center justify-between mb-4 max-w-3xl mx-auto">
        <Link to={`/ordens/${id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
          <ArrowLeft size={15} /> Voltar
        </Link>
        <button className="btn-primary" onClick={() => window.print()}><Printer size={16} /> Imprimir</button>
      </div>

      <div className="print-preview-scroll"><div id="print-area" className={`service-order-print-area ${d.paper === "thermal" ? "thermal-document" : ""}`}>
        <DocumentHeader number={order.order_number} />

        <div className="service-order-print-divider" />

        <div className="service-order-print-main-grid">
          <div>
            <p className="service-order-print-section-label">CLIENTE</p>
            <p className="service-order-print-client-name">{order.first_name} {order.last_name}</p>
            <p className="service-order-print-small">{order.phone}</p>
            <p className="service-order-print-small">{order.address}</p>
          </div>

          <div>
            <p className="service-order-print-section-label">APARELHO</p>
            <p className="service-order-print-device-name">{order.brand} {order.model}</p>
            <p className="service-order-print-small">IMEI 1: {order.imei1 || '—'}</p>
            <p className="service-order-print-small">IMEI 2: {order.imei2 || '—'}</p>
          </div>
        </div>

        {d.date && <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
          <div><p className="text-xs font-semibold text-slate-400 uppercase">Entrada</p><p>{formatDate(order.entry_date)}</p></div>
          <div><p className="text-xs font-semibold text-slate-400 uppercase">Previsão de Entrega</p><p>{formatDate(order.expected_delivery_date)}</p></div>
          <div><p className="text-xs font-semibold text-slate-400 uppercase">Status</p><p>{STATUS_LABELS[order.status]}</p></div>
        </div>}

        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Descrição do Reparo</p>
            <p className="text-sm border border-slate-400 rounded-lg p-3 min-h-[60px]">{order.description || '—'}</p>
          </div>
        </div>

        {hasEntryConditions && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Condições do Aparelho na Entrada</p>
            <div className="text-xs border border-slate-400 rounded-lg p-3 bg-slate-50/40 space-y-1.5 leading-relaxed">
              {conditionLabel && (
                <p className="font-semibold text-slate-800">
                  Estado Geral: <span className="font-medium text-slate-700">{conditionLabel}</span>
                  {order.battery_health ? ` • Saúde da bateria: ${order.battery_health}%` : ''}
                </p>
              )}
              {checklistSummaryList.length > 0 && (
                <p className="text-slate-800">
                  {checklistSummaryList.join(' • ')}
                </p>
              )}
              {accessoriesList.length > 0 && (
                <p className="text-slate-700">
                  <span className="font-semibold">Acessórios entregues:</span> {accessoriesList.join(', ')}
                </p>
              )}
              {order.checklist_notes && (
                <p className="text-slate-600 italic">
                  Obs. checklist: {order.checklist_notes}
                </p>
              )}
            </div>
          </div>
        )}

        {d.notes && <div className="mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Observações Técnicas</p>
          <p className="text-sm border border-slate-400 rounded-lg p-3 min-h-[50px]">{order.notes || '—'}</p>
        </div>}

        <Access><div className="mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Valor do Serviço</p>
          <div className="border border-slate-400 rounded-lg p-3 bg-slate-50">
            <p className="text-lg font-bold text-slate-800">{formatCurrency(order.service_price)}</p>
          </div>
        </div></Access>

        {d.time && <p className="text-xs">Emitido às {new Date().toLocaleTimeString('pt-BR')}</p>}
        <div className="service-order-print-footer w-full mt-16 text-sm">
          <div className="service-order-print-footer-signatures grid grid-cols-2 gap-10 mb-6">
            {d.customer_signature && <div className="text-center"><div className="border-t border-ink-900 pt-2">Assinatura do Cliente</div></div>}
            {d.staff_signature && <div className="text-center"><div className="border-t border-ink-900 pt-2">{settings.store.name}</div></div>}
          </div>

          <div className="service-order-print-footer-row flex items-start justify-between gap-6">
            <div className="service-order-print-warranty-block w-full text-left">
              <p className="text-[10px] font-semibold text-slate-700 mb-1 tracking-wide">GARANTIA</p>
              <p className="text-[10px] leading-relaxed text-slate-500">
                {[d.terms, d.warranty_terms, d.pickup_terms, d.storage_terms, d.disposal_terms].filter(Boolean).join(' ')} Garantia: {order.warranty_days ?? d.warranty_days} dias.
              </p>
            </div>


          </div>
        </div>
      </div></div>
    </div>
  )
}
