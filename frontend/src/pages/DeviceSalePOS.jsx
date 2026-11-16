import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, Smartphone, ShoppingBag, Wrench, X, Plus, Minus, Trash2,
  CheckCircle2, User, CreditCard, Banknote, QrCode, ArrowLeft,
  ChevronRight, AlertCircle, ShieldAlert, Sparkles, Tag, Package, Printer
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { formatCurrency } from '../utils/format';
import CustomerPicker from '../components/UI/CustomerPicker';
import ModalFrame from '../components/UI/ModalFrame';

const CATEGORIES = [
  { id: 'all', label: 'Tudo', icon: ShoppingBag },
  { id: 'devices', label: 'Aparelhos', icon: Smartphone },
  { id: 'accessories', label: 'Acessórios', icon: Package },
  { id: 'services', label: 'Serviço rápido', icon: Wrench },
];

const QUICK_SERVICES = [
  { id: 'qs-1', name: 'Aplicação de Película', price: 25.00, cost: 5.00 },
  { id: 'qs-2', name: 'Limpeza de Conector / Alto-falante', price: 40.00, cost: 0.00 },
  { id: 'qs-3', name: 'Backup / Transferência de Dados', price: 60.00, cost: 0.00 },
  { id: 'qs-4', name: 'Formatação / Restauração de Sistema', price: 70.00, cost: 0.00 },
  { id: 'qs-5', name: 'Troca de Película Traseira / Lente', price: 35.00, cost: 8.00 },
];

