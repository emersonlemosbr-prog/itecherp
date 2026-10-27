import React, { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import api from '../../api/client'
import ModalFrame from '../UI/ModalFrame'

export type ScreenProtectorGroup = {
  id: number
  name: string
  brand: string
  models: string[]
  created_at?: string
  updated_at?: string
}

const BRANDS = ['Samsung', 'Motorola', 'Xiaomi', 'POCO', 'Apple', 'Realme', 'LG', 'Nokia', 'Itel', 'Outra']

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
}

type Props = {
  group?: ScreenProtectorGroup | null
  knownModels: string[]
  onClose: () => void
  onSaved: (group: ScreenProtectorGroup) => void
}

export default function ScreenProtectorModal({ group, knownModels, onClose, onSaved }: Props) {
  const [name, setName] = useState(group?.name || '')
  const [brand, setBrand] = useState(group?.brand || 'Samsung')
  const [models, setModels] = useState<string[]>(group?.models || [])
  const [modelInput, setModelInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const suggestions = useMemo(() => {
    const query = normalized(modelInput.trim())
    if (!query) return []
    const selected = new Set(models.map(normalized))
    return knownModels
      .filter(model => normalized(model).includes(query) && !selected.has(normalized(model)))
      .slice(0, 8)
  }, [knownModels, modelInput, models])

  function addModel(rawValue = modelInput) {
    const value = rawValue.trim().replace(/\s+/g, ' ')
    if (!value) return
    if (!models.some(model => normalized(model) === normalized(value))) {
      setModels(current => [...current, value])
    }
    setModelInput('')
  }

  function removeModel(model: string) {
    setModels(current => current.filter(item => item !== model))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    if (modelInput.trim()) {
      setError('Pressione Enter para adicionar o modelo digitado antes de salvar.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = { name: name.trim(), brand, models }
      const response = group
        ? await api.put(`/screen-protectors/${group.id}`, payload)
        : await api.post('/screen-protectors', payload)
      onSaved(response.data)
    } catch (failure: any) {
      setError(failure.response?.data?.error || 'Não foi possível salvar o grupo de película.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalFrame
      busy={saving}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#262626]/70 p-3"
      onClick={onClose}
      aria-label={group ? 'Editar grupo de película' : 'Adicionar grupo de película'}
    >
      <form className="modal-panel csp-form-modal" onSubmit={submit} onClick={event => event.stopPropagation()}>
        <div className="csp-modal-header">
          <div>
            <p className="csp-modal-eyebrow">{group ? 'Editar cadastro' : 'Novo cadastro'}</p>
            <h3>{group ? 'Editar película' : 'Adicionar película'}</h3>
          </div>
          <button type="button" className="btn-ghost !p-2" onClick={onClose} disabled={saving} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="csp-modal-body">
          {error && <p className="csp-form-error" role="alert">{error}</p>}

          <div>
            <label className="label" htmlFor="screen-protector-name">Película / Grupo</label>
            <input
              id="screen-protector-name"
              className="input"
              required
              maxLength={300}
              autoFocus
              placeholder="Ex.: Samsung A24 / A25 / A34 / M34"
              value={name}
              onChange={event => setName(event.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="screen-protector-brand">Marca</label>
            <select id="screen-protector-brand" className="input" value={brand} onChange={event => setBrand(event.target.value)}>
              {BRANDS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="screen-protector-model">Modelos compatíveis</label>
            <div className="csp-model-editor">
              <div className="csp-editor-chips">
                {models.map(model => (
                  <span className="csp-editor-chip" key={model}>
                    {model}
                    <button type="button" onClick={() => removeModel(model)} aria-label={`Remover ${model}`}><X size={13} /></button>
                  </span>
                ))}
              </div>
              <input
                id="screen-protector-model"
                value={modelInput}
                maxLength={150}
                placeholder="Digite um modelo e pressione Enter"
                onChange={event => setModelInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ',') {
                    event.preventDefault()
                    addModel()
                  }
                }}
              />
              {suggestions.length > 0 && (
                <div className="csp-suggestions" role="listbox">
                  {suggestions.map(model => (
                    <button type="button" key={model} onClick={() => addModel(model)}>{model}</button>
                  ))}
                </div>
              )}
            </div>
            <p className="csp-field-help">Você também pode cadastrar um modelo novo digitando o nome e pressionando Enter.</p>
          </div>
        </div>

        <div className="csp-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar película'}</button>
        </div>
      </form>
    </ModalFrame>
  )
}

