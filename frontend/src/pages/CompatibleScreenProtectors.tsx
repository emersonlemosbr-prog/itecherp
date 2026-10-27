import React, { useEffect, useMemo, useState } from 'react'
import { Plus, SearchX, Shield, X } from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import ModalFrame from '../components/UI/ModalFrame'
import BrandFilter from '../components/CompatibleScreenProtectors/BrandFilter'
import CompatibilityCard from '../components/CompatibleScreenProtectors/CompatibilityCard'
import CompatibilitySearch from '../components/CompatibleScreenProtectors/CompatibilitySearch'
import ScreenProtectorModal, { ScreenProtectorGroup } from '../components/CompatibleScreenProtectors/ScreenProtectorModal'
import StatsCards from '../components/CompatibleScreenProtectors/StatsCards'
import './CompatibleScreenProtectors.css'

const BRANDS = ['Todos', 'Samsung', 'Motorola', 'Xiaomi', 'POCO', 'Apple', 'Realme', 'LG', 'Nokia', 'Itel']

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function modelBrand(model: string) {
  const normalized = normalizeSearch(model)
  if (normalized.includes('samsung')) return 'Samsung'
  if (normalized.includes('motorola') || normalized.includes('motog') || normalized.includes('motoe')) return 'Motorola'
  if (normalized.includes('poco')) return 'POCO'
  if (normalized.includes('redmi') || normalized.includes('xiaomi') || normalized.includes('mi')) return 'Xiaomi'
  if (normalized.includes('iphone') || normalized.includes('apple')) return 'Apple'
  if (normalized.includes('realme')) return 'Realme'
  if (normalized.includes('lg')) return 'LG'
  if (normalized.includes('nokia')) return 'Nokia'
  if (normalized.includes('itel')) return 'Itel'
  return 'Outra'
}

export default function CompatibleScreenProtectors() {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState<ScreenProtectorGroup[]>([])
  const [query, setQuery] = useState('')
  const [brand, setBrand] = useState('Todos')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<ScreenProtectorGroup | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<ScreenProtectorGroup | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  useEffect(() => {
    api.get('/screen-protectors')
      .then(({ data }) => setRows(data))
      .catch(failure => setError(failure.response?.data?.error || 'Não foi possível carregar as películas compatíveis.'))
      .finally(() => setLoading(false))
  }, [])

  const normalizedQuery = normalizeSearch(query)
  const filteredRows = useMemo(() => rows.filter(row => {
    const groupMatchesBrand = brand === 'Todos' || row.brand === brand || row.models.some(model => modelBrand(model) === brand)
    if (!groupMatchesBrand) return false
    if (!normalizedQuery) return true
    if (normalizeSearch(row.name).includes(normalizedQuery)) return true
    return row.models.some(model => normalizeSearch(model).includes(normalizedQuery))
  }), [rows, brand, normalizedQuery])

  const knownModels = useMemo(() => [...new Set(rows.flatMap(row => row.models))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [rows])
  const uniqueModelCount = knownModels.length
  const visibleQuery = query.trim()
  const isModelMatch = (model: string) => Boolean(normalizedQuery && normalizeSearch(model).includes(normalizedQuery))

  function saveGroup(saved: ScreenProtectorGroup) {
    setRows(current => {
      const exists = current.some(group => group.id === saved.id)
      return exists ? current.map(group => group.id === saved.id ? saved : group) : [...current, saved]
    })
    setEditing(undefined)
  }

  async function deleteGroup() {
    if (!deleting || deleteBusy) return
    setDeleteBusy(true)
    setError('')
    try {
      await api.delete(`/screen-protectors/${deleting.id}`)
      setRows(current => current.filter(group => group.id !== deleting.id))
      setDeleting(null)
    } catch (failure: any) {
      setError(failure.response?.data?.error || 'Não foi possível excluir o grupo de película.')
      setDeleting(null)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="csp-page">
      <header className="csp-header">
        <div className="csp-heading">
          <div className="csp-header-row">
            <div className="csp-header-icon"><Shield size={20} /></div>
            <div>
              <h2 className="csp-header-title">Películas Compatíveis</h2>
              <p className="csp-header-subtitle">Encontre rapidamente películas compatíveis entre diferentes aparelhos.</p>
            </div>
          </div>
          {isAdmin && (
            <button type="button" className="btn-primary csp-add-button" onClick={() => setEditing(null)}>
              <Plus size={16} /> Adicionar Película
            </button>
          )}
        </div>
      </header>

      {error && <div className="csp-page-error" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label="Fechar"><X size={15} /></button></div>}

      <section className="csp-section">
        <CompatibilitySearch value={query} onChange={setQuery} />
        <BrandFilter brands={BRANDS} activeBrand={brand} onSelect={setBrand} />
        <StatsCards groupCount={rows.length} modelCount={uniqueModelCount} brandCount={BRANDS.length - 1} />
      </section>

      {visibleQuery && filteredRows.length > 0 && (
        <div className="csp-results-summary" role="status">
          <span>Resultados para <strong>“{visibleQuery}”</strong></span>
          <span>{filteredRows.length} {filteredRows.length === 1 ? 'grupo compatível encontrado' : 'grupos compatíveis encontrados'}</span>
        </div>
      )}

      {loading ? (
        <div className="csp-loading">Carregando películas compatíveis...</div>
      ) : (
        <section className="csp-results-grid">
          {filteredRows.map(row => (
            <CompatibilityCard
              key={row.id}
              groupName={row.name}
              models={row.models}
              isModelMatch={isModelMatch}
              canManage={isAdmin}
              onEdit={() => setEditing(row)}
              onDelete={() => setDeleting(row)}
            />
          ))}
        </section>
      )}

      {!loading && filteredRows.length === 0 && (
        <div className="csp-empty" role="status">
          <span className="csp-empty-icon"><SearchX size={24} /></span>
          <h3>Nenhuma película compatível encontrada</h3>
          <p>Tente pesquisar outro modelo ou verifique a escrita do aparelho.</p>
          <button type="button" className="csp-empty-action" onClick={() => { setQuery(''); setBrand('Todos') }}>Limpar pesquisa</button>
        </div>
      )}

      {editing !== undefined && (
        <ScreenProtectorModal
          group={editing}
          knownModels={knownModels}
          onClose={() => setEditing(undefined)}
          onSaved={saveGroup}
        />
      )}

      {deleting && (
        <ModalFrame
          busy={deleteBusy}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#262626]/70 p-3"
          onClick={() => setDeleting(null)}
          aria-label="Confirmar exclusão do grupo"
        >
          <div className="modal-panel csp-confirm-modal" onClick={event => event.stopPropagation()}>
            <div className="csp-modal-header">
              <div>
                <p className="csp-modal-eyebrow">Confirmação</p>
                <h3>Excluir grupo de película?</h3>
              </div>
              <button type="button" className="btn-ghost !p-2" onClick={() => setDeleting(null)} aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="csp-modal-body">
              <p>Esta ação removerá o grupo <strong>{deleting.name}</strong> e suas compatibilidades.</p>
            </div>
            <div className="csp-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancelar</button>
              <button type="button" className="btn-danger" onClick={deleteGroup} disabled={deleteBusy}>{deleteBusy ? 'Excluindo...' : 'Excluir'}</button>
            </div>
          </div>
        </ModalFrame>
      )}
    </div>
  )
}
