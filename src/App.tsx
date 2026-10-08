import { canViewWarehouse, canWriteCases } from './lib/permissions';
import {
  lazy,
  Suspense,
  useEffect,
  useState,
} from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';

import {
  AuthProvider,
  useAuth,
} from './contexts/AuthContext';

import { supabase } from './lib/supabase';
import { NavigationProvider } from './contexts/NavigationContext';

import Layout from './components/Layout';
import Login from './components/Login';

const Dashboard = lazy(
  () => import('./components/Dashboard')
);
const AddCase = lazy(
  () => import('./components/AddCase')
);
const FocCase = lazy(
  () => import('./components/FocCase')
);
const List = lazy(() => import('./components/List'));
const ViewCase = lazy(
  () => import('./components/ViewCase')
);
const Stock = lazy(
  () => import('./components/Stock')
);
const StockMovements = lazy(
  () => import('./components/StockMovements')
);
const MainWarehouse = lazy(
  () => import('./components/MainWarehouse')
);
const CompetitorCases = lazy(
  () => import('./components/CompetitorCases')
);
const Users = lazy(
  () => import('./components/Users')
);

function PageLoading() {
  return (
    <div className="flex min-h-48 items-center justify-center text-sm text-slate-400">
      Sayfa yükleniyor...
    </div>
  );
}

function Protected({
  children,
}: {
  children: React.ReactNode;
}) {
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

function PermissionGuard({ children, warehouse = false }: {
  children: React.ReactNode;
  warehouse?: boolean;
}) {
  const { user, profile, loading } = useAuth();
  if (loading) return <PageLoading />;
  if (!user || profile?.id !== user.id) return <Navigate to="/" replace />;
  const allowed = warehouse
    ? canViewWarehouse(profile.role)
    : canWriteCases(profile.role);
  return allowed ? <>{children}</> : <Navigate to="/" replace />;
}

function AppRoutes() {
  const [isPasswordRecovery, setIsPasswordRecovery] =
    useState(false);

  useEffect(() => {
    let active = true;

    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, '')
    );

    const queryParams = new URLSearchParams(
      window.location.search
    );

    const recoveryInUrl =
      hashParams.get('type') === 'recovery' ||
      queryParams.get('type') === 'recovery';

    if (recoveryInUrl) {
      supabase.auth.getSession().then(({ data }) => {
        if (active && data.session) {
          setIsPasswordRecovery(true);
        }
      });
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }

      if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (
    isPasswordRecovery &&
    window.location.pathname !== '/reset-password'
  ) {
    return (
      <Navigate to="/reset-password" replace />
    );
  }

  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/reset-password"
          element={<Login />}
        />

        <Route
          path="/"
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route index element={<Dashboard />} />

          <Route path="add" element={<PermissionGuard><AddCase /></PermissionGuard>} />
          <Route path="edit/:id" element={<PermissionGuard><AddCase /></PermissionGuard>} />

          <Route path="foc/:vakaId" element={<PermissionGuard><FocCase /></PermissionGuard>} />

          <Route path="list" element={<List />} />
          <Route path="view/:id" element={<ViewCase />} />

          <Route
            path="search"
            element={<Navigate to="/list" replace />}
          />

          <Route
            path="export"
            element={<Navigate to="/list" replace />}
          />

          <Route path="stock" element={<Stock />} />

          <Route
            path="stock-movements"
            element={<StockMovements />}
          />

          <Route
            path="main-warehouse"
            element={<PermissionGuard warehouse><MainWarehouse /></PermissionGuard>}
          />

          <Route
            path="archive"
            element={<Navigate to="/list" replace />}
          />

          <Route
            path="competitor-cases"
            element={<PermissionGuard><CompetitorCases /></PermissionGuard>}
          />

          <Route path="users" element={<Users />} />
        </Route>

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <NavigationProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </NavigationProvider>
    </BrowserRouter>
  );
}
