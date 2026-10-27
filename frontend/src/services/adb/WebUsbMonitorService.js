import { webUsbAdb } from './WebUsbAdbService'
import { getPackageInfo } from './deviceOperations'
import { analyzePackage } from './analyzer'

function parseForeground(output) {
  const lines = output.split(/\r?\n/)
  for (const marker of [/topResumedActivity/i, /mResumedActivity|ResumedActivity:/, /mCurrentFocus/, /mFocusedApp/, /^\s*ACTIVITY /]) {
    for (const line of lines.filter(item => marker.test(item))) {
      const component = line.match(/\b([a-zA-Z][\w]*(?:\.[\w]+)*)\/([\w.$]+)/)
      if (component) return { package_name: component[1], activity: component[2], pid: Number(line.match(/pid=(\d+)/)?.[1]) || null }
    }
  }
  const top = output.match(/\bTOP\b[^\n]*?\b(\d+):([\w.]+)(?::[\w.]+)?\//)
  return top ? { package_name: top[2], activity: null, pid: Number(top[1]) } : null
}

let session = null
let timer = null
let closeLogcat = null
let busy = false
const cache = new Map()

function snapshot() {
  if (!session) throw new Error('Nenhum monitoramento ativo.')
  return {
    ...session,
    device: { ...session.device },
    current: session.current ? { ...session.current } : null,
    alert: session.alert ? { ...session.alert } : null,
    history: session.history.map(row => ({ ...row })),
  }
}
async function stop(message = 'Monitoramento encerrado.') {
  if (!session) return null
  session.active = false
  session.message = message
  clearTimeout(timer)
  timer = null
  const close = closeLogcat
  closeLogcat = null
  if (close) await close()
  return snapshot()
}
async function classify(event, active) {
  try {
    let row = cache.get(event.package_name)
    if (!row) {
      const info = await getPackageInfo(event.package_name)
      if (!info.apk_path) throw new Error('Não foi possível analisar este pacote.')
      row = { ...info, ...analyzePackage(info) }
      if (cache.size >= 1500) cache.delete(cache.keys().next().value)
      cache.set(event.package_name, row)
    }
    if (!active.active) return
    Object.assign(event, row, { analyzing: false })
    if (['medium', 'high', 'threat'].includes(event.risk_level)) active.alert = { ...event }
  } catch (error) {
    if (active.active) Object.assign(event, { analyzing: false, analysis_error: error?.message || 'Análise indisponível', removable: false })
  }
}
async function tick(active) {
  if (!active.active || busy) return
  busy = true
  try {
    let foreground = null
    for (const command of ['dumpsys activity activities', 'dumpsys window windows', 'dumpsys activity top', 'dumpsys activity processes']) {
      const output = await webUsbAdb.shell(command)
      if (!active.active) return
      foreground = parseForeground(output)
      if (foreground) break
    }
    if (!foreground) active.current = null
    else if (active.current?.package_name !== foreground.package_name || active.current?.activity !== foreground.activity) {
      const event = { ...foreground, detected_at: new Date().toISOString(), analyzing: true }
      active.current = event
      active.history.unshift(event)
      active.history = active.history.slice(0, 100)
      const known = cache.get(event.package_name)
      if (known) {
        Object.assign(event, known, { analyzing: false })
        if (['medium', 'high', 'threat'].includes(event.risk_level)) active.alert = { ...event }
      } else {
        classify(event, active)
      }
      if (!event.pid) {
        try {
          const output = await webUsbAdb.shell('pidof ' + event.package_name)
          if (active.active) event.pid = Number(output.trim().split(/\s+/)[0]) || null
        } catch (error) {
          if (active.active) console.info('[ADB] PID unavailable', event.package_name, error)
        }
      }
    }
  } catch (error) {
    if (active.active) await stop(error?.message || 'Monitoramento interrompido.')
  } finally {
    busy = false
    if (active.active) timer = setTimeout(() => tick(active), active.interval_ms)
  }
}

webUsbAdb.subscribe(state => {
  if (session?.active && (state.status === 'disconnected' || state.status === 'idle' || state.status === 'error')) {
    stop('A conexão USB foi perdida.')
  }
})

export const webUsbMonitor = {
  async start(interval) {
    if (session?.active) throw new Error('Já existe um monitoramento ativo.')
    if (!webUsbAdb.isConnected()) throw new Error('Conecte o Android antes de iniciar o monitoramento.')
    const device = webUsbAdb.getState().device
    session = {
      id: crypto.randomUUID(), active: true, device,
      interval_ms: Math.min(5000, Math.max(750, Number(interval) || 1000)),
      current: null, alert: null, history: [], logcat_available: true,
    }
    try {
      closeLogcat = await webUsbAdb.startLogcat(
        () => { if (session?.active) session.last_activity_hint = new Date().toISOString() },
        () => { if (session) session.logcat_available = false },
      )
    } catch (error) {
      console.error('[ADB] logcat unavailable', error)
      session.logcat_available = false
    }
    timer = setTimeout(() => tick(session), 0)
    return snapshot()
  },
  snapshot,
  stop,
  remember(row) {
    if (row?.package_name) cache.set(row.package_name, row)
  },
}

