import React from 'react'
import { Link } from 'react-router-dom'
import { Clock, CheckCircle2, MessageCircle, ArrowLeft, ShieldAlert } from 'lucide-react'

export default function PendingActivation() {
  const rawData = sessionStorage.getItem('itech_registered_store')
  let storeInfo = null
  try {
    storeInfo = rawData ? JSON.parse(rawData) : null
  } catch (_e) {}

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 sm:p-6">
      <div className="w-full max-w-lg">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-black/60 text-center space-y-6">
          
          {/* Ícone de Relógio / Aguardando */}
          <div className="mx-auto w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
            <Clock size={40} className="animate-pulse" />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ShieldAlert size={13} />
              Aguardando Ativação da Loja
            </span>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-white tracking-tight">
              Cadastro Recebido com Sucesso!
            </h1>
            <p className="text-slate-300 text-sm max-w-md mx-auto leading-relaxed">
              Sua loja foi pré-cadastrada no sistema. Para garantir a segurança e o suporte adequado, nossa equipe está realizando a liberação da sua assinatura.
            </p>
          </div>

          {storeInfo && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 text-left space-y-2 text-xs">
              <div className="text-slate-400 font-medium">Dados da solicitação:</div>
              <div className="grid grid-cols-2 gap-2 text-slate-200">
                <div>Loja: <span className="font-bold text-white">{storeInfo.storeName}</span></div>
                <div>Proprietário: <span className="font-bold text-white">{storeInfo.ownerName}</span></div>
                <div>E-mail: <span className="font-mono text-amber-300">{storeInfo.email}</span></div>
                <div>Login do ERP: <span className="font-mono text-amber-300">{storeInfo.nickname}</span></div>
              </div>
            </div>
          )}

          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 text-left space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2 font-semibold text-slate-200">
              <CheckCircle2 size={16} className="text-emerald-400" />
              O que acontece agora?
            </div>
            <p className="leading-relaxed text-slate-400">
              1. O administrador da plataforma analisa sua solicitação e ativa seu plano.<br />
              2. Assim que for ativada, você poderá acessar o ERP diretamente com seu <strong>nickname e senha</strong>.<br />
              3. Para agilizar a liberação da sua conta, entre em contato diretamente pelo WhatsApp.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <a
              href="https://wa.me/5511999999999?text=Ol%C3%A1!%20Acabei%20de%20cadastrar%20minha%20loja%20no%20iTech%20ERP%20e%20gostaria%20de%20ativar%20meu%20acesso."
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all"
            >
              <MessageCircle size={18} />
              Falar no WhatsApp
            </a>
            <Link
              to="/login"
              className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 transition-all border border-slate-700"
            >
              <ArrowLeft size={16} />
              Voltar ao Login
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}
