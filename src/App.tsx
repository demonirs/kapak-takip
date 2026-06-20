import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AddCase from './components/AddCase';
import List from './components/List';
import ViewCase from './components/ViewCase';
import Export from './components/Export';
import Search from './components/Search';
import Stock from './components/Stock';
import StockMovements from './components/StockMovements';

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
        <Route path="list" element={<List />} />
        <Route path="view/:id" element={<ViewCase />} />
        <Route path="search" element={<Search />} />
        <Route path="stock" element={<Stock />} />
        <Route path="stock-movements" element={<StockMovements />} />
        <Route path="export" element={<Export />} />
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
