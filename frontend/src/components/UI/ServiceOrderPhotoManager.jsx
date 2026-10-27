import ModalFrame from './ModalFrame'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ImagePlus, Trash2, X } from 'lucide-react'

const PHOTO_TYPES = [
  'Sem classificação',
  'Frente',
  'Traseira',
  'Tela',
  'Lateral esquerda',
  'Lateral direita',
  'Parte superior',
  'Parte inferior',
  'Câmeras',
  'Conector',
  'Outro',
]

export default function ServiceOrderPhotoManager({ value = [], onChange, maxPhotos = 8, disabled = false, existingPhotos = [], onDelete }) {
  const inputRef = useRef(null)
  const galleryRef = useRef(null)
  const previews = useRef(new Set())
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), [])
  const [photos, setPhotos] = useState(value)

  useEffect(() => {
    setPhotos(value)
  }, [value])

  const remaining = useMemo(() => maxPhotos - photos.length - existingPhotos.length, [photos.length, existingPhotos.length, maxPhotos])

  const addFiles = (fileList) => {
    const accepted = Array.from(fileList || []).filter((file) => file && file.type?.startsWith('image/'))
    if (!accepted.length) return

    const nextPhotos = []
    for (const file of accepted) {
      if (nextPhotos.length >= remaining) break
      const previewUrl = URL.createObjectURL(file)
      previews.current.add(previewUrl)
      nextPhotos.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file,
        name: file.name || 'foto',
        previewUrl,
        photoType: 'Sem classificação',
        description: '',
      })
    }

    const merged = [...photos, ...nextPhotos].slice(0, maxPhotos)
    setPhotos(merged)
    onChange?.(merged)
  }

  const removePhoto = (photoId) => {
    const next = photos.filter((photo) => photo.id !== photoId)
    const removedPhoto = photos.find((photo) => photo.id === photoId)
    if (removedPhoto?.previewUrl) URL.revokeObjectURL(removedPhoto.previewUrl)
    setPhotos(next)
    onChange?.(next)
  }

  const updatePhoto = (photoId, field, value) => {
    const next = photos.map((photo) => photo.id === photoId ? { ...photo, [field]: value } : photo)
    setPhotos(next)
    onChange?.(next)
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">📷 Registro fotográfico</p>
          <h3 className="font-display font-bold text-xl">Fotos de entrada do aparelho</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-200">
          Fotos: {photos.length + existingPhotos.length}/{maxPhotos}
        </span>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-300">Registre o estado físico do aparelho antes de iniciar o serviço.</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || photos.length + existingPhotos.length >= maxPhotos}
        >
          <Camera size={16} /> Tirar foto
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => galleryRef.current?.click()}
          disabled={disabled || photos.length + existingPhotos.length >= maxPhotos}
        >
          <ImagePlus size={16} /> Adicionar foto
        </button>
      </div>

      <input ref={galleryRef} type="file" accept="image/*" multiple disabled={disabled} className="hidden" onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} />
      <input
        disabled={disabled}
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={(event) => {
          addFiles(event.target.files)
          event.target.value = ''
        }}
      />

      {photos.length + existingPhotos.length >= maxPhotos && (
        <p className="text-sm text-amber-600 dark:text-amber-400">Limite de {maxPhotos} fotos atingido.</p>
      )}

      {existingPhotos.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{existingPhotos.map((photo) => <div key={photo.id}><button type="button" onClick={() => photo.url && setSelectedPhoto(photo)} className="w-full">{photo.url ? <img src={photo.url} alt="Foto de entrada" className="aspect-square w-full rounded-xl object-cover" /> : <span>Foto antiga: migração pendente</span>}</button><button type="button" disabled={disabled} className="btn-secondary mt-1" onClick={() => onDelete?.(photo.id)}><Trash2 size={14} /> Excluir</button></div>)}</div>}
      {selectedPhoto && <ModalFrame role="dialog" aria-modal="true" aria-label="Foto de entrada ampliada" className="photo-lightbox fixed inset-0 z-50 bg-black/80 p-5 flex items-center justify-center" onClick={() => setSelectedPhoto(null)}><button type="button" aria-label="Fechar foto" className="absolute right-5 top-5 text-white" onClick={() => setSelectedPhoto(null)}><X /></button><img src={selectedPhoto.url} alt="Foto ampliada" className="max-h-[85vh] max-w-full object-contain" /></ModalFrame>}
      {photos.length === 0 && existingPhotos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-[#171717] dark:text-slate-300">
          Nenhuma foto adicionada ainda.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {photos.map((photo) => (
            <div key={photo.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-[#171717]">
              <div className="relative aspect-square bg-slate-200 dark:bg-[#232323]">
                <button type="button" className="h-full w-full" onClick={() => setSelectedPhoto({ url: photo.previewUrl })}><img src={photo.previewUrl} alt={photo.name} className="h-full w-full object-cover" /></button>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label="Remover foto"
                  onClick={() => removePhoto(photo.id)}
                  className="absolute right-2 top-2 min-h-11 min-w-11 flex items-center justify-center rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="space-y-2 p-3">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-300">
                  Tipo da foto
                  <select disabled={disabled}
                    className="input mt-1 text-sm"
                    value={photo.photoType}
                    onChange={(event) => updatePhoto(photo.id, 'photoType', event.target.value)}
                  >
                    {PHOTO_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-medium text-slate-500 dark:text-slate-300">
                  Observação
                  <textarea disabled={disabled}
                    rows={2}
                    className="input mt-1 resize-none text-sm"
                    placeholder="Ex.: trinca no canto superior esquerdo"
                    value={photo.description}
                    onChange={(event) => updatePhoto(photo.id, 'description', event.target.value)}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
