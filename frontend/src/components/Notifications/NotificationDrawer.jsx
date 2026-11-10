import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, X, CheckCheck, Trash2, Sliders, ExternalLink,
  Wrench, ShoppingBag, Package, DollarSign, UserCheck, AlertTriangle, Info, Clock
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

const CATEGORY_ICONS = {
  orders: Wrench,
  sales: ShoppingBag,
  inventory: Package,
  finance: DollarSign,
  customers: UserCheck,
  system: AlertTriangle,
};

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'Agora mesmo';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min atrás`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} h atrás`;
  const days = Math.floor(diffSec / 86400);
  if (days === 1) return 'Ontem';
  if (days < 7) return `${days} dias atrás`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function NotificationDrawer() {
  const {
    notifications,
    unreadCount,
    loading,
    isPanelOpen,
    setIsPanelOpen,
    setIsPreferencesOpen,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
  } = useNotifications();

  const navigate = useNavigate();

  if (!isPanelOpen) return null;

  function handleNotificationClick(n) {
    if (!n.is_read) {
      markAsRead(n.id);
    }
    if (n.link) {
      navigate(n.link);
      setIsPanelOpen(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 transition-opacity no-print"
        onClick={() => setIsPanelOpen(false)}
      />

      {/* Painel Lateral / Drawer */}
      <aside
        className="fixed top-0 right-0 h-screen w-[90vw] max-w-md bg-white dark:bg-[#18181B] text-slate-800 dark:text-zinc-100 z-50 border-l border-slate-200 dark:border-white/10 shadow-2xl flex flex-col no-print animate-in slide-in-from-right duration-200"
      >
        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative p-2 rounded-xl bg-amber-500/10 text-amber-500 dark:text-amber-400">
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 min-w-[18px] text-center text-[10px] font-black rounded-full bg-rose-500 text-white shadow-sm">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-zinc-100">Central de Notificações</h2>
              <p className="text-xs text-slate-400 dark:text-zinc-400">
                {unreadCount > 0 ? `${unreadCount} não lida${unreadCount > 1 ? 's' : ''}` : 'Nenhuma notificação nova'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setIsPreferencesOpen(true);
              }}
              title="Preferências de Notificações"
              className="p-2 rounded-xl text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/5 transition"
            >
              <Sliders size={18} />
            </button>
            <button
              type="button"
              onClick={() => setIsPanelOpen(false)}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/5 transition"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Barra de Ações Rápidas */}
        {notifications.length > 0 && (
          <div className="px-5 py-2.5 bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/10 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={markAllAsRead}
              className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:underline font-medium transition"
            >
              <CheckCheck size={14} /> Marcar todas como lidas
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Deseja limpar todo o histórico de notificações?')) {
                  clearAllNotifications();
                }
              }}
              className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-500 transition"
            >
              <Trash2 size={13} /> Limpar tudo
            </button>
          </div>
        )}

        {/* Lista de Notificações */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5">
          {loading && notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-xs">Carregando avisos...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 mb-3">
                <Bell size={24} className="opacity-40" />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Você está em dia!</p>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1 max-w-[240px]">
                Nenhuma notificação encontrada no momento. Acompanhe as novas atualizações em tempo real.
              </p>
            </div>
          ) : (
            notifications.map(n => {
              const Icon = CATEGORY_ICONS[n.category] || Info;
              return (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`group relative p-3.5 rounded-xl border transition-all cursor-pointer ${
                    !n.is_read
                      ? 'bg-amber-50/50 dark:bg-amber-500/[0.06] border-amber-500/30 shadow-sm'
                      : 'bg-white dark:bg-white/[0.02] border-slate-200/80 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Ícone da Categoria */}
                    <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                      !n.is_read
                        ? 'bg-amber-500/20 text-amber-500 dark:text-amber-400'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-zinc-400'
                    }`}>
                      <Icon size={16} />
                    </div>

                    {/* Conteúdo */}
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-center gap-2">
                        <h3 className={`text-xs truncate ${!n.is_read ? 'font-bold text-slate-900 dark:text-zinc-100' : 'font-medium text-slate-700 dark:text-zinc-300'}`}>
                          {n.title}
                        </h3>
                        {!n.is_read && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                        {n.description}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400 dark:text-zinc-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={11} />
                          {formatRelativeTime(n.created_at)}
                        </span>
                        {n.link && (
                          <>
                            <span>•</span>
                            <span className="text-amber-600 dark:text-amber-400 group-hover:underline inline-flex items-center gap-0.5 font-medium">
                              Abrir <ExternalLink size={10} />
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ação de Excluir */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification(n.id);
                    }}
                    title="Excluir notificação"
                    className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}

