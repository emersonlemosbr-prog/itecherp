import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Truck, Plus, Search, Eye, Pencil, Power, Trash2, X, AlertCircle, CheckCircle2, ShoppingBag
} from 'lucide-react'
import api from '../api/client'
import {
  maskCPF, maskCNPJ, maskPhone, maskCEP, validateCPF, validateCNPJ, lookupCEP, onlyDigits
} from '../utils/masks'

const formatMoney = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const EMPTY_FORM = {
  name: '',
  trade_name: '',
  person_type: 'PJ',
  document: '',
  state_registration: '',
  phone: '',
  whatsapp: '',
  email: '',
  contact_name: '',
  postal_code: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  notes: '',
  is_active: 1,
}

export default function Suppliers() {
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'active' | 'inactive'
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Modal Cadastro / Edição
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [cepLoading, setCepLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Modal Detalhes + Histórico
  const [detailModal, setDetailModal] = useState(null)
  const [historyData, setHistoryData] = useState({ items: [], total_purchased: 0 })
  const [loadingHistory, setLoadingHistory] = useState(false)

  async function loadSuppliers() {
    setLoading(true)
    try {
      const { data } = await api.get('/inventory/suppliers')
      setSuppliers(data || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao carregar fornecedores.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSuppliers()
  }, [])

  const stats = useMemo(() => {
    return suppliers.reduce((acc, s) => {
      acc.total += 1
      if (s.is_active === 0) acc.inactive += 1
      else acc.active += 1
      acc.purchasesCount += Number(s.purchases_count || 0)
      acc.purchasesTotal += Number(s.purchases_total || 0)
      return acc
    }, { total: 0, active: 0, inactive: 0, purchasesCount: 0, purchasesTotal: 0 })
  }, [suppliers])

  const filtered = useMemo(() => {
    const cleanQ = q.trim().toLowerCase()
    const cleanDigits = onlyDigits(q)
    return suppliers.filter((s) => {
      if (statusFilter === 'active' && s.is_active === 0) return false
      if (statusFilter === 'inactive' && s.is_active !== 0) return false
      if (!cleanQ) return true
      return (
        String(s.name || '').toLowerCase().includes(cleanQ) ||
        String(s.trade_name || '').toLowerCase().includes(cleanQ) ||
        String(s.email || '').toLowerCase().includes(cleanQ) ||
        String(s.phone || '').toLowerCase().includes(cleanQ) ||
        String(s.whatsapp || '').toLowerCase().includes(cleanQ) ||
        (cleanDigits && String(s.document || '').includes(cleanDigits))
      )
    })
  }, [suppliers, q, statusFilter])

  function openNewModal() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
    setFormOpen(true)
  }

  function openEditModal(s) {
    setEditingId(s.id)
    const pType = s.person_type === 'PF' ? 'PF' : 'PJ'
    const docMasked = s.document
      ? (pType === 'PF' ? maskCPF(s.document) : maskCNPJ(s.document))
      : ''
    setForm({
      name: s.name || '',
      trade_name: s.trade_name || '',
      person_type: pType,
      document: docMasked,
      state_registration: s.state_registration || '',
      phone: s.phone ? maskPhone(s.phone) : '',
      whatsapp: s.whatsapp ? maskPhone(s.whatsapp) : '',
      email: s.email || '',
      contact_name: s.contact_name || '',
      postal_code: s.postal_code ? maskCEP(s.postal_code) : '',
      street: s.street || '',
      number: s.number || '',
      complement: s.complement || '',
      neighborhood: s.neighborhood || '',
      city: s.city || '',
      state: s.state || '',
      notes: s.notes || '',
      is_active: s.is_active === 0 ? 0 : 1,
    })
    setError('')
    setFormOpen(true)
  }

  async function handleCepChange(rawValue) {
    const masked = maskCEP(rawValue)
    setForm(f => ({ ...f, postal_code: masked }))
    const digits = onlyDigits(masked)
    if (digits.length === 8) {
      setCepLoading(true)
      const addr = await lookupCEP(digits)
      setCepLoading(false)
      if (addr) {
        setForm(f => ({
          ...f,
          street: addr.street || f.street,
          neighborhood: addr.neighborhood || f.neighborhood,
          city: addr.city || f.city,
          state: addr.state || f.state,
        }))
      }
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (form.document) {
      const valid = form.person_type === 'PF' ? validateCPF(form.document) : validateCNPJ(form.document)
      if (!valid) {
        return setError(form.person_type === 'PF' ? 'CPF inválido.' : 'CNPJ inválido.')
      }
    }

    setSaving(true)
    try {
      const payload = {
        ...form,
        is_active: form.is_active === 1 ? 1 : 0,
      }
      if (editingId) {
        await api.put(`/inventory/suppliers/${editingId}`, payload)
        setSuccess('Fornecedor atualizado com sucesso.')
      } else {
        await api.post('/inventory/suppliers', payload)
        setSuccess('Fornecedor cadastrado com sucesso.')
      }
      setFormOpen(false)
      loadSuppliers()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar fornecedor.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(s) {
    const nextActive = s.is_active === 0 ? 1 : 0
    const actionLabel = nextActive ? 'reativar' : 'inativar'
    if (!window.confirm(`Deseja ${actionLabel} o fornecedor "${s.name}"?`)) return
    setError('')
    try {
      await api.put(`/inventory/suppliers/${s.id}`, { is_active: nextActive })
      setSuccess(`Fornecedor ${nextActive ? 'reativado' : 'inativado'} com sucesso.`)
      loadSuppliers()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao atualizar status do fornecedor.')
    }
  }

  async function handleDelete(s) {
    if (!window.confirm(`Deseja excluir permanentemente o fornecedor "${s.name}"? Esta ação não pode ser desfeita.`)) return
    setError('')
    try {
      await api.delete(`/inventory/suppliers/${s.id}`)
      setSuccess('Fornecedor excluído com sucesso.')
      loadSuppliers()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao excluir fornecedor.')
    }
  }

  async function openDetail(s) {
    setDetailModal(s)
    setLoadingHistory(true)
    try {
      const { data } = await api.get(`/inventory/suppliers/${s.id}/purchases`)
      setHistoryData({ items: data?.items || [], total_purchased: data?.total_purchased || 0 })
    } catch (_) {
      setHistoryData({ items: [], total_purchased: 0 })
    } finally {
      setLoadingHistory(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Truck className="text-[#FFBE0B]" size={22} />
            Fornecedores
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Cadastro completo de fornecedores integrado às Compras, Estoque e Contas a Pagar.
          </p>
        </div>
        <button
          type="button"
          onClick={openNewModal}
          className="btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 self-start"
        >
          <Plus size={16} /> Novo fornecedor
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" /> <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 size={16} className="shrink-0" /> <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-wider text-zinc-400">Total</p>
          <p className="text-xl font-bold text-white mt-1">{stats.total}</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-wider text-zinc-400">Ativos</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{stats.active}</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-wider text-zinc-400">Inativos</p>
          <p className="text-xl font-bold text-zinc-400 mt-1">{stats.inactive}</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-wider text-zinc-400">Compras realizadas</p>
          <p className="text-xl font-bold text-white mt-1">{stats.purchasesCount}</p>
        </div>
        <div className="card p-4 col-span-2 lg:col-span-1">
          <p className="text-[11px] uppercase tracking-wider text-zinc-400">Total comprado</p>
          <p className="text-xl font-bold text-[#FFBE0B] mt-1">{formatMoney(stats.purchasesTotal)}</p>
        </div>
      </div>

      <div className="card p-3 flex flex-col sm:flex-row gap-2.5 text-xs">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9 w-full"
            placeholder="Buscar por razão social, nome fantasia, CPF/CNPJ, telefone ou e-mail..."
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { key: 'all', label: 'Todos' },
            { key: 'active', label: 'Ativos' },
            { key: 'inactive', label: 'Inativos' },
          ].map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-2 rounded-xl font-semibold ${statusFilter === f.key ? 'bg-[#FFBE0B] text-slate-950' : 'bg-white/5 text-zinc-300'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/5 text-zinc-400 uppercase text-[10px]">
              <tr>
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3">CPF / CNPJ</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3">Cidade / UF</th>
                <th className="px-4 py-3 text-right">Compras</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400">Nenhum fornecedor encontrado.</td></tr>
              ) : filtered.map(s => (
                <tr key={s.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <p className="font-bold text-white">{s.name}</p>
                    {s.trade_name && <p className="text-[11px] text-zinc-400">{s.trade_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {s.document ? (s.person_type === 'PF' ? maskCPF(s.document) : maskCNPJ(s.document)) : '-'}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    <p>{s.phone || s.whatsapp || s.contact_info || '-'}</p>
                    {s.email && <p className="text-[11px] text-zinc-400">{s.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {s.city ? `${s.city}${s.state ? `/${s.state}` : ''}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-bold text-[#FFBE0B]">{formatMoney(s.purchases_total)}</p>
                    <p className="text-[10px] text-zinc-400">{s.purchases_count || 0} compra(s)</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      s.is_active === 0 ? 'bg-zinc-500/20 text-zinc-400' : 'bg-emerald-500/15 text-emerald-400'
                    }`}>
                      {s.is_active === 0 ? 'Inativo' : 'Ativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => openDetail(s)} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300" title="Detalhes e histórico">
                        <Eye size={14} />
                      </button>
                      <button type="button" onClick={() => openEditModal(s)} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300" title="Editar">
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => handleToggleActive(s)} className="p-1.5 rounded-lg hover:bg-white/10 text-amber-400" title={s.is_active === 0 ? 'Reativar' : 'Inativar'}>
                        <Power size={14} />
                      </button>
                      <button type="button" onClick={() => handleDelete(s)} className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-400" title="Excluir permanentemente">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Cadastro / Edição */}
      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <form onSubmit={handleSave} className="card w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden text-xs">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
              <h3 className="text-base font-bold text-white">{editingId ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h3>
              <button type="button" onClick={() => setFormOpen(false)} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">

            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#FFBE0B]">Dados Cadastrais</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-zinc-400 mb-1">Tipo de pessoa</label>
                  <select
                    className="input w-full"
                    value={form.person_type}
                    onChange={e => setForm(f => ({ ...f, person_type: e.target.value, document: '' }))}
                  >
                    <option value="PJ">Pessoa Jurídica (CNPJ)</option>
                    <option value="PF">Pessoa Física (CPF)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">{form.person_type === 'PF' ? 'CPF' : 'CNPJ'}</label>
                  <input
                    className="input w-full"
                    value={form.document}
                    onChange={e => setForm(f => ({
                      ...f,
                      document: f.person_type === 'PF' ? maskCPF(e.target.value) : maskCNPJ(e.target.value)
                    }))}
                    placeholder={form.person_type === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Razão Social / Nome *</label>
                  <input className="input w-full" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Nome Fantasia</label>
                  <input className="input w-full" value={form.trade_name} onChange={e => setForm(f => ({ ...f, trade_name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Inscrição Estadual (opcional)</label>
                  <input className="input w-full" value={form.state_registration} onChange={e => setForm(f => ({ ...f, state_registration: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Situação</label>
                  <select className="input w-full" value={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: Number(e.target.value) }))}>
                    <option value={1}>Ativo</option>
                    <option value={0}>Inativo</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#FFBE0B]">Contato</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input className="input" placeholder="Telefone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: maskPhone(e.target.value) }))} />
                <input className="input" placeholder="WhatsApp" value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: maskPhone(e.target.value) }))} />
                <input type="email" className="input" placeholder="E-mail" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                <input className="input" placeholder="Nome do contato responsável" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#FFBE0B]">
                Endereço {cepLoading && <span className="text-zinc-400 font-normal">(Consultando CEP...)</span>}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input className="input" placeholder="CEP" value={form.postal_code} onChange={e => handleCepChange(e.target.value)} />
                <input className="input sm:col-span-2" placeholder="Rua / Avenida" value={form.street} onChange={e => setForm(f => ({ ...f, street: e.target.value }))} />
                <input className="input" placeholder="Número" value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} />
                <input className="input" placeholder="Complemento (opcional)" value={form.complement} onChange={e => setForm(f => ({ ...f, complement: e.target.value }))} />
                <input className="input" placeholder="Bairro" value={form.neighborhood} onChange={e => setForm(f => ({ ...f, neighborhood: e.target.value }))} />
                <input className="input sm:col-span-2" placeholder="Cidade" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
                <input className="input" placeholder="UF" maxLength={2} value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase() }))} />
              </div>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Observações</label>
              <textarea className="input w-full" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-white/10 shrink-0">
              <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-xl bg-white/5 text-zinc-300">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary px-5 py-2 rounded-xl font-bold disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar Fornecedor'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Detalhes + Histórico de Compras */}
      {detailModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="card w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden text-xs">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
              <div>
                <h3 className="text-base font-bold text-white">{detailModal.name}</h3>
                {detailModal.trade_name && <p className="text-zinc-400">{detailModal.trade_name}</p>}
              </div>
              <button type="button" onClick={() => setDetailModal(null)} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-white/5 text-zinc-300">
              <div><span className="text-zinc-500 block">Documento</span>{detailModal.document || '-'}</div>
              <div><span className="text-zinc-500 block">Telefone / WhatsApp</span>{detailModal.phone || detailModal.whatsapp || '-'}</div>
              <div><span className="text-zinc-500 block">Total Histórico Comprado</span><strong className="text-[#FFBE0B]">{formatMoney(historyData.total_purchased)}</strong></div>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-white flex items-center gap-1.5">
                <ShoppingBag size={15} className="text-[#FFBE0B]" /> Histórico de Compras
              </h4>
              {loadingHistory ? (
                <p className="text-zinc-400 py-4 text-center">Carregando histórico...</p>
              ) : historyData.items.length === 0 ? (
                <p className="text-zinc-400 py-4 text-center">Nenhuma compra registrada para este fornecedor.</p>
              ) : (
                <div className="overflow-x-auto border border-white/10 rounded-xl">
                  <table className="w-full text-left">
                    <thead className="bg-white/5 text-zinc-400 text-[10px] uppercase">
                      <tr>
                        <th className="px-3 py-2">Compra</th>
                        <th className="px-3 py-2">Data</th>
                        <th className="px-3 py-2">Itens</th>
                        <th className="px-3 py-2">Condição</th>
                        <th className="px-3 py-2">Situação</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {historyData.items.map(item => (
                        <tr
                          key={item.id}
                          onClick={() => { setDetailModal(null); navigate('/compras') }}
                          className="hover:bg-white/5 cursor-pointer"
                        >
                          <td className="px-3 py-2 font-bold text-[#FFBE0B]">{item.purchase_number}</td>
                          <td className="px-3 py-2 text-zinc-300">{String(item.purchase_date).slice(0, 10)}</td>
                          <td className="px-3 py-2 text-zinc-300">{item.items_count}</td>
                          <td className="px-3 py-2 text-zinc-300">{item.payment_condition === 'cash' ? 'À vista' : 'A prazo'}</td>
                          <td className="px-3 py-2 text-zinc-300">{item.financial_status === 'paid' ? 'Pago' : 'Em aberto'}</td>
                          <td className="px-3 py-2 text-right font-bold text-white">{formatMoney(item.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
