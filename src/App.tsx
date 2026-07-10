import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AddCase from './components/AddCase';
import FocCase from './components/FocCase';
import List from './components/List';
import ViewCase from './components/ViewCase';
import Export from './components/Export';
import Search from './components/Search';
import Stock from './components/Stock';
import StockMovements from './components/StockMovements';
import ArchivedMovements from './components/ArchivedMovements';
import CompetitorCases from './components/CompetitorCases';
import MarketShare from './components/MarketShare';
import CenterAnalysis from './components/CenterAnalysis';
import Users from './components/Users';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        Yükleniyor...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />

        <Route path="add" element={<AddCase />} />
        <Route path="edit/:id" element={<AddCase />} />

        <Route path="foc/:vakaId" element={<FocCase />} />

        <Route path="list" element={<List />} />
        <Route path="view/:id" element={<ViewCase />} />
        <Route path="search" element={<Search />} />
        <Route path="export" element={<Export />} />

        <Route path="stock" element={<Stock />} />
        <Route path="stock-movements" element={<StockMovements />} />
        <Route path="archive" element={<ArchivedMovements />} />

        <Route path="competitor-cases" element={<CompetitorCases />} />
        <Route path="market-share" element={<MarketShare />} />
        <Route path="center-analysis" element={<CenterAnalysis />} />

        <Route path="users" element={<Users />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
