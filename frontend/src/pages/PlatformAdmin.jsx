import React, { useState, useEffect } from 'react'
import {
  ShieldCheck, ShieldAlert, Store, User, Mail, Search, CheckCircle2,
  AlertTriangle, XCircle, Clock, Calendar, DollarSign, History, RefreshCw,
  LogOut, Plus, Lock, ChevronRight, AlertOctagon, UserPlus, Phone, AlertCircle,
  Trash2
} from 'lucide-react'
import api from '../api/client'

export default function PlatformAdmin() {
  // Autenticação do Superadmin
  const [platformToken, setPlatformToken] = useState(() => localStorage.getItem('itech_platform_token'))
  const [adminUser, setAdminUser] = useState(() => {
    try {
      const u = localStorage.getItem('itech_platform_user')
      return u ? JSON.parse(u) : null
    } catch {
      return null
    }
  })

  // Formulário de Login do Superadmin
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  // Lista de Lojas
  const [stores, setStores] = useState([])
  const [loadingStores, setLoadingStores] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Modais de Ação
  const [selectedStore, setSelectedStore] = useState(null)
  const [modalType, setModalType] = useState(null) // 'payment', 'due_date', 'suspend', 'history', 'admins', 'activate', 'delete_store'
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  // Dados dos formulários modais
  const [paymentForm, setPaymentForm] = useState({ amount: '', months_to_add: 1, payment_method: 'pix', notes: '' })
  const [dueDateForm, setDueDateForm] = useState({ due_date: '', grace_period_days: 3, notes: '' })
  const [activateForm, setActivateForm] = useState({ due_date: '', grace_period_days: 3, notes: '' })
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [suspendForm, setSuspendForm] = useState({ reason: '' })
  const [storeHistory, setStoreHistory] = useState([])

  // Seleção múltipla de lojas para ações em massa
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkActivateForm, setBulkActivateForm] = useState({ due_date: '', grace_period_days: 3, notes: '' })
  const [bulkSuspendForm, setBulkSuspendForm] = useState({ notes: '' })
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState('')

  // Modal de Administradores
  const [adminsList, setAdminsList] = useState([])
  const [newAdminForm, setNewAdminForm] = useState({ name: '', email: '', password: '' })
  const [showNewAdminForm, setShowNewAdminForm] = useState(false)

  // Configurar header Authorization para rotas de plataforma
  function platformApiConfig() {
    return {
      headers: { Authorization: `Bearer ${platformToken}` }
    }
  }

  // Login de Superadmin
  async function handleAdminLogin(e) {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    try {
      const { data } = await api.post('/platform/login', {
        email: loginEmail.trim(),
        password: loginPassword,
      })
      const adminData = data.admin || data.user || {}
      localStorage.setItem('itech_platform_token', data.token)
      localStorage.setItem('itech_platform_user', JSON.stringify(adminData))
      setPlatformToken(data.token)
      setAdminUser(adminData)
    } catch (err) {
      console.error('[PLATFORM_LOGIN_ERROR]', {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message,
        code: err.code,
      })
      let message = err.response?.data?.error || err.response?.data?.message
      if (!message) {
        if (err.message === 'Network Error' || err.code === 'ERR_NETWORK') {
          message = 'Não foi possível conectar ao servidor backend (Render). Verifique a conexão com a internet ou tente novamente em alguns instantes se o servidor estiver acordando.'
        } else if (err.response?.status === 404) {
          message = 'Endpoint de autenticação da plataforma não encontrado (404). Verifique a URL-base da API.'
        } else if (err.response?.status === 429) {
          message = 'Muitas tentativas consecutivas de login. Aguarde um minuto e tente novamente.'
        } else if (err.response?.status === 401) {
          message = 'E-mail ou senha de administrador da plataforma inválidos.'
        } else if (err.response?.status === 403) {
          message = 'Acesso negado. Esta conta não possui permissões de Administrador da Plataforma.'
        } else if (err.response?.status >= 500) {
          message = 'Erro interno do servidor backend (500). Tente novamente mais tarde.'
        } else {
          message = err.message || 'Erro ao realizar login de administrador.'
        }
      }
      setLoginError(message)
    } finally {
      setLoginLoading(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem('itech_platform_token')
    localStorage.removeItem('itech_platform_user')
    setPlatformToken(null)
    setAdminUser(null)
  }

  // Carregar lojas
  async function loadStores() {
    if (!platformToken) return
    setLoadingStores(true)
    try {
      const { data } = await api.get('/platform/stores', platformApiConfig())
      const list = Array.isArray(data) ? data : (data?.stores || data?.data || [])
      setStores(list)
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        handleLogout()
      }
    } finally {
      setLoadingStores(false)
    }
  }

  useEffect(() => {
    if (platformToken) {
      loadStores()
    }
  }, [platformToken])

  // Abrir Histórico
  async function openHistoryModal(store) {
    setSelectedStore(store)
    setModalType('history')
    setActionLoading(true)
    try {
      const { data } = await api.get(`/platform/stores/${store.id}/history`, platformApiConfig())
      const list = Array.isArray(data) ? data : (data?.history || data?.data || [])
      setStoreHistory(list)
    } catch (err) {
      setActionError('Erro ao carregar histórico da loja.')
    } finally {
      setActionLoading(false)
    }
  }

  // Abrir Gerenciamento de Administradores
  async function openAdminsModal() {
    setModalType('admins')
    setActionLoading(true)
    setActionError('')
    setActionSuccess('')
    try {
      const { data } = await api.get('/platform/admins', platformApiConfig())
      const list = Array.isArray(data) ? data : (data?.admins || data?.data || [])
      setAdminsList(list)
    } catch (err) {
      setActionError('Erro ao carregar administradores da plataforma.')
    } finally {
      setActionLoading(false)
    }
  }

  // Registrar Pagamento Manual
  async function handleRegisterPayment(e) {
    e.preventDefault()
    setActionError('')
    setActionLoading(true)
    try {
      await api.post(`/platform/stores/${selectedStore.id}/payment`, paymentForm, platformApiConfig())
      setModalType(null)
      loadStores()
    } catch (err) {
      setActionError(err.response?.data?.error || 'Erro ao registrar pagamento.')
    } finally {
      setActionLoading(false)
    }
  }

  // Atualizar Vencimento e Tolerância
  async function handleUpdateDueDate(e) {
    e.preventDefault()
    const cleanDate = (dueDateForm.due_date || '').slice(0, 10)
    if (!cleanDate || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      setActionError('Data de vencimento é obrigatória e deve ser válida (AAAA-MM-DD).')
      return
    }
    setActionError('')
    setActionSuccess('')
    setActionLoading(true)
    try {
      const { data } = await api.put(`/platform/stores/${selectedStore.id}/due-date`, {
        dueDate: cleanDate,
        due_date: cleanDate,
        gracePeriodDays: Number(dueDateForm.grace_period_days) >= 0 ? Number(dueDateForm.grace_period_days) : 3,
        grace_period_days: Number(dueDateForm.grace_period_days) >= 0 ? Number(dueDateForm.grace_period_days) : 3,
        notes: dueDateForm.notes,
      }, platformApiConfig())
      setModalType(null)
      setActionSuccess(`Data de vencimento da loja "${selectedStore.name}" atualizada com sucesso para ${formatDueDate(cleanDate)}!`)
      await loadStores()
    } catch (err) {
      setActionError(err.response?.data?.error || err.response?.data?.message || err.message || 'Erro ao atualizar vencimento.')
    } finally {
      setActionLoading(false)
    }
  }

  // Suspender Loja
  async function handleSuspendStore(e) {
    e.preventDefault()
    setActionError('')
    setActionLoading(true)
    try {
      await api.post(`/platform/stores/${selectedStore.id}/suspend`, suspendForm, platformApiConfig())
      setModalType(null)
      loadStores()
    } catch (err) {
      setActionError(err.response?.data?.error || 'Erro ao suspender loja.')
    } finally {
      setActionLoading(false)
    }
  }

  // Reativar Loja
  async function handleReactivateStore(store) {
    if (!window.confirm(`Deseja reativar o acesso da loja "${store.name}"?`)) return
    try {
      await api.post(`/platform/stores/${store.id}/reactivate`, {}, platformApiConfig())
      loadStores()
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao reativar loja.')
    }
  }

  // Abrir Modal de Ativação de Loja
  function openActivateModal(store) {
    setSelectedStore(store)
    setActionError('')
    setActionSuccess('')
    const nextMonth = new Date()
    nextMonth.setDate(nextMonth.getDate() + 30)
    setActivateForm({
      due_date: nextMonth.toISOString().slice(0, 10),
      grace_period_days: store.grace_period_days !== undefined ? store.grace_period_days : 3,
      notes: 'Ativação inicial de loja aprovada',
    })
    setModalType('activate')
  }

  // Executar Ativação de Loja (POST /platform/stores/:id/activate)
  async function handleActivateStore(e) {
    e.preventDefault()
    if (!activateForm.due_date || !/^\d{4}-\d{2}-\d{2}$/.test(activateForm.due_date)) {
      setActionError('Data de vencimento é obrigatória e deve estar no formato AAAA-MM-DD.')
      return
    }
    setActionError('')
    setActionLoading(true)
    try {
      await api.post(`/platform/stores/${selectedStore.id}/activate`, {
        dueDate: activateForm.due_date,
        due_date: activateForm.due_date,
        gracePeriodDays: Number(activateForm.grace_period_days) >= 0 ? Number(activateForm.grace_period_days) : 3,
        grace_period_days: Number(activateForm.grace_period_days) >= 0 ? Number(activateForm.grace_period_days) : 3,
        notes: activateForm.notes || 'Ativação aprovada pelo administrador da plataforma.',
      }, platformApiConfig())
      setModalType(null)
      loadStores()
    } catch (err) {
      setActionError(err.response?.data?.error || 'Erro ao ativar loja.')
    } finally {
      setActionLoading(false)
    }
  }

  // Abrir Modal de Exclusão de Cadastro
  function openDeleteModal(store) {
    setSelectedStore(store)
    setDeleteConfirmText('')
    setActionError('')
    setActionSuccess('')
    setModalType('delete_store')
  }

  // Executar Exclusão Definitiva de Cadastro (DELETE /platform/stores/:id)
  async function handleDeleteStore(e) {
    e.preventDefault()
    if (deleteConfirmText.trim() !== 'EXCLUIR') {
      setActionError('Para confirmar a exclusão, você deve digitar EXCLUIR exatamente em maiúsculas.')
      return
    }
    setActionError('')
    setActionLoading(true)
    try {
      await api.delete(`/platform/stores/${selectedStore.id}?confirmation=EXCLUIR`, {
        data: { confirmation: 'EXCLUIR' },
        ...platformApiConfig(),
      })
      setModalType(null)
      setDeleteConfirmText('')
      await loadStores()
    } catch (err) {
      setActionError(err.response?.data?.error || err.response?.data?.message || err.message || 'Erro ao excluir cadastro da loja.')
    } finally {
      setActionLoading(false)
    }
  }

  // Criar Novo Superadmin
  async function handleCreateAdmin(e) {
    e.preventDefault()
    setActionError('')
    setActionSuccess('')
    setActionLoading(true)
    try {
      const { data } = await api.post('/platform/admins', newAdminForm, platformApiConfig())
      const newAdmin = data?.admin || data
      setAdminsList((prev) => [newAdmin, ...(Array.isArray(prev) ? prev : [])])
      setNewAdminForm({ name: '', email: '', password: '' })
      setShowNewAdminForm(false)
      setActionSuccess('Novo administrador da plataforma criado com sucesso!')
    } catch (err) {
      setActionError(err.response?.data?.error || 'Erro ao criar administrador.')
    } finally {
      setActionLoading(false)
    }
  }

  // Funções de Seleção de Lojas para Ações em Massa
  function toggleSelectStore(storeId) {
    setSelectedIds(prev =>
      prev.includes(storeId) ? prev.filter(id => id !== storeId) : [...prev, storeId]
    )
  }

  function toggleSelectAllFiltered() {
    const visibleIds = filteredStores.map(s => s.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id))
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !visibleIds.includes(id)))
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...visibleIds])])
    }
  }

  function selectAllFiltered() {
    const visibleIds = filteredStores.map(s => s.id)
    setSelectedIds(prev => [...new Set([...prev, ...visibleIds])])
  }

  function clearSelection() {
    setSelectedIds([])
  }

  // Ações em Massa
  function openBulkActivateModal() {
    setActionError('')
    setActionSuccess('')
    const nextMonth = new Date()
    nextMonth.setDate(nextMonth.getDate() + 30)
    setBulkActivateForm({
      due_date: nextMonth.toISOString().slice(0, 10),
      grace_period_days: 3,
      notes: 'Ativação em massa realizada pelo Superadmin',
    })
    setModalType('bulk_activate')
  }

  async function handleBulkActivate(e) {
    e.preventDefault()
    if (!bulkActivateForm.due_date) {
      setActionError('Data de vencimento é obrigatória.')
      return
    }
    setActionError('')
    setActionLoading(true)
    try {
      const { data } = await api.post('/platform/stores/bulk-action', {
        action: 'activate',
        storeIds: selectedIds,
        dueDate: bulkActivateForm.due_date,
        gracePeriodDays: Number(bulkActivateForm.grace_period_days) || 3,
        notes: bulkActivateForm.notes,
      }, platformApiConfig())

      setActionSuccess(data.message || 'Lojas ativadas com sucesso!')
      setModalType(null)
      setSelectedIds([])
      await loadStores()
    } catch (err) {
      setActionError(err.response?.data?.error || 'Erro ao ativar lojas em massa.')
    } finally {
      setActionLoading(false)
    }
  }

  function openBulkSuspendModal() {
    setActionError('')
    setActionSuccess('')
    setBulkSuspendForm({ notes: 'Suspensão em massa realizada pelo Superadmin' })
    setModalType('bulk_suspend')
  }

  async function handleBulkSuspend(e) {
    e.preventDefault()
    setActionError('')
    setActionLoading(true)
    try {
      const { data } = await api.post('/platform/stores/bulk-action', {
        action: 'suspend',
        storeIds: selectedIds,
        notes: bulkSuspendForm.notes,
      }, platformApiConfig())

      setActionSuccess(data.message || 'Lojas suspensas com sucesso!')
      setModalType(null)
      setSelectedIds([])
      await loadStores()
    } catch (err) {
      setActionError(err.response?.data?.error || 'Erro ao suspender lojas em massa.')
    } finally {
      setActionLoading(false)
    }
  }

  function openBulkDeleteModal() {
    setActionError('')
    setActionSuccess('')
    setBulkDeleteConfirmText('')
    setModalType('bulk_delete')
  }

  async function handleBulkDelete(e) {
    e.preventDefault()
    if (bulkDeleteConfirmText.trim() !== 'EXCLUIR') {
      setActionError('Para confirmar a exclusão em massa, digite EXCLUIR exatamente em maiúsculas.')
      return
    }
    setActionError('')
    setActionLoading(true)
    try {
      const { data } = await api.post('/platform/stores/bulk-action', {
        action: 'delete',
        storeIds: selectedIds,
        confirmation: 'EXCLUIR',
      }, platformApiConfig())

      setActionSuccess(data.message || 'Lojas excluídas com sucesso!')
      setModalType(null)
      setSelectedIds([])
      setBulkDeleteConfirmText('')
      await loadStores()
    } catch (err) {
      setActionError(err.response?.data?.error || 'Erro ao excluir lojas em massa.')
    } finally {
      setActionLoading(false)
    }
  }

  // Filtragem de Lojas protegida
  const safeStores = Array.isArray(stores) ? stores : []
  const filteredStores = safeStores.filter((s) => {
    const status = s.effective_status || s.current_status || s.status
    if (statusFilter !== 'all' && status !== statusFilter) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.owner_name && s.owner_name.toLowerCase().includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q)) ||
      (s.owner_email && s.owner_email.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q)) ||
      (s.contact_phone && s.contact_phone.includes(q))
    )
  })

  // Contadores para métricas do topo protegidos
  const metrics = {
    total: safeStores.length,
    active: safeStores.filter((s) => (s.effective_status || s.current_status || s.status) === 'active').length,
    pending: safeStores.filter((s) => (s.effective_status || s.current_status || s.status) === 'pending_activation').length,
    overdue: safeStores.filter((s) => (s.effective_status || s.current_status || s.status) === 'overdue').length,
    suspended: safeStores.filter((s) => (s.effective_status || s.current_status || s.status) === 'suspended').length,
  }

  // Formatar data sem sofrer distorção de fuso horário
  function formatDueDate(val) {
    if (!val) return 'Não definido'
    const match = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) return `${match[3]}/${match[2]}/${match[1]}`
    try {
      return new Date(val + 'T12:00:00').toLocaleDateString('pt-BR')
    } catch {
      return val
    }
  }

  // Renderizador de Badge de Status
  function renderStatusBadge(status) {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 size={12} />
            Ativo
          </span>
        )
      case 'pending_activation':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Clock size={12} />
            Aguardando Ativação
          </span>
        )
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
            <AlertTriangle size={12} />
            Em Atraso (Tolerância)
          </span>
        )
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <XCircle size={12} />
            Suspenso
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300">
            {status}
          </span>
        )
    }
  }

  // TELA DE LOGIN DO SUPERADMIN (Se não autenticado)
  if (!platformToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4">
        <div className="w-full max-w-md">
          <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white mb-3 shadow-lg shadow-indigo-500/30">
                <ShieldCheck size={28} />
              </div>
              <h1 className="font-display font-extrabold text-2xl text-white">Painel da Plataforma</h1>
              <p className="text-slate-400 text-xs">
                Acesso restrito exclusivo para Administradores da Plataforma iTech ERP.
              </p>
            </div>

            {loginError && (
              <div className="flex items-start gap-2.5 text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-xl p-3.5">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-400" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">E-mail do Administrador</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="admin@itecherp.com"
                    autoFocus
                    className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Senha</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {loginLoading ? 'Entrando...' : 'Acessar Painel Global'}
              </button>
            </form>

            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 text-[11px] text-slate-400 leading-relaxed">
              <span className="font-semibold text-slate-300 block mb-0.5">Primeiro Acesso?</span>
              Crie o primeiro administrador com o comando seguro no terminal:<br />
              <code className="text-amber-300 font-mono">npm run platform:create-admin</code>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // PAINEL DE CONTROLE PRINCIPAL DO SUPERADMIN
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <ShieldCheck size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-extrabold text-2xl text-white">Painel da Plataforma</h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  SUPERADMIN
                </span>
              </div>
              <p className="text-slate-400 text-xs mt-0.5">
                Gestão central de assinaturas, lojas e clientes iTech ERP
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={openAdminsModal}
              className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-2 transition-all cursor-pointer"
            >
              <UserPlus size={15} />
              Administradores
            </button>
            <button
              onClick={loadStores}
              disabled={loadingStores}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
              title="Atualizar dados"
            >
              <RefreshCw size={16} className={loadingStores ? 'animate-spin' : ''} />
            </button>
            <div className="h-6 w-px bg-slate-800" />
            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold text-white">{adminUser?.name || 'Administrador'}</div>
              <div className="text-[10px] text-slate-400">{adminUser?.email}</div>
            </div>
            <button
              onClick={handleLogout}
              className="py-2 px-3 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 hover:text-rose-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <LogOut size={14} />
              Sair
            </button>
          </div>
        </div>

        {/* Métricas do Topo */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
          <div
            onClick={() => setStatusFilter('all')}
            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-indigo-950/40 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="text-slate-400 text-xs font-medium">Total de Lojas</div>
            <div className="text-2xl font-black text-white mt-1">{metrics.total}</div>
          </div>
          <div
            onClick={() => setStatusFilter('active')}
            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
              statusFilter === 'active'
                ? 'bg-emerald-950/40 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="text-emerald-400 text-xs font-medium flex items-center gap-1">
              <CheckCircle2 size={13} /> Ativas
            </div>
            <div className="text-2xl font-black text-emerald-300 mt-1">{metrics.active}</div>
          </div>
          <div
            onClick={() => setStatusFilter('pending_activation')}
            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
              statusFilter === 'pending_activation'
                ? 'bg-amber-950/40 border-amber-500/50 shadow-lg shadow-amber-500/10'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="text-amber-400 text-xs font-medium flex items-center gap-1">
              <Clock size={13} /> Aguardando Ativação
            </div>
            <div className="text-2xl font-black text-amber-300 mt-1">{metrics.pending}</div>
          </div>
          <div
            onClick={() => setStatusFilter('overdue')}
            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
              statusFilter === 'overdue'
                ? 'bg-yellow-950/40 border-yellow-500/50 shadow-lg shadow-yellow-500/10'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="text-yellow-400 text-xs font-medium flex items-center gap-1">
              <AlertTriangle size={13} /> Em Atraso
            </div>
            <div className="text-2xl font-black text-yellow-300 mt-1">{metrics.overdue}</div>
          </div>
          <div
            onClick={() => setStatusFilter('suspended')}
            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
              statusFilter === 'suspended'
                ? 'bg-rose-950/40 border-rose-500/50 shadow-lg shadow-rose-500/10'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="text-rose-400 text-xs font-medium flex items-center gap-1">
              <XCircle size={13} /> Suspensas
            </div>
            <div className="text-2xl font-black text-rose-300 mt-1">{metrics.suspended}</div>
          </div>
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por loja, proprietário, e-mail ou telefone..."
              className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'Todas' },
              { id: 'active', label: 'Ativas' },
              { id: 'pending_activation', label: 'Aguardando' },
              { id: 'overdue', label: 'Em Atraso' },
              { id: 'suspended', label: 'Suspensas' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`py-2 px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === f.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Banner de Sucesso */}
        {actionSuccess && (
          <div className="flex items-center justify-between p-3.5 bg-emerald-950/60 border border-emerald-500/40 rounded-2xl text-emerald-300 text-xs shadow-lg shadow-emerald-950/40 animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <span className="font-medium">{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess('')} className="text-emerald-400 hover:text-emerald-200 cursor-pointer text-sm font-bold">✕</button>
          </div>
        )}

        {/* Barra de Ações em Massa */}
        {selectedIds.length > 0 && (
          <div className="bg-slate-900/95 border-2 border-indigo-500/60 rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-indigo-600/30 shrink-0">
                {selectedIds.length}
              </div>
              <div>
                <div className="font-bold text-white text-sm flex items-center gap-2">
                  <span>{selectedIds.length} {selectedIds.length === 1 ? 'loja selecionada' : 'lojas selecionadas'}</span>
                  {selectedIds.length > filteredStores.filter(s => selectedIds.includes(s.id)).length && (
                    <span className="text-[11px] font-normal text-amber-300 bg-amber-950/60 border border-amber-500/30 px-2 py-0.5 rounded-full">
                      {filteredStores.filter(s => selectedIds.includes(s.id)).length} visíveis no filtro atual
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Ações aplicadas simultaneamente às lojas selecionadas no banco de dados.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                onClick={openBulkActivateModal}
                disabled={actionLoading}
                className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 size={14} />
                Ativar Selecionadas
              </button>

              <button
                onClick={openBulkSuspendModal}
                disabled={actionLoading}
                className="py-2 px-3.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <AlertTriangle size={14} />
                Suspender Selecionadas
              </button>

              <button
                onClick={openBulkDeleteModal}
                disabled={actionLoading}
                className="py-2 px-3.5 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-700/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <Trash2 size={14} />
                Excluir Selecionadas
              </button>

              <button
                onClick={clearSelection}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
              >
                Limpar Seleção
              </button>
            </div>
          </div>
        )}

        {/* Tabela de Lojas */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto table-scroll">
            <table className="w-full text-left text-xs min-w-[750px]">
              <thead className="bg-slate-950/70 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={filteredStores.length > 0 && filteredStores.every((s) => selectedIds.includes(s.id))}
                      onChange={toggleSelectAllFiltered}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                      title="Selecionar / Desmarcar todas as lojas exibidas"
                    />
                  </th>
                  <th className="py-3 px-4">Loja / Proprietário</th>
                  <th className="py-3 px-4">Contato</th>
                  <th className="py-3 px-4">Cadastro / Último Acesso</th>
                  <th className="py-3 px-4">Vencimento (Tolerância)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações de Gestão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredStores.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      Nenhuma loja encontrada com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredStores.map((store) => {
                    const isSelected = selectedIds.includes(store.id)
                    return (
                    <tr
                      key={store.id}
                      className={`hover:bg-slate-800/30 transition-colors ${
                        isSelected ? 'bg-indigo-950/30 ring-1 ring-inset ring-indigo-500/30' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectStore(store.id)}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                          title={`Selecionar loja ${store.name}`}
                        />
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white text-sm">{store.name}</div>
                        <div className="text-slate-400 text-xs flex items-center gap-1 mt-0.5">
                          <User size={12} className="text-slate-500" />
                          {store.owner_name}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 space-y-1">
                        <div className="text-slate-300 font-mono text-[11px] flex items-center gap-1.5">
                          <Mail size={12} className="text-slate-500" />
                          {store.email || store.owner_email || '-'}
                        </div>
                        {(store.phone || store.contact_phone) && (
                          <div className="text-slate-400 text-[11px] flex items-center gap-1.5">
                            <Phone size={12} className="text-slate-500" />
                            {store.phone || store.contact_phone}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 space-y-1 text-slate-400 text-[11px]">
                        <div>Cadastrado: {store.created_at ? new Date(store.created_at).toLocaleDateString('pt-BR') : '-'}</div>
                        <div className="text-slate-500">
                          Último acesso: {store.last_access_at ? new Date(store.last_access_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca acessou'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 space-y-1">
                        <div className="font-semibold text-slate-200">
                          {formatDueDate(store.due_date || store.subscription_due_date)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Tolerância: {store.grace_period_days !== undefined ? store.grace_period_days : 3} dias
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {renderStatusBadge(store.effective_status)}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {/* Se pendente, botão de ativar */}
                          {store.effective_status === 'pending_activation' && (
                            <button
                              onClick={() => openActivateModal(store)}
                              className="py-1 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition-all cursor-pointer"
                              title="Aprovar e ativar loja"
                            >
                              Ativar Loja
                            </button>
                          )}

                          {/* Se suspensa, botão de reativar */}
                          {store.effective_status === 'suspended' && (
                            <button
                              onClick={() => handleReactivateStore(store)}
                              className="py-1 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition-all cursor-pointer"
                              title="Reativar loja suspensa"
                            >
                              Reativar
                            </button>
                          )}

                          {/* Se ativa ou em atraso, botão de suspender */}
                          {(store.effective_status === 'active' || store.effective_status === 'overdue') && (
                            <button
                              onClick={() => {
                                setSelectedStore(store)
                                setSuspendForm({ reason: '' })
                                setModalType('suspend')
                              }}
                              className="py-1 px-2.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/40 text-rose-300 font-semibold text-xs transition-all cursor-pointer"
                              title="Suspender acesso"
                            >
                              Suspender
                            </button>
                          )}

                          {/* Registrar Pagamento Manual */}
                          <button
                            onClick={() => {
                              setSelectedStore(store)
                              setPaymentForm({ amount: '59.90', months_to_add: 1, payment_method: 'pix', notes: '' })
                              setModalType('payment')
                            }}
                            className="py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 hover:text-amber-200 font-semibold text-xs transition-all cursor-pointer flex items-center gap-1"
                            title="Confirmar pagamento e renovar"
                          >
                            <DollarSign size={13} />
                            Pagamento
                          </button>

                          {/* Ajustar Vencimento */}
                          <button
                            onClick={() => {
                              setSelectedStore(store)
                              const rawVal = store.due_date || store.subscription_due_date || ''
                              const defaultDate = rawVal ? String(rawVal).slice(0, 10) : new Date().toISOString().slice(0, 10)
                              setDueDateForm({
                                due_date: defaultDate,
                                grace_period_days: store.grace_period_days !== undefined ? store.grace_period_days : 3,
                                notes: '',
                              })
                              setActionError('')
                              setActionSuccess('')
                              setModalType('due_date')
                            }}
                            className="py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-semibold text-xs transition-all cursor-pointer flex items-center gap-1"
                            title="Definir vencimento ou tolerância"
                          >
                            <Calendar size={13} />
                            Prazo
                          </button>

                          {/* Ver Histórico */}
                          <button
                            onClick={() => openHistoryModal(store)}
                            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                            title="Ver histórico de status e pagamentos"
                          >
                            <History size={15} />
                          </button>

                          {/* Excluir Cadastro (Somente Superadmin e Loja !== 1) */}
                          {store.id !== 1 && (
                            <button
                              onClick={() => openDeleteModal(store)}
                              className="p-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/80 border border-rose-800/50 text-rose-400 hover:text-rose-200 transition-all cursor-pointer"
                              title="Excluir cadastro da loja permanentemente"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* MODAL: REGISTRAR PAGAMENTO MANUAL */}
      {modalType === 'payment' && selectedStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-5 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <DollarSign size={20} className="text-amber-400" />
                <h3 className="font-display font-bold text-lg text-white">Registrar Pagamento Manual</h3>
              </div>
              <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-white text-lg font-bold">✕</button>
            </div>

            <div className="text-xs text-slate-400">
              Loja: <span className="font-bold text-white">{selectedStore.name}</span> ({selectedStore.email})
            </div>

            {actionError && (
              <div className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-xl p-3">
                {actionError}
              </div>
            )}

            <form onSubmit={handleRegisterPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Valor Recebido (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  placeholder="Ex: 59.90"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Adicionar Meses *</label>
                  <input
                    type="number"
                    min="1"
                    max="36"
                    required
                    value={paymentForm.months_to_add}
                    onChange={(e) => setPaymentForm({ ...paymentForm, months_to_add: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Forma de Pagamento</label>
                  <select
                    value={paymentForm.payment_method}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="pix">PIX</option>
                    <option value="cash">Dinheiro</option>
                    <option value="credit_card">Cartão de Crédito</option>
                    <option value="bank_transfer">Transferência / TED</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Observações do Recebimento</label>
                <input
                  type="text"
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  placeholder="Ex: Comprovante recebido no WhatsApp"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Salvando...' : 'Confirmar e Renovar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ATIVAR LOJA */}
      {modalType === 'activate' && selectedStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-emerald-900/40 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-5 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} className="text-emerald-400" />
                <h3 className="font-display font-bold text-lg text-white">Ativar Cadastro da Loja</h3>
              </div>
              <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-white text-lg font-bold">✕</button>
            </div>

            <div className="text-xs text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-1">
              <div>Loja: <strong className="text-white">{selectedStore.name}</strong></div>
              <div>Proprietário: <span className="text-slate-300">{selectedStore.owner_name}</span></div>
            </div>

            {actionError && (
              <div className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-xl p-3">
                {actionError}
              </div>
            )}

            <form onSubmit={handleActivateStore} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Data de Vencimento *</label>
                <input
                  type="date"
                  required
                  value={activateForm.due_date}
                  onChange={(e) => setActivateForm({ ...activateForm, due_date: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Data em que a assinatura da loja vencerá (obrigatório).
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Dias de Tolerância após Vencimento *</label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  required
                  value={activateForm.grace_period_days}
                  onChange={(e) => setActivateForm({ ...activateForm, grace_period_days: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Período de tolerância antes do bloqueio automático (padrão: 3 dias).
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Observações de Ativação</label>
                <input
                  type="text"
                  value={activateForm.notes}
                  onChange={(e) => setActivateForm({ ...activateForm, notes: e.target.value })}
                  placeholder="Ex: Cadastro verificado e liberado"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/25 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Ativando...' : 'Confirmar e Ativar Loja'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AJUSTAR VENCIMENTO E TOLERÂNCIA */}
      {modalType === 'due_date' && selectedStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-5 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Calendar size={20} className="text-indigo-400" />
                <h3 className="font-display font-bold text-lg text-white">Configurar Vencimento e Tolerância</h3>
              </div>
              <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-white text-lg font-bold">✕</button>
            </div>

            <div className="text-xs text-slate-400">
              Loja: <span className="font-bold text-white">{selectedStore.name}</span>
            </div>

            {actionError && (
              <div className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-xl p-3">
                {actionError}
              </div>
            )}

            <form onSubmit={handleUpdateDueDate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Data de Vencimento *</label>
                <input
                  type="date"
                  required
                  value={dueDateForm.due_date}
                  onChange={(e) => setDueDateForm({ ...dueDateForm, due_date: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Dias de Tolerância após Vencimento *</label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  required
                  value={dueDateForm.grace_period_days}
                  onChange={(e) => setDueDateForm({ ...dueDateForm, grace_period_days: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Período no qual a loja fica "em atraso" antes do bloqueio total do acesso ao ERP.
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Motivo / Notas</label>
                <input
                  type="text"
                  value={dueDateForm.notes}
                  onChange={(e) => setDueDateForm({ ...dueDateForm, notes: e.target.value })}
                  placeholder="Ex: Prorrogação combinada com o cliente"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/25 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Salvando...' : 'Salvar Vencimento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SUSPENDER LOJA */}
      {modalType === 'suspend' && selectedStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-rose-900/50 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-5 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <AlertOctagon size={20} className="text-rose-400" />
                <h3 className="font-display font-bold text-lg text-white">Suspender Acesso da Loja</h3>
              </div>
              <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-white text-lg font-bold">✕</button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Tem certeza que deseja suspender a loja <strong className="text-white">{selectedStore.name}</strong>?
              O proprietário e todos os funcionários serão imediatamente impedidos de acessar as telas e APIs do ERP. Os dados permanecerão intactos.
            </p>

            {actionError && (
              <div className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-xl p-3">
                {actionError}
              </div>
            )}

            <form onSubmit={handleSuspendStore} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Motivo da Suspensão</label>
                <input
                  type="text"
                  required
                  value={suspendForm.reason}
                  onChange={(e) => setSuspendForm({ reason: e.target.value })}
                  placeholder="Ex: Mensalidade em atraso após tolerância"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/25 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Suspendendo...' : 'Confirmar Suspensão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EXCLUIR CADASTRO DA LOJA */}
      {modalType === 'delete_store' && selectedStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-rose-900/60 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-5 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Trash2 size={20} className="text-rose-400" />
                <h3 className="font-display font-bold text-lg text-white">Excluir Cadastro da Loja</h3>
              </div>
              <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-white text-lg font-bold">✕</button>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-800/50 text-rose-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-400">
                <AlertTriangle size={16} />
                AVISO: EXCLUSÃO PERMANENTE E DEFINITIVA
              </div>
              <p className="leading-relaxed">
                Esta ação apagará permanentemente a loja e todos os registros associados exclusivamente a ela (usuários, ordens de serviço, clientes, vendas, catálogo e configurações).
                Esta operação não pode ser desfeita.
              </p>
            </div>

            <div className="text-xs text-slate-300 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
              <div>Loja: <strong className="text-white">{selectedStore.name}</strong></div>
              <div>Proprietário: <strong className="text-slate-200">{selectedStore.owner_name}</strong></div>
            </div>

            {actionError && (
              <div className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-xl p-3">
                {actionError}
              </div>
            )}

            <form onSubmit={handleDeleteStore} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Para confirmar, digite <span className="font-mono font-bold text-rose-400">EXCLUIR</span> no campo abaixo:
                </label>
                <input
                  type="text"
                  required
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="EXCLUIR"
                  autoComplete="off"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={deleteConfirmText !== 'EXCLUIR' || actionLoading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/25 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {actionLoading ? 'Excluindo...' : 'Excluir Definitivamente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: HISTÓRICO DE MUDANÇAS E PAGAMENTOS */}
      {modalType === 'history' && selectedStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 w-full max-w-2xl shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <History size={20} className="text-amber-400" />
                <h3 className="font-display font-bold text-lg text-white">Histórico de Assinatura e Pagamentos</h3>
              </div>
              <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-white text-lg font-bold">✕</button>
            </div>

            <div className="text-xs text-slate-400 shrink-0">
              Loja: <span className="font-bold text-white">{selectedStore.name}</span> ({selectedStore.email})
            </div>

            <div className="overflow-y-auto space-y-3 pr-2 flex-1">
              {actionLoading ? (
                <div className="text-center py-8 text-slate-400 text-xs">Carregando histórico...</div>
              ) : storeHistory.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">Nenhum registro de pagamento ou alteração de status encontrado.</div>
              ) : (
                storeHistory.map((item) => (
                  <div key={item.id} className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white capitalize">
                        {item.action === 'payment_received' ? '💰 Pagamento Registrado' :
                         item.action === 'activated' ? '✅ Loja Ativada' :
                         item.action === 'reactivated' ? '🔄 Loja Reativada' :
                         item.action === 'suspended' ? '⛔ Loja Suspensa' :
                         item.action === 'due_date_updated' ? '📅 Vencimento Atualizado' : item.action}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(item.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>

                    {item.amount > 0 && (
                      <div className="text-emerald-400 font-bold">
                        Valor: R$ {Number(item.amount).toFixed(2).replace('.', ',')}
                      </div>
                    )}

                    <div className="text-slate-400 text-[11px]">
                      {item.previous_status && item.new_status && (
                        <span>Status: <strong className="text-slate-300">{item.previous_status}</strong> ➔ <strong className="text-slate-200">{item.new_status}</strong> | </span>
                      )}
                      {item.new_due_date && (
                        <span>Novo Vencimento: <strong className="text-slate-200">{item.new_due_date}</strong></span>
                      )}
                    </div>

                    {item.notes && (
                      <p className="text-slate-300 bg-slate-900/60 p-2 rounded-lg text-[11px] mt-1 border border-slate-800">
                        {item.notes}
                      </p>
                    )}

                    {item.platform_user_name && (
                      <div className="text-[10px] text-slate-500 text-right">
                        Registrado por: {item.platform_user_name}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end shrink-0">
              <button
                onClick={() => setModalType(null)}
                className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GERENCIAMENTO DE ADMINISTRADORES DA PLATAFORMA */}
      {modalType === 'admins' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 w-full max-w-xl shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <UserPlus size={20} className="text-indigo-400" />
                <h3 className="font-display font-bold text-lg text-white">Administradores da Plataforma</h3>
              </div>
              <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-white text-lg font-bold">✕</button>
            </div>

            <p className="text-xs text-slate-400 shrink-0">
              Apenas administradores autenticados podem conceder acesso de gestão global a novos administradores.
            </p>

            {actionError && (
              <div className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-xl p-3 shrink-0">
                {actionError}
              </div>
            )}
            {actionSuccess && (
              <div className="text-xs text-emerald-300 bg-emerald-950/50 border border-emerald-800/60 rounded-xl p-3 shrink-0">
                {actionSuccess}
              </div>
            )}

            <div className="overflow-y-auto space-y-4 pr-1 flex-1">
              {!showNewAdminForm ? (
                <button
                  type="button"
                  onClick={() => setShowNewAdminForm(true)}
                  className="w-full py-2.5 px-4 rounded-xl border border-dashed border-indigo-500/40 hover:border-indigo-500 text-indigo-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-indigo-950/10"
                >
                  <Plus size={15} />
                  Cadastrar Novo Administrador
                </button>
              ) : (
                <form onSubmit={handleCreateAdmin} className="p-4 rounded-2xl bg-slate-950 border border-indigo-500/30 space-y-3">
                  <div className="font-semibold text-xs text-indigo-300">Novo Administrador da Plataforma:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">Nome Completo</label>
                      <input
                        type="text"
                        required
                        value={newAdminForm.name}
                        onChange={(e) => setNewAdminForm({ ...newAdminForm, name: e.target.value })}
                        placeholder="Nome do admin"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">E-mail de Acesso</label>
                      <input
                        type="email"
                        required
                        value={newAdminForm.email}
                        onChange={(e) => setNewAdminForm({ ...newAdminForm, email: e.target.value })}
                        placeholder="admin@itecherp.com"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1">Senha (Mínimo 8 caracteres)</label>
                    <input
                      type="password"
                      required
                      value={newAdminForm.password}
                      onChange={(e) => setNewAdminForm({ ...newAdminForm, password: e.target.value })}
                      placeholder="••••••••"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowNewAdminForm(false)}
                      className="py-1.5 px-3 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20"
                    >
                      {actionLoading ? 'Criando...' : 'Salvar Admin'}
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Administradores Atuais:</div>
                {adminsList.map((adm) => (
                  <div key={adm.id} className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-white">{adm.name}</div>
                      <div className="text-slate-400 font-mono text-[11px]">{adm.email}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      ATIVO
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end shrink-0">
              <button
                onClick={() => setModalType(null)}
                className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ATIVAÇÃO EM MASSA */}
      {modalType === 'bulk_activate' && selectedIds.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-emerald-900/60 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-5 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} className="text-emerald-400" />
                <h3 className="font-display font-bold text-lg text-white">Ativação em Massa</h3>
              </div>
              <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-white text-lg font-bold">✕</button>
            </div>

            <div className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-800/50 p-3.5 rounded-xl space-y-1">
              <div className="font-bold">Você está ativando {selectedIds.length} {selectedIds.length === 1 ? 'loja selecionada' : 'lojas selecionadas'}.</div>
              <p className="text-[11px] text-emerald-200/90 leading-relaxed">
                Todas as lojas selecionadas terão suas assinaturas marcadas como ativas com a data de vencimento e tolerância definidas abaixo.
              </p>
            </div>

            {actionError && (
              <div className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-xl p-3">
                {actionError}
              </div>
            )}

            <form onSubmit={handleBulkActivate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Data de Vencimento *</label>
                <input
                  type="date"
                  required
                  value={bulkActivateForm.due_date}
                  onChange={(e) => setBulkActivateForm({ ...bulkActivateForm, due_date: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Dias de Tolerância após Vencimento *</label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  required
                  value={bulkActivateForm.grace_period_days}
                  onChange={(e) => setBulkActivateForm({ ...bulkActivateForm, grace_period_days: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Observações da Operação em Massa</label>
                <input
                  type="text"
                  value={bulkActivateForm.notes}
                  onChange={(e) => setBulkActivateForm({ ...bulkActivateForm, notes: e.target.value })}
                  placeholder="Ex: Ativação em lote pelo Superadmin"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/25 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Processando...' : `Ativar ${selectedIds.length} Lojas`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SUSPENSÃO EM MASSA */}
      {modalType === 'bulk_suspend' && selectedIds.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-amber-900/60 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-5 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <AlertOctagon size={20} className="text-amber-400" />
                <h3 className="font-display font-bold text-lg text-white">Suspensão em Massa</h3>
              </div>
              <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-white text-lg font-bold">✕</button>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-800/50 text-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-400">
                <AlertTriangle size={16} />
                Atenção ao Bloqueio de Acesso
              </div>
              <p className="leading-relaxed">
                Você selecionou <strong>{selectedIds.length} {selectedIds.length === 1 ? 'loja' : 'lojas'}</strong>. O acesso de todos os usuários dessas lojas ao ERP será interrompido imediatamente. A loja principal iTech (ID 1) está protegida e não será afetada. Os dados serão preservados.
              </p>
            </div>

            {actionError && (
              <div className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-xl p-3">
                {actionError}
              </div>
            )}

            <form onSubmit={handleBulkSuspend} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Motivo / Notas da Suspensão</label>
                <input
                  type="text"
                  required
                  value={bulkSuspendForm.notes}
                  onChange={(e) => setBulkSuspendForm({ notes: e.target.value })}
                  placeholder="Ex: Suspensão em massa por inadimplência"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-600/25 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Suspendendo...' : `Confirmar Suspensão (${selectedIds.length})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EXCLUSÃO EM MASSA COM CONFIRMAÇÃO RIGOROSA */}
      {modalType === 'bulk_delete' && selectedIds.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-rose-900/70 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-5 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Trash2 size={20} className="text-rose-400" />
                <h3 className="font-display font-bold text-lg text-white">Exclusão em Massa de Lojas</h3>
              </div>
              <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-white text-lg font-bold">✕</button>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-950/50 border border-rose-800/60 text-rose-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-400">
                <AlertTriangle size={16} />
                AVISO: EXCLUSÃO PERMANENTE E IRREVERSÍVEL
              </div>
              <p className="leading-relaxed">
                Você selecionou <strong>{selectedIds.length} {selectedIds.length === 1 ? 'loja' : 'lojas'}</strong> para exclusão definitiva. Todos os cadastros, usuários, produtos, clientes, ordens de serviço e históricos dessas lojas serão <strong>permanentemente apagados</strong>.
              </p>
              <p className="text-[11px] text-amber-300 font-medium">
                * A loja principal iTech (ID 1) é protegida por segurança e não será excluída.
              </p>
            </div>

            {actionError && (
              <div className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-xl p-3">
                {actionError}
              </div>
            )}

            <form onSubmit={handleBulkDelete} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Para confirmar a exclusão de {selectedIds.length} lojas, digite <span className="font-mono font-bold text-rose-400">EXCLUIR</span> no campo abaixo:
                </label>
                <input
                  type="text"
                  required
                  value={bulkDeleteConfirmText}
                  onChange={(e) => setBulkDeleteConfirmText(e.target.value)}
                  placeholder="EXCLUIR"
                  autoComplete="off"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={bulkDeleteConfirmText !== 'EXCLUIR' || actionLoading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/25 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {actionLoading ? 'Excluindo Lojas...' : `Excluir ${selectedIds.length} Lojas`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
