import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Archive,
  Bell,
  CheckCheck,
  FileSpreadsheet,
  HeartPulse,
  Home,
  List,
  LogOut,
  Menu,
  Moon,
  Package,
  PlusCircle,
  Search,
  Shuffle,
  Sun,
  Users,
  X,
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

  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(false);

  const unreadCount = notifications.filter(item => !item.is_read).length;
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
        !notificationRef.current.contains(event.target as Node)
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
    if (type === 'success') return 'bg-emerald-500/15 text-emerald-300';
    if (type === 'warning') return 'bg-orange-500/15 text-orange-300';
    if (type === 'error') return 'bg-red-500/15 text-red-300';
    return 'bg-cyan-500/15 text-cyan-300';
  }

  function notificationTypeIcon(type: string) {
    if (type === 'success') return '✓';
    if (type === 'warning') return '!';
    if (type === 'error') return '×';
    return 'i';
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
                <p className="text-sm font-semibold leading-tight truncate">
                  Fokus Sağlık
                </p>

                <p className="text-xs text-slate-400 leading-tight truncate">
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

                {notificationOpen && (
                  <div className="fixed left-4 right-4 top-[calc(env(safe-area-inset-top)+72px)] z-[80] overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl sm:left-auto sm:right-6 sm:w-[380px]">
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800">
                      <div>
                        <p className="text-sm font-bold text-white">Bildirimler</p>
                        <p className="text-xs text-slate-400">
                          {unreadCount > 0
                            ? `${unreadCount} okunmamış bildirim`
                            : 'Yeni bildirim yok'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={markAllNotificationsAsRead}
                        disabled={unreadCount === 0}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40"
                        title="Tümünü okundu yap"
                      >
                        <CheckCheck className="w-4 h-4" />
                        Okundu
                      </button>
                    </div>

                    <div className="max-h-[min(420px,calc(100dvh-150px-env(safe-area-inset-top)))] overflow-y-auto">
                      {notificationLoading ? (
                        <div className="px-4 py-6 text-sm text-slate-400 text-center">
                          Bildirimler yükleniyor...
                        </div>
                      ) : notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                          <div className="mx-auto mb-3 w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
                            <Bell className="w-5 h-5" />
                          </div>

                          <p className="text-sm font-semibold text-slate-200">
                            Henüz bildirim yok
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            ValveFlow önemli gelişmeleri burada gösterecek.
                          </p>
                        </div>
                      ) : (
                        notifications.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => markNotificationAsRead(item.id)}
                            className={`w-full text-left px-4 py-3 border-b border-slate-800 hover:bg-slate-800/80 ${
                              item.is_read ? 'opacity-70' : ''
                            }`}
                          >
                            <div className="flex gap-3">
                              <div
                                className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${notificationTypeClass(
                                  item.type
                                )}`}
                              >
                                {notificationTypeIcon(item.type)}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-semibold text-slate-100 leading-snug">
                                    {item.title}
                                  </p>

                                  {!item.is_read && (
                                    <span className="mt-1 w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                                  )}
                                </div>

                                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                                  {item.message}
                                </p>

                                <p className="mt-2 text-[11px] text-slate-500">
                                  {formatNotificationDate(item.created_at)}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
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
