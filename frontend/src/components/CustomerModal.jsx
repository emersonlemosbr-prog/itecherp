import React, { useState, useEffect } from 'react'
import {
  User, Phone, Mail, MapPin, FileText, CheckCircle2,
  AlertTriangle, Loader2, Search, X, Calendar, Hash, ArrowUpRight
} from 'lucide-react'
import ModalFrame from './UI/ModalFrame'
import api from '../api/client'
import { maskCPF, maskPhone, maskCEP, validateCPF, lookupCEP, onlyDigits } from '../utils/masks'

export default function CustomerModal({ customer, onClose, onSaved }) {
  const isEdit = Boolean(customer)
  const [activeSection, setActiveSection] = useState('personal') // 'personal' | 'contact' | 'address' | 'additional'

  const [form, setForm] = useState({
    first_name: customer?.first_name || '',
    last_name: customer?.last_name || '',
    cpf: customer?.cpf || '',
    rg: customer?.rg || '',
    gender: customer?.gender || '',
    birth_date: customer?.birth_date || '',

    phone: customer?.phone || '',
    phone_secondary: customer?.phone_secondary || '',
    email: customer?.email || '',

    postal_code: customer?.postal_code || '',
    street: customer?.street || '',
    number: customer?.number || '',
    complement: customer?.complement || '',
    neighborhood: customer?.neighborhood || '',
    city: customer?.city || '',
    state: customer?.state || '',
    address: customer?.address || '',

    notes: customer?.notes || '',
  })

  const [loadingCep, setLoadingCep] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState(null)
  const [allowDuplicate, setAllowDuplicate] = useState(false)

  // Preenche dados legados se os estruturados estiverem vazios
  useEffect(() => {
    if (customer && !customer.street && customer.address) {
      setForm(f => ({ ...f, street: customer.address }))
    }
  }, [customer])

  // Busca automática por CEP
  async function handleCepChange(e) {
    const val = maskCEP(e.target.value)
    setForm(f => ({ ...f, postal_code: val }))

    const clean = onlyDigits(val)
    if (clean.length === 8) {
      setLoadingCep(true)
      const res = await lookupCEP(clean)
      setLoadingCep(false)
      if (res) {
        setForm(f => ({
          ...f,
          street: res.street || f.street,
          neighborhood: res.neighborhood || f.neighborhood,
          city: res.city || f.city,
          state: res.state || f.state,
          complement: res.complement || f.complement
        }))
      }
    }
  }

  // Validação e Verificação de Duplicidade ao sair do campo
  async function checkDuplicates() {
    if (isEdit || allowDuplicate) return
    const name = `${form.first_name} ${form.last_name}`.trim()
    if (!name && !form.phone && !form.cpf) return

    try {
      const res = await api.get('/customers/check-duplicate', {
        params: {
          name: name || undefined,
          phone: form.phone || undefined,
          cpf: form.cpf || undefined
        }
      })
      if (res.data?.found && res.data.matches?.length > 0) {
        setDuplicateWarning(res.data.matches[0])
      } else {
        setDuplicateWarning(null)
      }
    } catch (_) {}
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // 1. Validações locais
    const fullName = `${form.first_name} ${form.last_name}`.trim()
    if (!form.first_name.trim()) {
      setError('O nome do cliente é obrigatório.')
      setActiveSection('personal')
      return
    }

    const cleanPhone = onlyDigits(form.phone)
    if (!cleanPhone || cleanPhone.length < 10) {
      setError('Telefone principal é obrigatório com DDD válido (ex: 82 99999-9999).')
      setActiveSection('contact')
      return
    }

    if (form.cpf && !validateCPF(form.cpf)) {
      setError('O CPF informado é inválido. Corrija ou deixe em branco.')
      setActiveSection('personal')
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...form,
        allow_duplicate: allowDuplicate
      }

      if (isEdit) {
        await api.put(`/customers/${customer.id}`, payload)
      } else {
        await api.post('/customers', payload)
      }

      onSaved()
    } catch (err) {
      if (err.response?.status === 409) {
        setError(err.response?.data?.error || 'Cliente duplicado identificado.')
      } else {
        setError(err.response?.data?.error || 'Erro ao salvar cliente. Verifique os dados.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalFrame busy={saving} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4" onClick={() => { if (!saving) onClose() }}>
      <div className="modal-panel w-full max-w-2xl max-h-[92dvh] flex flex-col p-5 sm:p-6" onClick={e => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-3.5 mb-3 border-b border-slate-200/70 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
              <User size={22} />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                {isEdit ? 'Editar Cliente' : 'Novo Cliente — CRM'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEdit ? `Atualizando cadastro do código #${customer.id}` : 'Cadastro completo e histórico unificado'}
              </p>
            </div>
          </div>
          <button type="button" onClick={() => { if (!saving) onClose() }} className="btn-ghost !p-2" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {/* Abas de Navegação das 4 Seções */}
        <div className="flex border-b border-slate-200/80 dark:border-white/5 mb-4 shrink-0 overflow-x-auto gap-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveSection('personal')}
            className={`flex items-center gap-2 px-3 py-2 border-b-2 transition whitespace-nowrap ${
              activeSection === 'personal'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <User size={14} /> Dados Pessoais
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('contact')}
            className={`flex items-center gap-2 px-3 py-2 border-b-2 transition whitespace-nowrap ${
              activeSection === 'contact'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Phone size={14} /> Contato
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('address')}
            className={`flex items-center gap-2 px-3 py-2 border-b-2 transition whitespace-nowrap ${
              activeSection === 'address'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MapPin size={14} /> Endereço
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('additional')}
            className={`flex items-center gap-2 px-3 py-2 border-b-2 transition whitespace-nowrap ${
              activeSection === 'additional'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText size={14} /> Informações Adicionais
          </button>
        </div>

        {/* Alerta de erro */}
        {error && (
          <div role="alert" className="p-3 mb-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2 shrink-0">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Alerta de duplicidade inteligente */}
        {duplicateWarning && (
          <div className="p-3 mb-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs space-y-1.5 shrink-0">
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1.5">
                <AlertTriangle size={15} /> Possível cliente já cadastrado:
              </span>
              <a href={`/clientes/${duplicateWarning.id}`} target="_blank" rel="noreferrer" className="underline hover:opacity-80 flex items-center gap-0.5">
                Ver perfil #{duplicateWarning.id} <ArrowUpRight size={12} />
              </a>
            </div>
            <p>
              Encontramos <strong>{duplicateWarning.first_name} {duplicateWarning.last_name}</strong> com telefone {duplicateWarning.phone || '—'} {duplicateWarning.cpf ? `(CPF: ${duplicateWarning.cpf})` : ''}.
            </p>
            <label className="flex items-center gap-2 pt-1 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={allowDuplicate}
                onChange={e => setAllowDuplicate(e.target.checked)}
                className="rounded text-amber-500 focus:ring-amber-400"
              />
              <span>Desejo prosseguir mesmo assim (confirmar cadastro)</span>
            </label>
          </div>
        )}

        {/* Formulário com Scroll Interno */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
          {/* SEÇÃO A: DADOS PESSOAIS */}
          {activeSection === 'personal' && (
            <div className="space-y-3.5 animate-in fade-in-50 duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Nome <span className="text-rose-500">*</span></label>
                  <input
                    className="input"
                    placeholder="Primeiro nome"
                    required
                    value={form.first_name}
                    onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                    onBlur={checkDuplicates}
                  />
                </div>
                <div>
                  <label className="label">Sobrenome</label>
                  <input
                    className="input"
                    placeholder="Sobrenome completo"
                    value={form.last_name}
                    onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                    onBlur={checkDuplicates}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">CPF (Opcional)</label>
                  <input
                    className="input"
                    placeholder="000.000.000-00"
                    value={form.cpf}
                    onChange={e => setForm(f => ({ ...f, cpf: maskCPF(e.target.value) }))}
                    onBlur={checkDuplicates}
                  />
                </div>
                <div>
                  <label className="label">RG (Opcional)</label>
                  <input
                    className="input"
                    placeholder="Número do RG"
                    value={form.rg}
                    onChange={e => setForm(f => ({ ...f, rg: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Data de Nascimento</label>
                  <input
                    type="date"
                    className="input"
                    value={form.birth_date || ''}
                    onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="label">Gênero (Opcional)</label>
                <select
                  className="input"
                  value={form.gender || ''}
                  onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                >
                  <option value="">Não informado</option>
                  <option value="male">Masculino</option>
                  <option value="female">Feminino</option>
                  <option value="other">Outro / Prefere não dizer</option>
                </select>
              </div>
            </div>
          )}

          {/* SEÇÃO B: CONTATO */}
          {activeSection === 'contact' && (
            <div className="space-y-3.5 animate-in fade-in-50 duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Telefone Principal / WhatsApp <span className="text-rose-500">*</span></label>
                  <input
                    className="input"
                    placeholder="(82) 9 9999-9999"
                    required
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: maskPhone(e.target.value) }))}
                    onBlur={checkDuplicates}
                  />
                </div>
                <div>
                  <label className="label">Telefone Secundário / Recado</label>
                  <input
                    className="input"
                    placeholder="(82) 3333-3333"
                    value={form.phone_secondary}
                    onChange={e => setForm(f => ({ ...f, phone_secondary: maskPhone(e.target.value) }))}
                  />
                </div>
              </div>

              <div>
                <label className="label">E-mail</label>
                <input
                  type="email"
                  className="input"
                  placeholder="cliente@exemplo.com.br"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>
          )}

          {/* SEÇÃO C: ENDEREÇO */}
          {activeSection === 'address' && (
            <div className="space-y-3.5 animate-in fade-in-50 duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="label flex items-center justify-between">
                    <span>CEP</span>
                    {loadingCep && <span className="text-amber-500 flex items-center gap-1 text-[11px]"><Loader2 size={12} className="animate-spin" /> Buscando...</span>}
                  </label>
                  <input
                    className="input"
                    placeholder="00000-000"
                    value={form.postal_code}
                    onChange={handleCepChange}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Logradouro / Rua</label>
                  <input
                    className="input"
                    placeholder="Rua, Avenida, Praça..."
                    value={form.street}
                    onChange={e => setForm(f => ({ ...f, street: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Número</label>
                  <input
                    className="input"
                    placeholder="123 ou S/N"
                    value={form.number}
                    onChange={e => setForm(f => ({ ...f, number: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Complemento</label>
                  <input
                    className="input"
                    placeholder="Apto, Bloco, Casa..."
                    value={form.complement}
                    onChange={e => setForm(f => ({ ...f, complement: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Bairro</label>
                  <input
                    className="input"
                    placeholder="Bairro"
                    value={form.neighborhood}
                    onChange={e => setForm(f => ({ ...f, neighborhood: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="label">Cidade</label>
                  <input
                    className="input"
                    placeholder="Cidade"
                    value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Estado (UF)</label>
                  <input
                    className="input uppercase"
                    maxLength={2}
                    placeholder="AL"
                    value={form.state}
                    onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase() }))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* SEÇÃO D: INFORMAÇÕES ADICIONAIS */}
          {activeSection === 'additional' && (
            <div className="space-y-3.5 animate-in fade-in-50 duration-150">
              {isEdit && (
                <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Código do Cliente:</span>
                    <span className="font-bold text-slate-800 dark:text-white">#{customer.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Data de Cadastro:</span>
                    <span className="text-slate-700 dark:text-slate-300">{new Date(customer.created_at).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="label">Observações Internas</label>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="Informações relevantes, preferências, histórico de atendimento ou restrições..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
          )}

          {/* Rodapé e Botões */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200/80 dark:border-white/10">
            <div className="flex gap-1.5">
              {activeSection !== 'personal' && (
                <button
                  type="button"
                  className="btn-secondary !text-xs !py-1.5"
                  onClick={() => {
                    if (activeSection === 'additional') setActiveSection('address')
                    else if (activeSection === 'address') setActiveSection('contact')
                    else if (activeSection === 'contact') setActiveSection('personal')
                  }}
                >
                  Voltar Seção
                </button>
              )}
              {activeSection !== 'additional' && (
                <button
                  type="button"
                  className="btn-secondary !text-xs !py-1.5 text-amber-600 dark:text-amber-400"
                  onClick={() => {
                    if (activeSection === 'personal') setActiveSection('contact')
                    else if (activeSection === 'contact') setActiveSection('address')
                    else if (activeSection === 'address') setActiveSection('additional')
                  }}
                >
                  Próxima Seção
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={saving}
                onClick={() => onClose()}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={saving}
              >
                {saving ? 'Salvando...' : (isEdit ? 'Salvar Alterações' : 'Cadastrar Cliente')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </ModalFrame>
  )
}
