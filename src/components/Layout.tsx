import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
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

function BackgroundWatermark() {
  const words = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    top: `${5 + ((i * 11) % 85)}%`,
    left: `${(i * 17) % 95}%`,
    rotate: i % 2 === 0 ? '-12deg' : '10deg',
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(6,182,212,0.08),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(6,182,212,0.06),transparent_35%)]" />

      {words.map(word => (
        <div
          key={word.id}
          className="absolute select-none font-bold tracking-[0.35em] text-cyan-400/[0.02] text-[9px] md:text-[11px]"
          style={{
            top: word.top,
            left: word.left,
            transform: `rotate(${word.rotate})`,
          }}
        >
          EVOLUT PRO+
        </div>
      ))}
    </div>
  );
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
    <div className="relative min-h-dvh bg-slate-950 text-white overflow-x-hidden">
      <BackgroundWatermark />

      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-dvh w-[82%] max-w-[320px] bg-slate-950 border-r border-slate-800 shadow-2xl transition-transform duration-300 pt-[env(safe-area-inset-top)] ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800">
          <button onClick={goHome} className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-cyan-500 flex items-center justify-center shadow-md shadow-cyan-500/20">
              <HeartPulse className="w-5 h-5" />
            </div>

            <div>
              <p className="text-sm font-bold leading-tight">Fokus Sağlık</p>
              <p className="text-xs text-slate-400">TAVI Kapak Takip Sistemi</p>
            </div>
          </button>

          <button
            onClick={() => setMenuOpen(false)}
            className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="h-[calc(100dvh-73px-env(safe-area-inset-top))] overflow-y-auto px-3 py-4 pb-8">
          {menuSections.map(section => (
            <div key={section.title} className="mb-6">
              <p className="px-3 mb-2 text-xs font-bold text-slate-500">
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
                        `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium ${
                          isActive
                            ? 'bg-cyan-500/15 text-cyan-200'
                            : 'text-slate-300 hover:bg-slate-900 hover:text-white'
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
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-red-300 hover:bg-red-500/10"
          >
            <LogOut className="w-5 h-5" />
            Çıkış Yap
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800 pt-[env(safe-area-inset-top)]">
        <div className="px-3 sm:px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setMenuOpen(true)}
                className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-300 shrink-0"
                title="Menü"
              >
                <Menu className="w-5 h-5" />
              </button>

              <button
                onClick={goHome}
                className="w-9 h-9 rounded-xl bg-cyan-500 flex items-center justify-center shadow-md shadow-cyan-500/20 shrink-0"
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
                  className="relative w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-300 hover:bg-cyan-500/10"
                  title="Bildirimler"
                >
                  <Bell className="w-4 h-4" />

                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center border border-slate-950">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notificationOpen && (
                  <div className="fixed z-[80] left-3 right-3 top-[calc(env(safe-area-inset-top)+82px)] sm:left-auto sm:right-4 sm:w-[380px] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
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
                className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-300 hover:bg-cyan-500/10"
                title={theme === 'dark' ? 'Gündüz Modu' : 'Gece Modu'}
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>

              <div className="hidden sm:block text-right">
                <p className="text-xs text-slate-400 leading-tight">Kullanıcı</p>

                <p className="text-sm text-slate-200 font-medium leading-tight max-w-[140px] truncate">
                  {profile?.full_name || 'Kullanıcı'}
                </p>
              </div>

              <button
                onClick={handleSignOut}
                className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 hover:text-red-200 hover:bg-red-500/10"
                title="Çıkış Yap"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 overflow-x-auto overflow-y-hidden pb-1">
            <NavLink
              to="/search"
              className={({ isActive }) =>
                `shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30'
                    : 'bg-slate-900 text-slate-300 border-slate-800'
                }`
              }
            >
              <Search className="w-4 h-4" />
              Arama
            </NavLink>

            <NavLink
              to="/export"
              className={({ isActive }) =>
                `shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30'
                    : 'bg-slate-900 text-slate-300 border-slate-800'
                }`
              }
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel
            </NavLink>

            <NavLink
              to="/archive"
              className={({ isActive }) =>
                `shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30'
                    : 'bg-slate-900 text-slate-300 border-slate-800'
                }`
              }
            >
              <Archive className="w-4 h-4" />
              Arşiv
            </NavLink>

            <NavLink
              to="/competitor-cases"
              className={({ isActive }) =>
                `shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30'
                    : 'bg-slate-900 text-slate-300 border-slate-800'
                }`
              }
            >
              <Users className="w-4 h-4" />
              Rakip
            </NavLink>

            <div className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-slate-900 border border-slate-800 text-slate-400">
              <Activity className="w-4 h-4 text-cyan-300" />
              TAVI Panel
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 w-full max-w-5xl mx-auto px-3 sm:px-4 py-4 pb-8 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
