import { useSettings } from '../context/SettingsContext'
import ModalFrame from '../components/UI/ModalFrame'
import AndroidMonitor from './AndroidMonitor'
import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { webUsbAdb } from '../services/adb/WebUsbAdbService'
import { scanDevice, removePackage } from '../services/adb/deviceOperations'
import { webUsbMonitor } from '../services/adb/WebUsbMonitorService'
import { ShieldAlert, ShieldCheck, Smartphone, Plug, Activity, Search, Trash2, WifiOff, AlertTriangle, CheckCircle2, Printer } from 'lucide-react'
import VirusRemovalReportPrint, { buildVirusRemovalReportHtml } from './VirusRemovalReportPrint'

const FILTER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'risky', label: 'Suspeitos' },
  { value: 'safe', label: 'Seguros' },
  { value: 'removable', label: 'Removíveis' },
  { value: 'protected', label: 'Protegidos' },
  { value: 'removed', label: 'Removidos' },
]

const CONNECTION_LABELS = {
  idle: 'Aguardando aparelho',
  requesting_device: 'Selecionando USB...',
  opening_usb: 'Abrindo transporte USB...',
  authenticating: 'Aguardando autorização ADB...',
  connected: 'Conectado',
  disconnected: 'Aparelho desconectado',
  error: 'Falha na conexão',
}

const RISK_COLORS = {
  safe: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  low: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  medium: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  high: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  threat: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
}

