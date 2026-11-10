import React, { useState, useEffect } from 'react';
import { X, Check, Sliders, CheckCircle2, XCircle, Settings2, ShieldAlert } from 'lucide-react';
import api from '../../api/client';
import ModalFrame from '../UI/ModalFrame';

const CATEGORY_NAMES = {
  orders: 'Ordens de Serviço',
  sales: 'Vendas',
  inventory: 'Estoque',
  finance: 'Financeiro',
  customers: 'Clientes',
  system: 'Sistema',
};

export default function NotificationPreferencesModal({ isOpen, onClose }) {
  const [mode, setMode] = useState('all'); // 'all', 'none', 'custom'
  const [preferences, setPreferences] = useState({});
  const [catalog, setCatalog] = useState({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError('');
    setNotice('');
    api.get('/notifications/preferences')
      .then(({ data }) => {
        setMode(data.mode || 'all');
        setPreferences(data.preferences || {});
        setCatalog(data.catalog || {});
        setIsAdmin(Boolean(data.isAdmin));
      })
      .catch((err) => {
        setError('Não foi possível carregar as preferências de notificações.');
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  function handleModeChange(newMode) {
    setMode(newMode);
    if (newMode === 'all') {
      const allTrue = {};
      Object.keys(catalog).forEach(k => { allTrue[k] = true; });
      setPreferences(allTrue);
    } else if (newMode === 'none') {
      const allFalse = {};
      Object.keys(catalog).forEach(k => { allFalse[k] = false; });
      setPreferences(allFalse);
    }
  }

  function handleToggleEvent(eventKey) {
    setMode('custom');
    setPreferences(prev => ({
      ...prev,
      [eventKey]: !prev[eventKey]
    }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.put('/notifications/preferences', {
        mode,
        preferences
      });
      setMode(data.mode);
      setPreferences(data.preferences);
      setNotice('Preferências salvas com sucesso!');
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar preferências.');
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  // Agrupa os eventos do catálogo por categoria
  const grouped = {};
  Object.entries(catalog).forEach(([key, info]) => {
    if (info.adminOnly && !isAdmin) return; // Não exibe para funcionários
    if (!grouped[info.category]) grouped[info.category] = [];
    grouped[info.category].push({ key, ...info });
  });

  return (
    <ModalFrame
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#1C1C1F] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 dark:text-amber-400">
              <Sliders size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-zinc-100">Preferências de Notificações</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Escolha quais avisos e eventos você deseja receber no ERP.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/5 transition"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo com Scroll */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-6">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-xs text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}
          {notice && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400">
              {notice}
            </div>
          )}

          {/* Controle Geral */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-400">
              Controle Geral
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleModeChange('all')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition ${
                  mode === 'all'
                    ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm'
                    : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                <CheckCircle2 size={14} /> Ativar todas
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('none')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition ${
                  mode === 'none'
                    ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                    : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                <XCircle size={14} /> Desativar todas
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('custom')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition ${
                  mode === 'custom'
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-500 dark:text-amber-400 font-bold'
                    : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                <Settings2 size={14} /> Personalizar
              </button>
            </div>
          </div>

          {/* Lista de Categorias com Checkboxes */}
          <div className="space-y-5 pt-2">
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500 dark:text-amber-400 flex items-center gap-1.5">
                  <span>{CATEGORY_NAMES[category] || category}</span>
                </h3>
                <div className="grid sm:grid-cols-2 gap-2">
                  {items.map(item => {
                    const isChecked = Boolean(preferences[item.key]);
                    return (
                      <label
                        key={item.key}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition select-none ${
                          isChecked
                            ? 'bg-slate-50/80 dark:bg-white/[0.04] border-slate-200 dark:border-white/10 text-slate-800 dark:text-zinc-200'
                            : 'bg-transparent border-slate-200/60 dark:border-white/5 text-slate-400 dark:text-zinc-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleEvent(item.key)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-amber-500 focus:ring-amber-500 accent-amber-500 cursor-pointer"
                        />
                        <span className="leading-tight">{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Footer do Modal */}
          <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="btn-secondary text-xs py-2 px-3"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary text-xs py-2 px-4 shadow-sm"
            >
              {saving ? 'Salvando...' : 'Salvar Preferências'}
            </button>
          </div>
        </form>
      </div>
    </ModalFrame>
  );
}

