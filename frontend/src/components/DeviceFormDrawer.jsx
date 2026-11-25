import React, { useState, useEffect, useRef } from 'react';
import { X, Smartphone, Plus, Check, ChevronDown, Building2 } from 'lucide-react';
import { POPULAR_BRANDS, STORAGE_OPTIONS, CONDITION_OPTIONS, getSuggestions } from '../data/deviceCatalog';
import { getSaoPauloDateString } from '../utils/date';

export default function DeviceFormDrawer({
  isOpen,
  onClose,
  initialData = null,
  onSuccess,
  api
}) {
  const isEditing = !!initialData?.id;

  const [brand, setBrand] = useState('Apple');
  const [customBrand, setCustomBrand] = useState('');
  const [model, setModel] = useState('');
  const [storage, setStorage] = useState('256GB');
  const [customStorage, setCustomStorage] = useState('');
  const [color, setColor] = useState('');
  const [category, setCategory] = useState('Smartphone');
  const [imei1, setImei1] = useState('');
  const [imei2, setImei2] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [condition, setCondition] = useState('Seminovo');
  const [batteryHealth, setBatteryHealth] = useState(85);
  const [hasBatteryInfo, setHasBatteryInfo] = useState(true);
  const [costPrice, setCostPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [entryDate, setEntryDate] = useState(() => getSaoPauloDateString());
  const [notes, setNotes] = useState('');

  // Sugestões de modelo
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const suggestionsRef = useRef(null);

  // Fornecedores
  const [suppliers, setSuppliers] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [isNewSupplierModalOpen, setIsNewSupplierModalOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [savingSupplier, setSavingSupplier] = useState(false);

  // Estados de envio
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Carregar lista de fornecedores
  const loadSuppliers = async () => {
    try {
      setLoadingSuppliers(true);
      const res = await api.get('/inventory/suppliers');
      setSuppliers(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Erro ao carregar fornecedores:', e);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSuppliers();
    }
  }, [isOpen]);

  // Preencher formulário ao abrir (para edição ou criação)
  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      const isKnownBrand = POPULAR_BRANDS.includes(initialData.brand);
      setBrand(isKnownBrand ? initialData.brand : 'Outra');
      setCustomBrand(isKnownBrand ? '' : (initialData.brand || ''));
      setModel(initialData.model || '');

      const isKnownStorage = STORAGE_OPTIONS.includes(initialData.storage);
      setStorage(isKnownStorage ? initialData.storage : 'Outro');
      setCustomStorage(isKnownStorage ? '' : (initialData.storage || ''));

      setColor(initialData.color || '');
      setCategory(initialData.category || 'Smartphone');
      setImei1(initialData.imei1 || '');
      setImei2(initialData.imei2 || '');
      setSerialNumber(initialData.serial_number || '');
      setCondition(initialData.condition || 'Seminovo');

      if (initialData.battery_health !== null && initialData.battery_health !== undefined) {
        setBatteryHealth(Number(initialData.battery_health));
        setHasBatteryInfo(true);
      } else {
        setBatteryHealth(100);
        setHasBatteryInfo(false);
      }

      setCostPrice(initialData.cost_price !== null && initialData.cost_price !== undefined ? String(initialData.cost_price) : '');
      setSellPrice(initialData.sell_price !== null && initialData.sell_price !== undefined ? String(initialData.sell_price) : '');
      setSupplierId(initialData.supplier_id ? String(initialData.supplier_id) : '');
      setEntryDate(initialData.entry_date || getSaoPauloDateString());
      setNotes(initialData.notes || '');
    } else {
      // Padrão criação
      setBrand('Apple');
      setCustomBrand('');
      setModel('');
      setStorage('256GB');
      setCustomStorage('');
      setColor('');
      setCategory('Smartphone');
      setImei1('');
      setImei2('');
      setSerialNumber('');
      setCondition('Seminovo');
      setBatteryHealth(85);
      setHasBatteryInfo(true);
      setCostPrice('');
      setSellPrice('');
      setSupplierId('');
      setEntryDate(getSaoPauloDateString());
      setNotes('');
    }
    setError('');
    setShowSuggestions(false);
  }, [isOpen, initialData]);

  // Atualizar sugestões conforme o usuário digita
  useEffect(() => {
    const activeBrand = brand === 'Outra' ? customBrand : brand;
    const list = getSuggestions(activeBrand, model);
    setSuggestions(list);
  }, [brand, customBrand, model]);

  // Fechar dropdown de sugestões ao clicar fora
  useEffect(() => {
    function handleClickOutside(event) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSuggestion = (sug) => {
    setModel(sug.model);
    if (sug.storage) {
      if (STORAGE_OPTIONS.includes(sug.storage)) {
        setStorage(sug.storage);
        setCustomStorage('');
      } else {
        setStorage('Outro');
        setCustomStorage(sug.storage);
      }
    }
    setShowSuggestions(false);
  };

  const handleCreateSupplier = async (e) => {
    e.preventDefault();
    if (!newSupplierName.trim()) return;
    try {
      setSavingSupplier(true);
      const res = await api.post('/inventory/suppliers', { name: newSupplierName.trim() });
      if (res.data?.id) {
        setSuppliers(prev => [res.data, ...prev]);
        setSupplierId(String(res.data.id));
      }
      setIsNewSupplierModalOpen(false);
      setNewSupplierName('');
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao criar fornecedor.');
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleSubmit = async (andKeepAdding = false) => {
    try {
      setLoading(true);
      setError('');

      const activeBrand = brand === 'Outra' ? customBrand.trim() : brand;
      const activeStorage = storage === 'Outro' ? customStorage.trim() : storage;

      if (!activeBrand) {
        setError('Informe a marca do aparelho.');
        setLoading(false);
        return;
      }
      if (!model.trim()) {
        setError('Informe o modelo do aparelho.');
        setLoading(false);
        return;
      }

      const cleanImei1 = imei1.replace(/\s+/g, '').trim();
      const cleanImei2 = imei2.replace(/\s+/g, '').trim();
      const cleanSerial = serialNumber.trim();

      if (!cleanImei1 && !cleanSerial) {
        setError('Informe ao menos o IMEI 1 ou o Número de Série para identificação.');
        setLoading(false);
        return;
      }

      if (cleanImei1 && !/^\d{14,16}$/.test(cleanImei1)) {
        setError('IMEI 1 inválido: deve conter de 14 a 16 dígitos numéricos.');
        setLoading(false);
        return;
      }

      if (cleanImei2 && !/^\d{14,16}$/.test(cleanImei2)) {
        setError('IMEI 2 inválido: deve conter de 14 a 16 dígitos numéricos.');
        setLoading(false);
        return;
      }

      const selectedSupplier = suppliers.find(s => String(s.id) === String(supplierId));

      const parseMoney = (val) => {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        const str = String(val).trim();
        if (str.includes(',') && str.includes('.')) {
          const clean = str.replace(/\./g, '').replace(',', '.');
          const num = parseFloat(clean);
          return isNaN(num) ? 0 : num;
        }
        if (str.includes(',')) {
          const num = parseFloat(str.replace(',', '.'));
          return isNaN(num) ? 0 : num;
        }
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
      };

      const payload = {
        brand: activeBrand,
        model: model.trim(),
        storage: activeStorage,
        color: color.trim(),
        category,
        imei1: cleanImei1 || null,
        imei2: cleanImei2 || null,
        serial_number: cleanSerial || null,
        condition,
        battery_health: hasBatteryInfo ? Number(batteryHealth) : null,
        cost_price: parseMoney(costPrice),
        sell_price: parseMoney(sellPrice),
        supplier_id: supplierId ? Number(supplierId) : null,
        supplier_name: selectedSupplier ? selectedSupplier.name : null,
        entry_date: entryDate,
        notes: notes.trim()
      };

      if (isEditing) {
        await api.put(`/devices/${initialData.id}`, payload);
      } else {
        await api.post('/devices', payload);
      }

      if (onSuccess) onSuccess();

      if (andKeepAdding) {
        // Limpar identificadores mas manter marca, modelo e fornecedor para agilizar lote
        setImei1('');
        setImei2('');
        setSerialNumber('');
        setError('');
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Erro ao salvar aparelho:', err);
      const rawData = err.response?.data;
      const isHtmlResponse = typeof rawData === 'string' && (rawData.includes('<!DOCTYPE') || rawData.includes('<pre>') || rawData.includes('<html'));
      const serverMessage = !isHtmlResponse && typeof rawData === 'string' && rawData.trim().length > 0
        ? rawData.trim()
        : (rawData?.error || rawData?.message || (Array.isArray(rawData?.errors) ? rawData.errors.map(e => e.msg || e.message).join(', ') : null));

      const status = err.response?.status;

      if (serverMessage) {
        setError(serverMessage);
      } else if (status === 404 || isHtmlResponse) {
        setError('Serviço em atualização ou rota indisponível. Por favor, recarregue a página e tente novamente.');
      } else if (status === 401) {
        setError('Sua sessão expirou. Por favor, faça login novamente.');
      } else if (status === 403) {
        setError('Você não tem permissão para cadastrar aparelhos ou a loja está suspensa.');
      } else if (status === 409) {
        setError('Aparelho duplicado: IMEI ou número de série já cadastrado nesta loja.');
      } else if (status >= 500) {
        setError('Erro interno no servidor ao salvar aparelho. Tente novamente em instantes.');
      } else if (!err.response) {
        setError('Falha de conexão com o servidor. Verifique sua conexão com a internet.');
      } else {
        setError('Erro ao salvar aparelho. Por favor, verifique os dados informados.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-xl bg-white dark:bg-[#18181B] text-slate-900 dark:text-zinc-100 border-l border-slate-200 dark:border-white/10 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Cabeçalho */}
        <div className="p-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-white/95 dark:bg-[#18181B]/95 sticky top-0 z-10 backdrop-blur-sm">
          <div>
            <h2 className="text-lg font-bold font-display text-slate-900 dark:text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-brand-500" />
              {isEditing ? 'Editar aparelho' : 'Adicionar aparelho'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Cada cadastro é um aparelho físico, com IMEI ou número de série próprio.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário com rolagem */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-400 text-xs">
              {error}
            </div>
          )}

          {/* APARELHO */}
          <div className="space-y-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Aparelho
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Marca *
                </label>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-ink-800/80 border border-slate-200 dark:border-ink-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-brand-500"
                >
                  {POPULAR_BRANDS.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                {brand === 'Outra' && (
                  <input
                    type="text"
                    placeholder="Digite a marca..."
                    value={customBrand}
                    onChange={(e) => setCustomBrand(e.target.value)}
                    className="w-full mt-2 bg-slate-50 dark:bg-ink-800/80 border border-slate-200 dark:border-ink-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
                  />
                )}
              </div>

              {/* Modelo com autocomplete */}
              <div className="relative" ref={suggestionsRef}>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Modelo *
                </label>
                <input
                  type="text"
                  placeholder="Digite para ver sugestões..."
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full bg-slate-50 dark:bg-ink-800/80 border border-slate-200 dark:border-ink-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
                />

                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-ink-800 border border-slate-200 dark:border-ink-700 rounded-xl shadow-xl max-h-48 overflow-y-auto z-20 py-1">
                    {suggestions.map((sug, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectSuggestion(sug)}
                        className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-ink-700 hover:text-brand-600 dark:hover:text-white flex items-center justify-between"
                      >
                        <span>{sug.model} {sug.storage && <span className="text-slate-400">({sug.storage})</span>}</span>
                        <span className="text-[10px] text-brand-600 dark:text-brand-400 uppercase font-semibold">{sug.brand}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Armazenamento (Pills) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                Armazenamento
              </label>
              <div className="flex flex-wrap gap-1.5">
                {STORAGE_OPTIONS.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStorage(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      storage === st
                        ? 'bg-brand-500 text-slate-950 border-brand-500 font-bold shadow-sm'
                        : 'bg-slate-100 dark:bg-ink-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-ink-700 hover:border-brand-500/40'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              {storage === 'Outro' && (
                <input
                  type="text"
                  placeholder="Informe o armazenamento (ex: 16GB)..."
                  value={customStorage}
                  onChange={(e) => setCustomStorage(e.target.value)}
                  className="w-full mt-2 bg-slate-50 dark:bg-ink-800/80 border border-slate-200 dark:border-ink-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
                />
              )}
            </div>

            {/* Cor e Categoria */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Cor
                </label>
                <input
                  type="text"
                  placeholder="Ex: Titânio Natural, Preto..."
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-ink-800/80 border border-slate-200 dark:border-ink-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Categoria
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-ink-800/80 border border-slate-200 dark:border-ink-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-brand-500"
                >
                  <option value="Smartphone">Smartphone</option>
                  <option value="Tablet">Tablet</option>
                  <option value="Smartwatch">Smartwatch</option>
                  <option value="Notebook">Notebook</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
            </div>
          </div>

          {/* IDENTIFICAÇÃO */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Identificação
            </span>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  IMEI 1
                </label>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Bipe com o leitor ou digite (14-16 dígitos)</span>
              </div>
              <input
                type="text"
                maxLength={18}
                placeholder="Ex: 356872109876543"
                value={imei1}
                onChange={(e) => setImei1(e.target.value)}
                className="w-full bg-slate-50 dark:bg-ink-800/80 border border-slate-200 dark:border-ink-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs font-mono placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  IMEI 2 (Opcional)
                </label>
                <input
                  type="text"
                  maxLength={18}
                  placeholder="Opcional"
                  value={imei2}
                  onChange={(e) => setImei2(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-ink-800/80 border border-slate-200 dark:border-ink-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs font-mono placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Número de série
                </label>
                <input
                  type="text"
                  placeholder="Ex: F17XYZ89ABCD"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-ink-800/80 border border-slate-200 dark:border-ink-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs font-mono placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>
          </div>

          {/* CONDIÇÃO & BATERIA */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Condição e Bateria
            </span>

            {/* Condição Pills */}
            <div className="flex flex-wrap gap-1.5">
              {CONDITION_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCondition(c.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    condition === c.value
                      ? 'bg-brand-500 text-slate-950 border-brand-500 font-bold shadow-sm'
                      : 'bg-slate-100 dark:bg-ink-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-ink-700 hover:border-brand-500/40'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Saúde de Bateria */}
            <div className="bg-slate-50 dark:bg-ink-800/40 p-3 rounded-xl border border-slate-200 dark:border-ink-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Saúde da bateria
                </span>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-500 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={!hasBatteryInfo}
                    onChange={(e) => setHasBatteryInfo(!e.target.checked)}
                    className="rounded bg-white dark:bg-ink-800 border-slate-300 dark:border-ink-700 text-brand-500 focus:ring-0"
                  />
                  <span>Não informada</span>
                </label>
              </div>

              {hasBatteryInfo && (
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={batteryHealth}
                    onChange={(e) => setBatteryHealth(Number(e.target.value))}
                    className="flex-1 accent-brand-500 cursor-pointer"
                  />
                  <div className="flex items-center gap-1 bg-white dark:bg-ink-800 border border-slate-200 dark:border-ink-700 px-2 py-1 rounded-lg">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={batteryHealth}
                      onChange={(e) => setBatteryHealth(Math.max(1, Math.min(100, Number(e.target.value))))}
                      className="w-10 bg-transparent text-slate-900 dark:text-white text-xs font-bold text-center focus:outline-none"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400">%</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* VALORES E ORIGEM */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Valores e Origem
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Custo de aquisição (R$)
                </label>
                <input
                  type="text"
                  placeholder="0,00"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-ink-800/80 border border-slate-200 dark:border-ink-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs font-mono placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Preço de venda (R$)
                </label>
                <input
                  type="text"
                  placeholder="0,00"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-ink-800/80 border border-slate-200 dark:border-ink-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs font-mono placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            {/* Fornecedor */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Fornecedor
                </label>
                <button
                  type="button"
                  onClick={() => setIsNewSupplierModalOpen(true)}
                  className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo fornecedor
                </button>
              </div>

              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-ink-800/80 border border-slate-200 dark:border-ink-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-brand-500"
              >
                <option value="">Selecione um fornecedor...</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* INFORMAÇÕES ADICIONAIS */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Informações Adicionais
            </span>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Data de entrada
              </label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-ink-800/80 border border-slate-200 dark:border-ink-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Observações
              </label>
              <textarea
                rows={2}
                placeholder="Detalhes sobre o estado estético, procedência, garantia do fornecedor..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-50 dark:bg-ink-800/80 border border-slate-200 dark:border-ink-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 focus:outline-none focus:border-brand-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div className="p-4 border-t border-slate-200 dark:border-white/10 bg-slate-50/95 dark:bg-[#18181B]/95 flex items-center justify-between gap-3 sticky bottom-0 z-10 backdrop-blur-sm">
          {!isEditing && (
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSubmit(true)}
              className="btn-secondary !text-xs disabled:opacity-50"
            >
              Salvar e cadastrar outro
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn-ghost !text-xs"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleSubmit(false)}
              className="btn-primary !text-xs disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading ? 'Salvando...' : (isEditing ? 'Atualizar aparelho' : 'Cadastrar aparelho')}
            </button>
          </div>
        </div>
      </div>

      {/* Modal Rápido de Novo Fornecedor */}
      {isNewSupplierModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#18181B] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-2xl">
            <h3 className="text-sm font-bold font-display text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-brand-500" />
              Cadastrar Novo Fornecedor
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Informe a razão social ou nome fantasia do fornecedor.
            </p>
            <form onSubmit={handleCreateSupplier} className="space-y-4">
              <input
                type="text"
                autoFocus
                placeholder="Nome do fornecedor..."
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-ink-800 border border-slate-200 dark:border-ink-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewSupplierModalOpen(false)}
                  className="btn-ghost !text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingSupplier || !newSupplierName.trim()}
                  className="btn-primary !text-xs disabled:opacity-50"
                >
                  {savingSupplier ? 'Salvando...' : 'Salvar fornecedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
