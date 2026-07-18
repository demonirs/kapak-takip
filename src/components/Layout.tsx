import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Archive,
  AlertTriangle,
  Bell,
  CheckCircle2,
  CheckCheck,
  Circle,
  FileSpreadsheet,
  HeartPulse,
  Home,
  List,
  LogOut,
  Menu,
  Moon,
  Info,
  Package,
  PlusCircle,
  Search,
  Shuffle,
  Sun,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';

type NotificationItem = {
  id: string;
  user_id: string | null;
  title: string;
  message: string;
  type: string;
  related_table: string | null;
  related_id: string | null;
  is_read: boolean;
  created_at: string;
};

type NotificationFilter = 'all' | 'unread';

const menuSections = [
  {
    title: 'VAKA YÖNETİMİ',
    items: [
      { to: '/', label: 'Ana Sayfa', icon: Home },
      { to: '/add', label: 'Yeni Vaka', icon: PlusCircle },
      { to: '/list', label: 'Vakalar', icon: List },
      { to: '/search', label: 'Arama', icon: Search },
      { to: '/export', label: 'Excel Aktar', icon: FileSpreadsheet },
    ],
  },
  {
    title: 'STOK YÖNETİMİ',
    items: [
      { to: '/stock', label: 'Stok Takip', icon: Package },
      { to: '/stock-movements', label: 'Stok Hareketleri', icon: Shuffle },
      { to: '/archive', label: 'Arşiv', icon: Archive },
    ],
  },
  {
    title: 'RAKİP TAKİBİ',
    items: [{ to: '/competitor-cases', label: 'Rakip Vakalar', icon: Users }],
  },
  {
    title: 'SİSTEM',
    items: [{ to: '/users', label: 'Kullanıcılar', icon: Users }],
  },
];

function getPageTitle(pathname: string) {
  if (pathname === '/') return 'Ana Sayfa';
  if (pathname.startsWith('/add')) return 'Yeni Vaka';
  if (pathname.startsWith('/edit')) return 'Vakayı Düzenle';
  if (pathname.startsWith('/list')) return 'Vakalar';
  if (pathname.startsWith('/view')) return 'Vaka Detayı';
  if (pathname.startsWith('/search')) return 'Arama';
  if (pathname.startsWith('/stock-movements')) return 'Stok Hareketleri';
  if (pathname.startsWith('/stock')) return 'Stok Takip';
  if (pathname.startsWith('/archive')) return 'Arşiv';
  if (pathname.startsWith('/users')) return 'Kullanıcı Yönetimi';
  if (pathname.startsWith('/export')) return 'Excel Aktar';
  if (pathname.startsWith('/competitor-cases')) return 'Rakip Vakalar';
  return 'ValveFlow';
}

