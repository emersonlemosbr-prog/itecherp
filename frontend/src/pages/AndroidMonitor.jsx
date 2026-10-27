import React, { useEffect, useRef, useState } from 'react'
import { webUsbMonitor } from '../services/adb/WebUsbMonitorService'

export default function AndroidMonitor({ disabled, onDevice, onRemove }) {
  const [monitor, setMonitor] = useState(null)
  const [interval, setIntervalMs] = useState(1000)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const session = useRef(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (session.current) webUsbMonitor.stop().catch(() => {})
    }
  }, [])
  useEffect(() => {
    if (!monitor?.active) return
    let cancelled = false
    let timer
    const poll = async () => {
      try {
        const data = { monitor: webUsbMonitor.snapshot() }
        if (!cancelled) { setMonitor(data.monitor); setError('') }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Conexão com o monitor perdida.')
          setMonitor(current => ({ ...current, active: false }))
        }
      }
      if (!cancelled) timer = setTimeout(poll, 750)
    }
    timer = setTimeout(poll, 750)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [monitor?.id, monitor?.active])
  async function start() {
    setBusy(true); setError('')
    try {
      const data = { monitor: await webUsbMonitor.start(interval) }
      session.current = data.monitor.id
      if (!mounted.current) { await webUsbMonitor.stop(); return }
      setMonitor(data.monitor); onDevice(data.monitor.device)
    } catch (e) {
      if (mounted.current) setError(e?.message || 'Não foi possível iniciar o monitoramento ADB via USB.')
    }
    finally { if (mounted.current) setBusy(false) }
  }
  async function stop() {
    setBusy(true)
    try {
      const data = { monitor: await webUsbMonitor.stop() }
      setMonitor(data.monitor); session.current = null
    } catch (e) { setError(e?.message || 'Não foi possível parar o monitoramento.') }
    finally { setBusy(false) }
  }
  const label = row => row.analyzing ? 'Analisando aplicativo...' : row.analysis_error ? 'Análise indisponível' : row.protected ? '🔒 Componente do sistema' : row.risk_label || 'Não classificado'
  const appCard = row => <div className="mt-3 space-y-2 break-words">
    <p className="text-lg font-semibold">{row.app_name || row.package_name}</p>
    <p className="text-sm text-slate-500">{row.package_name}</p>
    <p className={['medium', 'high', 'threat'].includes(row.risk_level) ? 'font-semibold text-red-500' : 'font-semibold'}>{label(row)}</p>
    <p className="text-sm">Detectado: {new Date(row.detected_at).toLocaleString('pt-BR')}</p>
    <details><summary className="cursor-pointer">Ver detalhes</summary>
      <p>Versão: {row.version_name || 'N/D'}</p><p>Activity: {row.activity || 'N/D'} • PID: {row.pid || 'N/D'}</p>
      <p>Classificação: {row.risk_level || 'Pendente'} • Removível: {row.removable === true && !row.protected ? 'Sim' : 'Não'}</p>
      <p>{row.reason || row.analysis_error}</p>
    </details>
    {row.removable === true && !row.protected && !row.analyzing && <div className="flex flex-wrap gap-2">
      <button className="btn-secondary" disabled={disabled} onClick={() => onRemove(row, false, monitor.device)}>Selecionar para remoção</button>
      <button className="btn-danger" disabled={disabled} onClick={() => onRemove(row, true, monitor.device)}>Remover aplicativo</button>
    </div>}
  </div>
  return <section className="card p-5 space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn-primary" disabled={disabled || busy || monitor?.active} onClick={start}>📡 MONITORAMENTO EM TEMPO REAL</button>
      <label className="text-sm">Intervalo <select className="input ml-2" value={interval} disabled={monitor?.active || busy} onChange={e => setIntervalMs(Number(e.target.value))}>
        {[750, 1000, 1500, 3000, 5000].map(value => <option key={value} value={value}>{value} ms</option>)}
      </select></label>
      {monitor?.active && <button className="btn-secondary" disabled={busy} onClick={stop}>PARAR MONITORAMENTO</button>}
    </div>
    {error && <p role="alert" className="text-red-500">{error}</p>}
    {monitor && <>
      <p>{monitor.device.manufacturer} {monitor.device.model} • Android {monitor.device.android_version}</p>
      <p className={monitor.active ? 'text-emerald-600' : 'text-slate-500'}>{monitor.active ? '● Monitoramento ativo' : monitor.message || 'Monitoramento inativo'}</p>
      {monitor.active && !monitor.logcat_available && <p className="text-sm text-slate-500">Observação auxiliar indisponível; acompanhamento periódico ativo.</p>}
      {monitor.alert && <div role="alert" className="rounded-xl border border-red-400 bg-red-500/5 p-4">
        <h3 className="font-bold text-red-500">⚠ APLICATIVO SUSPEITO DETECTADO</h3>
        <p>Este aplicativo foi aberto no aparelho.</p>{appCard(monitor.alert)}
      </div>}
      <div className="rounded-xl border border-slate-300 p-4"><h3 className="font-semibold">APP EM PRIMEIRO PLANO</h3>
        {monitor.current ? appCard(monitor.current) : <p className="mt-3">{monitor.active ? 'Aguardando atividade no aparelho...' : 'Monitoramento encerrado.'}</p>}
      </div>
      <h3 className="font-semibold">ATIVIDADE RECENTE</h3>
      <ol className="max-h-80 overflow-auto space-y-2">{monitor.history.map((row, index) => <li key={`${row.detected_at}-${index}`} className="rounded-lg border border-slate-300 p-3">
        <time>{new Date(row.detected_at).toLocaleTimeString('pt-BR')}</time> — {row.app_name || row.package_name}<p className="text-sm">{label(row)}</p>
      </li>)}</ol>
    </>}
  </section>
}
