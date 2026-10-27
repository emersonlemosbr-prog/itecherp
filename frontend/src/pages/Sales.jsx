import { useSettings } from '../context/SettingsContext'
import ModalFrame from '../components/UI/ModalFrame'
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Plus, Minus, Trash2, ShoppingCart, CheckCircle2, Undo2, ShieldAlert } from 'lucide-react';
import api from '../api/client';
import { formatCurrency } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const PAYMENT_LABELS = {
  cash: 'Dinheiro',
  pix: 'PIX',
  debit_card: 'Cartão de Débito',
  credit_card: 'Cartão de Crédito',
};

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function Sales() {
  const { settings } = useSettings()
  const { isAdmin } = useAuth();
  const [q, setQ] = useState('');
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discountType, setDiscountType] = useState('value');
  const [discountValue, setDiscountValue] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [cancelModal, setCancelModal] = useState({ open: false, step: 1, sale: null, details: null });
  const [cancelReason, setCancelReason] = useState('');
  const [secondConfirmText, setSecondConfirmText] = useState('');
  const [canceling, setCanceling] = useState(false);

  const loadProducts = useCallback(async (queryValue = '') => {
    const { data } = await api.get('/store-sales/products', { params: { q: queryValue || undefined } });
    setProducts(data);
  }, []);

  const loadHistory = useCallback(async () => {
    const { data } = await api.get('/store-sales/history');
    setHistory(data);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts(q);
    }, 180);
    return () => clearTimeout(timer);
  }, [q, loadProducts]);

  useEffect(() => {
    loadProducts('');
    loadHistory();
  }, [loadHistory, loadProducts]);

  const stockMap = useMemo(() => {
    return Object.fromEntries(products.map((product) => [product.id, Number(product.quantity) || 0]));
  }, [products]);

  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  }, [cart]);

  const numericDiscount = Math.max(0, Number(discountValue) || 0);
  const discountAmount = useMemo(() => {
    if (!subtotal) return 0;
    if (discountType === 'percent') return Math.min(subtotal, subtotal * (numericDiscount / 100));
    return Math.min(subtotal, numericDiscount);
  }, [discountType, numericDiscount, subtotal]);

  const total = Math.max(0, subtotal - discountAmount);

  function getItemMax(productId) {
    const stock = stockMap[productId] ?? 0;
    const inCart = cart.find((item) => item.product_id === productId)?.quantity || 0;
    return stock + inCart;
  }

  function addProduct(product) {
    setFeedback('');
    const available = Number(product.quantity) || 0;
    if (available <= 0) {
      setFeedback('Esse produto está sem estoque no momento.');
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === product.id);
      if (!existing) {
        return [
          ...prev,
          {
            product_id: product.id,
            product_name: product.name,
            product_code: product.code,
            unit_price: Number(product.sale_price) || 0,
            quantity: 1,
          },
        ];
      }

      const max = getItemMax(product.id);
      if (existing.quantity >= max) return prev;

      return prev.map((item) =>
        item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      );
    });
  }

  function incrementItem(productId) {
    setCart((prev) => {
      const target = prev.find((item) => item.product_id === productId);
      if (!target) return prev;
      const max = getItemMax(productId);
      if (target.quantity >= max) return prev;
      return prev.map((item) =>
        item.product_id === productId ? { ...item, quantity: item.quantity + 1 } : item
      );
    });
  }

  function decrementItem(productId) {
    setCart((prev) => {
      const target = prev.find((item) => item.product_id === productId);
      if (!target) return prev;
      if (target.quantity <= 1) return prev.filter((item) => item.product_id !== productId);
      return prev.map((item) =>
        item.product_id === productId ? { ...item, quantity: item.quantity - 1 } : item
      );
    });
  }

  function removeItem(productId) {
    setCart((prev) => prev.filter((item) => item.product_id !== productId));
  }

  async function finalizeSale() {
    if (!cart.length || saving) return;

    setSaving(true);
    setFeedback('');

    try {
      const payload = {
        payment_method: paymentMethod,
        discount_type: discountType,
        discount_value: numericDiscount,
        notes,
        items: cart.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
      };

      const { data } = await api.post('/store-sales/finalize', payload);

      setCart([]);
      setDiscountType('value');
      setDiscountValue('0');
      setPaymentMethod('cash');
      setNotes('');
      setFeedback(`Venda ${data.sale_number} finalizada com sucesso.`);
      await Promise.all([loadProducts(q), loadHistory()]);
    } catch (err) {
      setFeedback(err.response?.data?.error || 'Não foi possível finalizar a venda.');
    } finally {
      setSaving(false);
    }
  }

  async function openCancelModal(sale) {
    if (!isAdmin) return;
    try {
      const { data } = await api.get(`/store-sales/history/${sale.id}`);
      setCancelReason('');
      setSecondConfirmText('');
      setCancelModal({ open: true, step: 1, sale, details: data });
    } catch (err) {
      setFeedback(err.response?.data?.error || 'Não foi possível carregar os dados completos da venda.');
    }
  }

  async function cancelSale() {
    if (!cancelModal.details || !isAdmin || canceling) return;
    if (secondConfirmText.trim().toUpperCase() !== 'CONFIRMAR') {
      setFeedback('Digite CONFIRMAR para concluir o estorno com segurança.');
      return;
    }

    setCanceling(true);
    setFeedback('');

    try {
      const { data } = await api.post(`/store-sales/${cancelModal.details.id}/cancel`, {
        reason: cancelReason,
      });

      setCancelModal({ open: false, step: 1, sale: null, details: null });
      setFeedback(`Venda ${data.sale_number} estornada com sucesso.`);
      await Promise.all([loadHistory(), loadProducts(q)]);
    } catch (err) {
      setFeedback(err.response?.data?.error || 'Não foi possível estornar a venda.');
    } finally {
      setCanceling(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-xl">Venda</h2>
        <p className="text-sm text-slate-400">Busque produtos, monte o carrinho e conclua a venda com baixa automática de estoque.</p>
      </div>

      {feedback && (
        <div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${feedback.includes('sucesso') ? 'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-amber-100/80 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'}`}>
          {feedback.includes('sucesso') ? <CheckCircle2 size={16} /> : null}
          {feedback}
        </div>
      )}

      <div className="grid xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <div className="card p-4 space-y-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nome, código ou modelo..."
              />
            </div>

            <div className="table-scroll overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-ink-700">
                    <th className="px-3 py-2.5">Produto</th>
                    <th className="px-3 py-2.5">Categoria</th>
                    <th className="px-3 py-2.5">Disponível</th>
                    <th className="px-3 py-2.5">Preço</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className="border-b border-slate-50 dark:border-ink-700/50">
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{product.name}</p>
                        <p className="text-xs text-slate-400">{product.code} {product.model ? `• ${product.model}` : ''}</p>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">{product.category_name || 'Sem categoria'}</td>
                      <td className="px-3 py-2.5">
                        {(Number(product.quantity) || 0) > 0 ? (
                          <span className="badge-green">{product.quantity}</span>
                        ) : (
                          <span className="badge-red">Sem estoque</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">{formatCurrency(product.sale_price)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          className="btn-secondary"
                          onClick={() => addProduct(product)}
                          disabled={(Number(product.quantity) || 0) <= 0}
                        >
                          <Plus size={14} /> Adicionar à venda
                        </button>
                      </td>
                    </tr>
                  ))}
                  {products.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">Nenhum produto encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-ink-700">
              <h3 className="font-semibold text-sm">Histórico de Vendas</h3>
            </div>
            <div className="table-scroll overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-ink-700">
                    <th className="px-3 py-2.5">Venda</th>
                    <th className="px-3 py-2.5">Data/Hora</th>
                    <th className="px-3 py-2.5">Produtos</th>
                    <th className="px-3 py-2.5">Pagamento</th>
                    <th className="px-3 py-2.5">Total</th>
                    {isAdmin && <th className="px-3 py-2.5"></th>}
                  </tr>
                </thead>
                <tbody>
                  {history.map((sale) => (
                    <tr key={sale.id} className="border-b border-slate-50 dark:border-ink-700/50">
                      <td className="px-3 py-2.5 font-medium">{sale.sale_number}</td>
                      <td className="px-3 py-2.5 text-slate-500">{formatDateTime(sale.created_at)}</td>
                      <td className="px-3 py-2.5 text-slate-500">{sale.products_summary || '—'}</td>
                      <td className="px-3 py-2.5">{PAYMENT_LABELS[sale.payment_method] || sale.payment_method}</td>
                      <td className="px-3 py-2.5 font-medium">{formatCurrency(sale.total_amount)}</td>
                      {isAdmin && (
                        <td className="px-3 py-2.5 text-right">
                          <button className="btn-danger" onClick={() => openCancelModal(sale)}>
                            <Undo2 size={14} /> Desfazer venda
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr><td colSpan={isAdmin ? 6 : 5} className="px-3 py-8 text-center text-slate-400">Nenhuma venda realizada ainda.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="card p-4 space-y-4 h-fit xl:sticky xl:top-20">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} />
            <h3 className="font-semibold text-sm">Carrinho</h3>
          </div>

          <div className="space-y-2 max-h-[340px] overflow-auto pr-1">
            {cart.map((item) => (
              <div key={item.product_id} className="rounded-lg border border-slate-200 dark:border-[#4A4A4A] p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{item.product_name}</p>
                    <p className="text-xs text-slate-400">{item.product_code}</p>
                  </div>
                  <button className="btn-ghost !px-1.5 !py-1 text-rose-600" onClick={() => removeItem(item.product_id)}>
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button className="btn-secondary !px-2 !py-1" onClick={() => decrementItem(item.product_id)}>
                      <Minus size={13} />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                    <button className="btn-secondary !px-2 !py-1" onClick={() => incrementItem(item.product_id)}>
                      <Plus size={13} />
                    </button>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">{formatCurrency(item.unit_price)} un.</p>
                    <p className="text-sm font-semibold">{formatCurrency(item.quantity * item.unit_price)}</p>
                  </div>
                </div>
              </div>
            ))}

            {cart.length === 0 && <p className="text-sm text-slate-400">Seu carrinho está vazio.</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Tipo de desconto</label>
              <select className="input" value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
                <option value="value">Valor (R$)</option>
                <option value="percent">Porcentagem (%)</option>
              </select>
            </div>
            <div>
              <label className="label">Desconto</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">Forma de pagamento</label>
            <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {settings.finance?.payments.cash !== false && <option value="cash">Dinheiro</option>}
              {settings.finance?.payments.pix !== false && <option value="pix">PIX</option>}
              {settings.finance?.payments.debit_card !== false && <option value="debit_card">Cartão de Débito</option>}
              {settings.finance?.payments.credit_card !== false && <option value="credit_card">Cartão de Crédito</option>}
            </select>
          </div>

          <div>
            <label className="label">Observações</label>
            <textarea className="input min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-[#4A4A4A] p-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between"><span className="text-slate-400">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-400">Desconto</span><span>- {formatCurrency(discountAmount)}</span></div>
            <div className="flex items-center justify-between font-semibold text-base pt-1 border-t border-slate-200 dark:border-[#4A4A4A]"><span>Total</span><span>{formatCurrency(total)}</span></div>
          </div>

          <button className="btn-primary w-full justify-center py-3 text-base" onClick={finalizeSale} disabled={!cart.length || saving}>
            {saving ? 'Finalizando...' : 'Finalizar Venda'}
          </button>
        </div>
      </div>

      {cancelModal.open && cancelModal.details && (
        <ModalFrame busy={canceling} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCancelModal({ open: false, step: 1, sale: null, details: null })}>
          <div className="card w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert size={18} className="text-amber-500" />
              <h3 className="font-display font-bold text-lg">Desfazer venda</h3>
              <button type="button" disabled={canceling} className="btn-secondary ml-auto" onClick={() => setCancelModal({ open: false, step: 1, sale: null, details: null })}>Fechar</button>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-[#4A4A4A] p-3 text-sm space-y-1.5 mb-3">
              <p><strong>Número:</strong> {cancelModal.details.sale_number}</p>
              <p><strong>Data:</strong> {formatDateTime(cancelModal.details.created_at)}</p>
              <p><strong>Total:</strong> {formatCurrency(cancelModal.details.total_amount)}</p>
              <p><strong>Produtos:</strong> {cancelModal.details.items.map((item) => `${item.product_name} x${item.quantity}`).join(' | ') || '—'}</p>
            </div>

            {cancelModal.step === 1 ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-400">Confirme se os dados acima estão corretos. Esse processo devolverá os itens ao estoque e ajustará faturamento/lucro.</p>
                <div>
                  <label className="label">Motivo do estorno (opcional)</label>
                  <input className="input" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Erro operacional, venda duplicada, etc." />
                </div>
                <div className="flex justify-end gap-2">
                  <button className="btn-secondary" onClick={() => setCancelModal({ open: false, step: 1, sale: null, details: null })}>Cancelar</button>
                  <button className="btn-danger" onClick={() => setCancelModal((prev) => ({ ...prev, step: 2 }))}>Continuar</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-rose-500">Segunda confirmação de segurança: digite CONFIRMAR para prosseguir com o estorno.</p>
                <input className="input" value={secondConfirmText} onChange={(e) => setSecondConfirmText(e.target.value)} placeholder="Digite CONFIRMAR" />
                <div className="flex justify-end gap-2">
                  <button className="btn-secondary" onClick={() => setCancelModal((prev) => ({ ...prev, step: 1 }))}>Voltar</button>
                  <button className="btn-danger" onClick={cancelSale} disabled={canceling}>{canceling ? 'Estornando...' : 'Confirmar estorno'}</button>
                </div>
              </div>
            )}
          </div>
        </ModalFrame>
      )}
    </div>
  );
}
