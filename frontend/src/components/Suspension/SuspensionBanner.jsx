import React from 'react'
import { AlertTriangle, Lock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export default function SuspensionBanner() {
  const { isSuspended } = useAuth()

  if (!isSuspended) return null

  return (
    <div
      role="alert"
      className="bg-amber-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-300 px-4 py-2 text-xs flex items-center justify-between gap-3 shadow-sm"
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="truncate">
          <strong className="font-bold">ACESSO RESTRITO</strong> — Sua empresa possui uma pendência administrativa. Algumas funcionalidades estão temporariamente bloqueadas.
        </span>
      </div>
      <div className="shrink-0 flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/25">
        <Lock size={11} />
        <span>Somente Leitura e Conclusão de OS</span>
      </div>
    </div>
  )
}

