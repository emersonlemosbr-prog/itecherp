import { useSettings, calculatePrice } from '../context/SettingsContext'
import React, { useMemo, useState, useEffect, useRef } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { formatCurrency } from '../utils/format'
import api from '../api/client'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)


export default function PagbankCalculator() {
  const { settings: { finance } } = useSettings()
  const rates = useMemo(() => finance.rates.map((rate, index) => ({ installment: index + 1, rate: rate / 100 })), [finance.rates])
  const [value, setValue] = useState(100)
  const isLoadedRef = useRef(false)

  // Carrega dados ao montar o componente
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await api.get('/calculators/pagbank')
        if (response.data?.value) {
          setValue(response.data.value)
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error)
      }
      isLoadedRef.current = true
    }
    loadData()
  }, [])

  // Salva dados quando o valor muda - SÓ APÓS CARREGAR (sem debounce)
  useEffect(() => {
    if (!isLoadedRef.current) return

    const saveData = async () => {
      try {
        console.log('Salvando pagbank:', { value: Number(value) })
        const response = await api.post('/calculators/pagbank', { value: Number(value) || 100 })
        console.log('✓ Dados salvos:', response.data)
      } catch (error) {
        console.error('✗ Erro ao salvar:', error)
      }
    }

    saveData()
  }, [value, finance])

  const rows = useMemo(() => {
    const amount = Number(value) || 0
    return rates.map(({ installment, rate }) => ({
      installment,
      rate,
      total: amount * (1 + rate),
      installmentValue: (amount * (1 + rate)) / installment,
    }))
  }, [value, finance])

  const chartData = useMemo(() => ({
    labels: rows.map((row) => `${row.installment}x`),
    datasets: [
      {
        label: 'Total no Cartão',
        data: rows.map((row) => Number(row.total.toFixed(2))),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.2)',
        tension: 0.3,
        fill: true,
      },
      {
        label: 'Valor da Parcela',
        data: rows.map((row) => Number(row.installmentValue.toFixed(2))),
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22, 163, 74, 0.2)',
        tension: 0.3,
        fill: true,
      },
    ],
  }), [rows])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' },
      tooltip: { callbacks: { label: (context) => formatCurrency(context.parsed.y) } },
    },
    scales: {
      y: {
        ticks: {
          callback: (value) => formatCurrency(value),
        },
      },
    },
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 className="font-display font-bold text-xl">Taxa de Juros PagBank</h2>
        <p className="text-sm text-slate-400">Simule parcelas com juros de Visa/Master.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,360px)_1fr]">
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-100 p-3 text-sm text-slate-600 dark:bg-[#232323] dark:text-slate-300">
            <span>Visa/Master</span>
            <span className="font-semibold">Simulação de parcelamento</span>
          </div>

          <div className="space-y-2">
            <label className="label">Digite o valor</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input w-full"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-[#4A4A4A] dark:bg-[#232323] dark:text-slate-300">
            Valor base: <span className="font-semibold">{formatCurrency(Number(value) || 0)}</span>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">Parcelas</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">1 a 12x</p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600 dark:bg-[#232323] dark:text-slate-300">
              Juros baseados em PagBank
            </div>
          </div>
          <div className="h-72">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabela com rolagem horizontal"><table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-[#4A4A4A]">
              <th className="px-4 py-3">Parcela</th>
              <th className="px-4 py-3">Juros (%)</th>
              <th className="px-4 py-3">Valor Final</th>
              <th className="px-4 py-3">Valor por Parcela</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ installment, rate, total, installmentValue }) => (
              <tr key={installment} className="border-b border-slate-100 last:border-0 dark:border-[#4A4A4A]">
                <td className="px-4 py-3 font-medium">{installment}x</td>
                <td className="px-4 py-3 text-slate-500">{rate.toFixed(4)}</td>
                <td className="px-4 py-3">{formatCurrency(total)}</td>
                <td className="px-4 py-3">{formatCurrency(installmentValue)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  )
}
