import React, { useEffect, useMemo, useRef, useState } from 'react'
import MobileRecordCard from '../components/MobileRecordCard'
import {
  ShoppingBag, Plus, Search, Trash2, PackagePlus, Smartphone, Boxes,
  Calendar, DollarSign, CheckCircle2, AlertCircle, X, Eye, Pencil, Ban
} from 'lucide-react'
import api from '../api/client'
const formatMoney = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const todayDate = () => new Date().toISOString().slice(0, 10)

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'debit_card', label: 'Cartão de Débito' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'transfer', label: 'Transferência Bancária' },
]

function addDaysIso(dateStr, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

function generateInstallments(financedAmount, count, intervalDays, firstDueDate) {
  const n = Math.max(1, parseInt(count, 10) || 1)
  const totalCents = Math.max(0, Math.round(Number(financedAmount || 0) * 100))
  const baseCents = Math.floor(totalCents / n)
  const remainder = totalCents - baseCents * n

  return Array.from({ length: n }, (_, idx) => {
    const cents = idx === n - 1 ? baseCents + remainder : baseCents
    return {
      installment_number: idx + 1,
      amount: (cents / 100).toFixed(2),
      due_date: addDaysIso(firstDueDate, idx * (parseInt(intervalDays, 10) || 30)),
    }
  })
}

export default function Purchases() {
  const [view, setView] = useState('list') // 'list' | 'new'
  const [purchases, setPurchases] = useState([])
  const [summary, setSummary] = useState({ total_count: 0, total_amount: 0, cash_count: 0, installments_count: 0 })
  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [customers, setCustomers] = useState([])

  // Filtros
  const [q, setQ] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterCondition, setFilterCondition] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Modal detalhes
  const [detailModal, setDetailModal] = useState(null)

  // Modal novo fornecedor inline
  const [newSupplierOpen, setNewSupplierOpen] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierContact, setNewSupplierContact] = useState('')

  // Formulário Nova Compra
  const [originType, setOriginType] = useState('supplier')
  const [supplierId, setSupplierId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(todayDate())
  const [discount, setDiscount] = useState('0')
  const [freight, setFreight] = useState('0')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([])

  // Condição de pagamento
  const [paymentCondition, setPaymentCondition] = useState('cash')
  const [paymentMethod, setPaymentMethod] = useState('pix')
  const [paymentDate, setPaymentDate] = useState(todayDate())
  const [downPayment, setDownPayment] = useState('0')
  const [installmentsCount, setInstallmentsCount] = useState(2)
  const [intervalDays, setIntervalDays] = useState(30)
  const [firstDueDate, setFirstDueDate] = useState(addDaysIso(todayDate(), 30))
  const [installments, setInstallments] = useState([])

  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [editingPurchaseId, setEditingPurchaseId] = useState(null)
  const [editingOriginalTotal, setEditingOriginalTotal] = useState(0)
  const [editingAlreadyPaid, setEditingAlreadyPaid] = useState(0)
  const [cancelModal, setCancelModal] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(() => `pur-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

  // Item builder states
  const [itemTab, setItemTab] = useState('existing_accessory')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [itemQty, setItemQty] = useState(1)
  const [itemUnitCost, setItemUnitCost] = useState('')
  const [newAccName, setNewAccName] = useState('')
  const [newAccCode, setNewAccCode] = useState('')
  const [newAccCategory, setNewAccCategory] = useState('')
  const [newAccSalePrice, setNewAccSalePrice] = useState('')
  const [devBrand, setDevBrand] = useState('Apple')
  const [devModel, setDevModel] = useState('')
  const [devStorage, setDevStorage] = useState('')
  const [devColor, setDevColor] = useState('')
  const [devCondition, setDevCondition] = useState('Seminovo')
  const [devImei, setDevImei] = useState('')
  const [devSalePrice, setDevSalePrice] = useState('')

  async function loadDependencies() {
    try {
      const [supRes, prodRes, catRes, custRes] = await Promise.all([
        api.get('/inventory/suppliers', { params: { active_only: 'true' } }),
        api.get('/inventory/products', { params: { active_only: 'true' } }),
        api.get('/inventory/categories'),
        api.get('/customers', { params: { limit: 200 } }),
      ])
      setSuppliers(supRes.data || [])
      setProducts(prodRes.data || [])
      setCategories(catRes.data || [])
      setCustomers(Array.isArray(custRes.data) ? custRes.data : (custRes.data?.items || []))
    } catch (_) {}
  }

  async function loadPurchases() {
    setLoading(true)
    try {
      const { data } = await api.get('/purchases', {
        params: {
          q: q || undefined,
          supplier_id: filterSupplier || undefined,
          payment_condition: filterCondition || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        },
      })
      setPurchases(data?.items || [])
      setSummary(data?.summary || { total_count: 0, total_amount: 0, cash_count: 0, installments_count: 0 })
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao carregar compras.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDependencies()
    loadPurchases()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { loadPurchases() }, 250)
    return () => clearTimeout(t)
  }, [q, filterSupplier, filterCondition, startDate, endDate])

  const subtotal = useMemo(() => items.reduce((acc, it) => acc + Number(it.quantity) * Number(it.unit_cost), 0), [items])
  const totalAmount = useMemo(() => Math.max(0, subtotal - Number(discount || 0) + Number(freight || 0)), [subtotal, discount, freight])
  const financedAmount = useMemo(() => {
    if (paymentCondition !== 'installments') return 0
    return Math.max(0, totalAmount - Number(downPayment || 0))
  }, [paymentCondition, totalAmount, downPayment])

  useEffect(() => {
    if (paymentCondition === 'installments') {
      setInstallments(generateInstallments(financedAmount, installmentsCount, intervalDays, firstDueDate))
    } else {
      setInstallments([])
    }
  }, [paymentCondition, financedAmount, installmentsCount, intervalDays, firstDueDate])

  function handleSelectExistingProduct(id) {
    setSelectedProductId(id)
    const prod = products.find(p => String(p.id) === String(id))
    if (prod) {
      setItemUnitCost(String(prod.cost_price || 0))
    }
  }

  function addItemToPurchase() {
    setError('')
    const cost = Number(itemUnitCost || 0)
    if (cost < 0) return setError('Custo unitário inválido.')

    if (itemTab === 'existing_accessory') {
      const prod = products.find(p => String(p.id) === String(selectedProductId))
      if (!prod) return setError('Selecione um acessório cadastrado.')
      const qty = Math.max(1, parseInt(itemQty, 10) || 1)
      setItems(prev => [...prev, {
        uid: Date.now() + Math.random(),
        item_type: 'existing_accessory',
        product_id: prod.id,
        description: prod.name,
        identifier: prod.code,
        current_stock: prod.quantity ?? 0,
        quantity: qty,
        unit_cost: cost,
      }])
      setSelectedProductId('')
      setItemQty(1)
      setItemUnitCost('')
    } else if (itemTab === 'new_accessory') {
      if (!newAccName.trim()) return setError('Informe o nome do novo acessório.')
      const qty = Math.max(1, parseInt(itemQty, 10) || 1)
      setItems(prev => [...prev, {
        uid: Date.now() + Math.random(),
        item_type: 'new_accessory',
        description: newAccName.trim(),
        identifier: newAccCode.trim().toUpperCase(),
        category_name: newAccCategory.trim(),
        quantity: qty,
        unit_cost: cost,
        sale_price: Number(newAccSalePrice || 0),
      }])
      setNewAccName('')
      setNewAccCode('')
      setNewAccSalePrice('')
      setItemQty(1)
      setItemUnitCost('')
    } else {
      if (!devModel.trim()) return setError('Informe o modelo do aparelho.')
      setItems(prev => [...prev, {
        uid: Date.now() + Math.random(),
        item_type: 'device',
        description: `${devBrand} ${devModel}`.trim(),
        brand: devBrand,
        model: devModel.trim(),
        storage: devStorage.trim(),
        color: devColor.trim(),
        condition: devCondition,
        imei1: devImei.trim(),
        identifier: devImei.trim(),
        quantity: 1,
        unit_cost: cost,
        sale_price: Number(devSalePrice || 0),
      }])
      setDevModel('')
      setDevStorage('')
      setDevColor('')
      setDevImei('')
      setDevSalePrice('')
      setItemUnitCost('')
    }
  }

  async function handleCreateSupplierInline(e) {
    e.preventDefault()
    if (!newSupplierName.trim()) return
    try {
      const { data } = await api.post('/inventory/suppliers', {
        name: newSupplierName.trim(),
        contact_info: newSupplierContact.trim(),
      })
      setSuppliers(prev => [...prev, data])
      setSupplierId(String(data.id))
      setNewSupplierName('')
      setNewSupplierContact('')
      setNewSupplierOpen(false)
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao cadastrar fornecedor.')
    }
  }

  async function handleConfirmPurchase(e) {
    e.preventDefault()
    if (submittingRef.current) return
    setError('')
    setSuccess('')
    if (items.length === 0) return setError('Adicione pelo menos um item na compra.')

    if (editingPurchaseId && editingAlreadyPaid > 0) {
      const diff = Number((totalAmount - editingAlreadyPaid).toFixed(2))
      if (diff > 0) {
        if (!window.confirm(`Esta compra já possui ${formatMoney(editingAlreadyPaid)} pago(s). Será gerada uma conta a pagar pela diferença de ${formatMoney(diff)}. Deseja confirmar?`)) {
          return
        }
      } else if (diff < 0) {
        if (!window.confirm(`O novo total (${formatMoney(totalAmount)}) é menor que o valor já pago (${formatMoney(editingAlreadyPaid)}). Será registrado um crédito a compensar de ${formatMoney(Math.abs(diff))} sem excluir pagamentos históricos. Deseja confirmar?`)) {
          return
        }
      }
    }

    submittingRef.current = true
    setSubmitting(true)
    try {
      const payload = {
        idempotency_key: idempotencyKey,
        origin_type: originType,
        supplier_id: originType === 'supplier' ? Number(supplierId) : null,
        customer_id: originType === 'customer_trade' ? Number(customerId) : null,
        invoice_number: invoiceNumber.trim() || null,
        purchase_date: purchaseDate,
        discount: Number(discount || 0),
        freight: Number(freight || 0),
        notes: notes.trim() || null,
        payment_condition: paymentCondition,
        payment_method: paymentMethod,
        payment_date: paymentDate,
        down_payment: paymentCondition === 'installments' ? Number(downPayment || 0) : totalAmount,
        installments: paymentCondition === 'installments'
          ? installments.map(i => ({ amount: Number(i.amount), due_date: i.due_date }))
          : [],
        items,
      }
      if (editingPurchaseId) {
        await api.put(`/purchases/${editingPurchaseId}`, payload)
        setSuccess('Compra atualizada com sucesso!')
      } else {
        const { data } = await api.post('/purchases', payload)
        setSuccess(`Compra ${data?.purchase?.purchase_number || ''} confirmada com sucesso!`)
      }
      setEditingPurchaseId(null)
      setItems([])
      setInvoiceNumber('')
      setNotes('')
      setDiscount('0')
      setFreight('0')
      setDownPayment('0')
      setIdempotencyKey(`pur-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      setView('list')
      loadPurchases()
      loadDependencies()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao confirmar compra.')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  async function openEditPurchase(purchaseId) {
    setError('')
    try {
      const { data } = await api.get(`/purchases/${purchaseId}`)
      setEditingPurchaseId(data.id)
      setEditingOriginalTotal(Number(data.total_amount || 0))
      const paidInsts = (data.installments || []).reduce((acc, i) => acc + Number(i.paid_amount || 0), 0)
      const alreadyPaid = data.payment_condition === 'cash'
        ? Number(data.total_amount || 0)
        : (Number(data.down_payment || 0) + paidInsts)
      setEditingAlreadyPaid(alreadyPaid)
      setOriginType(data.origin_type || 'supplier')
      setSupplierId(data.supplier_id ? String(data.supplier_id) : '')
      setCustomerId(data.customer_id ? String(data.customer_id) : '')
      setInvoiceNumber(data.invoice_number || '')
      setPurchaseDate(String(data.purchase_date).slice(0, 10))
      setDiscount(String(data.discount || 0))
      setFreight(String(data.freight || 0))
      setNotes(data.notes || '')
      setPaymentCondition(data.payment_condition || 'cash')
      setPaymentMethod(data.payment_method || 'pix')
      setDownPayment(String(data.down_payment || 0))
      setItems((data.items || []).map(it => ({
        uid: it.id || Math.random(),
        item_type: it.item_type,
        product_id: it.product_id,
        description: it.description,
        identifier: it.identifier,
        brand: it.brand,
        model: it.model,
        storage: it.storage,
        color: it.color,
        condition: it.condition,
        quantity: it.quantity,
        unit_cost: Number(it.unit_cost),
        sale_price: Number(it.sale_price || 0),
      })))
      if (data.installments && data.installments.length > 0) {
        setInstallmentsCount(data.installments.length)
        setInstallments(data.installments.map(i => ({
          installment_number: i.installment_number,
          amount: String(Number(i.amount).toFixed(2)),
          due_date: String(i.due_date).slice(0, 10),
        })))
      }
      setView('new')
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao carregar compra para edição.')
    }
  }

  async function handleConfirmCancel(e) {
    e.preventDefault()
    if (!cancelModal) return
    setError('')
    try {
      await api.post(`/purchases/${cancelModal.id}/cancel`, { reason: cancelReason })
      setSuccess(`Compra ${cancelModal.purchase_number} cancelada com sucesso.`)
      setCancelModal(null)
      setCancelReason('')
      loadPurchases()
      loadDependencies()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao cancelar compra.')
    }
  }

  async function openDetail(purchaseId) {
    try {
      const { data } = await api.get(`/purchases/${purchaseId}`)
      setDetailModal(data)
    } catch (_) {}
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShoppingBag className="text-[#FFBE0B]" size={22} />
            Compras
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Entradas de fornecedores e aquisições de aparelhos integradas ao Estoque, Financeiro e Contas a Pagar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {view === 'list' ? (
            <button
              type="button"
              onClick={() => {
                setError('')
                setSuccess('')
                setEditingPurchaseId(null)
                setEditingOriginalTotal(0)
                setEditingAlreadyPaid(0)
                setPaymentCondition('cash')
                setPaymentMethod('pix')
                setDownPayment('0')
                setInstallments([])
                setItems([])
                setView('new')
              }}
              className="btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
            >
              <Plus size={16} /> Nova compra
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setView('list')}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-white/10 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/5"
            >
              Voltar ao Histórico
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {view === 'list' ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card p-4">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-zinc-400">Compras no período</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{summary.total_count}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-zinc-400">Valor total comprado</p>
              <p className="text-xl font-bold text-[#FFBE0B] mt-1">{formatMoney(summary.total_amount)}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-zinc-400">Compras à vista</p>
              <p className="text-xl font-bold text-emerald-400 mt-1">{summary.cash_count}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-zinc-400">Compras a prazo</p>
              <p className="text-xl font-bold text-amber-400 mt-1">{summary.installments_count}</p>
            </div>
          </div>

          <div className="card p-3 grid grid-cols-1 md:grid-cols-5 gap-2.5 text-xs">
            <div className="relative md:col-span-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9 w-full"
                placeholder="Buscar nº compra, fornecedor ou NF..."
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
            <select className="input" value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}>
              <option value="">Todos os fornecedores</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="input" value={filterCondition} onChange={e => setFilterCondition(e.target.value)}>
              <option value="">Todas as condições</option>
              <option value="cash">À vista</option>
              <option value="installments">A prazo</option>
            </select>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:col-span-2 lg:col-span-1">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">📅 Data inicial</label>
                <input type="date" className="input w-full" value={startDate} onChange={e => setStartDate(e.target.value)} title="Data inicial" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">📅 Data final</label>
                <input type="date" className="input w-full" value={endDate} onChange={e => setEndDate(e.target.value)} title="Data final" />
              </div>
            </div>
          </div>

          <div className="md:hidden space-y-3">
            {loading ? (
              <div className="card p-6 text-center text-xs text-zinc-400">Carregando compras...</div>
            ) : purchases.length === 0 ? (
              <div className="card p-6 text-center text-xs text-zinc-400">Nenhuma compra registrada no período.</div>
            ) : purchases.map(p => (
              <MobileRecordCard
                key={p.id}
                title={p.purchase_number}
                subtitle={p.origin_type === 'customer_trade' ? `Cliente: ${p.customer_name}` : p.supplier_name}
                badge={
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    p.payment_condition === 'cash'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-amber-500/15 text-amber-400'
                  }`}>
                    {p.payment_condition === 'cash' ? 'À vista' : `A prazo (${p.installments_count}x)`}
                  </span>
                }
                fields={[
                  { label: 'Data', value: String(p.purchase_date).slice(0, 10) },
                  { label: 'Nota Fiscal', value: p.invoice_number || '-' },
                  { label: 'Valor Total', value: formatMoney(p.total_amount), highlight: true },
                  { label: 'Situação', value: p.status === 'canceled' ? 'Cancelada' : 'Confirmada' },
                ]}
                actions={
                  <>
                    <button
                      type="button"
                      onClick={() => openDetail(p.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 text-xs flex items-center gap-1"
                    >
                      <Eye size={14} /> Visualizar
                    </button>
                    {p.status !== 'canceled' && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditPurchase(p.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 text-xs flex items-center gap-1"
                        >
                          <Pencil size={14} /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => { setError(''); setCancelModal(p); setCancelReason('') }}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs flex items-center gap-1"
                        >
                          <Ban size={14} /> Cancelar
                        </button>
                      </>
                    )}
                  </>
                }
              />
            ))}
          </div>

          <div className="card overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-zinc-400 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Compra</th>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Fornecedor / Cliente</th>
                    <th className="px-4 py-3">NF</th>
                    <th className="px-4 py-3">Condição</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400">Carregando compras...</td></tr>
                  ) : purchases.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400">Nenhuma compra registrada no período.</td></tr>
                  ) : purchases.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{p.purchase_number}</td>
                      <td className="px-4 py-3 text-zinc-400">{String(p.purchase_date).slice(0, 10)}</td>
                      <td className="px-4 py-3">
                        <span className="text-slate-800 dark:text-zinc-200 font-medium">
                          {p.origin_type === 'customer_trade' ? `Cliente: ${p.customer_name}` : p.supplier_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{p.invoice_number || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          p.payment_condition === 'cash'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-amber-500/15 text-amber-400'
                        }`}>
                          {p.payment_condition === 'cash' ? 'À vista' : `A prazo (${p.installments_count}x)`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-[#FFBE0B]">{formatMoney(p.total_amount)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openDetail(p.id)}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300"
                            title="Visualizar compra"
                          >
                            <Eye size={15} />
                          </button>
                          {p.status !== 'canceled' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditPurchase(p.id)}
                                className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300"
                                title="Editar compra"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => { setError(''); setCancelModal(p); setCancelReason('') }}
                                className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-400"
                                title="Excluir / Cancelar compra"
                              >
                                <Ban size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <form onSubmit={handleConfirmPurchase} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Coluna Esquerda + Centro (2/3) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Dados da Compra */}
            <div className="card p-4 space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar size={16} className="text-[#FFBE0B]" /> Dados da Compra
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-zinc-400 mb-1">Origem da Compra</label>
                  <select
                    className="input w-full"
                    value={originType}
                    onChange={e => {
                      const v = e.target.value
                      setOriginType(v)
                      if (v === 'customer_trade') setItemTab('device')
                      setItems([])
                    }}
                  >
                    <option value="supplier">De fornecedor</option>
                    <option value="customer_trade">Aparelho de cliente</option>
                  </select>
                </div>

                {originType === 'supplier' ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-zinc-400">Fornecedor *</label>
                      <button
                        type="button"
                        onClick={() => setNewSupplierOpen(true)}
                        className="text-[11px] text-[#FFBE0B] hover:underline font-semibold"
                      >
                        + Novo fornecedor
                      </button>
                    </div>
                    <select className="input w-full" value={supplierId} onChange={e => setSupplierId(e.target.value)} required>
                      <option value="">Selecione o fornecedor...</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-zinc-400 mb-1">Cliente vendedor *</label>
                    <select className="input w-full" value={customerId} onChange={e => setCustomerId(e.target.value)} required>
                      <option value="">Selecione o cliente...</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-zinc-400 mb-1">Nota Fiscal (opcional)</label>
                  <input className="input w-full" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Ex: NF 12345" />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Data da compra *</label>
                  <input type="date" className="input w-full" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Desconto (R$)</label>
                  <input type="number" step="0.01" min="0" className="input w-full" value={discount} onChange={e => setDiscount(e.target.value)} />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Frete (R$)</label>
                  <input type="number" step="0.01" min="0" className="input w-full" value={freight} onChange={e => setFreight(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-zinc-400 mb-1">Observações</label>
                  <input className="input w-full" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações internas da compra..." />
                </div>
              </div>
            </div>

            {/* Itens da Compra */}
            <div className="card p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Boxes size={16} className="text-[#FFBE0B]" /> Itens da Compra
                </h2>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {originType === 'supplier' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setItemTab('existing_accessory')}
                        className={`px-2.5 py-1 rounded-lg font-semibold ${itemTab === 'existing_accessory' ? 'bg-[#FFBE0B] text-slate-950' : 'bg-white/5 text-zinc-300'}`}
                      >
                        Acessório existente
                      </button>
                      <button
                        type="button"
                        onClick={() => setItemTab('new_accessory')}
                        className={`px-2.5 py-1 rounded-lg font-semibold ${itemTab === 'new_accessory' ? 'bg-[#FFBE0B] text-slate-950' : 'bg-white/5 text-zinc-300'}`}
                      >
                        Novo acessório
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setItemTab('device')}
                    className={`px-2.5 py-1 rounded-lg font-semibold ${itemTab === 'device' ? 'bg-[#FFBE0B] text-slate-950' : 'bg-white/5 text-zinc-300'}`}
                  >
                    Aparelho
                  </button>
                </div>
              </div>

              {itemTab === 'existing_accessory' && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                  <select className="input sm:col-span-2" value={selectedProductId} onChange={e => handleSelectExistingProduct(e.target.value)}>
                    <option value="">Selecione o produto...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code}) — Estoque: {p.quantity ?? 0}
                      </option>
                    ))}
                  </select>
                  <input type="number" min="1" className="input" placeholder="Qtd" value={itemQty} onChange={e => setItemQty(e.target.value)} />
                  <input type="number" step="0.01" min="0" className="input" placeholder="Custo unit." value={itemUnitCost} onChange={e => setItemUnitCost(e.target.value)} />
                </div>
              )}

              {itemTab === 'new_accessory' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <input className="input" placeholder="Nome do acessório *" value={newAccName} onChange={e => setNewAccName(e.target.value)} />
                  <input className="input" placeholder="Código / SKU (opcional)" value={newAccCode} onChange={e => setNewAccCode(e.target.value)} />
                  <input className="input" list="cat-list" placeholder="Categoria" value={newAccCategory} onChange={e => setNewAccCategory(e.target.value)} />
                  <datalist id="cat-list">
                    {categories.map(c => <option key={c.id} value={c.name} />)}
                  </datalist>
                  <input type="number" min="1" className="input" placeholder="Qtd" value={itemQty} onChange={e => setItemQty(e.target.value)} />
                  <input type="number" step="0.01" min="0" className="input" placeholder="Custo unit. *" value={itemUnitCost} onChange={e => setItemUnitCost(e.target.value)} />
                  <input type="number" step="0.01" min="0" className="input" placeholder="Preço venda" value={newAccSalePrice} onChange={e => setNewAccSalePrice(e.target.value)} />
                </div>
              )}

              {itemTab === 'device' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <input className="input" placeholder="Marca (ex: Apple)" value={devBrand} onChange={e => setDevBrand(e.target.value)} />
                  <input className="input" placeholder="Modelo * (ex: iPhone 13)" value={devModel} onChange={e => setDevModel(e.target.value)} />
                  <input className="input" placeholder="IMEI / Série" value={devImei} onChange={e => setDevImei(e.target.value)} />
                  <input className="input" placeholder="Armazenamento" value={devStorage} onChange={e => setDevStorage(e.target.value)} />
                  <input className="input" placeholder="Cor / Condição" value={devColor} onChange={e => setDevColor(e.target.value)} />
                  <div className="flex gap-2">
                    <input type="number" step="0.01" min="0" className="input w-1/2" placeholder="Custo *" value={itemUnitCost} onChange={e => setItemUnitCost(e.target.value)} />
                    <input type="number" step="0.01" min="0" className="input w-1/2" placeholder="Venda" value={devSalePrice} onChange={e => setDevSalePrice(e.target.value)} />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={addItemToPurchase}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex items-center gap-1.5"
              >
                <PackagePlus size={15} /> Adicionar item
              </button>

              {items.length > 0 && (
                <div className="overflow-x-auto border border-white/10 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-white/5 text-zinc-400 text-[10px] uppercase">
                      <tr>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2 w-20">Qtd</th>
                        <th className="px-3 py-2 w-28">Custo Unit.</th>
                        <th className="px-3 py-2 text-right">Subtotal</th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {items.map((it, idx) => (
                        <tr key={it.uid}>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-white">{it.description}</p>
                            {it.identifier && <p className="text-[10px] text-zinc-400">{it.identifier}</p>}
                          </td>
                          <td className="px-3 py-2 text-zinc-400">
                            {it.item_type === 'device' ? 'Aparelho' : it.item_type === 'new_accessory' ? 'Novo' : 'Estoque'}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="1"
                              disabled={it.item_type === 'device'}
                              className="input py-1 px-2 w-16"
                              value={it.quantity}
                              onChange={e => {
                                const val = Math.max(1, parseInt(e.target.value, 10) || 1)
                                setItems(prev => prev.map((r, i) => i === idx ? { ...r, quantity: val } : r))
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className="input py-1 px-2 w-24"
                              value={it.unit_cost}
                              onChange={e => {
                                const val = Number(e.target.value || 0)
                                setItems(prev => prev.map((r, i) => i === idx ? { ...r, unit_cost: val } : r))
                              }}
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-white">
                            {formatMoney(Number(it.quantity) * Number(it.unit_cost))}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button type="button" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} className="text-rose-400 hover:text-rose-300">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Coluna Direita: Condições de Pagamento e Resumo */}
          <div className="space-y-4">
            <div className="card p-4 space-y-3 text-xs">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <DollarSign size={16} className="text-[#FFBE0B]" /> Pagamento e Resumo
              </h2>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentCondition('cash')}
                  className={`py-2 rounded-xl font-bold border ${paymentCondition === 'cash' ? 'bg-[#FFBE0B] text-slate-950 border-[#FFBE0B]' : 'bg-white/5 text-zinc-300 border-white/10'}`}
                >
                  À vista
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentCondition('installments')}
                  className={`py-2 rounded-xl font-bold border ${paymentCondition === 'installments' ? 'bg-[#FFBE0B] text-slate-950 border-[#FFBE0B]' : 'bg-white/5 text-zinc-300 border-white/10'}`}
                >
                  A prazo
                </button>
              </div>

              {paymentCondition === 'cash' ? (
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-zinc-400 mb-1">Forma de pagamento</label>
                    <select className="input w-full" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                      {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">Data efetiva do pagamento</label>
                    <input type="date" className="input w-full" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-zinc-400 mb-1">Entrada (R$ — opcional)</label>
                    <input type="number" step="0.01" min="0" className="input w-full" value={downPayment} onChange={e => setDownPayment(e.target.value)} />
                  </div>
                  {Number(downPayment || 0) > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      <select className="input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                        {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                      <input type="date" className="input" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-zinc-400 mb-1">Parcelas</label>
                      <input type="number" min="1" max="36" className="input w-full" value={installmentsCount} onChange={e => setInstallmentsCount(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-zinc-400 mb-1">Intervalo (dias)</label>
                      <input type="number" min="1" className="input w-full" value={intervalDays} onChange={e => setIntervalDays(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">1º Vencimento</label>
                    <input type="date" className="input w-full" value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)} />
                  </div>

                  {installments.length > 0 && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      <p className="text-[11px] font-semibold text-zinc-400">Parcelas geradas ({formatMoney(financedAmount)}):</p>
                      {installments.map((inst, idx) => (
                        <div key={inst.installment_number} className="flex items-center gap-1.5">
                          <span className="w-7 text-zinc-400">{inst.installment_number}x</span>
                          <input
                            type="date"
                            className="input py-1 px-2 flex-1"
                            value={inst.due_date}
                            onChange={e => setInstallments(prev => prev.map((r, i) => i === idx ? { ...r, due_date: e.target.value } : r))}
                          />
                          <input
                            type="number"
                            step="0.01"
                            className="input py-1 px-2 w-24"
                            value={inst.amount}
                            onChange={e => setInstallments(prev => prev.map((r, i) => i === idx ? { ...r, amount: e.target.value } : r))}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-white/10 pt-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>Subtotal dos itens</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Desconto</span>
                  <span>- {formatMoney(discount || 0)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Frete</span>
                  <span>+ {formatMoney(freight || 0)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-[#FFBE0B] pt-1 border-t border-white/10">
                  <span>Total Final</span>
                  <span>{formatMoney(totalAmount)}</span>
                </div>
                {editingPurchaseId && editingAlreadyPaid > 0 && (
                  <div className="mt-2 p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-1 text-[11px]">
                    <p className="font-bold text-white">Reconciliação Financeira</p>
                    <div className="flex justify-between text-zinc-400">
                      <span>Total original</span>
                      <span>{formatMoney(editingOriginalTotal)}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Valor já pago</span>
                      <span>{formatMoney(editingAlreadyPaid)}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span className="text-zinc-300">
                        {totalAmount >= editingAlreadyPaid ? 'Saldo restante a pagar' : 'Crédito a compensar'}
                      </span>
                      <span className={totalAmount > editingAlreadyPaid ? 'text-amber-400' : totalAmount < editingAlreadyPaid ? 'text-emerald-400' : 'text-zinc-300'}>
                        {formatMoney(Math.abs(totalAmount - editingAlreadyPaid))}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full py-2.5 rounded-xl font-bold text-xs disabled:opacity-50"
              >
                {submitting ? 'Confirmando...' : 'Confirmar Compra'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Modal Novo Fornecedor Inline */}
      {newSupplierOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form onSubmit={handleCreateSupplierInline} className="card w-full max-w-md p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Novo Fornecedor</h3>
              <button type="button" onClick={() => setNewSupplierOpen(false)} className="text-zinc-400 hover:text-white"><X size={18} /></button>
            </div>
            <input className="input w-full text-xs" placeholder="Nome do fornecedor *" value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} required />
            <input className="input w-full text-xs" placeholder="Telefone / Contato (opcional)" value={newSupplierContact} onChange={e => setNewSupplierContact(e.target.value)} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setNewSupplierOpen(false)} className="px-3 py-1.5 rounded-lg text-xs text-zinc-300 bg-white/5">Cancelar</button>
              <button type="submit" className="btn-primary px-4 py-1.5 rounded-lg text-xs font-bold">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Detalhes da Compra */}
      {detailModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="card w-full max-w-[900px] max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
              <h3 className="text-base font-bold text-white">{detailModal.purchase_number}</h3>
              <button type="button" onClick={() => setDetailModal(null)} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-zinc-300">
                <div><span className="text-zinc-500 block">Data</span>{String(detailModal.purchase_date).slice(0, 10)}</div>
                <div><span className="text-zinc-500 block">Origem</span>{detailModal.origin_type === 'customer_trade' ? detailModal.customer_name : detailModal.supplier_name}</div>
                <div><span className="text-zinc-500 block">Total</span><strong className="text-[#FFBE0B]">{formatMoney(detailModal.total_amount)}</strong></div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-zinc-400">Itens</p>
                <div className="divide-y divide-white/5 border border-white/10 rounded-xl text-xs">
                  {(detailModal.items || []).map(it => (
                    <div key={it.id} className="p-2.5 flex justify-between gap-2">
                      <span>{it.quantity}x {it.description}</span>
                      <span className="font-semibold text-white shrink-0">{formatMoney(it.total_cost)}</span>
                    </div>
                  ))}
                </div>
              </div>
              {(detailModal.installments || []).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-zinc-400">Parcelas</p>
                  <div className="divide-y divide-white/5 border border-white/10 rounded-xl text-xs">
                    {detailModal.installments.map(inst => (
                      <div key={inst.id} className="p-2.5 flex justify-between gap-2">
                        <span>Parcela {inst.installment_number}/{inst.total_installments} — Venc: {String(inst.due_date).slice(0, 10)}</span>
                        <span className="font-semibold text-white shrink-0">{formatMoney(inst.amount)} ({inst.status})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Modal Cancelamento de Compra */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <form onSubmit={handleConfirmCancel} className="card w-full max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Excluir / Cancelar {cancelModal.purchase_number}</h3>
              <button type="button" onClick={() => setCancelModal(null)} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-white/5 text-zinc-300">
              <div>
                <span className="text-zinc-500 block">Fornecedor / Origem</span>
                <strong className="text-white">{cancelModal.origin_type === 'customer_trade' ? cancelModal.customer_name : cancelModal.supplier_name || '-'}</strong>
              </div>
              <div>
                <span className="text-zinc-500 block">Valor Total</span>
                <strong className="text-[#FFBE0B]">{formatMoney(cancelModal.total_amount)}</strong>
              </div>
            </div>
            <p className="text-zinc-400">
              O estoque será estornado (se disponível) e as parcelas pendentes serão canceladas, preservando o histórico e a auditoria.
            </p>
            {error && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300">
                {error}
              </div>
            )}
            <input
              className="input w-full"
              placeholder="Motivo do cancelamento *"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              required
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCancelModal(null)} className="px-3 py-1.5 rounded-lg bg-white/5 text-zinc-300">Voltar</button>
              <button type="submit" className="px-4 py-1.5 rounded-lg bg-rose-500 text-white font-bold">Confirmar Cancelamento</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
