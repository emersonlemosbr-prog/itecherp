import React, { useEffect, useState } from 'react'
import { useSettings } from '../../context/SettingsContext'
export function usePagination(rows) {
  const { settings } = useSettings()
  const [page, setPage] = useState(1)
  const size = settings.system.page_size
  const pages = Math.max(1, Math.ceil(rows.length / size))
  useEffect(() => setPage(1), [rows, size])
  return { rows: rows.slice((page - 1) * size, page * size), controls: <div className="flex flex-wrap items-center gap-3 text-sm"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {Math.min(page, pages)} de {pages}</span><button className="btn-secondary" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Próxima</button></div> }
}
