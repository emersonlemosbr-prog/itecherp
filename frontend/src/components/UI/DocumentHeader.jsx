import React from 'react'
import { useSettings } from '../../context/SettingsContext'

function formatPhoneDisplay(val) {
  if (!val) return ''
  const digits = String(val).replace(/\D/g, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return val
}

export default function DocumentHeader({ number, orderNumber, emittedAt }) {
  const { settings: { store: s, documents: d } } = useSettings()

  const docNumber = orderNumber || number

  // Formatação de telefones
  const p1 = formatPhoneDisplay(s?.phone)
  const p2 = formatPhoneDisplay(s?.secondary_phone)
  const phones = [p1, p2].filter(Boolean)
  const phoneText = phones.length > 1 && phones[0] !== phones[1] ? phones.join(' | ') : (phones[0] || '')

  // Endereço
  const streetLine = [s?.street, s?.number, s?.complement].filter(Boolean).join(', ')
  const cityLine = [s?.district, (s?.city && s?.state ? `${s.city}/${s.state}` : (s?.city || s?.state)), s?.zip].filter(Boolean).join(' - ')

  return (
    <header className="service-order-print-header">
      {d.logo && s.logo && (
        <div className="service-order-print-brand">
          <img src={s.logo} alt={s.name} className="service-order-print-logo" />
        </div>
      )}

      <div className="service-order-print-company">
        {d.name && <h1>{s.name}</h1>}
        {d.cnpj && s.cnpj && <p className="company-cnpj">CNPJ: {s.cnpj}</p>}
        {d.address && (
          <>
            {streetLine && <p>{streetLine}</p>}
            {cityLine && <p>{cityLine}</p>}
          </>
        )}
        {d.phone && phoneText && <p className="company-phones">{phoneText}</p>}
        {d.whatsapp && s.whatsapp && <p>WhatsApp: {formatPhoneDisplay(s.whatsapp)}</p>}
        {d.email && s.email && <p>{s.email}</p>}
      </div>

      {docNumber && (
        <div className="service-order-print-order-number">
          <p className="service-order-print-order-label">Nº do Documento</p>
          <p className="service-order-print-order-value">{docNumber}</p>
        </div>
      )}
    </header>
  )
}
