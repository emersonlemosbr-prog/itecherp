import React, { useState } from 'react';
import {
  X, Smartphone, Copy, Check, ExternalLink, ShoppingCart,
  Bookmark, Edit, Archive, RotateCcw, AlertTriangle, EyeOff,
  Clock, ShieldAlert, History
} from 'lucide-react';
import { STATUS_MAP, CONDITION_OPTIONS } from '../data/deviceCatalog';

export default function DeviceDetailDrawer({
  isOpen,
  onClose,
  device,
  onEdit,
  onReserve,
  onCancelReservation,
  onToggleStatus,
  onArchive,
  onRestore,
  onSellNow,
  isFinancialAllowed
}) {
  const [copiedKey, setCopiedKey] = useState('');
  const [isReserveModalOpen, setIsReserveModalOpen] = useState(false);
  const [reserveNotes, setReserveNotes] = useState('');

  if (!isOpen || !device) return null;

  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  const statusConfig = STATUS_MAP[device.status] || { label: device.status, badgeClass: 'bg-slate-700 text-slate-300' };
  const condConfig = CONDITION_OPTIONS.find(c => c.value === device.condition);

  // Anatel URL formatada
  const anatelUrl = 'https://www.anatel.gov.br/celularlegal/';

  const cost = Number(device.cost_price) || 0;
  const price = Number(device.sell_price) || 0;
  const profit = price - cost;
  const margin = cost > 0 ? ((profit / cost) * 100).toFixed(0) : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-medium">
              Selecionado · entrada há {device.days_in_stock || 0} {device.days_in_stock === 1 ? 'dia' : 'dias'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo rolável */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          {/* Card Principal do Aparelho */}
          <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-800/40 border border-slate-800">
            <div className="w-12 h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center shrink-0">
              <Smartphone className="w-6 h-6 text-yellow-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-white truncate">
                {device.brand} {device.model}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {device.storage || 'Sem armaz.'} · {device.color || 'Sem cor'}
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${statusConfig.badgeClass}`}>
                  {statusConfig.label}
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${condConfig?.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                  {device.condition}
                </span>
              </div>
            </div>
          </div>

          {/* Cards Financeiros (Somente para autorizados) */}
          {isFinancialAllowed ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Preço</span>
                <span className="text-sm font-bold text-white">
                  R$ {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Custo</span>
                <span className="text-sm font-bold text-slate-300">
                  R$ {cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Margem</span>
                <span className={`text-sm font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {margin}%
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Preço de Venda</span>
              <span className="text-base font-bold text-white">
                R$ {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Especificações do Aparelho */}
          <div className="space-y-2.5 bg-slate-800/30 p-4 rounded-2xl border border-slate-800/60 text-xs">
            {/* IMEI 1 */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">IMEI 1:</span>
              <div className="flex items-center gap-1.5 font-mono text-slate-200">
                <span>{device.imei1 || '—'}</span>
                {device.imei1 && (
                  <button
                    onClick={() => handleCopy(device.imei1, 'imei1')}
                    className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                    title="Copiar IMEI 1"
                  >
                    {copiedKey === 'imei1' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>

            {/* IMEI 2 */}
            {device.imei2 && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">IMEI 2:</span>
                <div className="flex items-center gap-1.5 font-mono text-slate-200">
                  <span>{device.imei2}</span>
                  <button
                    onClick={() => handleCopy(device.imei2, 'imei2')}
                    className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                    title="Copiar IMEI 2"
                  >
                    {copiedKey === 'imei2' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            {/* Série */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Série:</span>
              <div className="flex items-center gap-1.5 font-mono text-slate-200">
                <span>{device.serial_number || '—'}</span>
                {device.serial_number && (
                  <button
                    onClick={() => handleCopy(device.serial_number, 'serial')}
                    className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                    title="Copiar Série"
                  >
                    {copiedKey === 'serial' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>

            {/* Bateria */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Bateria:</span>
              <span className="font-semibold text-slate-200">
                {device.battery_health !== null && device.battery_health !== undefined ? `${device.battery_health}%` : 'Não informada'}
              </span>
            </div>

            {/* Armazenamento */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Armazenamento:</span>
              <span className="text-slate-200">{device.storage || '—'}</span>
            </div>

            {/* Cor */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Cor:</span>
              <span className="text-slate-200">{device.color || '—'}</span>
            </div>

            {/* Fornecedor */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Origem:</span>
              <span className="text-slate-200">
                {device.linked_supplier_name || device.supplier_name || 'Sem fornecedor informado'}
              </span>
            </div>

            {/* Lucro potencial */}
            {isFinancialAllowed && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Lucro potencial:</span>
                <span className="text-emerald-400 font-semibold">
                  R$ {profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* Data de Entrada */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Data de entrada:</span>
              <span className="text-slate-200">
                {device.entry_date ? new Date(device.entry_date + 'T12:00:00Z').toLocaleDateString('pt-BR') : '—'}
              </span>
            </div>

            {/* Observações */}
            {device.notes && (
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-slate-400 block mb-1">Observações:</span>
                <p className="text-slate-300 italic whitespace-pre-wrap">{device.notes}</p>
              </div>
            )}

            {/* Dados de Venda se estiver Vendido */}
            {device.status === 'sold' && (
              <div className="pt-2 border-t border-slate-800/80 space-y-1 bg-blue-500/10 p-2 rounded-xl text-blue-300">
                <div className="font-bold flex items-center gap-1">
                  <ShoppingCart className="w-3.5 h-3.5" /> Informações da Venda
                </div>
                <div>Pedido: <span className="font-mono font-semibold">{device.sale_order_number || '—'}</span></div>
                <div>Cliente: <span className="font-semibold">{device.sale_customer_name || '—'}</span></div>
                <div>Valor Vendido: <span className="font-semibold">R$ {Number(device.sale_price_sold || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
              </div>
            )}

            {/* Dados de Reserva se estiver Reservado */}
            {device.status === 'reserved' && (
              <div className="pt-2 border-t border-slate-800/80 space-y-1 bg-amber-500/10 p-2 rounded-xl text-amber-300">
                <div className="font-bold flex items-center gap-1">
                  <Bookmark className="w-3.5 h-3.5" /> Reserva Ativa
                </div>
                <div>Nota: <span className="font-medium">{device.reservation_notes || 'Sem detalhes'}</span></div>
              </div>
            )}
          </div>

          {/* Restrição / Consulta Anatel */}
          <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">Restrição (Anatel)</span>
              <a
                href={anatelUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-yellow-500 hover:text-yellow-400 flex items-center gap-1 font-medium"
              >
                Consultar no site oficial
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-[11px] text-slate-400">
              Copie o IMEI e consulte o Celular Legal da Anatel para verificar se o aparelho possui bloqueio ou restrição de impedimento.
            </p>
            {device.imei1 && (
              <button
                type="button"
                onClick={() => handleCopy(device.imei1, 'anatel_imei')}
                className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs rounded-xl flex items-center justify-center gap-2 transition-colors font-mono"
              >
                <Copy className="w-3.5 h-3.5 text-yellow-500" />
                {copiedKey === 'anatel_imei' ? 'IMEI Copiado!' : `Copiar IMEI: ${device.imei1}`}
              </button>
            )}
          </div>

          {/* Botões de Ação Rápida */}
          <div className="space-y-2 pt-2">
            {device.status === 'in_stock' && (
              <button
                onClick={() => onSellNow(device)}
                className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-yellow-500/20 flex items-center justify-center gap-2 transition-all text-xs"
              >
                <ShoppingCart className="w-4 h-4" />
                Vender agora
              </button>
            )}

            <div className="grid grid-cols-2 gap-2">
              {device.status === 'in_stock' && (
                <button
                  onClick={() => setIsReserveModalOpen(true)}
                  className="py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                  Reservar
                </button>
              )}

              {device.status === 'reserved' && (
                <button
                  onClick={() => onCancelReservation(device.id)}
                  className="py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Cancelar reserva
                </button>
              )}

              <button
                onClick={() => onEdit(device)}
                className="py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Edit className="w-3.5 h-3.5 text-blue-400" />
                Editar
              </button>
            </div>

            {/* Ações secundárias */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs text-slate-400">
              {device.status === 'in_stock' && (
                <button
                  onClick={() => onToggleStatus(device.id, 'unavailable')}
                  className="hover:text-red-400 transition-colors flex items-center gap-1"
                >
                  <EyeOff className="w-3 h-3" />
                  Marcar como indisponível
                </button>
              )}

              {device.status === 'unavailable' && (
                <button
                  onClick={() => onToggleStatus(device.id, 'in_stock')}
                  className="hover:text-emerald-400 transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Retornar ao estoque
                </button>
              )}

              {device.status !== 'archived' && (
                <button
                  onClick={() => onArchive(device.id)}
                  className="hover:text-slate-200 transition-colors flex items-center gap-1 ml-auto"
                >
                  <Archive className="w-3 h-3" />
                  Arquivar
                </button>
              )}

              {device.status === 'archived' && (
                <button
                  onClick={() => onRestore(device.id)}
                  className="hover:text-emerald-400 transition-colors flex items-center gap-1 ml-auto"
                >
                  <RotateCcw className="w-3 h-3" />
                  Desarquivar
                </button>
              )}
            </div>
          </div>

          {/* Linha do Tempo / Histórico de Movimentações */}
          <div className="space-y-3 pt-3 border-t border-slate-800">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <History className="w-4 h-4 text-yellow-500" />
              Histórico do Aparelho
            </span>

            {device.history && device.history.length > 0 ? (
              <div className="relative pl-4 space-y-4 before:content-[''] before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                {device.history.map((h) => (
                  <div key={h.id} className="relative text-xs space-y-0.5">
                    <span className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full bg-yellow-500 border-2 border-slate-900" />
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="font-semibold text-white">{h.description}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2">
                      <span>{h.user_name || 'Sistema'}</span>
                      <span>·</span>
                      <span>{h.created_at ? new Date(h.created_at).toLocaleString('pt-BR') : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">Nenhum evento registrado ainda.</p>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Reserva */}
      {isReserveModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-amber-500" />
              Reservar Aparelho
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              Informe o nome do cliente ou o motivo da reserva deste aparelho:
            </p>
            <textarea
              rows={3}
              autoFocus
              placeholder="Ex: Reservado para o cliente João da Silva até sexta-feira..."
              value={reserveNotes}
              onChange={(e) => setReserveNotes(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-xs focus:outline-none focus:border-yellow-500 resize-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setIsReserveModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onReserve(device.id, reserveNotes);
                  setIsReserveModalOpen(false);
                  setReserveNotes('');
                }}
                className="px-4 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-bold text-xs rounded-xl transition-colors"
              >
                Confirmar Reserva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
