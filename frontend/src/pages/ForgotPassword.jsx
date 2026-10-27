import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowLeft, CheckCircle2, AlertCircle, KeyRound, ArrowRight } from 'lucide-react'
import api from '../api/client'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successData, setSuccessData] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await api.post('/auth/forgot-password', { email: email.trim() })
      setSuccessData(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao processar solicitação de recuperação.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/60 space-y-6">
          
          <div className="text-center space-y-2">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3 shadow-inner">
              <KeyRound size={28} />
            </div>
            <h1 className="font-display font-extrabold text-2xl text-white">Recuperação de Acesso</h1>
            <p className="text-slate-400 text-xs max-w-xs mx-auto">
              Informe o e-mail cadastrado como proprietário da sua loja para receber as instruções e o link seguro de redefinição de senha.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-xl p-3.5">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {successData ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-emerald-400">
                  <CheckCircle2 size={16} />
                  Solicitação Recebida com Sucesso!
                </div>
                <p className="leading-relaxed">
                  {successData.message}
                </p>
                {successData.reset_token && (
                  <div className="pt-2 border-t border-emerald-800/40">
                    <span className="font-semibold block mb-1 text-emerald-300">Ambiente de Testes (Link Direto):</span>
                    <Link
                      to={`/redefinir-senha?token=${successData.reset_token}&email=${encodeURIComponent(email)}`}
                      className="inline-flex items-center gap-1.5 text-amber-300 hover:text-amber-200 underline font-mono text-[11px] break-all"
                    >
                      Clique aqui para redefinir sua senha agora
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                )}
              </div>

              <Link
                to="/login"
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all border border-slate-700"
              >
                <ArrowLeft size={14} />
                Voltar para a tela de login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">E-mail do Proprietário</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu.email@exemplo.com"
                    autoFocus
                    className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Processando...' : 'Enviar Link de Recuperação'}
              </button>

              <div className="text-center pt-2">
                <Link to="/login" className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1.5 transition-colors">
                  <ArrowLeft size={13} />
                  Lembrei da minha senha, voltar ao login
                </Link>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  )
}
