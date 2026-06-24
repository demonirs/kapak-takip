import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Archive,
  FileSpreadsheet,
  HeartPulse,
  Home,
  List,
  LogOut,
  Menu,
  Package,
  PlusCircle,
  Search,
  Shuffle,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

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
  return 'Kapak Takip';
}

function BackgroundWatermark() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(6,182,212,0.10),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.08),transparent_32%)]" />

      <div className="absolute -top-10 -left-8 text-[120px] sm:text-[180px] md:text-[240px] font-black tracking-tight text-cyan-400/[0.025] select-none">
        23
      </div>

      <div className="absolute top-[24%] -right-8 text-[120px] sm:text-[180px] md:text-[240px] font-black tracking-tight text-cyan-400/[0.025] select-none">
        26
      </div>

      <div className="absolute top-[48%] -left-10 text-[120px] sm:text-[180px] md:text-[240px] font-black tracking-tight text-cyan-400/[0.025] select-none">
        29
      </div>

      <div className="absolute bottom-0 right-4 text-[120px] sm:text-[180px] md:text-[240px] font-black tracking-tight text-cyan-400/[0.025] select-none">
        34
      </div>

      <div className="hidden md:block absolute top-[18%] left-[16%] -rotate-12 text-xs font-mono tracking-[0.45em] text-slate-400/[0.055] select-none">
        R039340 • R043497 • R223305 • R049080
      </div>

      <div className="hidden md:block absolute bottom-[22%] right-[10%] rotate-12 text-xs font-mono tracking-[0.45em] text-slate-400/[0.055] select-none">
        GTIN • LOT • SKT • TAVI
      </div>
    </div>
  );
}

export default function Layout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

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
        className={`fixed top-0 left-0 z-50 h-dvh w-[82%] max-w-[320px] bg-slate-950 border-r border-slate-800 shadow-2xl transition-transform duration-300 ${
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

        <div className="h-[calc(100dvh-73px)] overflow-y-auto px-3 py-4 pb-8">
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

      <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
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

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setMenuOpen(true)}
                className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-300"
                title="Menü"
              >
                <Menu className="w-5 h-5" />
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
