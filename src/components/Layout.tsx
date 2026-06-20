import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  FileSpreadsheet,
  HeartPulse,
  Home,
  List,
  LogOut,
  Package,
  PlusCircle,
  Search,
  Shuffle,
  Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const mainMenuItems = [
  { to: '/', label: 'Ana Sayfa', icon: Home },
  { to: '/add', label: 'Yeni Vaka', icon: PlusCircle },
  { to: '/list', label: 'Vakalar', icon: List },
  { to: '/stock', label: 'Stok', icon: Package },
  { to: '/stock-movements', label: 'Hareket', icon: Shuffle },
];

const quickMenuItems = [
  { to: '/search', label: 'Arama', icon: Search },
  { to: '/export', label: 'Excel', icon: FileSpreadsheet },
  { to: '/users', label: 'Kullanıcılar', icon: Users },
];

function getPageTitle(pathname: string) {
  if (pathname === '/') return 'Ana Sayfa';
  if (pathname.startsWith('/add')) return 'Yeni Vaka';
  if (pathname.startsWith('/edit')) return 'Vakayı Düzenle';
  if (pathname.startsWith('/list')) return 'Vakalar';
  if (pathname.startsWith('/view')) return 'Vaka Detayı';
  if (pathname.startsWith('/search')) return 'Arama';
  if (pathname.startsWith('/stock')) return 'Stok Takip';
  if (pathname.startsWith('/stock-movements')) return 'Stok Hareketleri';
  if (pathname.startsWith('/users')) return 'Kullanıcı Yönetimi';
  if (pathname.startsWith('/export')) return 'Excel Aktar';
  return 'Kapak Takip';
}

export default function Layout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-cyan-500 flex items-center justify-center shadow-md shadow-cyan-500/20 shrink-0">
                <HeartPulse className="w-5 h-5" />
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight truncate">
                  Fokus Sağlık
                </p>

                <p className="text-xs text-slate-400 leading-tight truncate">
                  {getPageTitle(location.pathname)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:block text-right">
                <p className="text-xs text-slate-400 leading-tight">
                  Kullanıcı
                </p>

                <p className="text-sm text-slate-200 font-medium leading-tight max-w-[140px] truncate">
                  {profile?.full_name || 'Kullanıcı'}
                </p>
              </div>

              <button
                onClick={signOut}
                className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 hover:text-red-200 hover:bg-red-500/10"
                title="Çıkış Yap"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
            {quickMenuItems.map(item => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border ${
                      isActive
                        ? 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30'
                        : 'bg-slate-900 text-slate-300 border-slate-800'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              );
            })}

            <div className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-slate-900 border border-slate-800 text-slate-400">
              <Activity className="w-4 h-4 text-cyan-300" />
              TAVI Panel
            </div>
          </div>
        </div>
      </header>

      <main className="px-3 sm:px-4 py-4 pb-24 max-w-5xl mx-auto">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur border-t border-slate-800">
        <div className="grid grid-cols-5 gap-1 px-2 py-2 max-w-5xl mx-auto">
          {mainMenuItems.map(item => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 rounded-xl py-2 min-h-[58px] text-[11px] font-medium ${
                    isActive
                      ? 'bg-cyan-500/15 text-cyan-200'
                      : 'text-slate-400 hover:text-slate-200'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                <span className="leading-none">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
