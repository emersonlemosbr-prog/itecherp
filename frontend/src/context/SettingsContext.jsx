import React, { createContext, useContext, useEffect, useState } from 'react'
import api from '../api/client'
import { useAuth } from './AuthContext'
import { useTheme } from './ThemeContext'
import { configureDeletionConfirmation } from '../utils/confirmDeletion'
const Context = createContext(null)
export function SettingsProvider({ children }) {
  const { user } = useAuth()
  const { setDark } = useTheme()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const reload = async () => { try { const response = await api.get('/settings'); setData(response.data); setError(''); return response.data } catch (e) { setError(e.response?.data?.error || 'Não foi possível carregar as configurações.'); throw e } }
  useEffect(() => { if (user) reload().catch(() => {}); else setData(null) }, [user?.id])
  useEffect(() => {
    if (!user) return
    const refresh = () => reload().catch(() => {})
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [user?.id])
  useEffect(() => {
    if (!data) return
    const prefs = data.settings.system
    configureDeletionConfirmation(prefs.confirm_delete)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => setDark(prefs.theme === 'system' ? media.matches : prefs.theme === 'dark')
    apply(); media.addEventListener('change', apply)
    document.documentElement.style.setProperty('--brand-primary', prefs.color)
    document.title = `${data.settings.store.name} — Painel`
    return () => media.removeEventListener('change', apply)
  }, [data?.settings.system.theme, data?.settings.system.color, data?.settings.system.confirm_delete, data?.settings.store.name])
  if (user && !data) return <div className="p-6"><p role="status">{error || 'Carregando configurações...'}</p>{error && <button className="btn-primary mt-4" onClick={() => reload().catch(() => {})}>Tentar novamente</button>}</div>
  return <Context.Provider value={{ ...data, reload, setData }}>{children}</Context.Provider>
}
export const useSettings = () => useContext(Context)
export function calculatePrice(amount, finance = {}, withFrame = true) { const f = finance || {}; const margin = Number(f.margin ?? 100); const risk = Number(f.risk ?? 9.97); const labor = Number(f.labor ?? 80); const supplies_frame = Number(f.supplies_frame ?? 0); const supplies_glue = Number(f.supplies_glue ?? 0.5); const protector = Number(f.protector ?? 2); return amount * (1 + margin / 100) * (1 + risk / 100) + labor + (withFrame ? supplies_frame : supplies_glue) + protector }
