import DocumentHeader from '../components/UI/DocumentHeader'
import { useSettings } from '../context/SettingsContext'
import { useAuth } from '../context/AuthContext'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileText, Mail, Package, Plus, Printer, Save, Search, Trash2, UserRound } from 'lucide-react'
import api from '../api/client'
import CustomerPicker from '../components/UI/CustomerPicker'
import { formatCurrency } from '../utils/format'


function emptyItem(index = 1) {
  return {
    id: `${Date.now()}-${index}`,
    item: String(index),
    product: '',
    quantity: '1',
    unit_price: '',
  }
}

function normalizeNumber(value) {
  const number = Number(String(value).replace(',', '.'))
  return Number.isFinite(number) ? number : 0
}

function buildRowSubtotal(row) {
  return normalizeNumber(row.quantity) * normalizeNumber(row.unit_price)
}

function computeTotal(items) {
  return items.reduce((sum, row) => sum + buildRowSubtotal(row), 0)
}

function createDraft() {
  const today = new Date().toISOString().slice(0, 10)
  return {
    id: null,
    order_number: '',
    sale_date: today,
    seller_name: '',
    customer_id: null,
    customer_name: '',
    customer_cpf_cnpj: '',
    address: '',
    city: '',
    state: '',
    cep: '',
    phone: '',
    email: '',
    horario: '',
    payment_method: '',
    notes: '',
    items: [emptyItem(1)],
  }
}

