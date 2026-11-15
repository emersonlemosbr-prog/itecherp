import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Smartphone, Plus, Search, Filter, ArrowUpDown, Clock,
  DollarSign, TrendingUp, AlertTriangle, CheckCircle2, ChevronRight,
  Eye, RefreshCw, Layers, ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import DeviceFormDrawer from '../components/DeviceFormDrawer';
import DeviceDetailDrawer from '../components/DeviceDetailDrawer';
import { POPULAR_BRANDS, STORAGE_OPTIONS, CONDITION_OPTIONS, STATUS_MAP } from '../data/deviceCatalog';

export default function Devices() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  // Permissão financeira: se admin ou se tiver view financeira
  const isFinancialAllowed = isAdmin || !!(user?.permissions?.financial_view || user?.permissions?.financial);

  // Estados principais
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({
    all: 0,
    in_stock: 0,
    reserved: 0,
    unavailable: 0,
    older_60: 0,
    sold: 0,
    archived: 0
  });
  const [metrics, setMetrics] = useState({
    in_stock_count: 0,
    stock_cost_total: 0,
    potential_profit_total: 0,
    older_60_count: 0,
    older_60_cost_total: 0
  });

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('in_stock');

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [conditionFilter, setConditionFilter] = useState('all');
  const [storageFilter, setStorageFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('recent');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);

  // Modais / Drawers
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formInitialData, setFormInitialData] = useState(null);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);

  // Carregar dados da API
  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        tab: activeTab,
        q: searchTerm,
        brand: brandFilter,
        condition: conditionFilter,
        storage: storageFilter,
        sort: sortOrder,
        page,
        limit
      };

      const res = await api.get('/devices', { params });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
      if (res.data.counts) setCounts(res.data.counts);
      if (res.data.metrics) setMetrics(res.data.metrics);
    } catch (err) {
      console.error('Erro ao carregar aparelhos:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchTerm, brandFilter, conditionFilter, storageFilter, sortOrder, page, limit]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Recarregar detalhe quando selecionado
  const refreshSelectedDevice = async (id) => {
    try {
      const res = await api.get(`/devices/${id}`);
      setSelectedDevice(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  // Ações de gerenciamento de status
  const handleOpenDetail = async (dev) => {
    setSelectedDevice(dev);
    setIsDetailOpen(true);
    refreshSelectedDevice(dev.id);
  };

  const handleOpenEdit = (dev) => {
    setFormInitialData(dev);
    setIsFormOpen(true);
  };

  const handleReserve = async (id, notes) => {
    try {
      await api.post(`/devices/${id}/reserve`, { reservation_notes: notes });
      fetchDevices();
      if (selectedDevice?.id === id) refreshSelectedDevice(id);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao reservar aparelho.');
    }
  };

  const handleCancelReservation = async (id) => {
    try {
      await api.post(`/devices/${id}/cancel-reservation`);
      fetchDevices();
      if (selectedDevice?.id === id) refreshSelectedDevice(id);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao cancelar reserva.');
    }
  };

  const handleToggleStatus = async (id, newStatus) => {
    try {
      await api.post(`/devices/${id}/status`, { status: newStatus });
      fetchDevices();
      if (selectedDevice?.id === id) refreshSelectedDevice(id);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao alterar status.');
    }
  };

  const handleArchive = async (id) => {
    if (!confirm('Deseja realmente arquivar este aparelho?')) return;
    try {
      await api.post(`/devices/${id}/archive`);
      fetchDevices();
      setIsDetailOpen(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao arquivar aparelho.');
    }
  };

  const handleRestore = async (id) => {
    try {
      await api.post(`/devices/${id}/restore`);
      fetchDevices();
      if (selectedDevice?.id === id) refreshSelectedDevice(id);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao desarquivar aparelho.');
    }
  };

  const handleSellNow = (dev) => {
    // Redireciona para /venda-aparelho com parâmetro deviceId
    navigate(`/venda-aparelho?deviceId=${dev.id}`);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Topo / Título & Botão Adicionar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Estoque
          </span>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-yellow-500" />
            Aparelhos
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setFormInitialData(null);
              setIsFormOpen(true);
            }}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-yellow-500/20 flex items-center gap-2 text-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            Adicionar aparelho
          </button>
        </div>
      </div>

      {/* Cards de Métricas Superiores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Em estoque */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs font-medium text-slate-400">Em estoque</span>
            <div className="text-2xl font-extrabold text-white mt-1">
              {metrics.in_stock_count}
            </div>
          </div>
          <span className="text-[11px] text-slate-500 mt-2">
            aparelhos disponíveis
          </span>
        </div>

        {/* Valor em estoque */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs font-medium text-slate-400">Valor em estoque</span>
            <div className="text-2xl font-extrabold text-white mt-1">
              {isFinancialAllowed
                ? `R$ ${(metrics.stock_cost_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                : '••••••'}
            </div>
          </div>
          <span className="text-[11px] text-slate-500 mt-2">
            custo dos aparelhos em estoque e reservados
          </span>
        </div>

        {/* Lucro potencial */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs font-medium text-slate-400">Lucro potencial</span>
            <div className="text-2xl font-extrabold text-emerald-400 mt-1">
              {isFinancialAllowed
                ? `R$ ${(metrics.potential_profit_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                : '••••••'}
            </div>
          </div>
          <span className="text-[11px] text-slate-500 mt-2">
            preço - custo, não realizado
          </span>
        </div>

        {/* Parados há +60 dias */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs font-medium text-slate-400">Parados há +60 dias</span>
            <div className="text-2xl font-extrabold text-amber-400 mt-1">
              {metrics.older_60_count}
            </div>
          </div>
          <span className="text-[11px] text-slate-500 mt-2">
            {isFinancialAllowed
              ? `R$ ${(metrics.older_60_cost_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em custo`
              : 'aparelhos parados'}
          </span>
        </div>
      </div>

      {/* Abas com Contadores Dinâmicos */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-slate-800 text-xs font-medium scrollbar-none">
        {[
          { key: 'all', label: 'Todos', count: counts.all },
          { key: 'in_stock', label: 'Em estoque', count: counts.in_stock },
          { key: 'reserved', label: 'Reservados', count: counts.reserved },
          { key: 'unavailable', label: 'Indisponíveis', count: counts.unavailable },
          { key: 'older_60', label: 'Parados +60 dias', count: counts.older_60 },
          { key: 'sold', label: 'Vendidos', count: counts.sold },
          { key: 'archived', label: 'Arquivados', count: counts.archived },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setPage(1);
            }}
            className={`px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-yellow-500/10 text-yellow-500 font-bold border border-yellow-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
              activeTab === tab.key ? 'bg-yellow-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Barra de Busca e Filtros */}
      <div className="bg-slate-900/60 p-3 rounded-2xl border border-slate-800 flex flex-wrap items-center gap-2.5 text-xs">
        {/* Campo de Busca Geral */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Modelo, IMEI ou série..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-yellow-500"
          />
        </div>

        {/* Marca */}
        <select
          value={brandFilter}
          onChange={(e) => {
            setBrandFilter(e.target.value);
            setPage(1);
          }}
          className="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
        >
          <option value="all">Marca: todas</option>
          {POPULAR_BRANDS.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        {/* Condição */}
        <select
          value={conditionFilter}
          onChange={(e) => {
            setConditionFilter(e.target.value);
            setPage(1);
          }}
          className="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
        >
          <option value="all">Condição: todas</option>
          {CONDITION_OPTIONS.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        {/* Armazenamento */}
        <select
          value={storageFilter}
          onChange={(e) => {
            setStorageFilter(e.target.value);
            setPage(1);
          }}
          className="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
        >
          <option value="all">Armazenamento: todos</option>
          {STORAGE_OPTIONS.map(st => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>

        {/* Ordenação */}
        <select
          value={sortOrder}
          onChange={(e) => {
            setSortOrder(e.target.value);
            setPage(1);
          }}
          className="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
        >
          <option value="recent">Ordenar: mais recentes</option>
          <option value="oldest">Ordenar: mais antigos</option>
          <option value="price_desc">Maior preço</option>
          <option value="price_asc">Menor preço</option>
          <option value="days_in_stock_desc">Mais tempo parado</option>
        </select>
      </div>

      {/* Tabela de Aparelhos */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/50 text-slate-400 border-b border-slate-800 font-medium">
              <tr>
                <th className="py-3 px-4">Aparelho</th>
                <th className="py-3 px-4">Condição</th>
                <th className="py-3 px-4">Bateria</th>
                <th className="py-3 px-4">Em estoque</th>
                {isFinancialAllowed && <th className="py-3 px-4">Custo</th>}
                <th className="py-3 px-4">Preço</th>
                <th className="py-3 px-4">Situação</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={isFinancialAllowed ? 8 : 7} className="py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-yellow-500" />
                      <span>Carregando aparelhos...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={isFinancialAllowed ? 8 : 7} className="py-16 text-center text-slate-500">
                    <Smartphone className="w-10 h-10 mx-auto text-slate-700 mb-2" />
                    <p className="font-semibold text-slate-400">Nenhum aparelho encontrado</p>
                    <p className="text-[11px] mt-1">Tente ajustar os filtros ou cadastre um novo aparelho.</p>
                  </td>
                </tr>
              ) : (
                items.map((dev) => {
                  const statusConf = STATUS_MAP[dev.status] || { label: dev.status, badgeClass: 'bg-slate-800 text-slate-400' };
                  const condConf = CONDITION_OPTIONS.find(c => c.value === dev.condition);

                  return (
                    <tr
                      key={dev.id}
                      onClick={() => handleOpenDetail(dev)}
                      className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      {/* Aparelho */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          {dev.brand} {dev.model} {dev.storage && <span className="font-normal text-slate-400">{dev.storage}</span>}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {dev.color || 'Sem cor'} · IMEI: {dev.imei1 || dev.serial_number || 'Sem serial'}
                        </div>
                      </td>

                      {/* Condição */}
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${condConf?.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                          {dev.condition}
                        </span>
                      </td>

                      {/* Bateria com barra de progresso */}
                      <td className="py-3.5 px-4">
                        {dev.battery_health !== null && dev.battery_health !== undefined ? (
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  dev.battery_health >= 85
                                    ? 'bg-emerald-400'
                                    : dev.battery_health >= 75
                                    ? 'bg-amber-400'
                                    : 'bg-rose-400'
                                }`}
                                style={{ width: `${dev.battery_health}%` }}
                              />
                            </div>
                            <span className="font-semibold text-slate-300">{dev.battery_health}%</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Tempo em estoque */}
                      <td className="py-3.5 px-4 text-slate-400">
                        {dev.days_in_stock || 0} {dev.days_in_stock === 1 ? 'dia' : 'dias'}
                      </td>

                      {/* Custo */}
                      {isFinancialAllowed && (
                        <td className="py-3.5 px-4 font-mono text-slate-400">
                          R$ {Number(dev.cost_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      )}

                      {/* Preço de venda */}
                      <td className="py-3.5 px-4 font-mono font-bold text-white">
                        R$ {Number(dev.sell_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Situação */}
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${statusConf.badgeClass}`}>
                          {statusConf.label}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleOpenDetail(dev)}
                          className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                          title="Ver detalhes"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="p-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div>
            Mostrando {items.length} de {total} aparelhos
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="font-medium text-slate-300">
              Página {page}
            </span>
            <button
              disabled={items.length < limit || (page * limit) >= total}
              onClick={() => setPage(p => p + 1)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      {/* Drawer de Cadastro/Edição de Aparelho */}
      <DeviceFormDrawer
        isOpen={isFormOpen}
        initialData={formInitialData}
        onClose={() => {
          setIsFormOpen(false);
          setFormInitialData(null);
        }}
        onSuccess={() => {
          fetchDevices();
          if (selectedDevice?.id && formInitialData?.id === selectedDevice.id) {
            refreshSelectedDevice(selectedDevice.id);
          }
        }}
        api={api}
      />

      {/* Drawer Lateral de Detalhes do Aparelho */}
      <DeviceDetailDrawer
        isOpen={isDetailOpen}
        device={selectedDevice}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedDevice(null);
        }}
        onEdit={(dev) => {
          handleOpenEdit(dev);
        }}
        onReserve={handleReserve}
        onCancelReservation={handleCancelReservation}
        onToggleStatus={handleToggleStatus}
        onArchive={handleArchive}
        onRestore={handleRestore}
        onSellNow={handleSellNow}
        isFinancialAllowed={isFinancialAllowed}
      />
    </div>
  );
}