export default function Layout() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const notificationRef = useRef<HTMLDivElement | null>(null);
  const notificationPanelRef = useRef<HTMLElement | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationFilter, setNotificationFilter] =
    useState<NotificationFilter>('all');

  const unreadCount = notifications.filter(item => !item.is_read).length;
  const visibleNotifications = notifications.filter(item =>
    notificationFilter === 'unread' ? !item.is_read : true
  );
  const profileRole = (profile as { role?: string | null } | null)?.role;
  const roleLabel = profileRole === 'admin' ? 'Yönetici' : 'Kullanıcı';

  useEffect(() => {
    setMenuOpen(false);
    setNotificationOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!notificationOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setNotificationOpen(false);
    }

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [notificationOpen]);

  useEffect(() => {
    if (!profile?.id) {
      setNotifications([]);
      return;
    }

    loadNotifications();

    const channel = supabase
      .channel(`notifications-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        payload => {
          const newNotification = payload.new as NotificationItem;

          setNotifications(current => {
            const alreadyExists = current.some(
              item => item.id === newNotification.id
            );

            if (alreadyExists) return current;

            return [newNotification, ...current].slice(0, 20);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node) &&
        !notificationPanelRef.current?.contains(event.target as Node)
      ) {
        setNotificationOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  async function loadNotifications() {
    if (!profile?.id) return;

    setNotificationLoading(true);

    const { data, error } = await supabase
      .from('notifications')
      .select(
        'id, user_id, title, message, type, related_table, related_id, is_read, created_at'
      )
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      setNotifications(data as NotificationItem[]);
    }

    setNotificationLoading(false);
  }

  async function markNotificationAsRead(notificationId: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) return;

    setNotifications(current =>
      current.map(item =>
        item.id === notificationId ? { ...item, is_read: true } : item
      )
    );
  }

  async function markAllNotificationsAsRead() {
    if (!profile?.id) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', profile.id)
      .eq('is_read', false);

    if (error) return;

    setNotifications(current =>
      current.map(item => ({
        ...item,
        is_read: true,
      }))
    );
  }

  async function handleNotificationClick(item: NotificationItem) {
    if (!item.is_read) {
      await markNotificationAsRead(item.id);
    }

    setNotificationOpen(false);

    if (!item.related_id) return;

    if (
      item.related_table === 'kapaklar' ||
      item.related_table === 'cases' ||
      item.related_table === 'vakalar'
    ) {
      navigate(`/view/${item.related_id}`);
      return;
    }

    if (item.related_table === 'stok_hareketleri') {
      navigate('/stock-movements');
      return;
    }

    if (item.related_table === 'rakip_vakalar') {
      navigate('/competitor-cases');
    }
  }

  function formatNotificationDate(date: string) {
    const diffMs = Date.now() - new Date(date).getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Şimdi';
    if (diffMinutes < 60) return `${diffMinutes} dk önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;

    return new Date(date).toLocaleDateString('tr-TR');
  }

  function notificationTypeClass(type: string) {
    if (type === 'success')
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300';
    if (type === 'warning')
      return 'border-amber-500/25 bg-amber-500/10 text-amber-300';
    if (type === 'error')
      return 'border-red-500/25 bg-red-500/10 text-red-300';
    return 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300';
  }

  function notificationTypeIcon(type: string) {
    if (type === 'success') return <CheckCircle2 className="h-4 w-4" />;
    if (type === 'warning') return <AlertTriangle className="h-4 w-4" />;
    if (type === 'error') return <XCircle className="h-4 w-4" />;
    return <Info className="h-4 w-4" />;
  }

  function goHome() {
    setMenuOpen(false);
    navigate('/');
  }

  async function handleSignOut() {
    setMenuOpen(false);
    await signOut();
  }

  return (
    <div className="app-shell selection:bg-cyan-500/30">

      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-[2px]"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Ana menü"
        className={`fixed left-0 top-0 z-50 h-dvh w-[min(86vw,304px)] border-r border-slate-800/80 bg-slate-950/98 pt-[env(safe-area-inset-top)] shadow-2xl transition-transform duration-200 ease-out ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex min-h-16 items-center justify-between border-b border-slate-800/80 px-4">
          <button onClick={goHome} className="flex items-center gap-3 text-left">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500 text-slate-950">
              <HeartPulse className="w-5 h-5" />
            </div>

            <div>
              <p className="text-sm font-bold leading-tight">Fokus Sağlık</p>
              <p className="text-xs text-slate-400">TAVI Kapak Takip Sistemi</p>
            </div>
          </button>

          <button
            onClick={() => setMenuOpen(false)}
            className="icon-button"
            aria-label="Menüyü kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="h-[calc(100dvh-64px-env(safe-area-inset-top))] overflow-y-auto px-3 py-4 pb-8">
          {menuSections.map(section => (
            <div key={section.title} className="mb-5">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {section.title}
              </p>

              <div className="space-y-1">
                {section.items.map(item => {
                  const Icon = item.icon;

                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-cyan-500/10 text-cyan-200 ring-1 ring-inset ring-cyan-500/15'
                            : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
                        }`
                      }
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}

          <button
            onClick={handleSignOut}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10"
          >
            <LogOut className="w-5 h-5" />
            Çıkış Yap
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="app-container flex min-h-16 items-center">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setMenuOpen(true)}
                className="icon-button shrink-0 text-cyan-300"
                title="Menü"
                aria-label="Menüyü aç"
              >
                <Menu className="w-5 h-5" />
              </button>

              <button
                onClick={goHome}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-slate-950 transition-colors hover:bg-cyan-400"
                title="Ana Sayfa"
              >
                <HeartPulse className="w-5 h-5" />
              </button>

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-200">
                  {getPageTitle(location.pathname)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div ref={notificationRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotificationOpen(current => !current);
                    loadNotifications();
                  }}
                  className="icon-button relative text-cyan-300"
                  title="Bildirimler"
                  aria-label="Bildirimler"
                >
                  <Bell className="w-4 h-4" />

                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center border border-slate-950">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notificationOpen && createPortal(
                  <>
                    <div
                      className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-[2px] sm:hidden"
                      onClick={() => setNotificationOpen(false)}
                      aria-hidden="true"
                    />

                    <section
                      ref={notificationPanelRef}
                      aria-label="Bildirim paneli"
                      className="fixed inset-x-0 bottom-0 z-[80] flex max-h-[min(82dvh,680px)] flex-col overflow-hidden rounded-t-2xl border border-b-0 border-slate-700/80 bg-slate-900 shadow-2xl sm:bottom-auto sm:left-auto sm:right-5 sm:top-[calc(env(safe-area-inset-top)+68px)] sm:w-[400px] sm:rounded-2xl sm:border-b"
                    >
                      <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-white">
                              Bildirimler
                            </p>
                            {unreadCount > 0 && (
                              <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
                                {unreadCount} yeni
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-400">
                            Son {notifications.length} bildirim gösteriliyor
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={markAllNotificationsAsRead}
                            disabled={unreadCount === 0}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-cyan-300 transition hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-30"
                            title="Tümünü okundu yap"
                            aria-label="Tüm bildirimleri okundu yap"
                          >
                            <CheckCheck className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setNotificationOpen(false)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
                            aria-label="Bildirim panelini kapat"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 border-b border-slate-800 bg-slate-950/30 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setNotificationFilter('all')}
                          className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            notificationFilter === 'all'
                              ? 'bg-cyan-500/15 text-cyan-200'
                              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          Tümü ({notifications.length})
                        </button>

                        <button
                          type="button"
                          onClick={() => setNotificationFilter('unread')}
                          className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            notificationFilter === 'unread'
                              ? 'bg-cyan-500/15 text-cyan-200'
                              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          Okunmamış ({unreadCount})
                        </button>
                      </div>

                      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
                        {notificationLoading ? (
                          <div className="px-4 py-10 text-center text-sm text-slate-400">
                            Bildirimler yükleniyor...
                          </div>
                        ) : notifications.length === 0 ? (
                          <div className="px-4 py-12 text-center">
                            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-400">
                              <Bell className="h-5 w-5" />
                            </div>
                            <p className="text-sm font-semibold text-slate-200">
                              Henüz bildirim yok
                            </p>
                            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
                              ValveFlow önemli gelişmeleri ve işlem sonuçlarını
                              burada gösterecek.
                            </p>
                          </div>
                        ) : visibleNotifications.length === 0 ? (
                          <div className="px-4 py-12 text-center">
                            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                              <CheckCheck className="h-5 w-5" />
                            </div>
                            <p className="text-sm font-semibold text-slate-200">
                              Tüm bildirimler okundu
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Şu anda bekleyen yeni bildiriminiz yok.
                            </p>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-800/80">
                            {visibleNotifications.map(item => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => handleNotificationClick(item)}
                                className={`relative w-full px-4 py-3.5 text-left transition hover:bg-slate-800/70 ${
                                  item.is_read ? 'bg-transparent' : 'bg-cyan-500/[0.035]'
                                }`}
                              >
                                {!item.is_read && (
                                  <span className="absolute bottom-3 left-0 top-3 w-0.5 rounded-r-full bg-cyan-400" />
                                )}

                                <div className="flex gap-3">
                                  <div
                                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${notificationTypeClass(
                                      item.type
                                    )}`}
                                  >
                                    {notificationTypeIcon(item.type)}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                      <p className={`break-words text-sm leading-snug ${
                                        item.is_read
                                          ? 'font-medium text-slate-300'
                                          : 'font-semibold text-slate-100'
                                      }`}>
                                        {item.title}
                                      </p>

                                      {!item.is_read && (
                                        <Circle className="mt-1 h-2.5 w-2.5 shrink-0 fill-cyan-400 text-cyan-400" />
                                      )}
                                    </div>

                                    <p className="mt-1.5 break-words text-xs leading-relaxed text-slate-400">
                                      {item.message}
                                    </p>

                                    <div className="mt-2 flex items-center justify-between gap-2">
                                      <span className="text-[11px] text-slate-500">
                                        {formatNotificationDate(item.created_at)}
                                      </span>

                                      {item.related_id && (
                                        <span className="text-[11px] font-medium text-cyan-300">
                                          Detayı aç
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </section>
                  </>,
                  document.body
                )}
              </div>

              <button
                onClick={toggleTheme}
                className="icon-button text-cyan-300"
                title={theme === 'dark' ? 'Gündüz Modu' : 'Gece Modu'}
                aria-label={theme === 'dark' ? 'Gündüz moduna geç' : 'Gece moduna geç'}
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>

              <div className="hidden border-l border-slate-800 pl-3 text-right sm:block">
                <p className="max-w-[150px] truncate text-sm font-medium leading-tight text-slate-200">
                  {profile?.full_name || 'Kullanıcı'}
                </p>

                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500">
                  {roleLabel}
                </p>
              </div>

              <button
                onClick={handleSignOut}
                className="icon-button text-slate-400 hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-300"
                title="Çıkış Yap"
                aria-label="Çıkış yap"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>
      </header>

      <main className="app-container relative z-10 py-5 pb-10 sm:py-6 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}
