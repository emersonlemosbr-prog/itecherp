import { confirmRecordDeletion } from '../utils/confirmDeletion'
import Access from '../components/UI/Access'
import { usePagination } from '../components/UI/Pagination'
import ModalFrame from '../components/UI/ModalFrame'
import PermanentDeleteDialog from '../components/UI/PermanentDeleteDialog'
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Boxes, AlertTriangle, CircleOff, DollarSign, Search,
  Plus, Pencil, Trash2, ArrowDownCircle, ArrowUpCircle, History, Settings, Camera, ImagePlus, X
} from 'lucide-react';
import api, { getApiBaseUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/format';

const MOVEMENT_LABELS = {
  entry: 'Entrada',
  exit: 'Saída',
  adjustment: 'Ajuste',
  sale: 'Venda realizada',
};

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function statusForProduct(product) {
  const quantity = Number(product.quantity) || 0;
  const minStock = Number(product.min_stock) || 0;
  if (quantity <= 0) return { key: 'out', label: 'Sem estoque', badge: 'badge-red' };
  if (quantity <= minStock) return { key: 'low', label: 'Estoque baixo', badge: 'badge-yellow' };
  return { key: 'normal', label: 'Estoque normal', badge: 'badge-green' };
}

export default function InventoryControl() {
  const { isSuspended } = useAuth();
  const [filters, setFilters] = useState({
    q: '',
    category_id: '',
    supplier_id: '',
    low_stock: false,
    out_of_stock: false,
  });

  const [stats, setStats] = useState(null);
  const [products, setProducts] = useState([]);
  const pagination = usePagination(products)
  const [movements, setMovements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [feedback, setFeedback] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const [actionModal, setActionModal] = useState({ open: false, mode: 'entry', product: null });
  const [historyModal, setHistoryModal] = useState({ open: false, product: null, rows: [] });
  const [imagePreview, setImagePreview] = useState(null);

  const queryParams = useMemo(() => ({
    q: filters.q || undefined,
    category_id: filters.category_id || undefined,
    supplier_id: filters.supplier_id || undefined,
    low_stock: filters.low_stock || undefined,
    out_of_stock: filters.out_of_stock || undefined,
  }), [filters]);

  const loadDashboard = useCallback(async () => {
    const { data } = await api.get('/inventory/dashboard');
    setStats(data);
  }, []);

  const loadProducts = useCallback(async () => {
    const { data } = await api.get('/inventory/products', { params: queryParams });
    setProducts(data);
  }, [queryParams]);

  const loadMovements = useCallback(async () => {
    const { data } = await api.get('/inventory/movements', { params: { q: filters.q || undefined } });
    setMovements(data);
  }, [filters.q]);

  const loadOptions = useCallback(async () => {
    const [categoriesRes, suppliersRes] = await Promise.all([
      api.get('/inventory/categories'),
      api.get('/inventory/suppliers'),
    ]);
    setCategories(categoriesRes.data);
    setSuppliers(suppliersRes.data);
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadDashboard(), loadProducts(), loadMovements(), loadOptions()]);
  }, [loadDashboard, loadMovements, loadOptions, loadProducts]);

  const refreshCore = useCallback(async () => {
    await Promise.all([loadDashboard(), loadProducts(), loadMovements()]);
  }, [loadDashboard, loadProducts, loadMovements]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts();
      loadMovements();
    }, 180);
    return () => clearTimeout(timer);
  }, [loadProducts, loadMovements]);

  useEffect(() => {
    const token = localStorage.getItem('itech_token');
    if (!token) return undefined;

    const base = getApiBaseUrl();
    const eventSource = new EventSource(`${base}/api/events/dashboard?token=${encodeURIComponent(token)}`);
    const refreshHandler = () => {
      refreshCore().catch(() => {
        // Falha transitória de rede: mantém tela estável.
      });
    };

    eventSource.addEventListener('inventory-refresh', refreshHandler);

    return () => {
      eventSource.removeEventListener('inventory-refresh', refreshHandler);
      eventSource.close();
    };
  }, [refreshCore]);

  function openCreateForm() {
    if (isSuspended) {
      setFeedback('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.');
      return;
    }
    setEditingProduct(null);
    setFormOpen(true);
  }

  function openEditForm(product) {
    if (isSuspended) {
      setFeedback('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.');
      return;
    }
    setEditingProduct(product);
    setFormOpen(true);
  }

  function openStockAction(mode, product) {
    if (isSuspended) {
      setFeedback('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.');
      return;
    }
    setActionModal({ open: true, mode, product });
  }

  async function openHistory(product) {
    const { data } = await api.get(`/inventory/products/${product.id}/movements`);
    setHistoryModal({ open: true, product, rows: data });
  }

  async function removeProduct(product) {
    if (isSuspended) {
      setFeedback('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.');
      return;
    }
    if (!confirmRecordDeletion(`Excluir o produto ${product.name}?`)) return;

    try {
      await api.delete(`/inventory/products/${product.id}`);
      setFeedback('Produto excluído com sucesso.');
      await refreshCore();
    } catch (err) {
      setFeedback(err.response?.data?.error || 'Não foi possível excluir o produto.');
    }
  }

  return (
    <div className="space-y-4">
      {pagination.controls}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-xl">Controle de Estoque</h2>
          <p className="text-sm text-slate-400">Gerencie produtos, movimentações e indicadores de estoque em tempo real.</p>
        </div>
        <Access><button className="btn-primary" onClick={openCreateForm}><Plus size={16} /> Cadastrar Produto</button></Access>
      </div>

      {feedback && <div className="rounded-lg bg-brand-100/70 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 p-3 text-sm">{feedback}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={Boxes} label="Produtos cadastrados" value={stats?.total_products ?? 0} />
        <StatCard icon={Boxes} label="Quantidade em estoque" value={stats?.total_stock_qty ?? 0} />
        <StatCard icon={AlertTriangle} label="Estoque baixo" value={stats?.low_stock ?? 0} tone="yellow" />
        <StatCard icon={CircleOff} label="Sem estoque" value={stats?.out_of_stock ?? 0} tone="red" />
        <Access><StatCard icon={DollarSign} label="Valor total (custo)" value={formatCurrency(stats?.stock_cost_value || 0)} tone="green" /></Access>
      </div>

      <div className="card p-4 space-y-3">
        <div className="grid md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Pesquisar por nome ou código"
              value={filters.q}
              onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
            />
          </div>

          <select className="input" value={filters.category_id} onChange={(e) => setFilters((prev) => ({ ...prev, category_id: e.target.value }))}>
            <option value="">Todas categorias</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>

          <select className="input" value={filters.supplier_id} onChange={(e) => setFilters((prev) => ({ ...prev, supplier_id: e.target.value }))}>
            <option value="">Todos fornecedores</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>

          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.low_stock}
                onChange={(e) => setFilters((prev) => ({ ...prev, low_stock: e.target.checked }))}
              />
              Estoque baixo
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.out_of_stock}
                onChange={(e) => setFilters((prev) => ({ ...prev, out_of_stock: e.target.checked }))}
              />
              Sem estoque
            </label>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="table-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-ink-700">
                <th className="px-3 py-2.5">Foto</th>
                <th className="px-3 py-2.5">Código</th>
                <th className="px-3 py-2.5">Produto</th>
                <th className="px-3 py-2.5">Categoria</th>
                <th className="px-3 py-2.5">Fornecedor</th>
                <Access><th className="px-3 py-2.5">Preço custo</th></Access>
                <Access><th className="px-3 py-2.5">Preço venda</th></Access>
                <th className="px-3 py-2.5">Quantidade</th>
                <th className="px-3 py-2.5">Estoque mínimo</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {pagination.rows.map((product) => {
                const status = statusForProduct(product);
                const rowClass = status.key === 'out'
                  ? 'bg-rose-500/10'
                  : status.key === 'low'
                    ? 'bg-amber-500/10'
                    : '';

                return (
                  <tr key={product.id} className={`border-b border-slate-50 dark:border-ink-700/50 ${rowClass}`}>
                    <td className="px-3 py-2.5">
                      {product.image_url ? <button type="button" onClick={() => setImagePreview(product)} className="block h-11 w-11 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"><img src={product.image_url} alt={product.name} className="h-full w-full object-cover" /></button> : <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400 dark:bg-ink-700">Sem foto</span>}
                    </td>
                    <td className="px-3 py-2.5 font-medium">{product.code}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-slate-400">{product.model || '—'}</p>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{product.category_name || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{product.supplier_name || '—'}</td>
                    <Access><td className="px-3 py-2.5">{formatCurrency(product.cost_price)}</td></Access>
                    <Access><td className="px-3 py-2.5">{formatCurrency(product.sale_price)}</td></Access>
                    <td className="px-3 py-2.5">{product.quantity}</td>
                    <td className="px-3 py-2.5">{product.min_stock}</td>
                    <td className="px-3 py-2.5"><span className={status.badge}>{status.label}</span></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <Access><button className="btn-ghost !px-1.5 !py-1" title="Editar" onClick={() => openEditForm(product)}><Pencil size={14} /></button></Access>
                        <Access><button className="btn-ghost !px-1.5 !py-1 text-emerald-600" title="Adicionar estoque" onClick={() => openStockAction('entry', product)}><ArrowUpCircle size={14} /></button></Access>
                        <Access><button className="btn-ghost !px-1.5 !py-1 text-amber-600" title="Retirar estoque" onClick={() => openStockAction('exit', product)}><ArrowDownCircle size={14} /></button></Access>
                        <button className="btn-ghost !px-1.5 !py-1" title="Histórico" onClick={() => openHistory(product)}><History size={14} /></button>
                        <Access><button className="btn-ghost !px-1.5 !py-1 text-rose-600" title="Excluir" onClick={() => removeProduct(product)}><Trash2 size={14} /></button></Access>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {products.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-8 text-center text-slate-400">Nenhum produto encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-ink-700">
          <h3 className="font-semibold text-sm">Movimentações de Estoque</h3>
        </div>
        <div className="table-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-ink-700">
                <th className="px-3 py-2.5">Data/Hora</th>
                <th className="px-3 py-2.5">Usuário</th>
                <th className="px-3 py-2.5">Produto</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Qtd. alterada</th>
                <th className="px-3 py-2.5">Saldo</th>
                <th className="px-3 py-2.5">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id} className="border-b border-slate-50 dark:border-ink-700/50">
                  <td className="px-3 py-2.5 text-slate-500">{formatDateTime(movement.created_at)}</td>
                  <td className="px-3 py-2.5">{movement.user_name || 'Sistema'}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{movement.product_name}</p>
                    <p className="text-xs text-slate-400">{movement.product_code}</p>
                  </td>
                  <td className="px-3 py-2.5">{MOVEMENT_LABELS[movement.movement_type] || movement.movement_type}</td>
                  <td className={`px-3 py-2.5 font-semibold ${movement.quantity_delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {movement.quantity_delta >= 0 ? `+${movement.quantity_delta}` : movement.quantity_delta}
                  </td>
                  <td className="px-3 py-2.5">{movement.previous_quantity} → {movement.new_quantity}</td>
                  <td className="px-3 py-2.5 text-slate-500">{movement.reason || '—'}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Sem movimentações no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <ProductFormModal
          onClose={() => setFormOpen(false)}
          editingProduct={editingProduct}
          categories={categories}
          suppliers={suppliers}
          onOptionsChanged={loadOptions}
          onSaved={async () => {
            setFormOpen(false);
            setFeedback(editingProduct ? 'Produto atualizado com sucesso.' : 'Produto cadastrado com sucesso.');
            await loadAll();
          }}
        />
      )}

      {imagePreview && <ModalFrame className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" onClick={() => setImagePreview(null)}><button type="button" aria-label="Fechar imagem" className="absolute right-5 top-5 text-white" onClick={() => setImagePreview(null)}><X size={28} /></button><img src={imagePreview.image_url} alt={imagePreview.name} className="max-h-[88vh] max-w-full rounded-xl object-contain" /></ModalFrame>}

      {actionModal.open && (
        <StockActionModal
          mode={actionModal.mode}
          product={actionModal.product}
          onClose={() => setActionModal({ open: false, mode: 'entry', product: null })}
          onSaved={async (message) => {
            setActionModal({ open: false, mode: 'entry', product: null });
            setFeedback(message);
            await refreshCore();
          }}
        />
      )}

      {historyModal.open && (
        <ModalFrame className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setHistoryModal({ open: false, product: null, rows: [] })}>
          <div className="card w-full max-w-4xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-lg">Histórico: {historyModal.product?.name}</h3>
              <button className="btn-secondary" onClick={() => setHistoryModal({ open: false, product: null, rows: [] })}>Fechar</button>
            </div>
            <div className="table-scroll max-h-[65vh] overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-ink-700">
                    <th className="px-3 py-2.5">Data/Hora</th>
                    <th className="px-3 py-2.5">Tipo</th>
                    <th className="px-3 py-2.5">Qtd. alterada</th>
                    <th className="px-3 py-2.5">Saldo</th>
                    <th className="px-3 py-2.5">Usuário</th>
                    <th className="px-3 py-2.5">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {historyModal.rows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-50 dark:border-ink-700/50">
                      <td className="px-3 py-2.5 text-slate-500">{formatDateTime(row.created_at)}</td>
                      <td className="px-3 py-2.5">{MOVEMENT_LABELS[row.movement_type] || row.movement_type}</td>
                      <td className={`px-3 py-2.5 font-semibold ${row.quantity_delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{row.quantity_delta >= 0 ? `+${row.quantity_delta}` : row.quantity_delta}</td>
                      <td className="px-3 py-2.5">{row.previous_quantity} → {row.new_quantity}</td>
                      <td className="px-3 py-2.5">{row.user_name || 'Sistema'}</td>
                      <td className="px-3 py-2.5 text-slate-500">{row.reason || '—'}</td>
                    </tr>
                  ))}
                  {historyModal.rows.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Nenhuma movimentação para este produto.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </ModalFrame>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone = 'brand' }) {
  const toneClass = tone === 'yellow'
    ? 'text-amber-500 bg-amber-100 dark:bg-amber-500/15'
    : tone === 'red'
      ? 'text-rose-500 bg-rose-100 dark:bg-rose-500/15'
      : tone === 'green'
        ? 'text-emerald-500 bg-emerald-100 dark:bg-emerald-500/15'
        : 'text-brand-600 bg-brand-100 dark:bg-brand-500/15';

  return (
    <div className="card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
          <p className="text-xl font-bold mt-1">{value}</p>
        </div>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${toneClass}`}><Icon size={18} /></div>
      </div>
    </div>
  );
}

function ProductFormModal({ onClose, editingProduct, categories, suppliers, onSaved, onOptionsChanged }) {
  const [form, setForm] = useState({
    name: editingProduct?.name || '',
    model: editingProduct?.model || '',
    code: editingProduct?.code || '',
    barcode: editingProduct?.barcode || '',
    category_id: editingProduct?.category_id || '',
    category_name: '',
    supplier_id: editingProduct?.supplier_id || '',
    supplier_name: '',
    cost_price: editingProduct?.cost_price ?? '',
    sale_price: editingProduct?.sale_price ?? '',
    initial_quantity: editingProduct?.quantity ?? 0,
    min_stock: editingProduct?.min_stock ?? 0,
    notes: editingProduct?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [manager, setManager] = useState(null);
  const [localCategories, setLocalCategories] = useState(categories);
  const [localSuppliers, setLocalSuppliers] = useState(suppliers);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(editingProduct?.image_url || '');
  const cameraRef = React.useRef(null);
  const galleryRef = React.useRef(null);

  useEffect(() => () => { if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  function choosePhoto(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setError('Selecione uma imagem JPG, PNG ou WebP.');
    if (file.size > 10 * 1024 * 1024) return setError('A foto deve ter no máximo 10 MB.');
    if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function refreshOptions(type, selectedId) {
    const endpoint = type === 'supplier' ? 'suppliers' : 'categories';
    const { data } = await api.get(`/inventory/${endpoint}`);
    if (type === 'supplier') setLocalSuppliers(data); else setLocalCategories(data);
    const field = type === 'supplier' ? 'supplier_id' : 'category_id';
    setForm(prev => ({ ...prev, [field]: selectedId || (data.some(item => String(item.id) === String(prev[field])) ? prev[field] : '') }));
    await onOptionsChanged?.();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      name: form.name,
      model: form.model,
      code: form.code,
      barcode: form.barcode,
      category_id: form.category_id || undefined,
      category_name: form.category_id ? undefined : (form.category_name || undefined),
      supplier_id: form.supplier_id || undefined,
      supplier_name: form.supplier_id ? undefined : (form.supplier_name || undefined),
      cost_price: form.cost_price,
      sale_price: form.sale_price,
      min_stock: form.min_stock,
      notes: form.notes,
    };

    if (!editingProduct) payload.initial_quantity = form.initial_quantity;

    try {
      const { data: savedProduct } = editingProduct
        ? await api.put(`/inventory/products/${editingProduct.id}`, payload)
        : await api.post('/inventory/products', payload);
      if (photo) {
        const imageData = new FormData();
        imageData.append('image', photo);
        await api.post(`/inventory/products/${savedProduct.id}/image`, imageData);
      }
      await onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar o produto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalFrame busy={saving} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/70 dark:border-white/10">
          <h3 className="font-display font-bold text-lg">{editingProduct ? 'Editar Produto' : 'Cadastrar Produto'}</h3>
          <button type="button" className="btn-ghost !px-2 !py-1.5" onClick={onClose} aria-label="Fechar modal"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-sm text-rose-600 bg-rose-100/70 dark:bg-rose-500/10 rounded-lg p-2.5">{error}</p>}

          <div className="grid md:grid-cols-2 gap-3">
            <div><label className="label">Nome</label><input required className="input" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} /></div>
            <div><label className="label">Modelo</label><input className="input" value={form.model} onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))} /></div>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div><label className="label">Código</label><input required className="input" value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))} /></div>
            <div><label className="label">Código de barras (opcional)</label><input className="input" value={form.barcode} onChange={(e) => setForm((prev) => ({ ...prev, barcode: e.target.value }))} /></div>
            <div><label className="label">Estoque mínimo</label><input type="number" min="0" className="input" value={form.min_stock} onChange={(e) => setForm((prev) => ({ ...prev, min_stock: e.target.value }))} /></div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="label">Categoria</label>
              <div className="flex gap-2"><select className="input min-w-0 flex-1" value={form.category_id} onChange={(e) => setForm((prev) => ({ ...prev, category_id: e.target.value }))}>
                <option value="">Selecionar categoria</option>
                {localCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select><button type="button" aria-label="Gerenciar categorias" className="btn-secondary shrink-0" onClick={() => setManager('category')}><Settings size={15} /><span className="hidden sm:inline">Gerenciar</span></button></div>
            </div>
            <div>
              <label className="label">Fornecedor</label>
              <div className="flex gap-2"><select className="input min-w-0 flex-1" value={form.supplier_id} onChange={(e) => setForm((prev) => ({ ...prev, supplier_id: e.target.value }))}>
                <option value="">Selecionar fornecedor</option>
                {localSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select><button type="button" aria-label="Gerenciar fornecedores" className="btn-secondary shrink-0" onClick={() => setManager('supplier')}><Settings size={15} /><span className="hidden sm:inline">Gerenciar</span></button></div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <label className="label">Foto do produto</label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {photoPreview ? <div className="h-28 w-28 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"><img src={photoPreview} alt="Prévia do produto" className="h-full w-full object-cover" /></div> : <div className="flex h-28 w-28 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400 dark:bg-ink-700">Sem foto</div>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={() => cameraRef.current?.click()}><Camera size={16} /> Tirar foto</button>
                <button type="button" className="btn-secondary" onClick={() => galleryRef.current?.click()}><ImagePlus size={16} /> Escolher da galeria</button>
                {editingProduct?.image_public_id && !photo && <button type="button" className="btn-secondary !text-rose-600" onClick={async () => { if (!confirmRecordDeletion('Remover a foto deste produto?')) return; try { await api.delete(`/inventory/products/${editingProduct.id}/image`); setPhotoPreview(''); } catch (err) { setError(err.response?.data?.error || 'Não foi possível remover a foto.'); } }}><Trash2 size={15} /> Remover foto</button>}
              </div>
            </div>
            <input ref={cameraRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e => { choosePhoto(e.target.files?.[0]); e.target.value = ''; }} />
            <input ref={galleryRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { choosePhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div><label className="label">Preço de custo</label><input type="number" step="0.01" min="0" className="input" value={form.cost_price} onChange={(e) => setForm((prev) => ({ ...prev, cost_price: e.target.value }))} /></div>
            <div><label className="label">Preço de venda</label><input type="number" step="0.01" min="0" className="input" value={form.sale_price} onChange={(e) => setForm((prev) => ({ ...prev, sale_price: e.target.value }))} /></div>
            {!editingProduct && <div><label className="label">Quantidade inicial</label><input type="number" min="0" className="input" value={form.initial_quantity} onChange={(e) => setForm((prev) => ({ ...prev, initial_quantity: e.target.value }))} /></div>}
          </div>

          <div>
            <label className="label">Observações</label>
            <textarea className="input min-h-[70px]" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar Produto'}</button>
          </div>
        </form>
      </div>
      {manager && <CatalogManagerModal type={manager} onClose={() => setManager(null)} onChanged={refreshOptions} />}
    </ModalFrame>
  );
}

function CatalogManagerModal({ type, onClose, onChanged }) {
  const isSupplier = type === 'supplier';
  const endpoint = isSupplier ? 'suppliers' : 'categories';
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', contact_info: '', notes: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const load = useCallback(() => api.get(`/inventory/${endpoint}`, { params: { include_inactive: 1 } }).then(({ data }) => setItems(data)), [endpoint]);
  useEffect(() => { load().catch(() => setError('Não foi possível carregar os registros.')); }, [load]);

  function startEdit(item) {
    setEditing(item);
    setForm({ name: item.name, contact_info: item.contact_info || '', notes: item.notes || '' });
    setError('');
  }
  function reset() { setEditing(null); setForm({ name: '', contact_info: '', notes: '' }); }
  async function save(event) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const payload = isSupplier ? form : { name: form.name };
      const wasEditing = Boolean(editing);
      const { data } = editing
        ? await api.put(`/inventory/${endpoint}/${editing.id}`, payload)
        : await api.post(`/inventory/${endpoint}`, payload);
      await load(); await onChanged(type, data.id); reset();
      setMessage(wasEditing ? 'Registro atualizado.' : 'Registro adicionado e selecionado.');
    } catch (err) { setError(err.response?.data?.error || 'Não foi possível salvar.'); }
  }
  async function confirmDelete() {
    const item = pendingDelete;
    if (!item) return;
    setDeleting(true);
    try {
      const { data } = await api.delete(`/inventory/${endpoint}/${item.id}`);
      setMessage(`Exclusão permanente concluída. ${data.product_count || 0} produto(s) foram preservados sem vínculo.`);
      setPendingDelete(null);
      await load(); await onChanged(type);
    } catch (err) { setError(err.response?.data?.error || 'Não foi possível excluir permanentemente.'); }
    finally { setDeleting(false); }
  }

  return <ModalFrame className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
    <div className="modal-panel w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-display text-lg font-bold">Gerenciar {isSupplier ? 'Fornecedores' : 'Categorias'}</h3><button type="button" className="btn-secondary" onClick={onClose}>Fechar</button></div>
      {error && <p className="mb-3 rounded-lg bg-rose-100 p-2 text-sm text-rose-700">{error}</p>}
      {message && <p className="mb-3 rounded-lg bg-emerald-100 p-2 text-sm text-emerald-700">{message}</p>}
      <form onSubmit={save} className="mb-4 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <p className="text-sm font-semibold">{editing ? 'Editar' : '+ Adicionar'} {isSupplier ? 'fornecedor' : 'categoria'}</p>
        <input className="input" required maxLength={200} placeholder="Nome" value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} />
        {isSupplier && <><input className="input" maxLength={100} placeholder="Telefone/WhatsApp" value={form.contact_info} onChange={e => setForm(v => ({ ...v, contact_info: e.target.value }))} /><textarea className="input" rows={2} maxLength={1000} placeholder="Observação" value={form.notes} onChange={e => setForm(v => ({ ...v, notes: e.target.value }))} /></>}
        <div className="flex justify-end gap-2">{editing && <button type="button" className="btn-secondary" onClick={reset}>Cancelar edição</button>}<button className="btn-primary" type="submit">Salvar</button></div>
      </form>
      <div className="space-y-2">{items.map(item => <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700"><div><p className="font-medium">{item.name}</p><p className="text-xs text-slate-400">{isSupplier ? `${item.product_count || 0} produto(s) • ${item.service_order_count || 0} OS • ${item.withdrawal_count || 0} retirada(s)` : `${item.product_count || 0} produto(s) vinculado(s)`}</p></div><div className="flex gap-2"><button type="button" className="btn-secondary" onClick={() => startEdit(item)}><Pencil size={14} /> Editar</button><button type="button" className="btn-secondary !text-rose-600" onClick={() => setPendingDelete(item)}><Trash2 size={14} /> Excluir</button></div></div>)}</div>
    </div>
    {pendingDelete && <PermanentDeleteDialog subject={isSupplier ? 'fornecedor' : 'categoria'} busy={deleting} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />}
  </ModalFrame>;
}

function StockActionModal({ mode, product, onClose, onSaved }) {
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const title = mode === 'entry' ? 'Adicionar estoque' : 'Retirar estoque';

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (mode === 'entry') {
        await api.post(`/inventory/products/${product.id}/add-stock`, { quantity, reason });
      } else {
        await api.post(`/inventory/products/${product.id}/remove-stock`, { quantity, reason });
      }
      await onSaved(mode === 'entry' ? 'Entrada de estoque registrada com sucesso.' : 'Saída de estoque registrada com sucesso.');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível registrar a movimentação.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalFrame busy={saving} className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel modal-panel-mobile p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-lg">{title}</h3>
          <button className="btn-secondary" onClick={onClose}>Fechar</button>
        </div>

        <p className="text-sm text-slate-400 mb-3">{product.name} • estoque atual: {product.quantity}</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-sm text-rose-600 bg-rose-100/70 dark:bg-rose-500/10 rounded-lg p-2.5">{error}</p>}

          <div>
            <label className="label">Quantidade</label>
            <input type="number" min="1" required className="input" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <label className="label">Motivo</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === 'entry' ? 'Compra de mercadorias, devolução...' : 'Perda, uso interno, avaria...'} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Confirmar'}</button>
          </div>
        </form>
      </div>
    </ModalFrame>
  );
}
