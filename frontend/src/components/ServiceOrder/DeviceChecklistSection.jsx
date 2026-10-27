// components/ServiceOrder/DeviceChecklistSection.jsx
// Seção do Checklist Completo de Entrada com categorias colapsáveis, busca instantânea,
// consistência lógica inteligente, acessórios, saúde da bateria, estado geral e observações.

import React, { useState, useMemo } from 'react';
import {
  CheckSquare, Search, Trash2, ChevronDown, ChevronUp,
  Smartphone, Shield, Sliders, Camera, Volume2, Zap,
  Battery, Wifi, Fingerprint, Cpu, Droplets, HardDrive,
  Package, AlertCircle, Check, X
} from 'lucide-react';
import {
  CHECKLIST_CATEGORIES,
  ACCESSORY_OPTIONS,
  GENERAL_CONDITION_OPTIONS,
} from '../../data/checklistDefinition';

const ICON_MAP = {
  Smartphone,
  Shield,
  Sliders,
  Camera,
  Volume2,
  Zap,
  Battery,
  Wifi,
  Fingerprint,
  Cpu,
  Droplets,
  HardDrive,
};

export default function DeviceChecklistSection({
  checklist = {},
  onChangeChecklist,
  accessories = { items: [], other: '' },
  onChangeAccessories,
  deviceCondition = '',
  onChangeDeviceCondition,
  batteryHealth = '',
  onChangeBatteryHealth,
  checklistNotes = '',
  onChangeChecklistNotes,
  disabled = false,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({});
  const [warningMessage, setWarningMessage] = useState('');

  const isNoPower = checklist?.sistema_estado === 'nao_liga';

  // Toggle de expansão de categoria
  const toggleCategory = (catId) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  // Contagem de seleções por categoria
  const getCategoryCount = (cat) => {
    let count = 0;
    cat.items.forEach((item) => {
      const val = checklist[item.id];
      if (item.type === 'boolean' && val) count += 1;
      else if (item.type === 'state' && val) count += 1;
    });
    return count;
  };

  // Limpeza de inconsistências quando "Não liga" for ativado
  const sanitizeForNoPower = (currentChecklist) => {
    const updated = { ...currentChecklist };
    CHECKLIST_CATEGORIES.forEach((cat) => {
      cat.items.forEach((item) => {
        if (item.requiresPower) {
          if (item.type === 'state' && updated[item.id] === 'funcionando') {
            delete updated[item.id];
          } else if (item.type === 'boolean' && item.isOk && updated[item.id]) {
            delete updated[item.id];
          }
        }
      });
    });
    return updated;
  };

  // Manipulador de item booleano com regras de consistência
  const handleToggleBoolean = (item, catId) => {
    if (disabled) return;
    const currentVal = !!checklist[item.id];
    const nextVal = !currentVal;

    let updated = { ...checklist };

    if (nextVal) {
      updated[item.id] = true;

      // Se marcou "Sem defeito aparente" na Tela: desmarcar todos os defeitos de tela
      if (item.id === 'tela_sem_defeito') {
        const screenCat = CHECKLIST_CATEGORIES.find((c) => c.id === 'screen');
        screenCat?.items.forEach((it) => {
          if (it.id !== 'tela_sem_defeito') delete updated[it.id];
        });
      } else if (catId === 'screen' && item.isDefect) {
        // Se marcou defeito de tela, desmarcar "Sem defeito aparente"
        delete updated.tela_sem_defeito;
      }

      // Se marcou "Sem defeito aparente" na Carcaça
      if (item.id === 'carcaca_sem_defeito') {
        const housingCat = CHECKLIST_CATEGORIES.find((c) => c.id === 'housing');
        housingCat?.items.forEach((it) => {
          if (it.id !== 'carcaca_sem_defeito') delete updated[it.id];
        });
      } else if (catId === 'housing' && item.isDefect) {
        delete updated.carcaca_sem_defeito;
      }

      // Se marcou "Sem sinais aparentes de líquido"
      if (item.id === 'sem_sinais_liquido') {
        delete updated.marcas_liquido;
        delete updated.possivel_contato_agua;
        delete updated.cliente_informou_agua;
        delete updated.indicador_liquido_ativado;
        delete updated.oxidacao_aparente;
        delete updated.oxidacao_grau;
      } else if (catId === 'moisture' && (item.isDefect || item.id === 'oxidacao_grau')) {
        delete updated.sem_sinais_liquido;
      }
    } else {
      delete updated[item.id];
    }

    onChangeChecklist(updated);
  };

  // Manipulador de item de estado mutuamente exclusivo
  const handleSelectState = (item, optionValue) => {
    if (disabled) return;
    const currentVal = checklist[item.id];
    let updated = { ...checklist };

    if (currentVal === optionValue) {
      // Clicou no mesmo: desmarca
      delete updated[item.id];
    } else {
      // Bloqueio de inconsistência: Não pode testar "funcionando" se "Não liga"
      if (isNoPower && item.requiresPower && optionValue === 'funcionando') {
        setWarningMessage("Aparelho marcado como 'Não liga'. Não é possível marcar componentes como funcionando.");
        setTimeout(() => setWarningMessage(''), 4500);
        return;
      }

      updated[item.id] = optionValue;

      // Se o usuário selecionou "Não liga" no sistema, limpar itens dependentes de ligado
      if (item.id === 'sistema_estado' && optionValue === 'nao_liga') {
        updated = sanitizeForNoPower(updated);
      }

      // Se marcou defeito em umidade, desmarcar "sem sinais de líquido"
      if (item.id === 'oxidacao_grau') {
        delete updated.sem_sinais_liquido;
      }
    }

    onChangeChecklist(updated);
  };

  // Limpar todo o checklist com confirmação
  const handleClearAll = () => {
    if (disabled) return;
    const hasAny =
      Object.keys(checklist || {}).length > 0 ||
      (accessories?.items || []).length > 0 ||
      deviceCondition ||
      batteryHealth ||
      checklistNotes;

    if (!hasAny) return;

    if (window.confirm('Tem certeza que deseja limpar todo o checklist de entrada do aparelho?')) {
      onChangeChecklist({});
      onChangeAccessories({ items: [], other: '' });
      onChangeDeviceCondition('');
      onChangeBatteryHealth('');
      onChangeChecklistNotes('');
    }
  };

  // Acessórios: toggle com exclusão mútua de "somente_aparelho"
  const handleToggleAccessory = (accId) => {
    if (disabled) return;
    const currentItems = Array.isArray(accessories?.items) ? [...accessories.items] : [];

    if (accId === 'somente_aparelho') {
      if (currentItems.includes('somente_aparelho')) {
        onChangeAccessories({ ...accessories, items: [] });
      } else {
        onChangeAccessories({ items: ['somente_aparelho'], other: '' });
      }
      return;
    }

    // Se marcou qualquer outro acessório, remover "somente_aparelho"
    let nextItems = currentItems.filter((i) => i !== 'somente_aparelho');

    if (nextItems.includes(accId)) {
      nextItems = nextItems.filter((i) => i !== accId);
    } else {
      nextItems.push(accId);
    }

    onChangeAccessories({
      ...accessories,
      items: nextItems,
      other: nextItems.includes('outro') ? accessories.other || '' : '',
    });
  };

  // Filtro de busca
  const term = searchTerm.trim().toLowerCase();

  const filteredCategories = useMemo(() => {
    if (!term) return CHECKLIST_CATEGORIES;

    return CHECKLIST_CATEGORIES.map((cat) => {
      const matchingItems = cat.items.filter((item) => {
        if (item.label.toLowerCase().includes(term)) return true;
        if (item.type === 'state' && item.options) {
          return item.options.some((opt) => opt.label.toLowerCase().includes(term));
        }
        return false;
      });

      return {
        ...cat,
        items: matchingItems,
      };
    }).filter((cat) => cat.items.length > 0);
  }, [term]);

  const totalSelectedCount = useMemo(() => {
    let count = 0;
    CHECKLIST_CATEGORIES.forEach((cat) => {
      cat.items.forEach((item) => {
        if (checklist[item.id]) count += 1;
      });
    });
    return count;
  }, [checklist]);

  return (
    <div className="card p-5 space-y-5">
      {/* Cabeçalho da seção */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CheckSquare size={18} className="text-amber-500" />
          <h3 className="font-semibold text-sm">Checklist de entrada</h3>
          {totalSelectedCount > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              {totalSelectedCount} item{totalSelectedCount > 1 ? 'ns' : ''} marcado{totalSelectedCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={handleClearAll}
          className="btn-ghost !px-2.5 !py-1 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center gap-1"
        >
          <Trash2 size={13} /> Limpar checklist
        </button>
      </div>

      {/* Alerta de inconsistência lógica quando houver */}
      {warningMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-500/15 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-300 animate-fadeIn">
          <AlertCircle size={15} className="shrink-0" />
          <span>{warningMessage}</span>
        </div>
      )}

      {/* Barra de Pesquisa */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          className="input pl-9 text-xs"
          placeholder="Pesquisar item do checklist... (ex: microfone, tela, água)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          disabled={disabled}
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Categorias Colapsáveis */}
      <div className="space-y-2.5">
        {filteredCategories.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-6">
            Nenhum item do checklist encontrado para "{searchTerm}".
          </p>
        ) : (
          filteredCategories.map((cat) => {
            const Icon = ICON_MAP[cat.icon] || CheckSquare;
            // Se houver busca, abre por padrão
            const isExpanded = term ? true : !!expandedCategories[cat.id];
            const count = getCategoryCount(cat);

            return (
              <div
                key={cat.id}
                className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white/40 dark:bg-[#252525]/60 transition-all"
              >
                {/* Botão de Accordion / Cabeçalho da Categoria */}
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50/80 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={16} className="text-slate-500 dark:text-slate-400" />
                    <span className="font-semibold text-xs tracking-wide text-slate-800 dark:text-slate-200">
                      {cat.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {count > 0 && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-600 dark:text-brand-400 border border-brand-500/30">
                        {count} selecionado{count > 1 ? 's' : ''}
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp size={16} className="text-slate-400" />
                    ) : (
                      <ChevronDown size={16} className="text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Conteúdo Expansível */}
                {isExpanded && (
                  <div className="px-4 py-3 border-t border-slate-100 dark:border-white/5 bg-slate-50/40 dark:bg-black/20">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {cat.items.map((item) => {
                        if (item.type === 'boolean') {
                          const isChecked = !!checklist[item.id];
                          return (
                            <label
                              key={item.id}
                              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer border select-none transition-all ${
                                isChecked
                                  ? item.isOk
                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-300 font-semibold'
                                    : 'bg-rose-500/15 border-rose-500/40 text-rose-800 dark:text-rose-300 font-semibold'
                                  : 'bg-white/70 dark:bg-[#2d2d2d] border-slate-200/80 dark:border-white/5 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleBoolean(item, cat.id)}
                                disabled={disabled}
                                className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 h-3.5 w-3.5"
                              />
                              <span className="truncate">{item.label}</span>
                            </label>
                          );
                        }

                        // Itens de Estado Mutuamente Exclusivos
                        if (item.type === 'state') {
                          const selectedValue = checklist[item.id];
                          return (
                            <div
                              key={item.id}
                              className="col-span-1 sm:col-span-2 lg:col-span-3 rounded-xl p-2.5 bg-white/60 dark:bg-[#2a2a2a] border border-slate-200/70 dark:border-white/5 space-y-1.5"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-slate-600 dark:text-slate-300">
                                  {item.label}
                                </span>
                                {selectedValue && (
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                                    {item.options.find((o) => o.value === selectedValue)?.label}
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-1.5">
                                {item.options.map((opt) => {
                                  const isOptionActive = selectedValue === opt.value;
                                  return (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      disabled={disabled}
                                      onClick={() => handleSelectState(item, opt.value)}
                                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                        isOptionActive
                                          ? opt.isOk
                                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-800 dark:text-emerald-300 font-bold shadow-sm'
                                            : 'bg-rose-500/20 border-rose-500 text-rose-800 dark:text-rose-300 font-bold shadow-sm'
                                          : 'bg-white/80 dark:bg-[#343434] border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20'
                                      }`}
                                    >
                                      {isOptionActive && <Check size={11} className="inline mr-1" />}
                                      <span>{opt.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Acessórios entregues junto com o aparelho */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-4 bg-white/40 dark:bg-[#252525]/60 space-y-3">
        <div className="flex items-center gap-2">
          <Package size={16} className="text-amber-500" />
          <h4 className="font-semibold text-xs text-slate-800 dark:text-slate-200">
            Acessórios entregues junto com o aparelho
          </h4>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {ACCESSORY_OPTIONS.map((acc) => {
            const isChecked = (accessories?.items || []).includes(acc.id);
            return (
              <label
                key={acc.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer border select-none transition-all ${
                  isChecked
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-300 font-semibold shadow-xs'
                    : 'bg-white/70 dark:bg-[#2d2d2d] border-slate-200/80 dark:border-white/5 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleToggleAccessory(acc.id)}
                  disabled={disabled}
                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 h-3.5 w-3.5"
                />
                <span className="truncate">{acc.label}</span>
              </label>
            );
          })}
        </div>

        {/* Campo de texto livre quando "Outro" estiver marcado */}
        {(accessories?.items || []).includes('outro') && (
          <div className="pt-1">
            <label className="label">Especifique o outro acessório</label>
            <input
              type="text"
              className="input text-xs"
              placeholder="Ex: Fone Bluetooth da marca X com estojo"
              value={accessories.other || ''}
              onChange={(e) => onChangeAccessories({ ...accessories, other: e.target.value })}
              disabled={disabled}
            />
          </div>
        )}
      </div>

      {/* Estado Geral e Saúde da Bateria */}
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2 space-y-1.5">
          <label className="label">Estado Geral do Aparelho</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {GENERAL_CONDITION_OPTIONS.map((opt) => {
              const isSelected = deviceCondition === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChangeDeviceCondition(isSelected ? '' : opt.id)}
                  className={`px-2.5 py-2 rounded-xl text-xs font-semibold border text-center transition-all ${
                    isSelected
                      ? 'border-brand-500 bg-brand-500/15 text-brand-600 dark:text-brand-400 font-bold shadow-sm'
                      : 'border-slate-200 dark:border-white/10 bg-white/70 dark:bg-[#2d2d2d] text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="label">Saúde da bateria (%)</label>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="100"
              className="input pr-8 text-sm"
              placeholder="Ex: 85"
              value={batteryHealth ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  onChangeBatteryHealth('');
                } else {
                  const num = parseInt(val, 10);
                  if (!isNaN(num)) onChangeBatteryHealth(Math.min(100, Math.max(0, num)));
                }
              }}
              disabled={disabled}
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">
              %
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Opcional. Principalmente para iPhone.</p>
        </div>
      </div>

      {/* Observações do checklist */}
      <div className="space-y-1.5">
        <label className="label">Observações do checklist</label>
        <textarea
          rows={2}
          className="input text-xs"
          placeholder="Ex: Aparelho chegou com forte amassado no canto inferior direito e tampa traseira parcialmente descolada."
          value={checklistNotes || ''}
          onChange={(e) => onChangeChecklistNotes(e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
