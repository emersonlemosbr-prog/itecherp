import React from 'react'

export default function StatCard({ label, value, icon: Icon, tone = 'brand', sub }) {
  const tones = {
    brand: 'bg-[rgba(79,125,255,0.16)] text-[#87a6ff] border border-[rgba(79,125,255,0.3)]',
    green: 'bg-[rgba(50,213,131,0.16)] text-[#78e7b5] border border-[rgba(50,213,131,0.3)]',
    yellow: 'bg-[rgba(251,191,36,0.16)] text-[#ffd86c] border border-[rgba(251,191,36,0.3)]',
    red: 'bg-[rgba(239,68,68,0.16)] text-[#fda4a4] border border-[rgba(239,68,68,0.3)]',
    slate: 'bg-[rgba(161,161,170,0.16)] text-[#d4d4d8] border border-[rgba(161,161,170,0.3)]',
    cyan: 'bg-[rgba(34,211,238,0.16)] text-[#67e8f9] border border-[rgba(34,211,238,0.3)]',
    pink: 'bg-[rgba(236,72,153,0.16)] text-[#f9a8d4] border border-[rgba(236,72,153,0.3)]',
    purple: 'bg-[rgba(139,92,246,0.16)] text-[#c4b5fd] border border-[rgba(139,92,246,0.3)]',
  }

  return (
    <div className="card p-[18px] flex items-start gap-3.5">
      <div className={`h-11 w-11 rounded-[14px] flex items-center justify-center shrink-0 ${tones[tone]}`}>
        <Icon size={21} />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-zinc-300 tracking-wide truncate">{label}</p>
        <p className="text-[30px] leading-none font-extrabold mt-1 tracking-tight truncate">{value}</p>
        {sub && <p className="text-[12px] text-zinc-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}
