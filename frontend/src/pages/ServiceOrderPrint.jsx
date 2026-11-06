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
  const [emissionDate] = useState(() => new Date())

  useEffect(() => {
    document.title = `Ordem de Serviço ${order?.order_number || ''}`.trim() || 'Ordem de Serviço'
    return () => {
      document.title = `${settings.store.name} — Painel`
    }
  }, [order?.order_number, settings.store.name])

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

  if (!order) return <div className="text-slate-400 text-sm p-6">Carregando...</div>

  // Formatação data e hora de emissão (Brasília / pt-BR)
  const formattedEmissionDate = emissionDate.toLocaleDateString('pt-BR')
  const formattedEmissionTime = emissionDate.toLocaleTimeString('pt-BR')

  // Identificação do cliente
  const customerName = [order.first_name, order.last_name].filter(Boolean).join(' ').trim() || order.customer_name_snapshot || '—'
  const customerPhone = order.phone || order.customer_phone_snapshot || ''
  const customerAddress = order.address || order.customer_address_snapshot || ''

  // Garantia e condições de retirada
  const defaultTerms = "Entrega e garantia somente mediante apresentação da Ordem de Serviço. Prazo para retirada do aparelho: até 10 dias úteis após a conclusão do serviço. Após a conclusão do serviço, o cliente será informado via WhatsApp. O prazo de retirada passa a contar a partir dessa comunicação. Após esse prazo, será cobrada taxa de armazenamento/guarda no valor de R$ 5,00 por dia. Após 90 dias sem retirada, o cliente autoriza o descarte do aparelho para cobrir custos de armazenamento e manutenção da loja."
  const customTerms = [d.terms, d.pickup_terms, d.storage_terms, d.disposal_terms].filter(Boolean).join(' ')
  const mainTerms = customTerms.trim() || defaultTerms
  const warrantyDays = order.warranty_days ?? d.warranty_days ?? 90

  return (
    <div>
      <div className="no-print flex items-center justify-between mb-4 max-w-3xl mx-auto">
        <Link to={`/ordens/${id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
          <ArrowLeft size={15} /> Voltar
        </Link>
        <button className="btn-primary" onClick={() => window.print()}><Printer size={16} /> Imprimir</button>
      </div>

      <div className="print-preview-scroll">
        <div id="print-area" className={`service-order-print-area ${d.paper === "thermal" ? "thermal-document" : ""}`}>
          
          {/* Cabeçalho */}
          <DocumentHeader number={order.order_number} />

          {/* Divisor superior */}
          <div className="service-order-print-divider" />

          {/* Identificação do Cliente e Aparelho em duas colunas */}
          <div className="service-order-print-main-grid">
            <div className="service-order-print-col">
              <p className="service-order-print-section-label">CLIENTE</p>
              <p className="service-order-print-client-name">{customerName}</p>
              {customerPhone && <p className="service-order-print-small">{customerPhone}</p>}
              {customerAddress && <p className="service-order-print-small">{customerAddress}</p>}
            </div>

            <div className="service-order-print-col">
              <p className="service-order-print-section-label">APARELHO</p>
              <p className="service-order-print-device-name">{[order.brand, order.model].filter(Boolean).join(' ') || '—'}</p>
              <p className="service-order-print-small">IMEI 1: {order.imei1 || '—'}</p>
              <p className="service-order-print-small">IMEI 2: {order.imei2 || '—'}</p>
            </div>
          </div>

          {/* Acompanhamento da OS: Entrada, Previsão de Entrega e Status */}
          <div className="service-order-print-meta-grid">
            <div className="service-order-print-meta-item">
              <p className="service-order-print-meta-label">ENTRADA</p>
              <p className="service-order-print-meta-value">{formatDate(order.entry_date)}</p>
            </div>
            <div className="service-order-print-meta-item">
              <p className="service-order-print-meta-label">PREVISÃO DE ENTREGA</p>
              <p className="service-order-print-meta-value">{formatDate(order.expected_delivery_date)}</p>
            </div>
            <div className="service-order-print-meta-item">
              <p className="service-order-print-meta-label">STATUS</p>
              <p className="service-order-print-meta-value font-semibold text-slate-900">{STATUS_LABELS[order.status] || order.status || '—'}</p>
            </div>
          </div>

          {/* Descrição do Reparo */}
          <div className="service-order-print-section">
            <p className="service-order-print-section-title">DESCRIÇÃO DO REPARO</p>
            <div className="service-order-print-box">
              <p className="text-sm text-slate-800 whitespace-pre-wrap">{order.description || '—'}</p>
            </div>
          </div>

          {/* Condições do Aparelho na Entrada (Preservado do modelo novo) */}
          {hasEntryConditions && (
            <div className="service-order-print-section">
              <p className="service-order-print-section-title">CONDIÇÕES DO APARELHO NA ENTRADA</p>
              <div className="service-order-print-box bg-slate-50/60 space-y-1.5 leading-relaxed text-xs">
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

          {/* Observações Técnicas */}
          <div className="service-order-print-section">
            <p className="service-order-print-section-title">OBSERVAÇÕES TÉCNICAS</p>
            <div className="service-order-print-box">
              <p className="text-sm text-slate-800 whitespace-pre-wrap">{order.notes ? order.notes : '—'}</p>
            </div>
          </div>

          {/* Valor do Serviço */}
          <Access>
            <div className="service-order-print-section">
              <p className="service-order-print-section-title">VALOR DO SERVIÇO</p>
              <div className="service-order-print-box bg-slate-50/80 flex items-center justify-between">
                <p className="text-lg font-bold text-slate-900 tracking-tight">{formatCurrency(order.service_price)}</p>
                {order.payment_method && (
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method}
                  </span>
                )}
              </div>
            </div>
          </Access>

          {/* Data e Horário de Emissão */}
          <div className="service-order-print-emission-time">
            <p>Emitido em: {formattedEmissionDate} às {formattedEmissionTime}</p>
          </div>

          {/* Rodapé com Assinaturas e Garantia */}
          <div className="service-order-print-footer">
            <div className="service-order-print-footer-signatures">
              <div className="service-order-print-sign-item">
                <div className="service-order-print-sign-line">Assinatura do Cliente</div>
              </div>
              <div className="service-order-print-sign-item">
                <div className="service-order-print-sign-line">{settings.store.name || 'iTech Celular e Informática'}</div>
              </div>
            </div>

            <div className="service-order-print-warranty-box">
              <p className="service-order-print-warranty-title">GARANTIA</p>
              <p className="service-order-print-warranty-text">
                {mainTerms} Garantia: {warrantyDays} dias.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
