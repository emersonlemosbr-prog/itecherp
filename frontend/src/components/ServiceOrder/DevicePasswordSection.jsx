// components/ServiceOrder/DevicePasswordSection.jsx
// Seção "Senha do aparelho" com suporte a Sem Senha, PIN, Senha alfanumérica e Padrão Android 3x3

import React, { useState } from 'react';
import { KeyRound, Lock, Eye, EyeOff, ShieldCheck, Grid3X3 } from 'lucide-react';
import PatternLockCanvas from './PatternLockCanvas';

export default function DevicePasswordSection({
  unlockType = 'none',
  unlockPassword = '',
  unlockPattern = '',
  onChangeType,
  onChangePassword,
  onChangePattern,
  disabled = false,
}) {
  const [showPassword, setShowPassword] = useState(false);

  const TYPE_OPTIONS = [
    { id: 'none', label: 'Sem senha', icon: ShieldCheck },
    { id: 'pin', label: 'PIN / números', icon: Lock },
    { id: 'password', label: 'Senha / letras e números', icon: KeyRound },
    { id: 'pattern', label: 'Padrão de desenho', icon: Grid3X3 },
  ];

  const handleTypeSelect = (typeId) => {
    if (disabled) return;
    onChangeType(typeId);
    if (typeId === 'none') {
      onChangePassword('');
      onChangePattern('');
    } else if (typeId === 'pattern') {
      onChangePassword('');
    } else {
      onChangePattern('');
    }
  };

  const handlePinChange = (e) => {
    // Permite apenas números
    const numericValue = e.target.value.replace(/\D/g, '');
    onChangePassword(numericValue);
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-amber-500" />
          <h3 className="font-semibold text-sm">Senha do aparelho</h3>
          <span className="text-xs text-slate-400 font-normal">(opcional)</span>
        </div>
      </div>

      {/* Seletor visual de tipo de desbloqueio */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {TYPE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = unlockType === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              onClick={() => handleTypeSelect(opt.id)}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                isSelected
                  ? 'border-brand-500 bg-brand-500/10 text-brand-500 dark:text-brand-400 font-bold shadow-sm'
                  : 'border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#252525] text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20'
              }`}
            >
              <Icon size={14} className={isSelected ? 'text-brand-500' : 'text-slate-400'} />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Interface dinâmica conforme o tipo */}
      {unlockType === 'none' && (
        <p className="text-xs text-slate-400 bg-slate-50 dark:bg-white/5 rounded-xl p-3 border border-slate-100 dark:border-white/5">
          Nenhuma senha informada para este aparelho. O cliente não utiliza bloqueio de tela ou entregou desbloqueado.
        </p>
      )}

      {unlockType === 'pin' && (
        <div className="space-y-1.5 max-w-sm">
          <label className="label">PIN numérico</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              inputMode="numeric"
              pattern="[0-9]*"
              className="input pr-10 tracking-widest text-base font-mono"
              placeholder="Ex: 2580"
              value={unlockPassword}
              onChange={handlePinChange}
              disabled={disabled}
              autoComplete="off"
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              aria-label={showPassword ? 'Ocultar PIN' : 'Mostrar PIN'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">Aceita somente números.</p>
        </div>
      )}

      {unlockType === 'password' && (
        <div className="space-y-1.5 max-w-md">
          <label className="label">Senha alfanumérica</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              className="input pr-10 text-sm font-mono"
              placeholder="Ex: Casa@2026"
              value={unlockPassword}
              onChange={(e) => onChangePassword(e.target.value)}
              disabled={disabled}
              autoComplete="off"
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">Aceita letras, números e caracteres especiais.</p>
        </div>
      )}

      {unlockType === 'pattern' && (
        <div className="flex flex-col items-center py-2 space-y-2">
          <p className="text-xs text-slate-400 text-center">
            Clique/toque no primeiro ponto e arraste pelos demais para traçar o padrão.
          </p>
          <PatternLockCanvas
            value={unlockPattern}
            onChange={onChangePattern}
            readOnly={disabled}
            size={250}
          />
        </div>
      )}
    </div>
  );
}
