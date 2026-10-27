import React from 'react'
import { useSettings } from '../../context/SettingsContext'
export default function DocumentHeader({ number }) {
  const { settings: { store: s, documents: d } } = useSettings()
  return <header className="service-order-print-header">
    {d.logo && s.logo && <div className="service-order-print-brand"><img src={s.logo} alt={s.name} className="service-order-print-logo" /></div>}
    <div className="service-order-print-company">
      {d.name && <h1>{s.name}</h1>}{d.cnpj && s.cnpj && <p className="company-cnpj">CNPJ: {s.cnpj}</p>}
      {d.address && <><p>{[s.street, s.number, s.complement].filter(Boolean).join(', ')}</p><p>{[s.district, `${s.city}/${s.state}`, s.zip].filter(Boolean).join(' - ')}</p></>}
      {d.phone && <p className="company-phones">{[s.phone, s.secondary_phone].filter(Boolean).join(' | ')}</p>}
      {d.whatsapp && s.whatsapp && <p>WhatsApp: {s.whatsapp}</p>}{d.email && s.email && <p>{s.email}</p>}
    </div>{d.order_number && number && <div className="service-order-print-order-number"><p className="service-order-print-order-label">Nº do Documento</p><p className="service-order-print-order-value">{number}</p></div>}
  </header>
}
