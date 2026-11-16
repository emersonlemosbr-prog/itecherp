import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowLeft, CheckCircle2, AlertCircle, KeyRound, Loader2 } from 'lucide-react'
import api from '../api/client'
import itechLogo from '../assets/itech-logo.png'

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
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-4 relative overflow-hidden font-['Inter',sans-serif]">
      {/* Glow de fundo inspirado na Landing Page e Login */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full blur-3xl opacity-40"
        style={{ background: 'radial-gradient(circle, rgba(255, 190, 11, 0.15) 0%, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 right-10 w-[500px] h-[400px] rounded-full blur-3xl opacity-20"
        style={{ background: 'radial-gradient(circle, rgba(255, 190, 11, 0.12) 0%, transparent 70%)' }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Cabeçalho com Logo Nova Oficial */}
        <div className="flex flex-col items-center mb-6 text-center">
          <Link to="/" className="inline-block transition-transform hover:scale-105 mb-3" title="iTech ERP">
            <img
              src={itechLogo}
              alt="iTech ERP"
              className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-[0_8px_24px_rgba(255,190,11,0.25)] rounded-2xl"
            />
          </Link>
          <h1 className="font-['Sora',sans-serif] font-extrabold text-2xl tracking-tight text-white">
            iTech <span className="text-[#FFBE0B]">ERP</span>
          </h1>
          <p className="text-gray-400 text-xs mt-1">Recuperação de Acesso</p>
        </div>

        {/* Card de Solicitação */}
        <div className="bg-[#111111] border border-white/[0.08] hover:border-[#FFBE0B]/30 rounded-2xl p-6 sm:p-7 shadow-2xl shadow-black/80 transition-all duration-200">
          {error && (
            <div className="flex items-start gap-2.5 text-xs text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-xl p-3 mb-4 animate-fadeIn">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-400" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {successData ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#1a2e1d] border border-emerald-500/30 text-emerald-200 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-emerald-400">
                  <CheckCircle2 size={16} />
                  Solicitação Recebida com Sucesso!
                </div>
                <p className="leading-relaxed text-gray-300">
                  {successData.message}
                </p>
                <p className="text-[11px] text-gray-400">
                  Verifique também sua caixa de spam ou lixo eletrônico.
                </p>
              </div>

              <Link
                to="/login"
                className="w-full py-2.5 px-4 rounded-xl bg-[#1f1f1f] hover:bg-[#2a2a2a] text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all border border-white/[0.08]"
              >
                <ArrowLeft size={14} />
                Voltar para a tela de login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-gray-400 text-xs leading-relaxed">
                Informe o e-mail cadastrado na sua conta para receber as instruções de redefinição de senha.
              </p>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5 tracking-wide">
                  E-mail cadastrado
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu.email@exemplo.com"
                    autoFocus
                    className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FFBE0B] focus:ring-1 focus:ring-[#FFBE0B] transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-[#FFBE0B] hover:bg-[#f5b400] text-[#0a0a0a] font-bold text-sm tracking-wide shadow-lg shadow-[#FFBE0B]/20 flex items-center justify-center gap-2 transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-[#0a0a0a]" />
                    <span>Enviando link...</span>
                  </>
                ) : (
                  <span>Enviar Link de Recuperação</span>
                )}
              </button>

              <div className="text-center pt-2">
                <Link
                  to="/login"
                  className="text-xs text-gray-400 hover:text-white inline-flex items-center gap-1.5 transition-colors"
                >
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
