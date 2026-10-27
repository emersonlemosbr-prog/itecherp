import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

let locks = 0
let previousOverflow = ''
export function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return
    if (locks++ === 0) {
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    return () => {
      if (--locks === 0) document.body.style.overflow = previousOverflow
    }
  }, [active])
}

// Preserve each screen's content; keep overlays outside transformed/backdrop-filter cards.
export default function ModalFrame({ children, className = '', onClick, busy = false, ...props }) {
  const ref = useRef(null)
  const [viewport, setViewport] = useState(null)
  useBodyScrollLock(true)

  useEffect(() => {
    const visual = window.visualViewport
    const update = () => {
      // Pinch zoom must remain available; resize for the keyboard, not user zoom.
      if (!visual || visual.scale !== 1) return
      setViewport({ height: visual.height, top: visual.offsetTop })
      const focused = document.activeElement
      if (ref.current?.contains(focused) && focused.matches('input, textarea, select')) {
        requestAnimationFrame(() => focused.scrollIntoView({ block: 'nearest' }))
      }
    }
    update()
    visual?.addEventListener('resize', update)
    visual?.addEventListener('scroll', update)
    return () => {
      visual?.removeEventListener('resize', update)
      visual?.removeEventListener('scroll', update)
    }
  }, [])

  useEffect(() => {
    const previous = document.activeElement
    ref.current?.focus({ preventScroll: true })
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])

  function handleKeyDown(event) {
    if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClick?.(event) }
    if (event.key !== 'Tab') return
    const nodes = Array.from(ref.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter((node) => node.getClientRects().length)
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (!first) { event.preventDefault(); return }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus() }
  }

  return createPortal(
    <div {...props} ref={ref} role="dialog" aria-modal="true" aria-busy={busy} tabIndex={-1}
      className={`app-modal ${className}`} style={viewport ? { '--modal-height': `${viewport.height}px`, '--modal-top': `${viewport.top}px` } : undefined}
      onKeyDown={handleKeyDown}
      onClickCapture={(event) => { if (busy) { event.preventDefault(); event.stopPropagation() } }}
      onClick={(event) => { if (!busy && event.target === event.currentTarget) onClick?.(event) }}>
      {children}
    </div>, document.body
  )
}
