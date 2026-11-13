import React, { useState, useEffect } from 'react'
import { ShieldAlert, AlertTriangle, CheckCircle2, MessageCircle, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export default function SuspensionEntryModal() {
  const { isSuspended, suspensionReason, store } = useAuth()
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (isSuspended) {
      const alreadyViewed = sessionStorage.getItem('itech_suspension_modal_viewed')
      if (!alreadyViewed) {
        setIsOpen(true)
      }
    } else {
      setIsOpen(false)
    }
  }, [isSuspended])

  function handleDismiss() {
    sessionStorage.setItem('itech_suspension_modal_viewed', 'true')
    setIsOpen(false)
  }

  if (!isOpen || !isSuspended) return null

  const effectiveReason = suspensionReason || store?.suspension_reason || 'Mensalidade pendente ou atrasada.'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="suspension-modal-title"
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-amber-500/40 dark:border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 text-slate-800 dark:text-slate-100"
      >
        {/* Cabeçalho com ícone de alerta */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-500 shadow-inner">
            <ShieldAlert size={34} />
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <AlertTriangle size={13} />
            Acesso Restrito
          </span>
          <h2 id="suspension-modal-title" className="text-xl sm:text-2xl font-bold font-display tracking-tight text-slate-900 dark:text-white">
            Conta temporariamente suspensa
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            O acesso da sua empresa está temporariamente limitado.
          </p>
        </div>

        {/* Motivo cadastrado */}
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-slate-950 border border-amber-200 dark:border-amber-900/40 text-left space-y-1">
          <p className="text-xs uppercase tracking-wider font-bold text-amber-800 dark:text-amber-400">
            Motivo da suspensão:
          </p>
          <p className="text-sm font-medium text-slate-800 dark:text-amber-200/90 break-words">
            {effectiveReason}
          </p>
        </div>

        {/* O que é permitido e orientação */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-left space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>Consultas e Ordens de Serviço abertas estão liberadas</span>
          </div>
          <p className="leading-relaxed text-slate-600 dark:text-slate-400">
            Você ainda pode consultar as informações da sua loja e concluir as ordens de serviço que já estavam abertas antes da suspensão.
          </p>
          <p className="leading-relaxed font-medium text-slate-700 dark:text-slate-300">
            Para regularizar seu acesso, entre em contato com o suporte.
          </p>
        </div>

        {/* Botões de Ação */}
        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <a
            href="https://wa.me/5511999999999?text=Ol%C3%A1!%20Gostaria%20de%20regularizar%20a%20assinatura%20da%20minha%20loja%20no%20iTech%20ERP."
            target="_blank"
            rel="noreferrer"
            className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <MessageCircle size={16} />
            Falar com Suporte
          </a>
          <button
            type="button"
            onClick={handleDismiss}
            className="py-3 px-6 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white font-bold text-xs transition-all cursor-pointer"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}

