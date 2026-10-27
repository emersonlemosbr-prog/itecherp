import React from 'react'
import ModalFrame from './ModalFrame'

export default function PermanentDeleteDialog({ subject, description = 'Esta ação não poderá ser desfeita.', busy = false, onCancel, onConfirm }) {
  return <ModalFrame busy={busy} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" onClick={() => { if (!busy) onCancel() }}>
    <div role="alertdialog" aria-modal="true" className="modal-panel w-full max-w-md p-5" onClick={event => event.stopPropagation()}>
      <h3 className="font-display text-lg font-bold">Excluir permanentemente este {subject}?</h3>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">{description}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>Cancelar</button>
        <button type="button" className="btn-primary !bg-rose-600 hover:!bg-rose-700" disabled={busy} onClick={onConfirm}>{busy ? 'Excluindo...' : 'Excluir permanentemente'}</button>
      </div>
    </div>
  </ModalFrame>
}
