import Access from '../components/UI/Access'
import { usePagination } from '../components/UI/Pagination'
import PermanentDeleteDialog from '../components/UI/PermanentDeleteDialog'
import React, { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Eye, Pencil, Trash2, X, Phone, User, MessageCircle, FileText, ArrowUpDown } from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { formatDate } from '../utils/format'
import useDebounce from '../hooks/useDebounce'
import CustomerModal from '../components/CustomerModal'
import { onlyDigits } from '../utils/masks'

export default function Customers() {
  const { isAdmin, isSuspended } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const debouncedQ = useDebounce(q, 300)
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(false)
  const [sortBy, setSortBy] = useState('first_name')
  const [sortOrder, setSortOrder] = useState('asc')

  const pagination = usePagination(customers)
  const [showModal, setShowModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/customers', {
        params: {
          q: debouncedQ || undefined,
          sort_by: sortBy,
          sort_order: sortOrder
        }
      })
      const list = Array.isArray(data) ? data : (data?.data || [])
      setCustomers(list)
    } catch (err) {
      setError('Erro ao carregar clientes.')
    } finally {
      setLoading(false)
    }
  }, [debouncedQ, sortBy, sortOrder])

  useEffect(() => { load() }, [load])

  async function handleDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setError('')
    try {
      await api.delete(`/customers/${pendingDelete.id}`)
      setPendingDelete(null)
      await load()
    } catch (failure) {
      setError(failure.response?.data?.error || 'Não foi possível excluir permanentemente o cliente.')
    } finally {
      setDeleting(false)
    }
  }

  function handleOpenWhatsApp(phone) {
    const digits = onlyDigits(phone)
    if (!digits) return
    const formatted = digits.length <= 11 ? `55${digits}` : digits
    window.open(`https://wa.me/${formatted}`, '_blank')
  }

  return (
    <div className="space-y-4">
      {pagination.controls}

      {error && (
        <p className="rounded-lg bg-rose-100 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}

      {/* Cabeçalho da Página */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-xl">Clientes — CRM</h2>
          <p className="text-sm text-slate-400">
            Base unificada de clientes, histórico de serviços e compras
          </p>
        </div>
        <Access permission="create_customer">
          <button
            className="btn-primary disabled:opacity-50"
            disabled={isSuspended}
            title={isSuspended ? 'Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.' : ''}
            onClick={() => {
              if (isSuspended) {
                setError('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.')
                return
              }
              setEditingCustomer(null)
              setShowModal(true)
            }}
          >
            <Plus size={16} /> Novo Cliente
          </button>
        </Access>
      </div>

      {/* Barra de Filtros e Busca Inteligente */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative max-w-md w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por nome, telefone, CPF, e-mail ou código..."
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary !text-xs !py-2 flex items-center gap-1.5"
            onClick={() => {
              if (sortBy === 'first_name') {
                setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
              } else {
                setSortBy('first_name')
                setSortOrder('asc')
              }
            }}
            title="Ordenar por Nome"
          >
            <ArrowUpDown size={13} /> Nome {sortBy === 'first_name' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
          </button>

          <button
            type="button"
            className="btn-secondary !text-xs !py-2 flex items-center gap-1.5"
            onClick={() => {
              if (sortBy === 'created_at') {
                setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
              } else {
                setSortBy('created_at')
                setSortOrder('desc')
              }
            }}
            title="Ordenar por Data de Cadastro"
          >
            <ArrowUpDown size={13} /> Recentes {sortBy === 'created_at' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
          </button>
        </div>
      </div>

      {/* Tabela de Clientes */}
      <div className="card overflow-hidden">
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabela de Clientes">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-ink-700">
                <th className="px-4 py-2.5">Código / Cliente</th>
                <th className="px-4 py-2.5">Contato</th>
                <th className="px-4 py-2.5">CPF / Documento</th>
                <th className="px-4 py-2.5">Cidade / UF</th>
                <th className="px-4 py-2.5">Cadastrado em</th>
                <th className="px-4 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pagination.rows.map(c => (
                <tr key={c.id} className="border-b border-slate-50 dark:border-ink-700/50 hover:bg-slate-50/60 dark:hover:bg-ink-700/30">
                  <td className="px-4 py-2.5">
                    <Link to={`/clientes/${c.id}`} className="font-semibold text-slate-800 dark:text-zinc-100 hover:text-amber-500 transition">
                      <span className="text-xs font-mono text-slate-400 mr-1.5">#{c.id}</span>
                      {c.first_name} {c.last_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-600 dark:text-slate-300 font-medium">{c.phone || '—'}</span>
                      {c.phone && (
                        <button
                          type="button"
                          onClick={() => handleOpenWhatsApp(c.phone)}
                          className="p-1 rounded-md text-emerald-600 hover:bg-emerald-500/10 transition"
                          title="Conversar no WhatsApp"
                          aria-label="Abrir WhatsApp"
                        >
                          <MessageCircle size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">
                    {c.cpf || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 truncate max-w-xs">
                    {c.city ? `${c.city}${c.state ? ` - ${c.state}` : ''}` : (c.address || '—')}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">
                    {formatDate(c.created_at)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        to={`/clientes/${c.id}`}
                        className="btn-ghost !px-2 !py-1 text-slate-600 dark:text-slate-300 hover:text-amber-500"
                        title="Ver Ficha Completa do Cliente"
                        aria-label="Ver perfil"
                      >
                        <Eye size={15} />
                      </Link>

                      <Access permission="edit_customer">
                        <button
                          disabled={isSuspended}
                          title={isSuspended ? 'Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.' : 'Editar Cadastro'}
                          onClick={() => {
                            if (isSuspended) {
                              setError('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.')
                              return
                            }
                            setEditingCustomer(c)
                            setShowModal(true)
                          }}
                          className="btn-ghost !px-2 !py-1 text-slate-600 dark:text-slate-300 hover:text-amber-500"
                          aria-label="Editar cliente"
                        >
                          <Pencil size={15} />
                        </button>
                      </Access>

                      {isAdmin && (
                        <button
                          disabled={isSuspended}
                          title={isSuspended ? 'Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.' : 'Excluir Cliente'}
                          onClick={() => {
                            if (isSuspended) {
                              setError('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.')
                              return
                            }
                            setPendingDelete(c)
                          }}
                          className="btn-ghost !px-2 !py-1 text-rose-600 hover:bg-rose-500/10"
                          aria-label="Excluir cliente"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && pagination.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    <User size={32} className="mx-auto mb-2 opacity-40 text-amber-500" />
                    <p className="font-medium text-sm">Nenhum cliente encontrado.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {q ? 'Tente buscar por outro termo ou limpe a pesquisa.' : 'Cadastre seu primeiro cliente para iniciar o relacionamento.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Criação / Edição */}
      {showModal && (
        <CustomerModal
          customer={editingCustomer}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false)
            load()
          }}
        />
      )}

      {/* Modal de Exclusão Permanente */}
      {pendingDelete && (
        <PermanentDeleteDialog
          recordName={`o cliente ${pendingDelete.first_name} ${pendingDelete.last_name || ''}`}
          impactText="O cadastro do cliente será removido, mas o histórico financeiro de ordens de serviço e garantias já emitidas será preservado sob um registro consolidado."
          loading={deleting}
          onCancel={() => { if (!deleting) setPendingDelete(null) }}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}
