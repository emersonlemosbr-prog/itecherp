import { useSettings } from '../context/SettingsContext'
import React, { useEffect, useMemo, useState } from 'react';
import { Search, CalendarRange, Receipt, TrendingUp, Wallet, PiggyBank, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../api/client';
import { formatCurrency, formatDate } from '../utils/format';

const MONTHS = [
  { value: '', label: 'Todos os meses' },
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Marco' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return value;
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-1 text-sm text-zinc-100 font-medium">{value}</p>
    </div>
  );
}

export default function FinancialHistory() {
  const { settings } = useSettings()
  const [items, setItems] = useState([]);
  const [years, setYears] = useState([]);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  async function loadHistory(options = {}) {
    const { silent = false } = options;
    if (!silent) {
      setLoading(true);
      setError('');
    }

    try {
      const { data } = await api.get('/financial-history', {
        params: {
          year: year || undefined,
          month: month || undefined,
          q: search.trim() || undefined,
        },
      });

      setItems(data.items || []);
      setYears(data.filters?.years || []);

      setExpandedId((prev) => {
        const nextItems = data.items || [];
        if (!nextItems.length) return null;
        const hasPrev = nextItems.some((item) => item.id === prev);
        return hasPrev ? prev : nextItems[0].id;
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Nao foi possivel carregar o historico financeiro.');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      loadHistory();
    }, 220);

    return () => clearTimeout(debounce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (!settings.system.financial_refresh) return
    const token = localStorage.getItem('itech_token');
    if (!token) return undefined;

    const base = window.location.origin;
    const eventSource = new EventSource(`${base}/api/events/dashboard?token=${encodeURIComponent(token)}`);

    const refreshHandler = () => {
      loadHistory({ silent: true }).catch(() => {
        // Evita quebrar a tela em falhas transitórias de rede.
      });
    };

    eventSource.addEventListener('dashboard-refresh', refreshHandler);

    return () => {
      eventSource.removeEventListener('dashboard-refresh', refreshHandler);
      eventSource.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, search]);

  const selectedItem = useMemo(() => {
    return items.find((item) => item.id === expandedId) || null;
  }, [items, expandedId]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-xl">Historico Financeiro</h2>
        <p className="text-sm text-slate-400">Resumo mensal arquivado automaticamente no fechamento de cada periodo.</p>
      </div>

      <div className="card p-4 space-y-3">
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="label">Ano</label>
            <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">Todos os anos</option>
              {years.map((availableYear) => (
                <option key={availableYear} value={String(availableYear)}>{availableYear}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Mes</label>
            <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
              {MONTHS.map((monthOption) => (
                <option key={monthOption.label} value={monthOption.value}>{monthOption.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Pesquisa rapida</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                placeholder="Ex: Julho/2026"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg p-3 text-sm bg-rose-500/15 text-rose-300 border border-rose-400/30">{error}</div>}

      {loading ? (
        <div className="text-sm text-zinc-400">Carregando historico financeiro...</div>
      ) : (
        <div className="grid xl:grid-cols-3 gap-4 items-start">
          <div className="xl:col-span-1 space-y-3">
            {items.map((item) => {
              const isExpanded = item.id === expandedId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className={`w-full text-left card p-4 transition-all border ${isExpanded ? 'border-[#4F7DFF]/60 shadow-[0_12px_26px_-20px_rgba(79,125,255,0.95)]' : 'border-white/10 hover:border-white/20'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-zinc-400">Periodo</p>
                      <p className="text-lg font-semibold text-zinc-100">{item.period_label}</p>
                    </div>
                    {isExpanded ? <ChevronUp size={18} className="text-zinc-300" /> : <ChevronDown size={18} className="text-zinc-300" />}
                  </div>

                  <div className="mt-2">
                    {item.is_current_month ? (
                      <span className="badge-green">Periodo em andamento (dinamico)</span>
                    ) : (
                      <span className="badge-blue">Periodo fechado (snapshot)</span>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-300">
                    <span className="inline-flex items-center gap-1.5"><Wallet size={13} /> Receita: {formatCurrency(item.revenue)}</span>
                    <span className="inline-flex items-center gap-1.5"><TrendingUp size={13} /> Lucro: {formatCurrency(item.profit)}</span>
                    <span className="inline-flex items-center gap-1.5"><Receipt size={13} /> OS: {item.total_services}</span>
                    <span className="inline-flex items-center gap-1.5"><CalendarRange size={13} /> Vendas: {item.total_sales}</span>
                  </div>
                </button>
              );
            })}

            {items.length === 0 && (
              <div className="card p-6 text-sm text-zinc-400 text-center">
                Nenhum fechamento mensal encontrado para os filtros selecionados.
              </div>
            )}
          </div>

          <div className="xl:col-span-2">
            {!selectedItem ? (
              <div className="card p-8 text-sm text-zinc-400 text-center">Selecione um card para ver os detalhes do fechamento mensal.</div>
            ) : (
              <div className="card p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-zinc-400">Detalhes do fechamento</p>
                    <h3 className="text-lg font-semibold text-zinc-100">{selectedItem.period_label}</h3>
                  </div>
                  {selectedItem.is_current_month ? (
                    <span className="badge-green inline-flex items-center gap-1.5"><PiggyBank size={14} /> Atualizacao em tempo real</span>
                  ) : (
                    <span className="badge-blue inline-flex items-center gap-1.5"><PiggyBank size={14} /> Snapshot financeiro</span>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <DetailItem label="Receita Bruta" value={formatCurrency(selectedItem.revenue)} />
                  <DetailItem label="Receita Recebida" value={formatCurrency(selectedItem.received)} />
                  <DetailItem label="Receita Pendente" value={formatCurrency(selectedItem.pending)} />
                  <DetailItem label="Lucro" value={formatCurrency(selectedItem.profit)} />
                  <DetailItem label="Lucro Liquido" value={formatCurrency(selectedItem.net_profit)} />
                  <DetailItem label="Ticket Medio" value={formatCurrency(selectedItem.average_ticket)} />
                  <DetailItem label="Quantidade de OS" value={selectedItem.total_services} />
                  <DetailItem label="Quantidade de Vendas" value={selectedItem.total_sales} />
                  <DetailItem label="Gastos Cadastrados" value={formatCurrency(selectedItem.expenses)} />
                  <DetailItem label="Recebido em Dinheiro" value={formatCurrency(selectedItem.cash_total)} />
                  <DetailItem label="Recebido em Pix" value={formatCurrency(selectedItem.pix_total)} />
                  <DetailItem label="Recebido em Cartao" value={formatCurrency(selectedItem.card_total)} />
                  <DetailItem label="Outros Meios" value={formatCurrency(selectedItem.other_total)} />
                  <DetailItem label="Abertura do Mes" value={formatDateTime(selectedItem.opened_at)} />
                  <DetailItem label="Fechamento do Mes" value={formatDateTime(selectedItem.closed_at)} />
                  <DetailItem label="Registro no Sistema" value={formatDate(selectedItem.created_at)} />
                </div>
                <p className="text-xs text-slate-500">Retiradas automáticas de peças aparecem nos gastos, mas o custo já está incluído no lucro da OS e não é descontado novamente do lucro líquido.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
