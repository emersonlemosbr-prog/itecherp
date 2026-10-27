import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, Copy } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import api from '../../api/client'

export default function TrackingPanel({ order }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function generate() {
    setBusy(true)
    setMessage('')
    try {
      const { data } = await api.post(`/service-orders/${order.id}/tracking`)
      setUrl(data.url)
      try {
        sessionStorage.setItem(`tracking_url_${order.id}`, data.url)
      } catch (_) {}
    } catch (error) { setMessage(error.response?.data?.error || 'Não foi possível gerar o acompanhamento.') }
    finally { setBusy(false) }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage('Link copiado!') }
    catch (_) { setMessage('Selecione o link acima e copie manualmente.') }
  }
  return <div className="card p-5 flex flex-col items-center justify-center gap-3">
    <p className="font-semibold text-sm">Acompanhamento público</p>
    <p className="text-xs text-slate-500 text-center">Gerar novamente invalida o link anterior. O link aparece somente após a geração; copie ou imprima antes de sair.</p>
    <button type="button" className="btn-primary" disabled={busy} onClick={generate}>{busy ? 'Gerando…' : 'Gerar acompanhamento'}</button>
    {url && <>
      <QRCodeSVG value={url} size={140} marginSize={4} />
      <input aria-label="URL pública de acompanhamento" className="input w-full text-xs" readOnly value={url} onFocus={e => e.target.select()} />
      <div className="flex gap-2 flex-wrap justify-center">
        <button type="button" className="btn-secondary inline-flex items-center gap-1.5" onClick={copy}>
          <Copy size={15} /> Copiar link
        </button>
        <Link className="btn-secondary inline-flex items-center gap-1.5" to={`/ordens/${order.id}/imprimir-qrcode`} state={{ trackingUrl: url, orderId: String(order.id) }}>
          <Printer size={15} /> Imprimir o acompanhamento
        </Link>
      </div>
    </>}
    {message && <p role="status" className="text-xs">{message}</p>}
  </div>
}
