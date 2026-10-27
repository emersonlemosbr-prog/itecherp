import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock3, PackageCheck } from 'lucide-react'
import logo from '../assets/logo.svg'
import { STATUS_LABELS, formatDate } from '../utils/format'

const TIMELINE_STEPS = [
  { key: 'received', label: 'Recebido' },
  { key: 'diagnosis', label: 'Em Diagnóstico' },
  { key: 'waiting_parts', label: 'Aguardando Peças' },
  { key: 'repairing', label: 'Em Reparo' },
  { key: 'ready', label: 'Pronto para Retirada' },
  { key: 'delivered', label: 'Entregue' },
]

export default function PublicTracking() {
  const { order_number } = useParams()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function buscarDados() {
    try {
      const response = await fetch(`/api/track/${encodeURIComponent(order_number)}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Não foi possível carregar a ordem de serviço.')
      }

      const data = await response.json()
      setOrder(data)
      setError('')
    } catch (err) {
      setError(err.message || 'Não foi possível carregar a ordem de serviço.')
      setOrder(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!order_number) {
      setError('Número da ordem não informado.')
      setLoading(false)
      return undefined
    }

    buscarDados()
    const timer = setInterval(buscarDados, 15000)
    return () => clearInterval(timer)
  }, [order_number])

  const currentStepIndex = order && order.status !== 'not_performed'
    ? TIMELINE_STEPS.findIndex((step) => step.key === order.status)
    : -1

  if (loading && !order) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-8">
        <div className="mx-auto max-w-md">
          <div className="card p-6 text-center">
            <p className="text-sm text-slate-500">Carregando acompanhamento...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-8">
        <div className="mx-auto max-w-md">
          <div className="card p-6">
            <div className="mb-4 flex items-center gap-3">
              <img src={logo} alt="iTech Celular e Informática" className="h-12 w-auto" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">iTech</p>
                <p className="font-display text-lg text-slate-800">Celular e Informática</p>
              </div>
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <AlertTriangle size={18} /> Ordem não encontrada
              </div>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6">
      <div className="mx-auto max-w-md">
        <header className="card p-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="iTech Celular e Informática" className="h-12 w-auto" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Acompanhe seu reparo</p>
              <h1 className="font-display text-xl text-slate-900">itech celular e informática</h1>
            </div>
          </div>
        </header>

        <main className="card mt-4 overflow-hidden p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Nº da OS</p>
              <p className="font-display text-2xl text-slate-900">{order.order_number}</p>
            </div>

            <span className={order.status === 'not_performed' ? 'badge badge-red' : 'badge badge-blue'}>
              {order.status === 'not_performed' ? 'Reparo não realizado' : STATUS_LABELS[order.status]}
            </span>
          </div>

          <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Cliente</p>
            <p className="mt-1 text-base font-semibold text-slate-800">{order.customer_name || 'Cliente'}</p>
          </div>

          <div className="mb-4 rounded-2xl border border-brand-100 bg-brand-50/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Aparelho</p>
            <p className="mt-1 text-base font-semibold text-slate-800">{order.brand || '—'} {order.model || ''}</p>
          </div>

          {order.expected_delivery_date && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
              <Clock3 size={18} />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Previsão de entrega</p>
                <p className="text-sm font-semibold">{formatDate(order.expected_delivery_date)}</p>
              </div>
            </div>
          )}

          {order.status === 'not_performed' ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <AlertTriangle size={18} /> Atenção
              </div>
              <p className="text-sm">
                Seu aparelho foi recebido, mas o reparo não foi realizado conforme o status atual da ordem.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {TIMELINE_STEPS.map((step, index) => {
                const isPassed = index < currentStepIndex
                const isCurrent = index === currentStepIndex
                const isFuture = index > currentStepIndex

                let circleClasses = 'flex h-8 w-8 items-center justify-center rounded-full border-2 bg-slate-100 text-slate-400 border-slate-200'
                let labelClasses = 'text-xs font-medium text-slate-400'
                let cardClasses = 'rounded-2xl border border-slate-200 bg-slate-50 p-3'

                if (isPassed) {
                  circleClasses = 'flex h-8 w-8 items-center justify-center rounded-full border-2 bg-emerald-100 text-emerald-700 border-emerald-300'
                  labelClasses = 'text-xs font-semibold text-emerald-700'
                  cardClasses = 'rounded-2xl border border-emerald-200 bg-emerald-50 p-3'
                }

                if (isCurrent) {
                  circleClasses = 'flex h-8 w-8 items-center justify-center rounded-full border-2 bg-brand-100 text-brand-700 border-brand-400'
                  labelClasses = 'text-xs font-semibold text-brand-700'
                  cardClasses = 'rounded-2xl border border-brand-200 bg-brand-50 p-3 shadow-sm'
                }

                if (isFuture) {
                  circleClasses = 'flex h-8 w-8 items-center justify-center rounded-full border-2 bg-slate-100 text-slate-400 border-slate-200'
                  labelClasses = 'text-xs font-medium text-slate-400'
                  cardClasses = 'rounded-2xl border border-slate-200 bg-slate-50 p-3 opacity-80'
                }

                return (
                  <div key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={circleClasses}>
                        {isPassed ? <CheckCircle2 size={16} /> : <span className="text-[10px] font-bold">{index + 1}</span>}
                      </div>
                      {index < TIMELINE_STEPS.length - 1 && (
                        <div className={`mt-2 h-8 w-px ${isPassed || isCurrent ? 'bg-brand-300' : 'bg-slate-200'}`} />
                      )}
                    </div>

                    <div className={`${cardClasses} flex-1`}>
                      <p className={labelClasses}>{step.label}</p>
                      {isCurrent && (
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-600">Etapa atual</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
            <div className="mb-2 flex items-center justify-center gap-2 text-slate-600">
              <PackageCheck size={16} />
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">Status atual</span>
            </div>
            <p className="text-sm font-semibold text-slate-800">
              {order.status === 'not_performed' ? 'Reparo não realizado' : STATUS_LABELS[order.status]}
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