export default function DeviceSale() {
  const { settings } = useSettings()
  const { isSuspended } = useAuth()
  const d = settings.documents
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState(createDraft)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!id)
  const [feedback, setFeedback] = useState('')
  const printRef = useRef(null)

  useEffect(() => {
    if (!id) return
    let active = true

    async function loadSale() {
      setLoading(true)
      try {
        const { data } = await api.get(`/device-sales/${id}`)
        if (!active) return
        setForm({
          id: data.id,
          order_number: data.order_number || '',
          sale_date: data.sale_date || new Date().toISOString().slice(0, 10),
          seller_name: data.seller_name || '',
          customer_id: data.customer_id || null,
          customer_name: data.customer_name || '',
          customer_cpf_cnpj: data.customer_cpf_cnpj || '',
          address: data.address || '',
          city: data.city || '',
          state: data.state || '',
          cep: data.cep || '',
          phone: data.phone || '',
          email: data.email || '',
          horario: data.horario || '',
          payment_method: data.payment_method || '',
          notes: data.notes || '',
          items: (data.items?.length ? data.items : [emptyItem(1)]).map((item, index) => ({
            id: `${Date.now()}-${index}`,
            item: item.item || String(index + 1),
            product: item.product || '',
            quantity: String(item.quantity ?? 0),
            unit_price: String(item.unit_price ?? ''),
          })),
        })
        if (data.customer_id) {
          try {
            const customerResponse = await api.get(`/customers/${data.customer_id}`)
            if (active) setSelectedCustomer(customerResponse.data)
          } catch {
            if (active) setSelectedCustomer(null)
          }
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadSale()
    return () => { active = false }
  }, [id])

  useEffect(() => {
    if (!selectedCustomer) return
    setForm((current) => ({
      ...current,
      customer_id: selectedCustomer.id,
      customer_name: `${selectedCustomer.first_name || ''} ${selectedCustomer.last_name || ''}`.trim(),
      address: selectedCustomer.address || current.address,
      phone: selectedCustomer.phone || current.phone,
    }))
  }, [selectedCustomer])

  const totalAmount = useMemo(() => computeTotal(form.items), [form.items])

  const printableRows = useMemo(() => form.items.map((row, index) => ({
    ...row,
    item: row.item || String(index + 1),
    subtotal: buildRowSubtotal(row),
  })), [form.items])

  async function saveSale(nextForm = form) {
    if (isSuspended) {
      setFeedback('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.')
      return
    }
    const payload = {
      ...nextForm,
      items: nextForm.items.map((row, index) => ({
        item: row.item || String(index + 1),
        product: row.product,
        quantity: normalizeNumber(row.quantity),
        unit_price: normalizeNumber(row.unit_price),
        subtotal: buildRowSubtotal(row),
      })),
      total_amount: computeTotal(nextForm.items),
    }

    setSaving(true)
    setFeedback('')
    try {
      const request = payload.id ? api.put(`/device-sales/${payload.id}`, payload) : api.post('/device-sales', payload)
      const { data } = await request
      setForm({
        id: data.id,
        order_number: data.order_number || payload.order_number,
        sale_date: data.sale_date || payload.sale_date,
        seller_name: data.seller_name || payload.seller_name,
        customer_id: data.customer_id || payload.customer_id,
        customer_name: data.customer_name || payload.customer_name,
        customer_cpf_cnpj: data.customer_cpf_cnpj || payload.customer_cpf_cnpj,
        address: data.address || payload.address,
        city: data.city || payload.city,
        state: data.state || payload.state,
        cep: data.cep || payload.cep,
        phone: data.phone || payload.phone,
        email: data.email || payload.email,
        horario: data.horario || payload.horario,
        payment_method: data.payment_method || payload.payment_method,
        notes: data.notes || payload.notes,
        items: (data.items?.length ? data.items : payload.items).map((row, index) => ({
          id: `${Date.now()}-${index}`,
          item: row.item || String(index + 1),
          product: row.product || '',
          quantity: String(row.quantity ?? 0),
          unit_price: String(row.unit_price ?? ''),
        })),
      })
      setFeedback('Venda salva com sucesso.')
      return data
    } finally {
      setSaving(false)
    }
  }

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updateItem(index, key, value) {
    setForm((current) => {
      const items = current.items.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row)
      return { ...current, items }
    })
  }

  function addItem() {
    setForm((current) => ({ ...current, items: [...current.items, emptyItem(current.items.length + 1)] }))
  }

  function removeItem(index) {
    setForm((current) => {
      const items = current.items.filter((_, rowIndex) => rowIndex !== index)
      const normalized = items.length > 0 ? items.map((row, rowIndex) => ({ ...row, item: String(rowIndex + 1) })) : [emptyItem(1)]
      return { ...current, items: normalized }
    })
  }

  async function handlePrint() {
    window.print()
  }

  async function buildPdfFromPrintTemplate(fileName) {
    const printArea = printRef.current
    const template = printArea?.querySelector('.device-sale-print-doc')
    if (!template) throw new Error('Template de impressão não encontrado.')

    const wrapper = document.createElement('div')
    wrapper.style.position = 'fixed'
    wrapper.style.left = '-100000px'
    wrapper.style.top = '0'
    wrapper.style.width = '194mm'
    wrapper.style.background = '#ffffff'
    wrapper.style.zIndex = '-1'

    const clone = template.cloneNode(true)
    if (clone instanceof HTMLElement) {
      clone.classList.remove('hidden')
      clone.classList.remove('print:block')
      clone.style.display = 'block'
      clone.style.width = '100%'
    }

    wrapper.appendChild(clone)
    document.body.appendChild(wrapper)

    try {
      const module = await import('html2pdf.js')
      const html2pdf = module.default || module
      const worker = html2pdf().set({
        margin: [8, 8, 8, 8],
        filename: `${fileName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      }).from(clone).toPdf()

      const pdf = await worker.get('pdf')
      return pdf.output('blob')
    } finally {
      wrapper.remove()
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(String(reader.result || ''))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  function openMailClientWithFallback(fileName) {
    const recipient = encodeURIComponent(form.email || '')
    const subject = encodeURIComponent(`Venda de Aparelho ${fileName}`)
    const body = encodeURIComponent('Segue a venda de aparelho em anexo. O PDF foi gerado com o mesmo layout da impressão e baixado automaticamente para anexar no envio.')
    window.open(`mailto:${recipient}?subject=${subject}&body=${body}`, '_blank', 'noopener,noreferrer')
  }

  async function handleEmail() {
    try {
      const saved = await saveSale()
      if (!saved?.id) return

      const fileName = saved.order_number || 'venda-aparelho'
      const blob = await buildPdfFromPrintTemplate(fileName)
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = `${fileName}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()

      if (form.email) {
        const pdfBase64 = await blobToBase64(blob)
        try {
          await api.post('/device-sales/email', {
            to: form.email,
            subject: `Venda de Aparelho ${fileName}`,
            text: 'Segue em anexo o documento da venda de aparelho.',
            fileName: `${fileName}.pdf`,
            pdfBase64,
          })
          setFeedback('E-mail enviado com o mesmo PDF da impressão.')
        } catch {
          openMailClientWithFallback(fileName)
          setFeedback('SMTP não disponível. PDF baixado; finalize o envio no seu cliente de e-mail.')
        }
      } else {
        openMailClientWithFallback(fileName)
        setFeedback('Informe um e-mail para envio automático. PDF já foi gerado com o layout da impressão.')
      }

      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      console.error(error)
      setFeedback('Não foi possível gerar o PDF para envio por e-mail.')
    }
  }

  const signatureName = form.customer_name || 'Assinatura do cliente'

  function formatPrintDate(value) {
    if (!value) return '—'
    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  function parseAddressParts(address = '') {
    const trimmed = String(address || '').trim()
    if (!trimmed) return { street: '', number: '' }

    const withComma = trimmed.split(',').map((part) => part.trim()).filter(Boolean)
    if (withComma.length > 1) {
      const lastPart = withComma[withComma.length - 1]
      if (/^\d+[A-Za-z0-9/-]*$/.test(lastPart)) {
        return {
          street: withComma.slice(0, -1).join(', '),
          number: lastPart,
        }
      }
    }

    const numberMatch = trimmed.match(/^(.*?)(?:\s+)(\d+[A-Za-z0-9/-]*)$/)
    if (numberMatch) {
      return {
        street: numberMatch[1].trim(),
        number: numberMatch[2].trim(),
      }
    }

    return { street: trimmed, number: '' }
  }

  const { street: customerStreet, number: customerNumber } = parseAddressParts(form.address)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap no-print">
        <div>
          <h2 className="font-display font-bold text-xl">Venda de Aparelho</h2>
          <p className="text-sm text-slate-400">Formulário de venda.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => { setForm(createDraft()); setSelectedCustomer(null); setFeedback(''); navigate('/venda-aparelho') }}>
            <FileText size={16} /> Novo
          </button>
          <button className="btn-secondary" onClick={() => {
            if (isSuspended) {
              alert('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.')
              return
            }
            saveSale()
          }} disabled={saving || isSuspended} title={isSuspended ? 'Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.' : ''}>
            <Save size={16} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button className="btn-secondary" onClick={handlePrint}>
            <Printer size={16} /> Imprimir
          </button>
          <button className="btn-primary" onClick={() => {
            if (isSuspended) {
              alert('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.')
              return
            }
            handleEmail()
          }} disabled={isSuspended} title={isSuspended ? 'Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.' : ''}>
            <Mail size={16} /> Enviar por E-mail
          </button>
        </div>
      </div>

      {feedback && <div className="card px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{feedback}</div>}
      {loading && <div className="text-sm text-slate-400">Carregando pedido...</div>}

      <div id="print-area" ref={printRef} className="space-y-4">
        <div className="card p-4 md:p-6 space-y-5 print:hidden">
          <div className="flex items-center justify-between gap-4 flex-wrap border-b border-slate-100 dark:border-[#4A4A4A] pb-4">
            <div>
              <middle> <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{settings.store.name}</p></middle>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm w-full sm:w-auto min-w-0">
              <div className="rounded-xl bg-slate-50 dark:bg-[#232323] p-3">
                <p className="text-xs text-slate-400 uppercase">Pedido Nº</p>
                <input className="input mt-1" value={form.order_number} onChange={(e) => updateField('order_number', e.target.value)} placeholder="Automático" />
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-[#232323] p-3">
                <p className="text-xs text-slate-400 uppercase">Data</p>
                <input type="date" className="input mt-1" value={form.sale_date} onChange={(e) => updateField('sale_date', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)]">
            <div className="space-y-4">
              <div className="card p-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-slate-100">
                  <UserRound size={16} className="text-brand-600" /> Dados do cliente
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="label">Buscar cliente cadastrado</label>
                    <CustomerPicker value={selectedCustomer} onChange={setSelectedCustomer} />
                  </div>
                  <div>
                    <label className="label">Nome do cliente</label>
                    <input className="input" value={form.customer_name} onChange={(e) => updateField('customer_name', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">CPF/CNPJ</label>
                    <input className="input" value={form.customer_cpf_cnpj} onChange={(e) => updateField('customer_cpf_cnpj', e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Endereço</label>
                    <input className="input" value={form.address} onChange={(e) => updateField('address', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Cidade</label>
                    <input className="input" value={form.city} onChange={(e) => updateField('city', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Estado</label>
                    <input className="input" value={form.state} onChange={(e) => updateField('state', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">CEP</label>
                    <input className="input" value={form.cep} onChange={(e) => updateField('cep', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Telefone</label>
                    <input className="input" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">E-mail</label>
                    <input type="email" className="input" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="card p-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-slate-100">
                  <Package size={16} className="text-brand-600" /> Produtos
                </div>

                <div className="table-scroll overflow-x-auto rounded-xl border border-slate-200 dark:border-[#4A4A4A]">
                  <table className="w-full text-sm min-w-[780px]">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50 dark:bg-[#232323] border-b border-slate-200 dark:border-[#4A4A4A]">
                        <th className="px-3 py-2 w-20">Item</th>
                        <th className="px-3 py-2">Produto</th>
                        <th className="px-3 py-2 w-28">Quantidade</th>
                        <th className="px-3 py-2 w-36">Valor Unitário</th>
                        <th className="px-3 py-2 w-36">Subtotal</th>
                        <th className="px-3 py-2 w-24">Total</th>
                        <th className="px-3 py-2 w-14"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((row, index) => {
                        const subtotal = buildRowSubtotal(row)
                        return (
                          <tr key={row.id} className="border-b border-slate-100 dark:border-[#3A3A3A] last:border-0">
                            <td className="px-3 py-2 align-top">
                              <input className="input" value={row.item} onChange={(e) => updateItem(index, 'item', e.target.value)} />
                            </td>
                            <td className="px-3 py-2 align-top">
                              <input className="input" value={row.product} onChange={(e) => updateItem(index, 'product', e.target.value)} placeholder="Descreva o aparelho" />
                            </td>
                            <td className="px-3 py-2 align-top">
                              <input type="number" min="0" step="1" className="input" value={row.quantity} onChange={(e) => updateItem(index, 'quantity', e.target.value)} />
                            </td>
                            <td className="px-3 py-2 align-top">
                              <input type="number" min="0" step="0.01" className="input" value={row.unit_price} onChange={(e) => updateItem(index, 'unit_price', e.target.value)} />
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="input bg-slate-50 dark:bg-[#232323]">{formatCurrency(subtotal)}</div>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="input bg-slate-50 dark:bg-[#232323]">{formatCurrency(subtotal)}</div>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <button type="button" className="btn-ghost !px-2 !py-2 text-rose-600" onClick={() => removeItem(index)} disabled={form.items.length === 1}>
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <button type="button" className="btn-secondary" onClick={addItem}>
                    <Plus size={16} /> Adicionar linha
                  </button>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Valor total do pedido</p>
                    <p className="text-2xl font-bold text-brand-700 dark:text-brand-400">{formatCurrency(totalAmount)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="card p-4 space-y-4 sticky top-24">
                <div className="flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-slate-100">
                  <Search size={16} className="text-brand-600" /> Resumo e entrega
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Horário</label>
                    <input className="input" value={form.horario} onChange={(e) => updateField('horario', e.target.value)} placeholder="Ex.: 14:30" />
                  </div>
                  <div>
                    <label className="label">Forma de pagamento</label>
                    <select className="input" value={form.payment_method} onChange={e=>updateField("payment_method",e.target.value)}><option value="">Selecione</option>{Object.entries({pix:"PIX",cash:"Dinheiro",credit_card:"Cartão de Crédito",debit_card:"Cartão de Débito",credit_account:"Fiado / A Prazo"}).filter(([key])=>settings?.finance?.payments?.[key] !== false).map(([key,label])=><option key={key} value={key}>{label}</option>)}{form.payment_method && !["pix","cash","credit_card","debit_card","credit_account"].includes(form.payment_method) && <option value={form.payment_method}>{form.payment_method}</option>}</select>
                  </div>
                  <div className="col-span-2">
                    <label className="label">Nome do vendedor</label>
                    <input className="input" value={form.seller_name} onChange={(e) => updateField('seller_name', e.target.value)} />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-[#4A4A4A] bg-slate-50 dark:bg-[#232323] p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Total calculado</p>
                  <p className="text-3xl font-bold text-ink-900 dark:text-slate-100">{formatCurrency(totalAmount)}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Atualizado em tempo real conforme quantidade e valor unitário.</p>
                </div>

                <div>
                  <label className="label">Observações</label>
                  <textarea className="input min-h-28 resize-y" value={form.notes} onChange={(e) => updateField('notes', e.target.value)} />
                </div>

                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-4 bg-white/50 dark:bg-transparent">
                  <p className="text-xs uppercase tracking-wide text-slate-400 mb-3">Assinatura do cliente</p>
                  <div className="h-28 rounded-xl border border-slate-200 dark:border-[#4A4A4A] bg-gradient-to-b from-transparent to-slate-50 dark:to-[#232323] flex items-end justify-center pb-3 text-sm text-slate-400">
                    {signatureName}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="no-print flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => navigate('/')}>
              Voltar ao painel
            </button>
          </div>
        </div>

        <div className="hidden print:block">
          <div className={`device-sale-print-doc service-order-print-area ${d.paper === "thermal" ? "thermal-document" : ""}`}>
            <DocumentHeader number={form.order_number} />

            <div className="service-order-print-divider" />

            <div className="device-sale-print-main-grid">
              <div className="device-sale-print-client-block">
                <p className="service-order-print-section-label">CLIENTE</p>
                <div className="device-sale-print-client-grid">
                  <div className="device-sale-print-client-field">
                    <span className="device-sale-print-client-label">Nome:</span>
                    <span className="device-sale-print-client-value">{form.customer_name || ''}</span>
                  </div>
                  <div className="device-sale-print-client-field">
                    <span className="device-sale-print-client-label">Telefone:</span>
                    <span className="device-sale-print-client-value">{form.phone || ''}</span>
                  </div>
                  <div className="device-sale-print-client-field full-width">
                    <span className="device-sale-print-client-label">CPF/CNPJ:</span>
                    <span className="device-sale-print-client-value">{form.customer_cpf_cnpj || ''}</span>
                  </div>
                  <div className="device-sale-print-client-field">
                    <span className="device-sale-print-client-label">Endereço:</span>
                    <span className="device-sale-print-client-value">{customerStreet || form.address || ''}</span>
                  </div>
                  <div className="device-sale-print-client-field">
                    <span className="device-sale-print-client-label">Número:</span>
                    <span className="device-sale-print-client-value">{customerNumber || ''}</span>
                  </div>
                  <div className="device-sale-print-client-field">
                    <span className="device-sale-print-client-label">Cidade:</span>
                    <span className="device-sale-print-client-value">{form.city || ''}</span>
                  </div>
                  <div className="device-sale-print-client-field">
                    <span className="device-sale-print-client-label">Estado:</span>
                    <span className="device-sale-print-client-value">{form.state || ''}</span>
                  </div>
                  <div className="device-sale-print-client-field">
                    <span className="device-sale-print-client-label">CEP:</span>
                    <span className="device-sale-print-client-value">{form.cep || ''}</span>
                  </div>
                </div>
              </div>
            </div>



            <div className="device-sale-print-summary">
              {d.date && <div className="device-sale-print-summary-item">
                <p className="service-order-print-section-label">DATA</p>
                <div className="device-sale-print-summary-value">{formatPrintDate(form.sale_date)}</div>
              </div>}
              {d.time && <div className="device-sale-print-summary-item">
                <p className="service-order-print-section-label">HORÁRIO</p>
                <div className="device-sale-print-summary-value">{form.horario || '—'}</div>
              </div>}
              {d.payment && <div className="device-sale-print-summary-item">
                <p className="service-order-print-section-label">PAGAMENTO</p>
                <div className="device-sale-print-summary-value">{form.payment_method || '—'}</div>
              </div>}
            </div>

            <div className="mb-6">
              <p className="service-order-print-section-label">ITENS</p>
              <table className="device-sale-print-item-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Produto</th>
                    <th className="text-right">Qtd.</th>
                    <th className="text-right">Valor Unit.</th>
                    <th className="text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {printableRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.item}</td>
                      <td>{row.product || '—'}</td>
                      <td className="text-right">{row.quantity || '0'}</td>
                      <td className="text-right">{formatCurrency(row.unit_price)}</td>
                      <td className="text-right">{formatCurrency(row.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="device-sale-print-total-wrap">
              <div className="device-sale-print-total-box">
                <p>Valor total</p>
                <strong>{formatCurrency(totalAmount)}</strong>
              </div>
            </div>

            {d.notes && <div className="mb-6">
              <p className="service-order-print-section-label">OBSERVAÇÕES</p>
              <p className="device-sale-print-notes-box whitespace-pre-wrap">{form.notes || 'Sem observações.'}</p>
            </div>}

            {d.footer && <p className="text-xs">{d.footer_text}</p>}
            <div className="service-order-print-footer w-full mt-12 text-sm">
              <div className="service-order-print-footer-signatures grid grid-cols-2 gap-10 mb-6">
                {d.customer_signature && <div className="text-center">
                  <div className="border-t border-slate-700 pt-2">Assinatura do cliente</div>
                </div>}
                {d.staff_signature && <div className="text-center">
                  <div className="border-t border-slate-700 pt-2">{form.seller_name || 'Vendedor'}</div>
                </div>}
              </div>

              <div className="service-order-print-footer-row flex items-start justify-between gap-6">
                <div className="service-order-print-warranty-block w-full text-left">
                  <p className="text-[10px] font-semibold text-slate-700 mb-1 tracking-wide">TERMOS DA VENDA</p>
                  <p className="text-[10px] leading-relaxed text-slate-500">
                    O cliente declara ter recebido o aparelho conforme descrito na nota, ciente do valor total, forma de pagamento e condições de entrega.
                    Qualquer pendência, troca ou falha de comunicação deve ser formalizada imediatamente para acompanhamento da loja.
                    A loja se responsabiliza pela conferência do produto e pela emissão do comprovante deste atendimento.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}




  
