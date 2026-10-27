import React, { useEffect, useState, useCallback } from 'react'
import {
  AlertTriangle,
  Users,
  Wrench,
  Package,
  Truck,
  Tag,
  ShieldAlert,
  Smartphone,
  StickyNote,
  Download,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Info,
  CheckSquare,
  Square,
  Sliders,
  History,
} from 'lucide-react'
import api from '../../api/client'
import ModalFrame from '../UI/ModalFrame'

export default function DangerZone({ onBackup }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null) // { type: 'success' | 'blocked' | 'error', message: string, details?: any }

  // Modal de confirmação
  const [modalCategory, setModalCategory] = useState(null) // 'customers' | 'service_orders' | 'inventory' | 'suppliers' | 'categories' | 'users' | 'parts_catalog' | 'notes'
  const [confirmText, setConfirmText] = useState('')
  const [stockAction, setStockAction] = useState('delete') // 'delete' | 'zero_stock' | 'deactivate'

  // Seleção de usuários para remoção
  const [selectedUserIds, setSelectedUserIds] = useState([])

  const loadStats = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const { data } = await api.get('/danger-zone/stats')
      setStats(data)
    } catch (err) {
      const status = err.response?.status
      let errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Falha ao carregar as informações da Zona de Perigo.'
      let errorHint = 'Verifique se o backend está em execução.'

      if (status === 401) {
        errorMsg = 'Sessão revogada ou expirada.'
        errorHint = 'Por favor, faça login novamente para revalidar sua sessão.'
      } else if (status === 403) {
        errorMsg = 'Acesso não autorizado.'
        errorHint = 'Apenas administradores têm permissão para acessar a Zona de Perigo.'
      } else if (status === 404) {
        errorMsg = 'Endpoint da Zona de Perigo não encontrado (/api/danger-zone/stats).'
        errorHint = 'O servidor administrativo precisa ser reiniciado para carregar as novas rotas implementadas.'
      } else if (status === 500) {
        errorMsg = 'Falha ao consultar os registros no banco de dados SQLite.'
        errorHint = 'Ocorreu um erro interno na consulta do banco de dados do sistema.'
      }

      setLoadError({
        status,
        message: errorMsg,
        hint: errorHint,
        details: err.response?.data?.details || err.message,
      })
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  function openConfirmation(category) {
    if (!stats) return
    setModalCategory(category)
    setConfirmText('')
    setStockAction(category === 'inventory' && stats?.inventory?.dependencies?.hasDependencies ? 'zero_stock' : 'delete')
  }

  function closeModal() {
    if (busy) return
    setModalCategory(null)
    setConfirmText('')
  }

  function toggleUserSelection(id) {
    setSelectedUserIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function toggleSelectAllRemovableUsers() {
    const removable = (stats?.users?.list || []).filter(u => u.can_delete).map(u => u.id)
    if (selectedUserIds.length === removable.length) {
      setSelectedUserIds([])
    } else {
      setSelectedUserIds(removable)
    }
  }

  async function executeClear(e) {
    e.preventDefault()
    if (confirmText.trim() !== 'EXCLUIR') return
    if (!stats) return

    setBusy(true)
    setNotice(null)

    try {
      let endpoint = ''
      let payload = {}

      switch (modalCategory) {
        case 'customers':
          endpoint = '/danger-zone/clear/customers'
          break
        case 'service_orders':
          endpoint = '/danger-zone/clear/service-orders'
          break
        case 'inventory':
          endpoint = '/danger-zone/clear/inventory'
          payload = { action: stockAction }
          break
        case 'stock_movements':
          endpoint = '/danger-zone/clear/stock-movements'
          break
        case 'suppliers':
          endpoint = '/danger-zone/clear/suppliers'
          break
        case 'categories':
          endpoint = '/danger-zone/clear/categories'
          break
        case 'users':
          endpoint = '/danger-zone/clear/users'
          payload = { user_ids: selectedUserIds }
          break
        case 'parts_catalog':
          endpoint = '/danger-zone/clear/parts-catalog'
          break
        case 'notes':
          endpoint = '/danger-zone/clear/notes'
          break
        default:
          throw new Error('Categoria inválida.')
      }

      const { data } = await api.post(endpoint, payload)

      setNotice({
        type: 'success',
        message: data.message || 'Limpeza concluída com sucesso.',
      })

      if (modalCategory === 'users') {
        setSelectedUserIds([])
      }

      closeModal()
      await loadStats()
    } catch (err) {
      const resp = err.response?.data
      if (err.response?.status === 409 && resp?.blocked) {
        setNotice({
          type: 'blocked',
          message: resp.message || resp.error,
          dependencies: resp.dependencies,
        })
      } else {
        setNotice({
          type: 'error',
          message: resp?.error || 'A operação não foi concluída. Nenhum dado deve ser considerado excluído sem confirmação do resultado no banco de dados.',
        })
      }
      closeModal()
    } finally {
      setBusy(false)
    }
  }

  if (loading && !stats) {
    return (
      <div className="card p-10 flex flex-col items-center justify-center gap-3 text-slate-400">
        <RefreshCw className="animate-spin text-amber-500" size={28} />
        <span className="font-medium text-sm">Consultando banco de dados real do iTech ERP...</span>
        <span className="text-xs text-slate-500">Lendo contagens e dependências de clientes, ordens de serviço e estoque.</span>
      </div>
    )
  }

  // Falha de leitura: NÃO confunda erro com banco vazio (Requisito 4 e 6)
  if (loadError && !stats) {
    return (
      <div className="space-y-6">
        <div className="card p-6 border-l-4 border-rose-500 bg-rose-500/10 space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 shrink-0 mt-0.5">
              <XCircle size={26} />
            </div>
            <div className="space-y-1.5 flex-1">
              <h3 className="font-display text-lg font-bold text-rose-400">
                Erro ao Conectar com o Banco de Dados Real
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed font-semibold">
                {loadError.message}
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                {loadError.hint}
              </p>
              {loadError.status && (
                <p className="text-[11px] font-mono text-rose-300 pt-1">
                  Código de resposta HTTP: {loadError.status}
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn-primary !bg-rose-600 hover:!bg-rose-700 flex items-center gap-2 text-xs"
              onClick={loadStats}
            >
              <RefreshCw size={14} />
              Tentar Novamente
            </button>
          </div>

          <div className="pt-3 border-t border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0 text-amber-400" />
            <span>
              <strong>Ações Destrutivas Suspensas:</strong> Como as informações reais do banco de dados não puderam ser verificadas, todas as opções de exclusão foram preventivamente bloqueadas para evitar alterações indevidas.
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 1. Aviso de Segurança e Status de Backup no Topo */}
      <section className="card p-5 sm:p-6 border-l-4 border-amber-500 bg-amber-500/5 dark:bg-amber-500/10 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-500 shrink-0 mt-0.5">
              <AlertTriangle size={24} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="font-display text-lg font-bold text-amber-500">
                  Zona de Perigo — Ações Potencialmente Irreversíveis
                </h3>
                {stats?.store?.name && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/20 text-amber-400">
                    Loja: {stats.store.name}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600 dark:text-zinc-300 max-w-3xl leading-relaxed">
                As operações desta seção permitem a limpeza seletiva de registros do sistema. As exclusões confirmadas são permanentes e não podem ser desfeitas. Dados essenciais de histórico financeiro, lançamentos de caixa e configurações da loja são preservados com base nas regras de integridade do ERP.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              className="btn-secondary flex items-center gap-2"
              disabled={busy}
              onClick={loadStats}
              title="Atualizar números"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
            {onBackup && (
              <button
                type="button"
                className="btn-primary flex items-center gap-2"
                onClick={onBackup}
                disabled={busy}
              >
                <Download size={15} />
                Gerar Backup Agora
              </button>
            )}
          </div>
        </div>

        {/* Informação sobre Backup Existente */}
        <div className="pt-3 border-t border-amber-500/20 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-zinc-400">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-amber-500" />
            <span>
              <strong>Status de Cópia de Segurança:</strong>{' '}
              {stats?.backup?.last_backup
                ? `Último backup registrado em ${new Date(stats.backup.last_backup + 'Z').toLocaleString('pt-BR')}`
                : 'Nenhum backup registrado recentemente no sistema.'}
            </span>
          </div>
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            Recomenda-se gerar um backup antes de qualquer exclusão.
          </span>
        </div>
      </section>

      {/* Notificação de Resultado */}
      {notice && (
        <div
          role="alert"
          className={`card p-4 flex items-start gap-3 border-l-4 ${
            notice.type === 'success'
              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
              : notice.type === 'blocked'
              ? 'border-amber-500 bg-amber-500/10 text-amber-300'
              : 'border-rose-500 bg-rose-500/10 text-rose-300'
          }`}
        >
          {notice.type === 'success' && <CheckCircle2 size={20} className="shrink-0 text-emerald-400 mt-0.5" />}
          {notice.type === 'blocked' && <AlertTriangle size={20} className="shrink-0 text-amber-400 mt-0.5" />}
          {notice.type === 'error' && <XCircle size={20} className="shrink-0 text-rose-400 mt-0.5" />}
          <div className="text-sm space-y-1">
            <p className="font-semibold">
              {notice.type === 'success' && 'Sucesso'}
              {notice.type === 'blocked' && 'Bloqueio por dependências'}
              {notice.type === 'error' && 'Erro na operação'}
            </p>
            <p className="leading-relaxed">{notice.message}</p>
          </div>
        </div>
      )}

      {/* 2. Categorias de Limpeza */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Clientes */}
        <div className="card p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                  <Users size={18} />
                </div>
                <h4 className="font-semibold text-base">Clientes</h4>
              </div>
              <span className={`badge-slate font-mono text-xs ${stats?.customers?.count > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                {stats?.customers?.count > 0 ? `${stats.customers.count} cliente(s) no banco` : '0 cadastrado(s) (Nenhum no banco)'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              Excluir os clientes cadastrados no sistema. A exclusão só é permitida se não houver ordens de serviço, vendas ou fiados vinculados.
            </p>
            {stats?.customers?.dependencies?.hasDependencies && (
              <p className="text-xs text-amber-500 flex items-center gap-1.5 font-medium">
                <AlertTriangle size={13} />
                Existem vínculos ativos que impedem a exclusão direta de clientes.
              </p>
            )}
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex justify-end">
            <button
              type="button"
              className="btn-ghost text-rose-500 hover:bg-rose-500/10 disabled:opacity-40 text-xs font-semibold px-3 py-2"
              disabled={busy || !stats || stats.customers.count === 0}
              onClick={() => openConfirmation('customers')}
            >
              Apagar clientes
            </button>
          </div>
        </div>

        {/* Ordens de Serviço */}
        <div className="card p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                  <Wrench size={18} />
                </div>
                <h4 className="font-semibold text-base">Ordens de Serviço</h4>
              </div>
              <span className={`badge-slate font-mono text-xs ${stats?.service_orders?.count > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                {stats?.service_orders?.count > 0 ? `${stats.service_orders.count} OS no banco` : '0 cadastrada(s) (Nenhuma no banco)'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              Excluir as ordens de serviço cadastradas, incluindo histórico de status, fotos e vínculos. Lançamentos de caixa e históricos financeiros são estritamente preservados.
            </p>
            <div className="text-xs text-slate-400 flex flex-wrap gap-2">
              <span>{stats?.service_orders?.details?.photos || 0} foto(s)</span>
              <span>·</span>
              <span>{stats?.service_orders?.details?.warranties || 0} garantia(s)</span>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex justify-end">
            <button
              type="button"
              className="btn-ghost text-rose-500 hover:bg-rose-500/10 disabled:opacity-40 text-xs font-semibold px-3 py-2"
              disabled={busy || !stats || stats.service_orders.count === 0}
              onClick={() => openConfirmation('service_orders')}
            >
              Apagar ordens de serviço
            </button>
          </div>
        </div>

        {/* Estoque e Produtos */}
        <div className="card p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                  <Package size={18} />
                </div>
                <h4 className="font-semibold text-base">Estoque e Produtos</h4>
              </div>
              <span className={`badge-slate font-mono text-xs ${stats?.inventory?.count > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                {stats?.inventory?.count > 0
                  ? `${stats.inventory.count} produto(s) ativo(s) · ${stats.inventory.stock_qty_total} un.`
                  : '0 produto(s) ativo(s)'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              Limpar os produtos e registros de estoque. Se houver movimentações ou vendas vinculadas, utilize as opções seguras de zerar estoque ou desativar produtos.
            </p>
            {stats?.inventory?.inactive_count > 0 && (
              <p className="text-[11px] text-slate-400">
                Total cadastrado no banco: {stats.inventory.total_count} ({stats.inventory.inactive_count} inativo(s)/arquivado(s)).
              </p>
            )}
            {stats?.inventory?.dependencies?.hasDependencies && (
              <p className="text-xs text-amber-500 flex items-center gap-1.5 font-medium">
                <AlertTriangle size={13} />
                Possui {stats.inventory.dependencies.sales_items} venda(s) e {stats.inventory.dependencies.movements} movimentação(ões) vinculadas.
              </p>
            )}
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex justify-end">
            <button
              type="button"
              className="btn-ghost text-rose-500 hover:bg-rose-500/10 disabled:opacity-40 text-xs font-semibold px-3 py-2"
              disabled={busy || !stats || (stats.inventory.total_count === 0 && stats.inventory.count === 0)}
              onClick={() => openConfirmation('inventory')}
            >
              Apagar estoque
            </button>
          </div>
        </div>

        {/* Movimentações de Estoque */}
        <div className="card p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                  <History size={18} />
                </div>
                <h4 className="font-semibold text-base">Movimentações de Estoque</h4>
              </div>
              <span className={`badge-slate font-mono text-xs ${stats?.stock_movements?.count > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                {stats?.stock_movements?.count > 0 ? `${stats.stock_movements.count} movimentação(ões) no banco` : '0 registrada(s) (Nenhuma no banco)'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              Excluir todo o histórico de movimentações de estoque registrado no sistema. Esta operação não deve excluir os produtos cadastrados.
            </p>
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex justify-end">
            <button
              type="button"
              className="btn-ghost text-rose-500 hover:bg-rose-500/10 disabled:opacity-40 text-xs font-semibold px-3 py-2"
              disabled={busy || !stats || (stats.stock_movements?.count || 0) === 0}
              onClick={() => openConfirmation('stock_movements')}
            >
              Apagar movimentações
            </button>
          </div>
        </div>

        {/* Fornecedores */}
        <div className="card p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                  <Truck size={18} />
                </div>
                <h4 className="font-semibold text-base">Fornecedores</h4>
              </div>
              <span className={`badge-slate font-mono text-xs ${stats?.suppliers?.count > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                {stats?.suppliers?.count > 0 ? `${stats.suppliers.count} fornecedor(es)` : '0 cadastrado(s) (Nenhum no banco)'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              Excluir fornecedores cadastrados que não possuam produtos, ordens de serviço ou retiradas de caixa vinculadas.
            </p>
            {stats?.suppliers?.dependencies?.hasDependencies && (
              <p className="text-xs text-amber-500 flex items-center gap-1.5 font-medium">
                <AlertTriangle size={13} />
                Vínculos ativos com compras/ordens bloqueiam a exclusão direta.
              </p>
            )}
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex justify-end">
            <button
              type="button"
              className="btn-ghost text-rose-500 hover:bg-rose-500/10 disabled:opacity-40 text-xs font-semibold px-3 py-2"
              disabled={busy || !stats || stats.suppliers.count === 0}
              onClick={() => openConfirmation('suppliers')}
            >
              Apagar fornecedores
            </button>
          </div>
        </div>

        {/* Categorias */}
        <div className="card p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                  <Tag size={18} />
                </div>
                <h4 className="font-semibold text-base">Categorias</h4>
              </div>
              <span className={`badge-slate font-mono text-xs ${stats?.categories?.count > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                {stats?.categories?.count > 0 ? `${stats.categories.count} categoria(s)` : '0 cadastrada(s) (Nenhuma no banco)'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              Excluir categorias cadastradas que não estejam sendo utilizadas por produtos no estoque da loja.
            </p>
            {stats?.categories?.dependencies?.hasDependencies && (
              <p className="text-xs text-amber-500 flex items-center gap-1.5 font-medium">
                <AlertTriangle size={13} />
                Existem {stats.categories.dependencies.products} produto(s) vinculados a categorias.
              </p>
            )}
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex justify-end">
            <button
              type="button"
              className="btn-ghost text-rose-500 hover:bg-rose-500/10 disabled:opacity-40 text-xs font-semibold px-3 py-2"
              disabled={busy || !stats || stats.categories.count === 0}
              onClick={() => openConfirmation('categories')}
            >
              Apagar categorias
            </button>
          </div>
        </div>

        {/* Modelos e Marcas (Auxiliar) */}
        <div className="card p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                  <Smartphone size={18} />
                </div>
                <h4 className="font-semibold text-base">Modelos e Marcas de Peças</h4>
              </div>
              <span className={`badge-slate font-mono text-xs ${stats?.parts_catalog?.models_count > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                {stats?.parts_catalog?.models_count || 0} modelo(s)
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              Excluir o catálogo auxiliar de modelos e marcas técnicas de aparelhos e frontais.
            </p>
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex justify-end">
            <button
              type="button"
              className="btn-ghost text-rose-500 hover:bg-rose-500/10 disabled:opacity-40 text-xs font-semibold px-3 py-2"
              disabled={busy || !stats || (stats.parts_catalog?.models_count || 0) === 0}
              onClick={() => openConfirmation('parts_catalog')}
            >
              Apagar modelos e marcas
            </button>
          </div>
        </div>

        {/* Bloco de Notas (Auxiliar) */}
        <div className="card p-5 space-y-4 flex flex-col justify-between md:col-span-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                  <StickyNote size={18} />
                </div>
                <h4 className="font-semibold text-base">Anotações e Lembretes</h4>
              </div>
              <span className={`badge-slate font-mono text-xs ${stats?.notes?.count > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                {stats?.notes?.count || 0} nota(s)
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              Limpar anotações, lembretes e listas de tarefas do bloco de notas da loja. Registros financeiros e de clientes permanecem intocados.
            </p>
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex justify-end">
            <button
              type="button"
              className="btn-ghost text-rose-500 hover:bg-rose-500/10 disabled:opacity-40 text-xs font-semibold px-3 py-2"
              disabled={busy || !stats || (stats.notes?.count || 0) === 0}
              onClick={() => openConfirmation('notes')}
            >
              Apagar anotações
            </button>
          </div>
        </div>
      </div>

      {/* 3. Usuários e Funcionários (Seleção Explícita Obrigatória) */}
      <section className="card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h4 className="font-semibold text-base">Usuários e Funcionários</h4>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Selecione explicitamente os usuários que deseja remover. A conta autenticada, administradores master e o último admin ativo são permanentemente protegidos.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary text-xs flex items-center gap-1.5"
              onClick={toggleSelectAllRemovableUsers}
              disabled={busy || !stats || (stats?.users?.removable_count || 0) === 0}
            >
              {selectedUserIds.length > 0 && selectedUserIds.length === (stats?.users?.removable_count || 0) ? (
                <>
                  <CheckSquare size={14} /> Desmarcar todos
                </>
              ) : (
                <>
                  <Square size={14} /> Selecionar elegíveis
                </>
              )}
            </button>
            <button
              type="button"
              className="btn-primary !bg-rose-600 hover:!bg-rose-700 disabled:opacity-40 text-xs"
              disabled={busy || !stats || selectedUserIds.length === 0}
              onClick={() => openConfirmation('users')}
            >
              Apagar usuários selecionados ({selectedUserIds.length})
            </button>
          </div>
        </div>

        {/* Lista de Usuários */}
        <div className="divide-y divide-slate-200 dark:divide-white/10 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
          {(stats?.users?.list || []).map(u => {
            const isSelected = selectedUserIds.includes(u.id)
            return (
              <div
                key={u.id}
                className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm transition-colors ${
                  isSelected ? 'bg-rose-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={`user-select-${u.id}`}
                    disabled={!u.can_delete || busy}
                    checked={isSelected}
                    onChange={() => toggleUserSelection(u.id)}
                    className="h-4 w-4 rounded accent-rose-600 disabled:opacity-30 cursor-pointer"
                  />
                  <div>
                    <label
                      htmlFor={`user-select-${u.id}`}
                      className={`font-semibold cursor-pointer ${!u.can_delete ? 'text-slate-500 dark:text-zinc-400' : ''}`}
                    >
                      {u.full_name}
                    </label>
                    <p className="text-xs text-slate-400">@{u.username}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge-slate uppercase text-[10px] tracking-wider">
                    {u.role === 'admin' ? 'Administrador' : 'Funcionário'}
                  </span>

                  {u.protection_reason ? (
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-500">
                      {u.protection_reason}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-zinc-300">
                      Elegível para remoção
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 4. Modal de Confirmação Reforçada */}
      {modalCategory && (
        <ModalFrame busy={busy} className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={closeModal}>
          <form
            className="modal-panel max-w-lg w-full p-6 space-y-5"
            onClick={e => e.stopPropagation()}
            onSubmit={executeClear}
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-500 shrink-0 mt-0.5">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-rose-500">
                  Confirmar Exclusão de {getCategoryTitle(modalCategory)}
                </h3>
                <p className="text-xs text-slate-400">
                  Esta operação é permanente e <strong>NÃO</strong> poderá ser desfeita.
                </p>
              </div>
            </div>

            {/* Detalhes de Registros Afetados */}
            <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3.5 bg-slate-50 dark:bg-black/30 space-y-2 text-sm">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Categoria alvo:</span>
                <span className="font-semibold">{getCategoryTitle(modalCategory)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Registros afetados:</span>
                <span className="font-semibold text-rose-500">
                  {getAffectedCount(modalCategory, stats, selectedUserIds)}
                </span>
              </div>

              {/* Informação sobre Histórico Financeiro */}
              <p className="pt-2 text-xs border-t border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400">
                {modalCategory === 'service_orders' &&
                  'As fotos e o histórico das ordens serão excluídos. Retiradas de caixa e contas de fiado financeiras permanecerão preservadas.'}
                {modalCategory === 'customers' &&
                  'Apenas clientes sem vínculos com ordens de serviço ou vendas podem ser excluídos.'}
                {modalCategory === 'users' &&
                  'Os usuários selecionados serão excluídos. O histórico de autoria de OS e vendas passadas será preservado em snapshots.'}
                {modalCategory === 'inventory' &&
                  'Para produtos com vendas ou movimentações passadas, utilize as opções seguras abaixo.'}
                {modalCategory === 'stock_movements' &&
                  'Todo o histórico de movimentações de estoque (entradas, saídas, ajustes e vendas) será permanentemente removido. Os produtos cadastrados e seus saldos atuais de estoque permanecerão inalterados.'}
              </p>
            </div>

            {/* Alternativas seguras para estoque */}
            {modalCategory === 'inventory' && (
              <div className="space-y-2">
                <label className="label">Modo de Operação de Estoque</label>
                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="stockAction"
                      value="zero_stock"
                      checked={stockAction === 'zero_stock'}
                      onChange={() => setStockAction('zero_stock')}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-semibold">Zerar quantidades em estoque (Recomendado)</p>
                      <p className="text-slate-400">Mantém os produtos cadastrados e zera as quantidades físicas.</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="stockAction"
                      value="deactivate"
                      checked={stockAction === 'deactivate'}
                      onChange={() => setStockAction('deactivate')}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-semibold">Desativar produtos</p>
                      <p className="text-slate-400">Oculta os produtos sem violar o histórico de movimentações ou vendas.</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="stockAction"
                      value="delete"
                      checked={stockAction === 'delete'}
                      onChange={() => setStockAction('delete')}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-semibold text-rose-500">Exclusão física permanente</p>
                      <p className="text-slate-400">Só permitida se o produto não tiver vendas ou movimentações registradas.</p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Confirmação Obrigatória com EXCLUIR */}
            <div className="space-y-2">
              <label htmlFor="confirm-danger-input" className="label text-xs">
                Digite a palavra <strong className="text-rose-500 font-bold">EXCLUIR</strong> em maiúsculas para habilitar a confirmação:
              </label>
              <input
                id="confirm-danger-input"
                type="text"
                className="input font-mono uppercase tracking-wider"
                placeholder="EXCLUIR"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value.toUpperCase())}
                autoFocus
                disabled={busy}
              />
            </div>

            {/* Botões */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={closeModal}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary !bg-rose-600 hover:!bg-rose-700 disabled:opacity-40"
                disabled={busy || confirmText.trim() !== 'EXCLUIR'}
              >
                {busy ? 'Processando exclusão...' : 'Confirmar exclusão'}
              </button>
            </div>
          </form>
        </ModalFrame>
      )}
    </div>
  )
}

function getCategoryTitle(key) {
  switch (key) {
    case 'customers': return 'Clientes'
    case 'service_orders': return 'Ordens de Serviço'
    case 'inventory': return 'Estoque e Produtos'
    case 'stock_movements': return 'Movimentações de Estoque'
    case 'suppliers': return 'Fornecedores'
    case 'categories': return 'Categorias'
    case 'users': return 'Usuários Selecionados'
    case 'parts_catalog': return 'Modelos e Marcas'
    case 'notes': return 'Anotações'
    default: return 'Dados'
  }
}

function getAffectedCount(category, stats, selectedUserIds) {
  if (!stats) return '0'
  switch (category) {
    case 'customers':
      return `${stats.customers?.count || 0} cliente(s)`
    case 'service_orders':
      return `${stats.service_orders?.count || 0} ordem(ns)`
    case 'inventory':
      return `${stats.inventory?.count || 0} produto(s) (${stats.inventory?.stock_qty_total || 0} unidades)`
    case 'stock_movements':
      return `${stats.stock_movements?.count || 0} movimentação(ões)`
    case 'suppliers':
      return `${stats.suppliers?.count || 0} fornecedor(es)`
    case 'categories':
      return `${stats.categories?.count || 0} categoria(s)`
    case 'users':
      return `${selectedUserIds?.length || 0} usuário(s) selecionado(s)`
    case 'parts_catalog':
      return `${stats.parts_catalog?.models_count || 0} modelo(s)`
    case 'notes':
      return `${stats.notes?.count || 0} anotação(ões)`
    default:
      return '0'
  }
}
