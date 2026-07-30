import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Layers,
  Package,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { supabase, timeout } from '../lib/supabase';

type DashboardCase = {
  id: string;
  vaka_tarihi: string | null;
  merkez_hastane: string | null;
  doktor: string | null;
  hasta_adi: string | null;
  kapak_tipi: string | null;
  kapak_size: string | number | null;
  lot_no: string | null;
};

type DashboardStats = {
  monthCases: number;
  totalCases: number;
  stockTotal: number;
};

type StatCardProps = {
  label: string;
  value: number;
  description: string;
  icon: typeof Activity;
  iconClassName: string;
  iconContainerClassName: string;
};

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getCurrentMonthRange(): {
  start: string;
  end: string;
} {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDayOfNextMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1
  );

  return {
    start: toDateInputValue(firstDay),
    end: toDateInputValue(firstDayOfNextMonth),
  };
}

function currentMonthLabel(): string {
  return new Date().toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  });
}

function formatDate(value: string | null): string {
  if (!value) return 'Tarih yok';

  const datePart = value.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);

  if (!year || !month || !day) return value;

  return new Date(year, month - 1, day).toLocaleDateString('tr-TR');
}

function formatSize(value: string | number | null): string {
  if (value === null || value === undefined || value === '') {
    return 'Ölçü yok';
  }

  const text = String(value).trim();

  return text.toLocaleLowerCase('tr-TR').endsWith('mm')
    ? text
    : `${text} mm`;
}

function formatValve(caseItem: DashboardCase): string {
  const valveType = caseItem.kapak_tipi?.trim() || 'Kapak tipi yok';

  return `${valveType} / ${formatSize(caseItem.kapak_size)}`;
}

function StatCard({
  label,
  value,
  description,
  icon: Icon,
  iconClassName,
  iconContainerClassName,
}: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {label}
          </p>

          <p className="mt-2 text-3xl font-bold text-white">
            {value}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {description}
          </p>
        </div>

        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${iconContainerClassName}`}
        >
          <Icon className={`h-5 w-5 ${iconClassName}`} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    monthCases: 0,
    totalCases: 0,
    stockTotal: 0,
  });
  const [recentCases, setRecentCases] = useState<DashboardCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    null
  );

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const monthRange = getCurrentMonthRange();

      const [
        monthCountResponse,
        totalCountResponse,
        stockCountResponse,
        recentCasesResponse,
      ] = await Promise.all([
        timeout(
          supabase
            .from('kapaklar')
            .select('id', {
              count: 'exact',
              head: true,
            })
            .gte('vaka_tarihi', monthRange.start)
            .lt('vaka_tarihi', monthRange.end),
          10000
        ),

        timeout(
          supabase
            .from('kapaklar')
            .select('id', {
              count: 'exact',
              head: true,
            }),
          10000
        ),

        timeout(
          supabase
            .from('kapak_stok')
            .select('id', {
              count: 'exact',
              head: true,
            })
            .eq('durum', 'stokta'),
          10000
        ),

        timeout(
          supabase
            .from('kapaklar')
            .select(
              'id, vaka_tarihi, merkez_hastane, doktor, hasta_adi, kapak_tipi, kapak_size, lot_no'
            )
            .order('vaka_tarihi', {
              ascending: false,
              nullsFirst: false,
            })
            .limit(5),
          10000
        ),
      ]);

      const firstError =
        monthCountResponse.error ||
        totalCountResponse.error ||
        stockCountResponse.error ||
        recentCasesResponse.error;

      if (firstError) {
        throw firstError;
      }

      setStats({
        monthCases: monthCountResponse.count ?? 0,
        totalCases: totalCountResponse.count ?? 0,
        stockTotal: stockCountResponse.count ?? 0,
      });

      setRecentCases(
        (recentCasesResponse.data as DashboardCase[] | null) || []
      );
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Ana sayfa verileri yüklenemedi.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className="surface p-4">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <RefreshCw className="h-4 w-4 animate-spin text-cyan-300" />
          Ana sayfa yükleniyor...
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />

          <div>
            <p className="text-sm font-semibold text-red-200">
              Ana sayfa yüklenemedi
            </p>

            <p className="mt-1 text-xs text-red-300">
              {errorMessage}
            </p>

            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/20"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Tekrar Dene
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 pb-6">
      <section className="page-header">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-400">
            ValveFlow
          </p>

          <h1 className="page-title mt-1">
            Ana Sayfa
          </h1>

          <p className="page-description">
            Vaka ve stok durumunuzun kısa özeti
          </p>
        </div>

        <Link
          to="/add"
          className="button-primary w-full sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Yeni Vaka
        </Link>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Bu Ay Vaka"
          value={stats.monthCases}
          description={currentMonthLabel()}
          icon={Activity}
          iconClassName="text-cyan-300"
          iconContainerClassName="border-cyan-500/20 bg-cyan-500/10"
        />

        <StatCard
          label="Toplam Vaka"
          value={stats.totalCases}
          description="Tüm zamanlardaki kayıtlar"
          icon={Layers}
          iconClassName="text-violet-300"
          iconContainerClassName="border-violet-500/20 bg-violet-500/10"
        />

        <StatCard
          label="Stokta Kapak"
          value={stats.stockTotal}
          description="Kullanıma hazır kapaklar"
          icon={Package}
          iconClassName="text-emerald-300"
          iconContainerClassName="border-emerald-500/20 bg-emerald-500/10"
        />
      </section>

      <section className="surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-700/80 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Son Vakalar
            </h2>

            <p className="mt-0.5 text-[11px] text-slate-500">
              Son eklenen 5 vaka
            </p>
          </div>

          <Link
            to="/list"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 transition hover:text-cyan-200"
          >
            Tüm Vakalar
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {recentCases.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-4 py-8 text-center">
            <CalendarDays className="h-7 w-7 text-slate-600" />

            <p className="mt-3 text-sm font-medium text-slate-300">
              Henüz vaka bulunmuyor
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Yeni vaka eklendiğinde burada görünecek.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/70">
            {recentCases.map(caseItem => (
              <Link
                key={caseItem.id}
                to={`/view/${caseItem.id}`}
                className="group block px-4 py-3 transition hover:bg-slate-700/25"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {caseItem.hasta_adi || 'Hasta bilgisi yok'}
                    </p>

                    <p className="mt-1 truncate text-xs text-slate-400">
                      {caseItem.merkez_hastane || 'Merkez bilgisi yok'}
                      <span className="mx-1.5 text-slate-600">•</span>
                      {caseItem.doktor || 'Doktor bilgisi yok'}
                    </p>

                    <p className="mt-1 truncate text-xs text-cyan-300">
                      {formatValve(caseItem)}
                      <span className="mx-1.5 text-slate-600">•</span>
                      LOT: {caseItem.lot_no || 'Yok'}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-slate-300">
                      {formatDate(caseItem.vaka_tarihi)}
                    </p>

                    <ChevronRight className="ml-auto mt-2 h-4 w-4 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-cyan-300" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          to="/list"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/10"
        >
          Tüm Vaka Listesini Aç
          <ArrowRight className="h-4 w-4" />
        </Link>

        <Link
          to="/stock"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/10"
        >
          Stok Takibini Aç
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}