export default function VirusRemover() {
  const { settings } = useSettings()
  const [searchParams] = useSearchParams()
  const [connectionState, setConnectionState] = useState(webUsbAdb.getState())
  const [device, setDevice] = useState(null)
  const [scanResult, setScanResult] = useState(null)
  const [scanId, setScanId] = useState(null)
  const [selected, setSelected] = useState([])
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [serviceOrders, setServiceOrders] = useState([])
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('Aguardando conexão')
  const [isScanning, setIsScanning] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [showConfirm, setShowConfirm] = useState(false)

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null
    return serviceOrders.find((order) => String(order.id) === String(selectedOrderId)) || null
  }, [selectedOrderId, serviceOrders])

  const reportData = useMemo(() => {
    if (!scanResult) return null

    const removedApps = (scanResult.results || [])
      .filter((row) => row.status === 'removed' || row.removal_status === 'removed')
      .map((row) => ({
        appName: row.app_name || row.package_name || 'Aplicativo',
        packageName: row.package_name || '—',
        riskLevel: row.original_risk_label || row.risk_label || row.risk_level || '—',
        removedAt: row.removed_at ? new Date(row.removed_at).toLocaleString('pt-BR') : row.removedAt || new Date().toLocaleString('pt-BR'),
        result: row.status === 'removed' || row.removal_status === 'removed' ? 'Removido' : 'Não removido',
      }))

    return {
      orderNumber: selectedOrder?.order_number || 'Sem vínculo',
      customerName: selectedOrder ? `${selectedOrder.first_name || ''} ${selectedOrder.last_name || ''}`.trim() || 'Não informado' : 'Não informado',
      deviceManufacturer: device?.manufacturer || scanResult.device?.manufacturer || 'N/D',
      deviceModel: device?.model || scanResult.device?.model || 'N/D',
      androidVersion: device?.android_version || scanResult.device?.android_version || 'N/D',
      analysisDate: new Date().toLocaleString('pt-BR'),
      totalApps: scanResult.total || 0,
      selectedCount: selected.length || 0,
      removedCount: removedApps.length,
      failedCount: Math.max(0, (scanResult.results || []).filter((row) => row.status === 'failed' || row.removal_status === 'failed').length),
      removedApps,
    }
  }, [scanResult, device, selected, selectedOrder])

  function generateReport() {
    if (!scanResult) {
      alert('Faça uma varredura antes de gerar o relatório.')
      return
    }

    const html = buildVirusRemovalReportHtml(reportData, settings)
    const popup = window.open('', '_blank', 'width=900,height=800')
    if (!popup) {
      alert('O navegador bloqueou a abertura da janela de relatório.')
      return
    }

    popup.document.write(html)
    popup.document.close()
    popup.focus()
  }

  function printReport() {
    if (!scanResult) {
      alert('Faça uma varredura antes de imprimir o relatório.')
      return
    }

    const reportNode = document.getElementById('virus-removal-report-print-root')
    if (!reportNode) {
      generateReport()
      return
    }

    const printWindow = window.open('', '_blank', 'width=900,height=800')
    if (!printWindow) {
      alert('O navegador bloqueou a impressão do relatório.')
      return
    }

    const html = buildVirusRemovalReportHtml(reportData, settings)
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 300)
  }

  useEffect(() => webUsbAdb.subscribe((next) => {
    setConnectionState(next)
    setDevice(next.device)
    if (next.status === 'disconnected') {
      setIsScanning(false)
      setIsRemoving(false)
      setStage('A conexão USB foi perdida.')
    }
  }), [])

  useEffect(() => {
    async function loadOrders() {
      try {
        const { data } = await api.get('/service-orders')
        setServiceOrders(Array.isArray(data) ? data : [])
      } catch (_error) {
        setServiceOrders([])
      }
    }

    loadOrders()
  }, [])

  useEffect(() => {
    const orderIdFromQuery = searchParams.get('serviceOrderId')
    if (orderIdFromQuery) {
      setSelectedOrderId(orderIdFromQuery)
    }
  }, [searchParams])

  async function detectDevice() {
    try {
      await webUsbAdb.connect()
    } catch (error) {
      console.error('[WebUSB] connection failed', error)
    }
  }

  async function reconnectDevice() {
    try {
      await webUsbAdb.reconnect()
    } catch (error) {
      console.error('[WebUSB] reconnect failed', error)
    }
  }

  async function runScan() {
    if (!webUsbAdb.isConnected()) return
    setIsScanning(true)
    setProgress(0)
    setStage('Listando aplicativos')
    setSelected([])
    setScanId(null)
    try {
      const activeDevice = webUsbAdb.getState().device
      const results = await scanDevice(({ completed, total }) => {
        setProgress(total ? Math.round(completed * 100 / total) : 100)
        setStage('Analisando aplicativos: ' + completed + ' / ' + total)
      })
      results.forEach(row => webUsbMonitor.remember(row))
      setScanResult({
        total: results.length,
        threatsFound: results.filter(row => row.risk_level && row.risk_level !== 'safe').length,
        results,
        device: activeDevice,
      })
      try {
        const record = await api.post('/virus-agent/scan/record', {
          service_order_id: selectedOrderId ? Number(selectedOrderId) : null,
          device: activeDevice,
          results,
        })
        setScanId(record.data.scan_id)
        setStage('Varredura concluída')
      } catch (recordError) {
        console.error('Falha ao registrar varredura no ERP', recordError)
        setStage('Varredura concluída; não foi possível salvar o histórico no ERP.')
      }
      setProgress(100)
    } catch (error) {
      console.error('[WebUSB] scan failed', error)
      setStage(error?.message || 'Não foi possível executar a varredura ADB.')
    } finally {
      setIsScanning(false)
    }
  }

  const summary = useMemo(() => {
    if (!scanResult) return null
    return {
      safe: scanResult.results.filter((row) => row.risk_level === 'safe').length,
      low: scanResult.results.filter((row) => row.risk_level === 'low').length,
      medium: scanResult.results.filter((row) => row.risk_level === 'medium').length,
      high: scanResult.results.filter((row) => row.risk_level === 'high').length,
      threat: scanResult.results.filter((row) => row.risk_level === 'threat').length,
      removed: scanResult.results.filter((row) => row.status === 'removed').length,
    }
  }, [scanResult])

  const counts = useMemo(() => {
    if (!scanResult) {
      return { all: 0, risky: 0, safe: 0, removable: 0, protected: 0, removed: 0 }
    }

    return {
      all: scanResult.results.length,
      risky: scanResult.results.filter((row) => row.risk_level && row.risk_level !== 'safe').length,
      safe: scanResult.results.filter((row) => row.risk_level === 'safe').length,
      removable: scanResult.results.filter((row) => row.removable !== false && !row.protected).length,
      protected: scanResult.results.filter((row) => row.protected).length,
      removed: scanResult.results.filter((row) => row.status === 'removed').length,
    }
  }, [scanResult])

  const filteredResults = useMemo(() => {
    if (!scanResult) return []

    const query = searchTerm.trim().toLowerCase()

    return scanResult.results.filter((row) => {
      const matchesText = !query || (row.app_name || '').toLowerCase().includes(query) || (row.package_name || '').toLowerCase().includes(query)
      if (!matchesText) return false

      if (activeFilter === 'risky') return row.risk_level && row.risk_level !== 'safe'
      if (activeFilter === 'safe') return row.risk_level === 'safe'
      if (activeFilter === 'removable') return row.removable !== false && !row.protected
      if (activeFilter === 'protected') return row.protected
      if (activeFilter === 'removed') return row.status === 'removed'
      return true
    })
  }, [scanResult, searchTerm, activeFilter])

  async function handleRemoveSelected() {
    if (!selected.length) return

    setIsRemoving(true)
    setStage('Removendo aplicativos selecionados')
    try {
      const removed = []
      const failed = []
      for (const name of selected) {
        try {
          const row = scanResult?.results?.find(item => item.package_name === name)
          await removePackage(name, row)
          removed.push(name)
        } catch (error) {
          console.error('[WebUSB] remove failed', name, error)
          failed.push({ package_name: name, error: error?.message || 'Falha ao remover.' })
        }
      }
      const data = { ok: removed.length > 0 || failed.length === 0, removed, failed }
      if (failed.length) setStage('Falha ao remover: ' + failed.map(item => item.package_name + ' (' + item.error + ')').join('; '))

      if (data?.ok) {
        setStage(failed.length ? 'Remoção parcial: ' + failed.map(item => item.package_name + ' (' + item.error + ')').join('; ') : 'Remoção concluída')
        if (scanId && Array.isArray(data.removed) && data.removed.length) {
          try {
            await api.post('/virus-agent/remove/record', { scan_id: scanId, package_names: data.removed })
          } catch (recordError) {
            console.error('Falha ao registrar remoção no ERP', recordError)
            setStage('Remoção concluída; não foi possível salvar o histórico no ERP.')
          }
        }
        setSelected([])
        if (scanResult) {
          setScanResult((current) => {
            if (!current) return current

            return {
              ...current,
              results: current.results.map((row) => {
                const isRemoved = (data.removed || []).includes(row.package_name)
                const failure = (data.failed || []).find(item => item.package_name === row.package_name)
                if (!isRemoved) return failure ? { ...row, removal_status: 'failed', reason: failure.error } : row
                return {
                  ...row,
                  original_risk_label: row.original_risk_label || row.risk_label,
                  removed_at: new Date().toISOString(),
                  status: 'removed',
                  removal_status: 'removed',
                  risk_level: 'safe',
                  risk_label: 'Removido',
                  reason: 'Aplicativo removido com sucesso.',
                  protected: false,
                  removable: false,
                }
              }),
            }
          })
        }
      } else {
        setStage(failed.map(item => item.package_name + ': ' + item.error).join('; ') || 'Não foi possível remover os aplicativos selecionados.')
        setScanResult(current => current ? {
          ...current,
          results: current.results.map(row => {
            const failure = failed.find(item => item.package_name === row.package_name)
            return failure ? { ...row, removal_status: 'failed', reason: failure.error } : row
          }),
        } : current)
      }
    } catch (error) {
      setStage(error?.message || 'Não foi possível remover os aplicativos selecionados.')
    } finally {
      setIsRemoving(false)
      setShowConfirm(false)
    }
  }

  function toggleSelection(pkgName) {
    setSelected((prev) => prev.includes(pkgName)
      ? prev.filter((item) => item !== pkgName)
      : [...prev, pkgName])
  }

  const hasConnectedDevice = !!device && device.connected

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-stone-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            <ShieldAlert size={22} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Ferramenta</p>
            <h2 className="font-display font-bold text-2xl">Removedor de Vírus Android</h2>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-[#4A4A4A] dark:bg-[#232323]">
          <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Ordem de serviço vinculada</label>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={generateReport}
                disabled={!scanResult}
              >
                GERAR RELATÓRIO
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={printReport}
                disabled={!scanResult}
              >
                <Printer size={14} /> IMPRIMIR RELATÓRIO
              </button>
            </div>
          </div>

          <select
            className="input w-full"
            value={selectedOrderId}
            onChange={(event) => setSelectedOrderId(event.target.value)}
          >
            <option value="">Sem vínculo com OS</option>
            {serviceOrders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.order_number} — {order.first_name} {order.last_name} ({order.brand || 'Sem marca'} {order.model || ''})
              </option>
            ))}
          </select>
        </div>

        {selectedOrder ? (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/5 dark:text-emerald-400">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em]">Atendimento selecionado</p>
                <p className="font-semibold">{selectedOrder.order_number} • {selectedOrder.first_name} {selectedOrder.last_name}</p>
              </div>
              <p className="text-sm font-medium">{selectedOrder.brand || 'Marca'} {selectedOrder.model || '—'}</p>
            </div>
          </div>
        ) : (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-400">
            Nenhuma ordem vinculada. Selecione uma OS para registrar o resultado da verificação no ERP.
          </div>
        )}

        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:border-[#4A4A4A] dark:bg-[#1b1b1b] dark:text-slate-300">
          Pacotes essenciais do sistema ficam protegidos e não podem ser removidos.
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-[#4A4A4A] dark:bg-[#232323]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className={connectionState.status === 'connected' ? 'text-emerald-500' : 'text-rose-500'} size={18} />
                <span className="font-semibold">USB direto · Tango ADB</span>
              </div>
              <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${connectionState.status === 'connected' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400'}`}>
                {CONNECTION_LABELS[connectionState.status] || 'Não conectado'}
              </span>
            </div>

            <p className="mt-3 text-sm text-slate-500 dark:text-slate-300">
              {connectionState.status === 'connected' && device
                ? `Aparelho detectado: ${device.manufacturer || 'Desconhecido'} ${device.model || ''}`
                : connectionState.status === 'authenticating' ? 'Aguardando autorização ADB no celular...' : connectionState.error || (!webUsbAdb.available() ? (!window.isSecureContext ? 'WebUSB indisponível neste endereço. Utilize uma conexão HTTPS ou um contexto permitido pelo navegador.' : 'WebUSB indisponível. Use Chrome ou Edge.') : 'Conecte o Android pelo cabo USB e autorize a depuração.')}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={detectDevice} disabled={!webUsbAdb.available() || connectionState.status === "connected" || connectionState.status === "requesting_device" || connectionState.status === "opening_usb" || connectionState.status === "authenticating"}><Plug size={15} /> {connectionState.status === "connected" ? "CONECTADO" : "CONECTAR APARELHO"}</button>
              {["disconnected", "error"].includes(connectionState.status) && <button type="button" className="btn-secondary" onClick={reconnectDevice}>RECONECTAR AUTORIZADO</button>}
              <button type="button" className="btn-primary" onClick={runScan} disabled={connectionState.status !== 'connected' || isScanning}>
                <Search size={15} /> {isScanning ? 'Analisando...' : 'VARREDURA COMPLETA'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#4A4A4A] dark:bg-[#1f1f1f]">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Smartphone size={18} />
              <span className="font-semibold">Status do aparelho</span>
            </div>
            {hasConnectedDevice ? (
              <div className="mt-3 space-y-2 text-sm">
                <p><strong>Fabricante:</strong> {device.manufacturer}</p>
                <p><strong>Modelo:</strong> {device.model}</p>
                <p><strong>Android:</strong> {device.android_version}</p>
                <p><strong>SDK:</strong> {device.sdk_version}</p>
                <p><strong>Serial:</strong> {device.serial_masked}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-300">Aguardando aparelho autorizado via USB.</p>
            )}
          </div>
        </div>
      </div>

      <AndroidMonitor disabled={connectionState.status !== 'connected' || isScanning || isRemoving} onDevice={setDevice} onRemove={(row, confirm, targetDevice) => {
        setDevice(targetDevice)
        setScanResult(current => {
          const results = current?.device?.serial === targetDevice.serial ? [...current.results] : []
          if (!results.some(item => item.package_name === row.package_name)) results.push(row)
          return { ...current, results, total: results.length, device: targetDevice }
        })
        setSelected([row.package_name])
        if (confirm) setShowConfirm(true)
      }} />

      {isScanning && (
        <div className="card p-5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="font-semibold">Analisando aparelho</p>
            <span className="text-sm text-slate-500">{progress}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-300">Etapa atual: {stage}</p>
          <p className="mt-1 text-xs text-slate-400">Não desconecte o aparelho durante a análise.</p>
        </div>
      )}

      {scanResult && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Resultado</p>
                <h3 className="font-display font-bold text-xl">Aparelho analisado</h3>
              </div>
              <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                {scanResult.total} aplicativos analisados
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-[#4A4A4A] dark:bg-[#232323]">
                <p className="text-xs uppercase tracking-wide text-slate-400">Seguros</p>
                <p className="mt-2 text-2xl font-bold text-emerald-600">{summary?.safe ?? 0}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-[#4A4A4A] dark:bg-[#232323]">
                <p className="text-xs uppercase tracking-wide text-slate-400">Baixo risco</p>
                <p className="mt-2 text-2xl font-bold text-amber-600">{summary?.low ?? 0}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-[#4A4A4A] dark:bg-[#232323]">
                <p className="text-xs uppercase tracking-wide text-slate-400">Suspeitos</p>
                <p className="mt-2 text-2xl font-bold text-orange-600">{summary?.medium ?? 0}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-[#4A4A4A] dark:bg-[#232323]">
                <p className="text-xs uppercase tracking-wide text-slate-400">Alto risco</p>
                <p className="mt-2 text-2xl font-bold text-red-600">{summary?.high ?? 0}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-[#4A4A4A] dark:bg-[#232323]">
                <p className="text-xs uppercase tracking-wide text-slate-400">Ameaças</p>
                <p className="mt-2 text-2xl font-bold text-rose-600">{summary?.threat ?? 0}</p>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="text-amber-500" size={18} />
                  <h3 className="font-display font-bold text-xl">Todos os aplicativos</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      const removableVisible = scanResult.results
                        .filter((row) => row.removable !== false && !row.protected && row.package_name)
                        .map((row) => row.package_name)
                      setSelected(Array.from(new Set(removableVisible)))
                    }}
                  >
                    Selecionar removíveis
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setSelected([])}
                  >
                    Limpar seleção
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="virus-search" className="text-xs font-medium uppercase tracking-wide text-slate-400">Pesquisar aplicativo</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    id="virus-search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Pesquisar por nome ou package..."
                    className="input w-full pl-9"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setActiveFilter(option.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${activeFilter === option.value ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'}`}
                  >
                    {option.label} ({counts[option.value] ?? 0})
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500 dark:text-slate-300">{filteredResults.length} aplicativos no filtro atual</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-200">{selected.length} selecionados</span>
                  <button type="button" className="btn-danger" disabled={selected.length === 0 || isRemoving} onClick={() => setShowConfirm(true)}>
                    <Trash2 size={15} /> {isRemoving ? 'Removendo...' : 'Remover selecionados'}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {filteredResults.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-[#171717] dark:text-slate-300">
                  Nenhum aplicativo encontrado com esse filtro ou termo de pesquisa.
                </div>
              ) : (
                filteredResults.map((row) => {
                  const selectedPackage = selected.includes(row.package_name)
                  const canSelect = row.removable !== false && !row.protected
                  return (
                    <div key={row.package_name || row.app_name} className={`rounded-2xl border p-4 ${selectedPackage ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/5' : 'border-slate-200 bg-slate-50 dark:border-[#4A4A4A] dark:bg-[#232323]'}`}>
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedPackage}
                            disabled={!canSelect}
                            onChange={() => toggleSelection(row.package_name)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-semibold text-lg">{row.app_name || row.package_name}</h4>
                              {row.protected && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:bg-slate-700 dark:text-slate-200">🔒 Protegido</span>}
                              {row.status === 'removed' && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">Removido</span>}
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-300">{row.package_name}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Versão {row.version_name || row.version_code || 'N/D'}</p>
                            {row.protected && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Essencial do sistema • não pode ser removido</p>}
                            {row.reason && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{row.reason}</p>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 md:ml-auto">
                          <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${RISK_COLORS[row.risk_level] || RISK_COLORS.safe}`}>
                            {row.risk_label || 'Seguro'}
                          </span>
                          {!canSelect && (
                            <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-200">Não removível</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {!scanResult && !isScanning && (
        <div className="card p-5 text-slate-500 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <Activity size={18} />
            <p>Analise seu aparelho Android conectado via USB.</p>
          </div>
          {connectionState.status !== 'connected' && (
            <p className="mt-3 text-sm text-rose-500">{connectionState.error || 'Conecte o aparelho Android para iniciar.'}</p>
          )}
        </div>
      )}

      {connectionState.status === 'disconnected' && (
        <div className="card p-5 text-amber-700 dark:text-amber-400">
          <div className="flex items-center gap-2"><WifiOff size={18} /><p>APARELHO DESCONECTADO · A conexão USB foi perdida.</p></div>
        </div>
      )}

      {connectionState.status === 'connected' && !hasConnectedDevice && (
        <div className="card p-5 text-amber-700 dark:text-amber-400">
          <div className="flex items-center gap-2">
            <WifiOff size={18} />
            <p>Desbloqueie o celular e aceite a autorização da Depuração USB.</p>
          </div>
        </div>
      )}

      {showConfirm && (
        <ModalFrame className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#4A4A4A] dark:bg-[#1f1f1f]">
            <h3 className="font-display font-bold text-xl">Confirmar remoção</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">
              Você selecionou {selected.length} aplicativo(s) para remoção. Essa ação desinstalará os itens marcados do aparelho.
            </p>
            <div className="mt-4 max-h-72 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-[#4A4A4A] dark:bg-[#171717]">
              {selected.map((pkg) => (
                <div key={pkg} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm dark:bg-[#232323]">
                  <span>{scanResult?.results?.find(row => row.package_name === pkg)?.app_name || pkg}<br /><small>{pkg}</small></span>
                  <CheckCircle2 className="text-emerald-600" size={16} />
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" className="btn-secondary" onClick={() => setShowConfirm(false)}>Cancelar</button>
              <button type="button" className="btn-danger" onClick={handleRemoveSelected} disabled={isRemoving}>Confirmar remoção</button>
            </div>
          </div>
        </ModalFrame>
      )}

      {reportData && (
        <div id="virus-removal-report-print-root" className="hidden">
          <VirusRemovalReportPrint reportData={reportData} />
        </div>
      )}
    </div>
  )
}



