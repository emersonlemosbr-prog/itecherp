import React, { useEffect, useState } from 'react'
import { useSettings } from '../../context/SettingsContext'

export function usePagination(rows = []) {
  const { settings } = useSettings()
  const [page, setPage] = useState(1)

  const list = Array.isArray(rows) ? rows : []
  const parsedSize = Number(settings?.system?.page_size)
  const size = Number.isInteger(parsedSize) && parsedSize > 0 ? parsedSize : 20
  const pages = Math.max(1, Math.ceil(list.length / size))
  const currentPage = Math.min(Math.max(1, page), pages)

  useEffect(() => {
    setPage(1)
  }, [list.length, size])

  const startIndex = (currentPage - 1) * size
  const paginatedRows = list.slice(startIndex, startIndex + size)

  const controls = (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button
        type="button"
        className="btn-secondary"
        disabled={currentPage <= 1}
        onClick={() => setPage(p => Math.max(1, p - 1))}
      >
        Anterior
      </button>
      <span>
        Página {currentPage} de {pages}
      </span>
      <button
        type="button"
        className="btn-secondary"
        disabled={currentPage >= pages}
        onClick={() => setPage(p => Math.min(pages, p + 1))}
      >
        Próxima
      </button>
    </div>
  )

  return {
    rows: paginatedRows,
    page: currentPage,
    pages,
    controls,
  }
}
