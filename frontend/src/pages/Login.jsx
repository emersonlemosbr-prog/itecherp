import api from '../api/client'
import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Smartphone, Lock, User, AlertCircle, Store, KeyRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const [branding, setBranding] = useState(null)
  useEffect(() => { api.get('/auth/branding').then(r => setBranding(r.data)).catch(() => { }) }, [])
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
      const { data } = await api.get('/settings')
      navigate(account.role === 'admin' ? data.settings.system.home : '/ordens')
    } catch (err) {
      const code = err.response?.data?.code
      if (code === 'STORE_PENDING') {
        navigate('/aguardando-ativacao')
        return
      }
      if (code === 'STORE_SUSPENDED') {
        navigate('/loja-suspensa')
        return
      }
      let msg = err.response?.data?.error
      if (!msg) {
        if (err.message === 'Network Error' || err.code === 'ERR_NETWORK') {
          msg = 'Não foi possível conectar ao servidor. Verifique a conexão Wi-Fi do celular ou se o servidor está ativo.'
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-950 via-ink-900 to-ink-800 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 text-white">
          <div className="h-14 w-14 rounded-2xl bg-brand-600 flex items-center justify-center mb-4 shadow-card">
            <Smartphone size={28} />
          </div>
          <h1 className="font-display font-extrabold text-2xl text-center">{branding?.name || "Painel da Loja"}</h1>
          <p className="text-slate-300 text-sm mt-1">Painel da Loja</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-lg p-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <div>
            <label className="label">Usuário</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" value={username} onChange={e => setUsername(e.target.value)}
                autoFocus placeholder="seu usuário" required />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="label">Senha</label>
              <Link to="/recuperar-senha" className="text-xs text-amber-500 hover:text-amber-400 transition-colors mb-1">
                Esqueceu a senha?
              </Link>
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="password" className="input pl-9" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required />
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-center space-y-2">
            <Link
              to="/cadastro"
              className="inline-flex items-center justify-center gap-1.5 text-xs text-amber-500 hover:text-amber-400 font-semibold transition-colors"
            >
              <Store size={14} />
              Quero cadastrar minha loja
            </Link>
            <div>
              <Link
                to="/politica-privacidade"
                className="text-[11px] text-slate-400 hover:text-slate-300 transition-colors"
              >
                Política de Privacidade (LGPD)
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

