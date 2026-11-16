import api from '../api/client'
import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Lock, User, AlertCircle, Store } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import itechLogo from '../assets/itech-logo.png'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const account = await login(username, password)
      let destination = '/dashboard'
      try {
        const { data } = await api.get('/settings')
        const configuredHome = data?.settings?.system?.home
        if (configuredHome && configuredHome !== '/') {
          destination = configuredHome
        }
      } catch (settingsErr) {
        console.warn('Configurações não puderam ser carregadas após o login, usando rota padrão:', settingsErr)
      }
      navigate(destination)
    } catch (err) {
      const code = err.response?.data?.code
      if (code === 'STORE_PENDING') {
        navigate('/aguardando-ativacao')
        return
      }
      let msg = err.response?.data?.error
      if (!msg) {
        if (err.message === 'Network Error' || err.code === 'ERR_NETWORK') {
          msg = 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet ou se o servidor está ativo.'
        } else {
          msg = 'Não foi possível entrar. Tente novamente.'
        }
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-4 relative overflow-hidden font-['Inter',sans-serif]">
      {/* Glow de fundo inspirado na Landing Page */}
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
          <p className="text-gray-400 text-xs mt-1">Acesso ao Sistema de Gestão</p>
        </div>

        {/* Card de Login */}
        <div className="bg-[#111111] border border-white/[0.08] hover:border-[#FFBE0B]/30 rounded-2xl p-6 sm:p-7 shadow-2xl shadow-black/80 transition-all duration-200">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2.5 text-xs text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-xl p-3 animate-fadeIn">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-400" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5 tracking-wide">
                Usuário
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FFBE0B] focus:ring-1 focus:ring-[#FFBE0B] transition-all"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoFocus
                  placeholder="Seu usuário de acesso"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-gray-300 tracking-wide">
                  Senha
                </label>
                <Link
                  to="/recuperar-senha"
                  className="text-xs text-[#FFBE0B] hover:text-[#f5b400] transition-colors font-medium"
                >
                  Esqueceu a senha?
                </Link>
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="password"
                  className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FFBE0B] focus:ring-1 focus:ring-[#FFBE0B] transition-all"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
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
                  <div className="w-4 h-4 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
                  <span>Entrando...</span>
                </>
              ) : (
                <span>Entrar no iTech ERP</span>
              )}
            </button>

            <div className="pt-4 border-t border-white/[0.06] text-center space-y-2.5">
              <Link
                to="/cadastro"
                className="inline-flex items-center justify-center gap-2 text-xs text-[#FFBE0B] hover:text-[#f5b400] font-semibold transition-colors py-1"
              >
                <Store size={15} />
                Quero cadastrar minha loja
              </Link>
              <div>
                <Link
                  to="/politica-privacidade"
                  className="text-[11px] text-gray-500 hover:text-gray-400 transition-colors"
                >
                  Política de Privacidade (LGPD)
                </Link>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

