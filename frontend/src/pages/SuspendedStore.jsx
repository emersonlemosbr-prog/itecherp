import React from 'react'
import { Link } from 'react-router-dom'
import { AlertOctagon, MessageCircle, ArrowLeft, ShieldAlert, CheckCircle2 } from 'lucide-react'

export default function SuspendedStore() {
  const userStr = localStorage.getItem('itech_user')
  let user = null
  try {
    user = userStr ? JSON.parse(userStr) : null
  } catch (_e) {}

  function handleLogout() {
    localStorage.removeItem('itech_token')
    localStorage.removeItem('itech_user')
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950/60 p-4 sm:p-6">
      <div className="w-full max-w-lg">
        <div className="bg-slate-900/90 backdrop-blur-xl border border-rose-900/40 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-black/70 text-center space-y-6">
          
          {/* Ícone de Alerta / Suspensão */}
          <div className="mx-auto w-20 h-20 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 shadow-inner">
            <AlertOctagon size={44} />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
              <ShieldAlert size={13} />
              Acesso ao ERP Suspenso
            </span>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-white tracking-tight">
              Assinatura Vencida ou Temporariamente Suspensa
            </h1>
            <p className="text-slate-300 text-sm max-w-md mx-auto leading-relaxed">
              O período de vigência da assinatura desta loja e o prazo de tolerância expiraram. O acesso de administradores e funcionários foi pausado.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-left space-y-2.5 text-xs text-slate-300">
            <div className="flex items-center gap-2 font-semibold text-emerald-400">
              <CheckCircle2 size={16} />
              Seus dados estão 100% seguros e preservados
            </div>
            <p className="text-slate-400 leading-relaxed">
              Todas as suas ordens de serviço, clientes, vendas, produtos e histórico financeiro permanecem guardados com total segurança. Assim que o pagamento for confirmado pelo administrador, o acesso à sua loja será reativado instantaneamente.
            </p>
          </div>

          {user && (
            <div className="text-xs text-slate-400">
              Usuário conectado: <span className="font-semibold text-slate-200">{user.username || user.full_name}</span>
            </div>
          )}

          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <a
              href="https://wa.me/5511999999999?text=Ol%C3%A1!%20Sou%20lojista%20do%20iTech%20ERP%20e%20gostaria%20de%20regularizar%20minha%20assinatura%20para%20reativar%20o%20acesso."
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all"
            >
              <MessageCircle size={18} />
              Falar com o Administrador
            </a>
            <button
              onClick={handleLogout}
              className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 transition-all border border-slate-700 cursor-pointer"
            >
              <ArrowLeft size={16} />
              Sair da Conta
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
