import React, { useEffect, useState } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useSettings } from '../context/SettingsContext'
import api from '../api/client'

export default function QrCodePrint() {
  const { settings } = useSettings()
  const { id } = useParams()
  const { state } = useLocation()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Paper width state: '80mm' (default / priority) or '58mm'
  const [paperWidth, setPaperWidth] = useState(() => {
    try {
      return localStorage.getItem('itech_qr_paper_width') || '80mm'
    } catch {
      return '80mm'
    }
  })

  const handleSelectPaper = (width) => {
    setPaperWidth(width)
    try {
      localStorage.setItem('itech_qr_paper_width', width)
    } catch {}
  }

  // Retrieve publicUrl from router state or sessionStorage
  const [publicUrl, setPublicUrl] = useState(() => {
    if (state?.orderId === id && state?.trackingUrl) return state.trackingUrl
    try {
      return sessionStorage.getItem(`tracking_url_${id}`) || ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    if (state?.trackingUrl && state?.orderId === id) {
      setPublicUrl(state.trackingUrl)
      try {
        sessionStorage.setItem(`tracking_url_${id}`, state.trackingUrl)
      } catch {}
    }
  }, [state, id])

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    api.get(`/service-orders/${id}`)
      .then((res) => {
        if (isMounted) {
          setOrder(res.data)
          setError('')
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Erro ao carregar OS para impressão:', err)
          setError('Não foi possível carregar os dados da ordem de serviço.')
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => { isMounted = false }
  }, [id])

  useEffect(() => {
    const osId = order?.order_number || id
    document.title = `Comprovante OS ${osId}`
    return () => {
      document.title = `${settings?.store?.trade_name || settings?.store?.name || 'iTech'} — Painel`
    }
  }, [order?.order_number, id, settings])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-slate-400 text-sm">Carregando dados do comprovante...</p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="card max-w-md mx-auto p-6 text-center space-y-4">
        <p className="text-slate-700 dark:text-slate-200 text-sm font-medium">
          {error || 'Ordem de serviço não encontrada.'}
        </p>
        <Link to={`/ordens`} className="btn-secondary inline-flex items-center gap-1.5 text-xs">
          <ArrowLeft size={15} /> Voltar para Ordens
        </Link>
      </div>
    )
  }

  if (!publicUrl) {
    return (
      <div className="card max-w-md mx-auto p-6 text-center space-y-4">
        <p className="text-slate-700 dark:text-slate-200 text-sm font-medium">
          Nenhum link de acompanhamento ativo para esta Ordem de Serviço.
        </p>
        <p className="text-xs text-slate-500">
          Abra os detalhes da OS e clique em &quot;Gerar acompanhamento&quot; antes de imprimir o comprovante.
        </p>
        <Link to={`/ordens/${id}`} className="btn-primary inline-flex items-center gap-1.5 text-xs font-semibold">
          <ArrowLeft size={15} /> Voltar à OS e gerar acompanhamento
        </Link>
      </div>
    )
  }

  // Store information formatting
  const storeName = settings?.store?.trade_name || 'iTech Celular e Informática'
  const storeCnpj = settings?.store?.cnpj || '58.710.025/0001-69'

  const streetPart = settings?.store?.street || 'Av. Ananias Fernandes dos Santos'
  const numberPart = settings?.store?.number ? `, ${settings.store.number}` : (settings?.store?.street ? '' : ', 231')
  const districtPart = settings?.store?.district ? ` - ${settings.store.district}` : (settings?.store?.street ? '' : ' - Centro')
  const addressLine1 = `${streetPart}${numberPart}${districtPart}`.trim()

  const cityPart = settings?.store?.city || 'Canindé de São Francisco'
  const statePart = settings?.store?.state || 'SE'
  const zipPart = settings?.store?.zip || '49820-000'
  const addressLine2 = `${cityPart}/${statePart} - CEP ${zipPart}`

  const formatPhone = (val) => {
    if (!val) return ''
    const digits = String(val).replace(/\D/g, '')
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
    if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
    return val
  }

  const p1 = formatPhone(settings?.store?.phone) || '(79) 98135-1174'
  const p2 = formatPhone(settings?.store?.secondary_phone) || '(79) 98140-9039'
  const phonesLine = p1 && p2 && p1 !== p2 ? `Telefones: ${p1} | ${p2}` : `Telefones: ${p1 || p2}`

  // OS information
  const osNumber = order.order_number || String(id)
  const customerName = [order.first_name, order.last_name].filter(Boolean).join(' ').trim() || order.customer_name_snapshot || 'Cliente não identificado'
  const deviceName = [order.brand, order.model].filter(Boolean).join(' ').trim() || 'Aparelho não especificado'

  // QR Code size:
  // 80mm roll -> 132px (~35mm, useful content width: 72mm)
  // 58mm roll -> 116px (~30.7mm, useful content width: 48mm)
  const qrCodeSize = paperWidth === '58mm' ? 116 : 132

  return (
    <div className="qr-receipt-page">
      {/* Interface control bar (hidden in print) */}
      <div className="no-print max-w-xl mx-auto mb-6 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#1E1E1E] p-4 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
        <Link
          to={`/ordens/${id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-zinc-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
        >
          <ArrowLeft size={16} /> Voltar à OS
        </Link>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400">Bobina:</span>
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-zinc-800 p-1 border border-slate-200 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => handleSelectPaper('80mm')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                paperWidth === '80mm'
                  ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-sm font-semibold'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Bobina padrão de 80mm (largura útil 72mm)"
            >
              80 mm (Padrão)
            </button>
            <button
              type="button"
              onClick={() => handleSelectPaper('58mm')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                paperWidth === '58mm'
                  ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-sm font-semibold'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Bobina estreita de 58mm (largura útil 48mm)"
            >
              58 mm
            </button>
          </div>
        </div>

        <button
          type="button"
          className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold shadow-sm"
          onClick={() => window.print()}
        >
          <Printer size={16} /> Imprimir comprovante
        </button>
      </div>

      {/* Screen Preview & Thermal Receipt */}
      <div className="qr-thermal-preview-container">
        <div
          id="qr-thermal-print-area"
          className={`qr-thermal-receipt ${paperWidth === '58mm' ? 'receipt-58mm' : 'receipt-80mm'}`}
        >
          {/* 1. Cabeçalho da loja */}
          <div className="qr-receipt-header">
            <div className="qr-receipt-store-name">{storeName}</div>
            <div className="qr-receipt-store-info">CNPJ: {storeCnpj}</div>
            <div className="qr-receipt-store-info">{addressLine1}</div>
            <div className="qr-receipt-store-info">{addressLine2}</div>
            <div className="qr-receipt-store-info">{phonesLine}</div>
          </div>

          {/* 2. Informações da ordem de serviço */}
          <div className="qr-receipt-divider" />

          <div className="qr-receipt-body">
            <div className="qr-receipt-title">ACOMPANHAMENTO DO REPARO</div>
            <div className="qr-receipt-os">
              OS: <strong>{osNumber}</strong>
            </div>
            <div className="qr-receipt-meta-line">
              <strong>Cliente:</strong> {customerName}
            </div>
            <div className="qr-receipt-meta-line">
              <strong>Aparelho:</strong> {deviceName}
            </div>
          </div>

          {/* 3. QR Code */}
          <div className="qr-receipt-qrcode-wrap">
            <div className="qr-receipt-qrcode-box">
              <QRCodeSVG
                value={publicUrl}
                size={qrCodeSize}
                level="M"
                marginSize={2}
                fgColor="#000000"
                bgColor="#ffffff"
              />
            </div>
            <div className="qr-receipt-caption">
              Escaneie para acompanhar o status do seu reparo
            </div>
          </div>

          {/* 4. Rodapé */}
          <div className="qr-receipt-divider" />

          <div className="qr-receipt-footer">
            <p className="qr-receipt-footer-line">Guarde este comprovante para consultar o andamento do serviço.</p>
            <p className="qr-receipt-footer-line">Dúvidas? Entre em contato pelos telefones acima.</p>
          </div>
        </div>
      </div>

      {/* Scoped CSS for Screen & Thermal Printing */}
      <style>{`
        .qr-receipt-page {
          width: 100%;
        }

        .qr-thermal-preview-container {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 8px 0 32px;
          width: 100%;
        }

        /* Base receipt container (Screen preview) */
        .qr-thermal-receipt {
          background: #ffffff;
          color: #000000;
          font-family: Arial, Helvetica, sans-serif;
          text-align: center;
          box-sizing: border-box;
          margin: 0 auto;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
          transition: width 0.2s ease;
        }

        .qr-thermal-receipt.receipt-80mm {
          width: 72mm;
          max-width: 72mm;
          padding: 5mm 3mm 6mm;
        }

        .qr-thermal-receipt.receipt-58mm {
          width: 48mm;
          max-width: 48mm;
          padding: 3mm 2mm 5mm;
        }

        /* 1. Header Typography */
        .qr-receipt-header {
          text-align: center;
          margin: 0;
          padding: 0;
        }

        .qr-receipt-store-name {
          font-size: 13.5px;
          font-weight: 800;
          line-height: 1.25;
          color: #000000;
          margin-bottom: 3px;
          word-break: break-word;
        }
        .receipt-58mm .qr-receipt-store-name {
          font-size: 11.5px;
          margin-bottom: 2px;
        }

        .qr-receipt-store-info {
          font-size: 9.5px;
          line-height: 1.35;
          color: #000000;
          margin: 1px 0;
          word-break: break-word;
        }
        .receipt-58mm .qr-receipt-store-info {
          font-size: 8.5px;
          line-height: 1.28;
        }

        /* Dividers */
        .qr-receipt-divider {
          border-top: 1px dashed #000000;
          margin: 6px 0;
          width: 100%;
        }
        .receipt-58mm .qr-receipt-divider {
          margin: 5px 0;
        }

        /* 2. OS Section */
        .qr-receipt-body {
          text-align: center;
        }

        .qr-receipt-title {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: #000000;
          line-height: 1.3;
          margin-bottom: 3px;
        }
        .receipt-58mm .qr-receipt-title {
          font-size: 9.5px;
          letter-spacing: 0.02em;
        }

        .qr-receipt-os {
          font-size: 12px;
          font-weight: 600;
          color: #000000;
          margin-bottom: 3px;
        }
        .qr-receipt-os strong {
          font-size: 14px;
          font-weight: 800;
        }
        .receipt-58mm .qr-receipt-os {
          font-size: 11px;
        }
        .receipt-58mm .qr-receipt-os strong {
          font-size: 12.5px;
        }

        .qr-receipt-meta-line {
          font-size: 10px;
          line-height: 1.35;
          color: #000000;
          margin: 1px 0;
          word-break: break-word;
        }
        .qr-receipt-meta-line strong {
          font-weight: 700;
        }
        .receipt-58mm .qr-receipt-meta-line {
          font-size: 9px;
          line-height: 1.28;
        }

        /* 3. QR Code */
        .qr-receipt-qrcode-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin: 5px auto 3px;
          width: 100%;
        }

        .qr-receipt-qrcode-box {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 3px;
          background: #ffffff;
        }

        .qr-receipt-caption {
          font-size: 9.5px;
          line-height: 1.3;
          color: #000000;
          margin-top: 5px;
          max-width: 92%;
          word-break: break-word;
          font-weight: 500;
        }
        .receipt-58mm .qr-receipt-caption {
          font-size: 8.5px;
          line-height: 1.25;
          max-width: 96%;
        }

        /* 4. Footer */
        .qr-receipt-footer {
          font-size: 9px;
          line-height: 1.35;
          color: #000000;
          word-break: break-word;
          text-align: center;
        }
        .receipt-58mm .qr-receipt-footer {
          font-size: 8px;
          line-height: 1.28;
        }
        .qr-receipt-footer-line {
          margin: 2px 0;
        }

        /* 5. Requisitos de Impressão Térmica (@media print) */
        @media print {
          @page {
            size: ${paperWidth === '58mm' ? '58mm auto' : '80mm auto'};
            margin: 0mm !important;
          }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            width: 100% !important;
            height: auto !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Hide everything in page by default */
          body * {
            visibility: hidden !important;
          }

          .no-print,
          .no-print * {
            display: none !important;
            visibility: hidden !important;
          }

          /* Show only the thermal print area and its elements */
          #qr-thermal-print-area,
          #qr-thermal-print-area * {
            visibility: visible !important;
          }

          .qr-receipt-page,
          .qr-thermal-preview-container {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
          }

          #qr-thermal-print-area {
            position: absolute !important;
            left: 0 !important;
            right: 0 !important;
            top: 0 !important;
            margin: 0 auto !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
            color: #000000 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          #qr-thermal-print-area.receipt-80mm {
            width: 72mm !important;
            max-width: 72mm !important;
            padding: 2mm 1mm 4mm 1mm !important;
          }

          #qr-thermal-print-area.receipt-58mm {
            width: 48mm !important;
            max-width: 48mm !important;
            padding: 2mm 1mm 3mm 1mm !important;
          }

          .qr-receipt-header,
          .qr-receipt-body,
          .qr-receipt-qrcode-wrap,
          .qr-receipt-footer {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  )
}