export default function DeviceSalePOS() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialDeviceId = searchParams.get('deviceId');

  const { user, isAdmin } = useAuth();
  const { settings } = useSettings();

  // Permissão financeira para visualização de margem/custo
  const isFinancialAllowed = useMemo(() => {
    if (isAdmin) return true;
    return !!(user?.permissions?.finance || user?.permissions?.financial_access);
  }, [isAdmin, user]);

  // Estados de catálogo e busca
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [devicesList, setDevicesList] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  // Carrinho de itens
  // item = { id, type: 'device' | 'product' | 'service', originalId, name, details, unitPrice, costPrice, quantity, imei, serial }
  const [cart, setCart] = useState([]);

  // Cliente selecionado
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  // Pagamento e Totais
  const [discountType, setDiscountType] = useState('value'); // 'value' | 'percent'
  const [discountValue, setDiscountValue] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('pix'); // 'pix', 'credit_card', 'debit_card', 'cash', 'credit'
  const [notes, setNotes] = useState('');

  // Serviço rápido customizado
  const [isCustomServiceModalOpen, setIsCustomServiceModalOpen] = useState(false);
  const [customServiceName, setCustomServiceName] = useState('');
  const [customServicePrice, setCustomServicePrice] = useState('');
  const [customServiceCost, setCustomServiceCost] = useState('');

  // Estados de submissão e conclusão
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [completedSale, setCompletedSale] = useState(null);

  const searchInputRef = useRef(null);

  // 1. Carregar catálogo inicial
  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      // Carregar aparelhos em estoque
      const devRes = await api.get('/devices', { params: { tab: 'in_stock', limit: 100 } });
      const devItems = devRes.data?.items || devRes.data || [];
      setDevicesList(Array.isArray(devItems) ? devItems : []);

      // Carregar produtos de estoque/acessórios
      const prodRes = await api.get('/store-sales/products');
      const prodItems = prodRes.data || [];
      setProductsList(Array.isArray(prodItems) ? prodItems : []);
    } catch (err) {
      console.error('Erro ao carregar catálogo para PDV:', err);
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // 2. Pré-carregar aparelho quando passado via parâmetro `deviceId`
  useEffect(() => {
    if (!initialDeviceId) return;

    let active = true;
    async function loadPrefilledDevice() {
      try {
        const { data: dev } = await api.get(`/devices/${initialDeviceId}`);
        if (!active || !dev) return;

        if (dev.status !== 'in_stock') {
          setFeedback({
            type: 'error',
            message: `Atenção: O aparelho ${dev.brand} ${dev.model} não está com status 'Em Estoque' (Situação atual: ${dev.status}).`
          });
          return;
        }

        // Adiciona automaticamente ao carrinho caso ainda não esteja
        setCart(prev => {
          const already = prev.find(it => it.type === 'device' && it.originalId === dev.id);
          if (already) return prev;

          const desc = `${dev.brand} ${dev.model} ${dev.storage || ''} ${dev.color ? `(${dev.color})` : ''}`.trim();
          const newItem = {
            cartItemId: `dev-${dev.id}-${Date.now()}`,
            type: 'device',
            originalId: dev.id,
            name: desc,
            details: `IMEI: ${dev.imei1 || dev.serial_number || 'Sem serial'} · Condição: ${dev.condition || 'Seminovo'}`,
            unitPrice: Number(dev.sell_price) || 0,
            costPrice: Number(dev.cost_price) || 0,
            quantity: 1,
            imei: dev.imei1 || '',
            serial: dev.serial_number || ''
          };
          return [newItem, ...prev];
        });
      } catch (err) {
        console.error('Erro ao carregar aparelho pré-selecionado:', err);
      }
    }

    loadPrefilledDevice();
    return () => { active = false; };
  }, [initialDeviceId]);

  // 3. Atalhos de Teclado (F2, F4, F8, F10, Escape)
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === 'F4') {
        e.preventDefault();
        setIsCustomerModalOpen(true);
      } else if (e.key === 'F8') {
        e.preventDefault();
        const select = document.getElementById('pos-payment-select');
        select?.focus();
      } else if (e.key === 'F10') {
        e.preventDefault();
        if (cart.length > 0 && !saving) {
          handleFinalizeSale();
        }
      } else if (e.key === 'Escape') {
        if (isCustomerModalOpen) setIsCustomerModalOpen(false);
        if (isCustomServiceModalOpen) setIsCustomServiceModalOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // 4. Adicionar Aparelho ao Carrinho
  const addDeviceToCart = (dev) => {
    if (dev.status !== 'in_stock') {
      alert('Este aparelho não está disponível em estoque.');
      return;
    }

    const alreadyInCart = cart.find(it => it.type === 'device' && it.originalId === dev.id);
    if (alreadyInCart) {
      alert('Este aparelho já está adicionado ao carrinho de venda.');
      return;
    }

    const desc = `${dev.brand} ${dev.model} ${dev.storage || ''} ${dev.color ? `(${dev.color})` : ''}`.trim();
    const newItem = {
      cartItemId: `dev-${dev.id}-${Date.now()}`,
      type: 'device',
      originalId: dev.id,
      name: desc,
      details: `IMEI: ${dev.imei1 || dev.serial_number || 'Sem serial'} · Condição: ${dev.condition || 'Seminovo'}`,
      unitPrice: Number(dev.sell_price) || 0,
      costPrice: Number(dev.cost_price) || 0,
      quantity: 1,
      imei: dev.imei1 || '',
      serial: dev.serial_number || ''
    };

    setCart(prev => [newItem, ...prev]);
    setFeedback({ type: '', message: '' });
  };

  // 5. Adicionar Produto / Acessório ao Carrinho
  const addProductToCart = (prod) => {
    setCart(prev => {
      const existing = prev.find(it => it.type === 'product' && it.originalId === prod.id);
      if (existing) {
        return prev.map(it => {
          if (it.cartItemId === existing.cartItemId) {
            return { ...it, quantity: it.quantity + 1 };
          }
          return it;
        });
      }

      const newItem = {
        cartItemId: `prod-${prod.id}-${Date.now()}`,
        type: 'product',
        originalId: prod.id,
        name: prod.name,
        details: prod.code ? `Cód: ${prod.code}` : 'Acessório / Peça',
        unitPrice: Number(prod.sale_price) || 0,
        costPrice: Number(prod.cost_price) || 0,
        quantity: 1,
        imei: '',
        serial: ''
      };
      return [...prev, newItem];
    });
  };

  // 6. Adicionar Serviço Rápido ao Carrinho
  const addQuickServiceToCart = (qs) => {
    setCart(prev => {
      const newItem = {
        cartItemId: `qs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'service',
        originalId: null,
        name: qs.name,
        details: 'Serviço rápido avulso',
        unitPrice: Number(qs.price) || 0,
        costPrice: Number(qs.cost) || 0,
        quantity: 1,
        imei: '',
        serial: ''
      };
      return [...prev, newItem];
    });
  };

  // 7. Adicionar Serviço Rápido Customizado
  const handleAddCustomService = (e) => {
    e.preventDefault();
    if (!customServiceName.trim()) {
      alert('Informe o nome ou descrição do serviço.');
      return;
    }
    const price = Number(String(customServicePrice).replace(',', '.')) || 0;
    const cost = Number(String(customServiceCost).replace(',', '.')) || 0;

    addQuickServiceToCart({
      name: customServiceName.trim(),
      price,
      cost
    });

    setCustomServiceName('');
    setCustomServicePrice('');
    setCustomServiceCost('');
    setIsCustomServiceModalOpen(false);
  };

  // 8. Atualizar Preço ou Quantidade de Item no Carrinho
  const updateCartItemQuantity = (cartItemId, delta) => {
    setCart(prev => {
      return prev.map(it => {
        if (it.cartItemId !== cartItemId) return it;
        if (it.type === 'device') {
          // Aparelho físico é unidade individual
          return it;
        }
        const newQty = Math.max(1, it.quantity + delta);
        return { ...it, quantity: newQty };
      });
    });
  };

  const updateCartItemPrice = (cartItemId, newPrice) => {
    const parsed = Number(String(newPrice).replace(',', '.')) || 0;
    setCart(prev => {
      return prev.map(it => {
        if (it.cartItemId === cartItemId) {
          return { ...it, unitPrice: parsed };
        }
        return it;
      });
    });
  };

  const removeCartItem = (cartItemId) => {
    setCart(prev => prev.filter(it => it.cartItemId !== cartItemId));
  };

  // 9. Cálculos Totais e Margem
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  }, [cart]);

  const totalCost = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.quantity * item.costPrice), 0);
  }, [cart]);

  const numericDiscount = Math.max(0, Number(String(discountValue).replace(',', '.')) || 0);

  const discountAmount = useMemo(() => {
    if (!subtotal) return 0;
    if (discountType === 'percent') {
      return Math.min(subtotal, subtotal * (numericDiscount / 100));
    }
    return Math.min(subtotal, numericDiscount);
  }, [discountType, numericDiscount, subtotal]);

  const total = Math.max(0, subtotal - discountAmount);
  const estimatedProfit = Math.max(0, total - totalCost);
  const marginPercent = totalCost > 0 ? ((estimatedProfit / totalCost) * 100).toFixed(0) : 100;

  // 10. Filtragem do Catálogo
  const filteredCatalog = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    const devMatches = devicesList.filter(d => {
      if (activeCategory !== 'all' && activeCategory !== 'devices') return false;
      if (!q) return true;
      const full = `${d.brand} ${d.model} ${d.imei1 || ''} ${d.serial_number || ''} ${d.color || ''}`.toLowerCase();
      return full.includes(q);
    });

    const prodMatches = productsList.filter(p => {
      if (activeCategory !== 'all' && activeCategory !== 'accessories') return false;
      if (!q) return true;
      const full = `${p.name} ${p.model || ''} ${p.code || ''}`.toLowerCase();
      return full.includes(q);
    });

    return {
      devices: devMatches,
      products: prodMatches,
    };
  }, [activeCategory, devicesList, productsList, searchQuery]);

  // 11. Finalizar Venda
  const handleFinalizeSale = async () => {
    if (!cart.length) {
      alert('Adicione pelo menos um item ao carrinho para finalizar a venda.');
      return;
    }

    if (total <= 0) {
      alert('O valor total da venda deve ser maior que zero.');
      return;
    }

    // Montar payload compatível com POST /api/device-sales
    const today = new Date().toISOString().slice(0, 10);
    const customerName = selectedCustomer
      ? `${selectedCustomer.first_name || ''} ${selectedCustomer.last_name || ''}`.trim()
      : 'Cliente Balcão';

    const itemsPayload = cart.map((it, idx) => ({
      item: String(idx + 1),
      product: it.type === 'device'
        ? `${it.name} - ${it.details}`
        : it.name,
      quantity: it.quantity,
      unit_price: it.unitPrice,
      subtotal: it.quantity * it.unitPrice,
      device_id: it.type === 'device' ? it.originalId : null,
    }));

    const payload = {
      order_number: '',
      sale_date: today,
      seller_name: user?.name || user?.full_name || 'Vendedor',
      customer_id: selectedCustomer ? selectedCustomer.id : null,
      customer_name: customerName,
      customer_cpf_cnpj: selectedCustomer?.cpf_cnpj || '',
      address: selectedCustomer?.address || '',
      city: selectedCustomer?.city || '',
      state: selectedCustomer?.state || '',
      cep: selectedCustomer?.cep || '',
      phone: selectedCustomer?.phone || '',
      email: selectedCustomer?.email || '',
      horario: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      payment_method: paymentMethod,
      notes: notes.trim() ? notes.trim() : (discountAmount > 0 ? `Desconto concedido: R$ ${discountAmount.toFixed(2)}` : ''),
      items: itemsPayload,
      total_amount: total,
    };

    setSaving(true);
    setFeedback({ type: '', message: '' });

    try {
      const response = await api.post('/device-sales', payload);
      const saleResult = response.data;

      setCompletedSale({
        ...saleResult,
        items: itemsPayload,
        total_amount: total,
        customer_name: customerName,
        payment_method: paymentMethod
      });

      // Recarrega catálogo
      loadCatalog();
    } catch (err) {
      console.error('Erro ao finalizar venda no PDV:', err);
      const msg = err.response?.data?.error || err.message || 'Erro ao registrar venda.';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setSaving(false);
    }
  };

  const resetSale = () => {
    setCart([]);
    setSelectedCustomer(null);
    setDiscountValue('0');
    setNotes('');
    setFeedback({ type: '', message: '' });
    setCompletedSale(null);
    loadCatalog();
  };

  return (
    <div className="space-y-4">
      {/* 1. TOPO: Identificação da Loja, Usuário, Atalhos e Botão Sair */}
      <div className="card p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b-2 border-brand-500/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center shrink-0">
            <ShoppingBag className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-base text-slate-900 dark:text-white">
                Frente de Caixa · PDV
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                Caixa Aberto
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Operador: <strong className="text-slate-700 dark:text-zinc-200">{user?.name || user?.full_name || user?.username || 'Usuário'}</strong>
            </p>
          </div>
        </div>

        {/* Atalhos Rápidos */}
        <div className="hidden lg:flex items-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400">
          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-ink-800 border border-slate-200 dark:border-ink-700 font-mono">F2</span> Buscar
          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-ink-800 border border-slate-200 dark:border-ink-700 font-mono">F4</span> Cliente
          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-ink-800 border border-slate-200 dark:border-ink-700 font-mono">F8</span> Pagamento
          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-ink-800 border border-slate-200 dark:border-ink-700 font-mono">F10</span> Finalizar
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/aparelhos')}
            className="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar para Aparelhos
          </button>
        </div>
      </div>

      {/* Alerta de Feedback */}
      {feedback.message && (
        <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
          feedback.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300'
            : 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Grid Principal: Esquerda (Catálogo/Produtos/Serviços) | Direita (Painel Lateral de Venda) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* COLUNA ESQUERDA (8 colunas): Campo de Pesquisa, Categorias e Catálogo */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {/* Campo Amplo de Pesquisa com Destaque */}
          <div className="card p-3 sm:p-4">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Digite o IMEI ou busque aparelho, acessório ou serviço... (F2)"
                className="input w-full pl-11 pr-4 py-3 text-sm rounded-xl font-medium focus:ring-2 focus:ring-brand-500/30"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Categorias */}
            <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1">
              {CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const active = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                      active
                        ? 'bg-brand-500 text-slate-950 shadow-sm font-bold'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-ink-800 dark:hover:bg-ink-700 text-slate-600 dark:text-zinc-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grid de Itens e Catálogo */}
          <div className="space-y-4">
            {/* Seção Aparelhos em Estoque */}
            {(activeCategory === 'all' || activeCategory === 'devices') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                    Aparelhos em Estoque ({filteredCatalog.devices.length})
                  </span>
                </div>

                {filteredCatalog.devices.length === 0 ? (
                  <div className="card p-6 text-center text-xs text-slate-400 dark:text-zinc-500 italic">
                    Nenhum aparelho encontrado com os filtros atuais.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {filteredCatalog.devices.map(dev => {
                      const inCart = cart.some(it => it.type === 'device' && it.originalId === dev.id);
                      return (
                        <div
                          key={`dev-${dev.id}`}
                          onClick={() => !inCart && addDeviceToCart(dev)}
                          className={`card p-3 rounded-2xl flex flex-col justify-between transition-all cursor-pointer ${
                            inCart
                              ? 'opacity-60 border-brand-500/40 bg-brand-500/5 cursor-not-allowed'
                              : 'hover:border-brand-500/70 hover:shadow-md'
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-500/15 text-brand-700 dark:text-brand-400">
                                {dev.brand}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-ink-700 text-slate-500 dark:text-zinc-400">
                                {dev.condition || 'Seminovo'}
                              </span>
                            </div>
                            <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1.5 truncate">
                              {dev.model}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-zinc-400">
                              {dev.storage || 'Sem armaz.'} · {dev.color || 'Sem cor'}
                            </p>
                            <p className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 mt-1 truncate">
                              IMEI: {dev.imei1 || dev.serial_number || 'Sem serial'}
                            </p>
                          </div>

                          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-ink-700/80 flex items-center justify-between">
                            <span className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                              R$ {Number(dev.sell_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            <button
                              type="button"
                              disabled={inCart}
                              className={`!py-1 !px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                                inCart ? 'bg-slate-200 dark:bg-ink-800 text-slate-400' : 'btn-primary'
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              {inCart ? 'Adicionado' : 'Adicionar'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Seção Acessórios e Peças do Estoque */}
            {(activeCategory === 'all' || activeCategory === 'accessories') && (
              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-blue-500" />
                  Acessórios e Produtos ({filteredCatalog.products.length})
                </span>

                {filteredCatalog.products.length === 0 ? (
                  <div className="card p-6 text-center text-xs text-slate-400 dark:text-zinc-500 italic">
                    Nenhum produto cadastrado no controle de estoque.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {filteredCatalog.products.map(prod => (
                      <div
                        key={`prod-${prod.id}`}
                        onClick={() => addProductToCart(prod)}
                        className="card p-3 rounded-2xl flex flex-col justify-between hover:border-brand-500/70 hover:shadow-md transition-all cursor-pointer"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                              Estoque: {prod.quantity} un
                            </span>
                            {prod.code && (
                              <span className="text-[10px] font-mono text-slate-400">#{prod.code}</span>
                            )}
                          </div>
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1.5 truncate">
                            {prod.name}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                            {prod.model || 'Acessório'}
                          </p>
                        </div>

                        <div className="mt-3 pt-2 border-t border-slate-100 dark:border-ink-700/80 flex items-center justify-between">
                          <span className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                            R$ {Number(prod.sale_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                          <button
                            type="button"
                            className="btn-secondary !py-1 !px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Adicionar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Seção Serviço Rápido */}
            {(activeCategory === 'all' || activeCategory === 'services') && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-amber-500" />
                    Serviços Rápidos de Balcão
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsCustomServiceModalOpen(true)}
                    className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Outro Serviço
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                  {QUICK_SERVICES.map(qs => (
                    <div
                      key={qs.id}
                      onClick={() => addQuickServiceToCart(qs)}
                      className="card p-3 rounded-2xl flex flex-col justify-between hover:border-amber-500/70 hover:shadow-md transition-all cursor-pointer"
                    >
                      <div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                          Serviço Rápido
                        </span>
                        <h3 className="font-bold text-xs text-slate-900 dark:text-white mt-1.5">
                          {qs.name}
                        </h3>
                      </div>
                      <div className="mt-3 pt-2 border-t border-slate-100 dark:border-ink-700/80 flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                          R$ {qs.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <button
                          type="button"
                          className="btn-secondary !py-1 !px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Adicionar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA (5 colunas): PAINEL LATERAL DE VENDA */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4 sticky top-4">
          <div className="card p-4 space-y-4 border-2 border-slate-200 dark:border-white/10 shadow-lg">
            {/* 1. Cliente */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                  Cliente (F4)
                </span>
                {selectedCustomer && (
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="text-[11px] text-rose-500 hover:underline"
                  >
                    Remover
                  </button>
                )}
              </div>

              {selectedCustomer ? (
                <div className="p-2.5 rounded-xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                      {selectedCustomer.first_name} {selectedCustomer.last_name}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                      {selectedCustomer.phone || selectedCustomer.cpf_cnpj || 'Sem telefone/documento'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCustomerModalOpen(true)}
                    className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    Alterar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(true)}
                  className="w-full py-2 px-3 rounded-xl border border-dashed border-slate-300 dark:border-ink-700 hover:border-brand-500 text-xs text-slate-500 dark:text-zinc-400 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Venda sem cliente identificado (Clique para selecionar)
                </button>
              )}
            </div>

            {/* 2. Itens do Carrinho */}
            <div className="border-t border-slate-100 dark:border-ink-700/80 pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                  <ShoppingBag className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                  Itens da Venda ({cart.length})
                </span>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCart([])}
                    className="text-[11px] text-slate-400 hover:text-rose-500 transition-colors"
                  >
                    Limpar itens
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-ink-800 text-center text-xs text-slate-400 italic">
                  Nenhum item adicionado à venda. Clique nos cards à esquerda ou pesquise pelo IMEI.
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div
                      key={item.cartItemId}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 flex items-start justify-between gap-2 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                            item.type === 'device'
                              ? 'bg-brand-500/20 text-brand-700 dark:text-brand-400'
                              : item.type === 'service'
                              ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                              : 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
                          }`}>
                            {item.type === 'device' ? 'Aparelho' : item.type === 'service' ? 'Serviço' : 'Produto'}
                          </span>
                          <h4 className="font-semibold text-slate-900 dark:text-white truncate">
                            {item.name}
                          </h4>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 truncate">
                          {item.details}
                        </p>

                        {/* Preço editável */}
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[11px] text-slate-400">Preço un:</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.unitPrice}
                            onChange={(e) => updateCartItemPrice(item.cartItemId, e.target.value)}
                            className="input !py-0.5 !px-1.5 w-24 text-xs font-mono font-bold"
                          />
                        </div>
                      </div>

                      {/* Controles de Quantidade e Excluir */}
                      <div className="flex flex-col items-end justify-between self-stretch shrink-0">
                        <button
                          type="button"
                          onClick={() => removeCartItem(item.cartItemId)}
                          className="p-1 text-slate-400 hover:text-rose-500 rounded transition-colors"
                          title="Remover item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <div className="flex items-center gap-1 mt-auto">
                          {item.type !== 'device' && (
                            <button
                              type="button"
                              onClick={() => updateCartItemQuantity(item.cartItemId, -1)}
                              className="w-5 h-5 rounded bg-slate-200 dark:bg-ink-800 text-slate-600 dark:text-zinc-300 flex items-center justify-center text-xs"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                          )}
                          <span className="font-mono font-bold px-1 text-xs">
                            {item.quantity}x
                          </span>
                          {item.type !== 'device' && (
                            <button
                              type="button"
                              onClick={() => updateCartItemQuantity(item.cartItemId, 1)}
                              className="w-5 h-5 rounded bg-slate-200 dark:bg-ink-800 text-slate-600 dark:text-zinc-300 flex items-center justify-center text-xs"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Forma de Pagamento e Desconto */}
            <div className="border-t border-slate-100 dark:border-ink-700/80 pt-3 space-y-3">
              <div>
                <label className="label text-xs">Forma de Pagamento (F8)</label>
                <select
                  id="pos-payment-select"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="input w-full text-xs"
                >
                  <option value="pix">PIX</option>
                  <option value="credit_card">Cartão de Crédito</option>
                  <option value="debit_card">Cartão de Débito</option>
                  <option value="cash">Dinheiro</option>
                  <option value="credit">Crediário / Fiado</option>
                </select>
              </div>

              {/* Desconto */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label text-xs">Tipo de Desconto</label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value)}
                    className="input w-full text-xs"
                  >
                    <option value="value">Valor (R$)</option>
                    <option value="percent">Percentual (%)</option>
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Desconto</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className="input w-full text-xs"
                    placeholder="0,00"
                  />
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="label text-xs">Observações da Venda</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Garantia de 90 dias, brinde película..."
                  className="input w-full text-xs"
                />
              </div>
            </div>

            {/* 4. Totais e Margem */}
            <div className="border-t border-slate-100 dark:border-ink-700/80 pt-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
                <span>Subtotal:</span>
                <span className="font-mono font-medium">{formatCurrency(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex items-center justify-between text-rose-500">
                  <span>Desconto:</span>
                  <span className="font-mono">- {formatCurrency(discountAmount)}</span>
                </div>
              )}
              {isFinancialAllowed && totalCost > 0 && (
                <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-zinc-500">
                  <span>Margem estimada:</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    {marginPercent}% ({formatCurrency(estimatedProfit)})
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-base font-bold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-ink-700">
                <span>Total a Pagar:</span>
                <span className="font-mono text-lg text-brand-600 dark:text-brand-400">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>

            {/* 5. Botão Finalizar */}
            <button
              type="button"
              onClick={handleFinalizeSale}
              disabled={!cart.length || saving}
              className="btn-primary w-full py-3.5 text-sm font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg disabled:opacity-40"
            >
              <CheckCircle2 className="w-5 h-5" />
              {saving ? 'Finalizando Venda...' : 'Finalizar Venda (F10)'}
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Conclusão / Comprovante */}
      {completedSale && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-200 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h2 className="font-display font-bold text-xl text-slate-900 dark:text-white">
                Venda Concluída com Sucesso!
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                Pedido número: <strong className="font-mono text-slate-800 dark:text-zinc-200">#{completedSale.order_number || completedSale.id}</strong>
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs text-left space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Cliente:</span>
                <span className="font-semibold text-slate-800 dark:text-zinc-200">{completedSale.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Pagamento:</span>
                <span className="font-semibold uppercase">{completedSale.payment_method}</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-slate-200 dark:border-ink-700">
                <span>Total Recebido:</span>
                <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(completedSale.total_amount)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => navigate('/aparelhos')}
                className="btn-secondary flex-1 py-2 text-xs"
              >
                Voltar a Aparelhos
              </button>
              <button
                type="button"
                onClick={resetSale}
                className="btn-primary flex-1 py-2 text-xs font-bold"
              >
                Nova Venda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Seleção de Cliente */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <User className="w-4 h-4 text-brand-500" />
                Selecionar ou Cadastrar Cliente
              </h3>
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <CustomerPicker
              selectedId={selectedCustomer?.id}
              onSelect={(cust) => {
                setSelectedCustomer(cust);
                setIsCustomerModalOpen(false);
              }}
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-ink-700">
              <button
                type="button"
                onClick={() => {
                  setSelectedCustomer(null);
                  setIsCustomerModalOpen(false);
                }}
                className="btn-ghost text-xs"
              >
                Vender sem cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Serviço Rápido Customizado */}
      {isCustomServiceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleAddCustomService} className="card w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Wrench className="w-4 h-4 text-amber-500" />
                Adicionar Serviço Rápido Avulso
              </h3>
              <button
                type="button"
                onClick={() => setIsCustomServiceModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="label text-xs">Descrição do Serviço *</label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={customServiceName}
                  onChange={(e) => setCustomServiceName(e.target.value)}
                  placeholder="Ex: Troca de conector, limpeza profunda..."
                  className="input w-full text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs">Valor Cobrado (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={customServicePrice}
                    onChange={(e) => setCustomServicePrice(e.target.value)}
                    placeholder="0,00"
                    className="input w-full text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="label text-xs">Custo Opcional (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={customServiceCost}
                    onChange={(e) => setCustomServiceCost(e.target.value)}
                    placeholder="0,00"
                    className="input w-full text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-ink-700">
              <button
                type="button"
                onClick={() => setIsCustomServiceModalOpen(false)}
                className="btn-ghost text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary text-xs font-bold"
              >
                Adicionar à Venda
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
