import { Link, NavLink, Outlet } from 'react-router-dom';
import { HeartPulse, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { profile, signOut } = useAuth();

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-lg text-sm font-medium ${
      isActive
        ? 'bg-cyan-500/20 text-cyan-300'
        : 'text-slate-300 hover:bg-slate-700/60'
    }`;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="sticky top-0 z-20 bg-slate-900/95 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500 flex items-center justify-center">
              <HeartPulse />
            </div>

            <div>
              <p className="font-bold">Fokus Sağlık</p>
              <p className="text-xs text-slate-400">Kapak Takip</p>
            </div>
          </Link>

          <nav className="flex items-center gap-1 overflow-x-auto">
            <NavLink className={navClass} to="/">
              Ana Sayfa
            </NavLink>

            <NavLink className={navClass} to="/add">
              Yeni Vaka
            </NavLink>

            <NavLink className={navClass} to="/list">
              Vakalar
            </NavLink>

            <NavLink className={navClass} to="/search">
              Arama
            </NavLink>

            <NavLink className={navClass} to="/stock">
              Stok Takip
            </NavLink>

            <NavLink className={navClass} to="/export">
              Excel Aktar
            </NavLink>
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden md:block text-sm text-slate-300">
              {profile?.full_name}
            </span>

            <button
              onClick={signOut}
              className="p-2 rounded-lg hover:bg-slate-700"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}
