import { confirmRecordDeletion } from '../utils/confirmDeletion'
import { useSettings } from '../context/SettingsContext'
import { useAuth } from '../context/AuthContext'
import ModalFrame from '../components/UI/ModalFrame'
import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Save, MessageCircle, X } from 'lucide-react'
import api from '../api/client'
import CustomerPicker from '../components/UI/CustomerPicker'
import ServiceOrderPhotoManager from '../components/UI/ServiceOrderPhotoManager'
import DevicePasswordSection from '../components/ServiceOrder/DevicePasswordSection'
import DeviceChecklistSection from '../components/ServiceOrder/DeviceChecklistSection'
import { STATUS_LABELS, PAYMENT_METHOD_LABELS, formatCurrency, onlyDigits } from '../utils/format'

const today = () => new Date().toISOString().slice(0, 10)

export default function ServiceOrderForm() {
  const { settings } = useSettings()
  const { isAdmin } = useAuth()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [customer, setCustomer] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [form, setForm] = useState({
    brand: '', model: '', imei1: '', imei2: '',
    entry_date: today(), expected_delivery_date: '', delivery_date: '',
    description: '', notes: '',
    service_price: '', parts_cost: '', supplier_id: '', additional_costs: '',
    payment_method: 'pending', status: 'received', warranty_days: settings.documents.warranty_days,
    unlock_type: 'none', unlock_password: '', unlock_pattern: '',
    device_condition: '', battery_health: '', checklist_notes: '',
  })
  const [checklist, setChecklist] = useState({})
  const [accessories, setAccessories] = useState({ items: [], other: '' })
  const [saving, setSaving] = useState(false)
  const submitLock = useRef(false)
  const errorRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [savedOrder, setSavedOrder] = useState(null)
  const [pendingPhotos, setPendingPhotos] = useState([])
  const [existingPhotos, setExistingPhotos] = useState([])
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 640 : false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 640px)')
    const handleChange = (event) => setIsMobile(event.matches)

    setIsMobile(mediaQuery.matches)
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    api.get('/inventory/suppliers').then(({ data }) => setSuppliers(data))
      .catch(() => setError('Não foi possível carregar os fornecedores.'))
  }, [isAdmin])

  useEffect(() => {
    if (!isEdit) return
    api.get(`/service-orders/${id}`).then(({ data }) => {
      setCustomer({ id: data.customer_id, first_name: data.first_name, last_name: data.last_name, phone: data.phone })

      let parsedChecklist = {}
      try {
        if (typeof data.checklist_json === 'string') parsedChecklist = JSON.parse(data.checklist_json)
        else if (typeof data.checklist_json === 'object' && data.checklist_json) parsedChecklist = data.checklist_json
      } catch (_) {}
      setChecklist(parsedChecklist && typeof parsedChecklist === 'object' ? parsedChecklist : {})

      let parsedAccessories = { items: [], other: '' }
      try {
        if (typeof data.accessories_json === 'string') parsedAccessories = JSON.parse(data.accessories_json)
        else if (typeof data.accessories_json === 'object' && data.accessories_json) parsedAccessories = data.accessories_json
      } catch (_) {}
      setAccessories(parsedAccessories && typeof parsedAccessories === 'object' ? parsedAccessories : { items: [], other: '' })

      setForm({
        brand: data.brand || '', model: data.model || '', imei1: data.imei1 || '', imei2: data.imei2 || '',
        entry_date: data.entry_date || today(), expected_delivery_date: data.expected_delivery_date || '',
        delivery_date: data.delivery_date || '', description: data.description || '', notes: data.notes || '',
        service_price: data.service_price ?? '', parts_cost: data.parts_cost ?? '', supplier_id: data.supplier_id ?? '', additional_costs: data.additional_costs ?? '',
        payment_method: data.payment_method || 'pending', status: data.status || 'received', warranty_days: data.warranty_days ?? settings.documents.warranty_days,
        unlock_type: data.unlock_type || 'none',
        unlock_password: data.unlock_password || '',
        unlock_pattern: data.unlock_pattern || '',
        device_condition: data.device_condition || '',
        battery_health: data.battery_health ?? '',
        checklist_notes: data.checklist_notes || '',
      })
      setExistingPhotos(data.photos || [])
      setSavedOrder(data)
    })
  }, [id, isEdit])

  const profit = (Number(form.service_price) || 0) - (Number(form.parts_cost) || 0) - (Number(form.additional_costs) || 0)

  async function uploadPendingPhotos(orderId) {
    if (!pendingPhotos.length) return

    setUploading(true)
    const formData = new FormData()
    pendingPhotos.forEach((photo) => {
      formData.append('photos', photo.file)
    })
    formData.append('metadata', JSON.stringify(
      pendingPhotos.map((photo) => ({
        photoType: photo.photoType,
        description: photo.description,
      }))
    ))

    const { data } = await api.post(`/service-orders/${orderId}/photos`, formData)
    setExistingPhotos((current) => [...current, ...data])
    setPendingPhotos([])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitLock.current) return
    if (!customer) { setError('Selecione um cliente.'); return }
    submitLock.current = true
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        customer_id: customer.id,
        checklist_json: checklist,
        accessories_json: accessories,
      }
      let res
      if (isEdit || savedOrder?.id) res = await api.put(`/service-orders/${id || savedOrder.id}`, payload)
      else res = await api.post('/service-orders', payload)
      setSavedOrder(res.data)
      await uploadPendingPhotos(res.data.id)
      navigate(isMobile ? '/ordens' : `/ordens/${res.data.id}`, { replace: true })
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar ordem de serviço.')
      requestAnimationFrame(() => errorRef.current?.scrollIntoView({ block: 'start' }))
    } finally {
      submitLock.current = false
      setUploading(false)
      setSaving(false)
    }
  }

  function whatsappLink() {
    if (!customer?.phone) return null
    const phone = onlyDigits(customer.phone)
    const fullPhone = phone.length <= 11 ? `55${phone}` : phone
    const msg = `Olá, ${customer.first_name}!\n\nSeu ${form.brand} ${form.model} já está pronto para retirada na *${settings.store.name}*.\n\nValor total: ${formatCurrency(form.service_price)}\n\nObrigado por escolher nossos serviços!`
    return `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`
  }

  const content = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <fieldset disabled={saving} className="min-w-0 space-y-4">
      {error && <p ref={errorRef} role="alert" className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-lg p-3">{error}</p>}

      <div className="card p-5 space-y-3">
        <p className="font-semibold text-sm mb-1">Cliente</p>
        <CustomerPicker value={customer} onChange={setCustomer} />
      </div>

      <div className="card p-5 grid sm:grid-cols-2 gap-3">
        <div><label className="label">Marca</label><input className="input" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} /></div>
        <div><label className="label">Modelo</label><input className="input" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} /></div>
        <div><label className="label">IMEI 1</label><input className="input" value={form.imei1} onChange={e => setForm(f => ({ ...f, imei1: e.target.value }))} /></div>
        <div><label className="label">IMEI 2</label><input className="input" value={form.imei2} onChange={e => setForm(f => ({ ...f, imei2: e.target.value }))} /></div>
        <div className="sm:col-span-2">
          <label className="label">Descrição do Reparo</label>
          <textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Observações</label>
          <textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
      </div>

      <DevicePasswordSection
        unlockType={form.unlock_type}
        unlockPassword={form.unlock_password}
        unlockPattern={form.unlock_pattern}
        onChangeType={(val) => setForm(f => ({ ...f, unlock_type: val }))}
        onChangePassword={(val) => setForm(f => ({ ...f, unlock_password: val }))}
        onChangePattern={(val) => setForm(f => ({ ...f, unlock_pattern: val }))}
        disabled={saving}
      />

      <DeviceChecklistSection
        checklist={checklist}
        onChangeChecklist={setChecklist}
        accessories={accessories}
        onChangeAccessories={setAccessories}
        deviceCondition={form.device_condition}
        onChangeDeviceCondition={(val) => setForm(f => ({ ...f, device_condition: val }))}
        batteryHealth={form.battery_health}
        onChangeBatteryHealth={(val) => setForm(f => ({ ...f, battery_health: val }))}
        checklistNotes={form.checklist_notes}
        onChangeChecklistNotes={(val) => setForm(f => ({ ...f, checklist_notes: val }))}
        disabled={saving}
      />

      <div className="card p-5 grid sm:grid-cols-3 gap-3">
        <div><label className="label">Data de Entrada</label><input type="date" className="input" required value={form.entry_date} onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} /></div>
        <div><label className="label">Previsão de Entrega</label><input type="date" className="input" value={form.expected_delivery_date} onChange={e => setForm(f => ({ ...f, expected_delivery_date: e.target.value }))} /></div>
        <div><label className="label">Data de Entrega</label><input type="date" className="input" value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))} /></div>
      </div>

      <div className="card p-5 grid sm:grid-cols-3 gap-3">
        <div><label className="label">Preço do Serviço (R$)</label><input type="number" step="0.01" className="input" value={form.service_price} onChange={e => setForm(f => ({ ...f, service_price: e.target.value }))} /></div>
        {isAdmin && <div><label className="label">Custo de Peças (R$)</label><input type="number" step="0.01" className="input" value={form.parts_cost} onChange={e => setForm(f => ({ ...f, parts_cost: e.target.value }))} /></div>}
        {isAdmin && <div className="min-w-0">
          <label className="label" htmlFor="part-supplier">Fornecedor da peça (opcional)</label>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <select id="part-supplier" className="input min-w-0 flex-1" value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
              <option value="">Selecione o fornecedor</option>
              {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
            <button type="button" className="btn-secondary shrink-0" onClick={() => setShowSupplierModal(true)}>+ Adicionar</button>
          </div>
          {savedOrder?.part_withdrawal_id && <p className="mt-1 text-xs text-slate-500">Ao salvar, custo e fornecedor serão atualizados na retirada automática.</p>}
        </div>}
        {isAdmin && <div><label className="label">Custos Adicionais (R$)</label><input type="number" step="0.01" className="input" value={form.additional_costs} onChange={e => setForm(f => ({ ...f, additional_costs: e.target.value }))} /></div>}
        {isAdmin && <div className="sm:col-span-3 flex items-center justify-between bg-slate-50 dark:bg-ink-700/40 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium text-slate-500">Lucro Calculado</span>
          <span className={`font-display font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(profit)}</span>
        </div>}
      </div>

      <div className="card p-5 grid sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Forma de Pagamento</label>
          <select className="input" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
            {Object.entries(PAYMENT_METHOD_LABELS).filter(([k]) => settings?.finance?.payments?.[k] !== false || k === form.payment_method).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Status do Reparo</label>
          <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Garantia (dias)</label>
          <input type="number" className="input" value={form.warranty_days} onChange={e => setForm(f => ({ ...f, warranty_days: e.target.value }))} />
        </div>
      </div>

      <ServiceOrderPhotoManager value={pendingPhotos} onChange={setPendingPhotos} maxPhotos={8} disabled={saving} existingPhotos={existingPhotos} onDelete={async (photoId) => {
        if (!confirmRecordDeletion('Excluir esta foto permanentemente?')) return
        try { await api.delete(`/service-orders/${id || savedOrder.id}/photos/${photoId}`); setExistingPhotos((current) => current.filter((photo) => photo.id !== photoId)) }
        catch (err) { setError(err.response?.data?.error || 'Falha ao excluir foto.') }
      }} />

      <div className="form-actions">
        <button type="button" disabled={saving} onClick={() => navigate('/ordens')} className="btn-secondary">Cancelar</button>
        <button type="submit" className="btn-primary" disabled={saving}><Save size={16} /> {uploading ? 'Enviando fotos...' : saving ? 'Salvando...' : 'Salvar Ordem de Serviço'}</button>
      </div>
      </fieldset>
    </form>
  )

  const supplierModal = showSupplierModal && <SupplierQuickAddModal onClose={() => setShowSupplierModal(false)} onSaved={supplier => {
      setSuppliers(current => [...current, supplier].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
      setForm(current => ({ ...current, supplier_id: supplier.id }))
      setShowSupplierModal(false)
    }} />

  if (isMobile) {
    return (
      <>
      <ModalFrame busy={saving} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-3 flex items-center justify-center" onClick={() => { if (!saving) navigate(isEdit ? `/ordens/${id}` : '/ordens') }}>
        <div className="mx-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[22px] border border-white/10 bg-white dark:bg-[#222225] shadow-2xl dark:border-white/10 dark:bg-[#222225]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-4 py-3 dark:border-white/10">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{isEdit ? 'Editar' : 'Nova'}</p>
              <h2 className="font-display font-bold text-lg">{isEdit ? `Ordem ${savedOrder?.order_number || ''}` : 'Ordem de Serviço'}</h2>
            </div>
            <button type="button" disabled={saving} onClick={() => { if (!saving) navigate(isEdit ? `/ordens/${id}` : '/ordens') }} className="btn-ghost !px-2 !py-1.5" aria-label="Fechar modal">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 sm:px-4">
            <div className="mx-auto max-w-4xl space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-display font-bold text-xl">{isEdit ? `Editar Ordem ${savedOrder?.order_number || ''}` : 'Nova Ordem de Serviço'}</h2>
                {isEdit && form.status === 'ready' && customer?.phone && (
                  <a href={whatsappLink()} target="_blank" rel="noreferrer" className="btn-secondary !bg-emerald-50 !text-emerald-700 dark:!bg-emerald-500/10 dark:!text-emerald-400">
                    <MessageCircle size={16} /> WhatsApp
                  </a>
                )}
              </div>

              {content}
            </div>
          </div>
        </div>
      </ModalFrame>
      {supplierModal}
      </>
    )
  }

  return (
    <>
    <div className="space-y-4 max-w-4xl">
      <Link to="/ordens" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft size={15} /> Voltar às ordens de serviço
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-display font-bold text-xl">{isEdit ? `Editar Ordem ${savedOrder?.order_number || ''}` : 'Nova Ordem de Serviço'}</h2>
        {isEdit && form.status === 'ready' && customer?.phone && (
          <a href={whatsappLink()} target="_blank" rel="noreferrer" className="btn-secondary !bg-emerald-50 !text-emerald-700 dark:!bg-emerald-500/10 dark:!text-emerald-400">
            <MessageCircle size={16} /> Enviar Mensagem no WhatsApp
          </a>
        )}
      </div>

      {content}
    </div>
    {supplierModal}
    </>
  )
}

function SupplierQuickAddModal({ onClose, onSaved }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const { data } = await api.post('/inventory/suppliers', { name: name.trim(), contact_info: phone.trim(), notes: notes.trim() })
      onSaved(data)
    } catch (failure) {
      setError(failure.response?.data?.error || 'Não foi possível salvar o fornecedor.')
    } finally { setSaving(false) }
  }

  return <ModalFrame busy={saving} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
    <form onSubmit={handleSubmit} onClick={event => event.stopPropagation()} className="modal-panel w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-bold">Adicionar fornecedor</h3>
        <button type="button" className="btn-ghost" aria-label="Fechar" disabled={saving} onClick={onClose}><X size={18} /></button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div><label className="label" htmlFor="supplier-name">Nome do fornecedor</label><input id="supplier-name" className="input" required maxLength={200} autoFocus value={name} onChange={event => setName(event.target.value)} /></div>
      <div><label className="label" htmlFor="supplier-phone">Telefone/WhatsApp (opcional)</label><input id="supplier-phone" className="input" type="tel" maxLength={100} value={phone} onChange={event => setPhone(event.target.value)} /></div>
      <div><label className="label" htmlFor="supplier-notes">Observação (opcional)</label><textarea id="supplier-notes" className="input" rows={3} maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} /></div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar fornecedor'}</button>
      </div>
    </form>
  </ModalFrame>
}
