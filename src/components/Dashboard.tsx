import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileWarning,
  Layers,
  Package,
  Plus,
  RefreshCw,
  TrendingUp,
  User,
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
  son_kul_tarihi: string | null;
  crimp_yapan: string | null;
  arsivlendi?: boolean | null;
};

type StockItem = {
  id: string;
  urun_adi: string | null;
  lot_no: string | null;
  son_kullanma_tarihi: string | null;
  durum?: string | null;
};

type Stats = {
  totalCases: number;
  monthCases: number;
  monthCenters: number;
  monthDoctors: number;
  stockTotal: number;
  criticalStock: number;
};

type StockSummary = {
  normal: number;
  approaching: number;
  critical: number;
  expired: number;
  missingExpiry: number;
};

type MonthlyTrendItem = {
  key: string;
  label: string;
  value: number;
};

type StatCardProps = {
  label: string;
  value: number;
  description: string;
  icon: typeof Layers;
  iconClassName: string;
  iconContainerClassName: string;
};

const DAY_IN_MS = 1000 * 60 * 60 * 24;

function parseDateOnly(value?: string | null): Date | null {
  if (!value) return null;

  const datePart = value.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);

  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);

  return date;
}

function getRemainingDays(value?: string | null): number | null {
  const expiryDate = parseDateOnly(value);

  if (!expiryDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil(
    (expiryDate.getTime() - today.getTime()) / DAY_IN_MS
  );
}

function formatDate(value?: string | null): string {
  const date = parseDateOnly(value);

  if (!date) return '-';

  return date.toLocaleDateString('tr-TR');
}

function formatValve(caseItem: DashboardCase): string {
  const parts = [
    caseItem.kapak_tipi,
    caseItem.kapak_size
      ? `${caseItem.kapak_size} mm`
      : null,
  ].filter(Boolean);

  return parts.length > 0
    ? parts.join(' / ')
    : 'Kapak bilgisi yok';
}

function hasMissingCaseInformation(caseItem: DashboardCase): boolean {
  return [
    caseItem.vaka_tarihi,
    caseItem.merkez_hastane,
    caseItem.doktor,
    caseItem.hasta_adi,
    caseItem.kapak_tipi,
    caseItem.kapak_size,
    caseItem.lot_no,
  ].some(
    (value) =>
      value === null ||
      value === undefined ||
      String(value).trim() === ''
  );
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
    <div className="min-w-[158px] rounded-xl border border-slate-700/90 bg-slate-800/80 p-3.5 shadow-sm sm:min-w-0 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 sm:text-xs">
            {label}
          </p>

          <p className="mt-2 text-2xl font-bold leading-none text-white">
            {value}
          </p>
        </div>

        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${iconContainerClassName}`}
        >
          <Icon className={`h-4 w-4 ${iconClassName}`} />
        </div>
      </div>

      <p className="mt-3 truncate text-[11px] text-slate-500 sm:text-xs">
        {description}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const [cases, setCases] = useState<DashboardCase[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    null
  );

  const loadDashboard = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const activeCaseFilter =
        'arsivlendi.eq.false,arsivlendi.is.null';

      const [casesResponse, stockResponse] = await Promise.all([
        timeout(
          supabase
            .from('kapaklar')
            .select(
              [
                'id',
                'vaka_tarihi',
                'merkez_hastane',
                'doktor',
                'hasta_adi',
                'kapak_tipi',
                'kapak_size',
                'lot_no',
                'son_kul_tarihi',
                'crimp_yapan',
                'arsivlendi',
              ].join(',')
            )
            .or(activeCaseFilter)
            .order('vaka_tarihi', { ascending: false }),
          10000
        ),

        timeout(
          supabase
            .from('kapak_stok')
            .select(
              'id, urun_adi, lot_no, son_kullanma_tarihi, durum'
            )
            .eq('durum', 'stokta'),
          10000
        ),
      ]);

      if (casesResponse.error) {
        throw casesResponse.error;
      }

      if (stockResponse.error) {
        throw stockResponse.error;
      }

      setCases(
        (casesResponse.data as DashboardCase[] | null) || []
      );

      setStockItems(
        (stockResponse.data as StockItem[] | null) || []
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
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const stats = useMemo<Stats>(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const currentMonthCases = cases.filter((caseItem) => {
      const caseDate = parseDateOnly(caseItem.vaka_tarihi);

      if (!caseDate) return false;

      return (
        caseDate.getFullYear() === currentYear &&
        caseDate.getMonth() === currentMonth
      );
    });

    const uniqueCenters = new Set(
      currentMonthCases
        .map((caseItem) => caseItem.merkez_hastane?.trim())
        .filter(Boolean)
    );

    const uniqueDoctors = new Set(
      currentMonthCases
        .map((caseItem) => caseItem.doktor?.trim())
        .filter(Boolean)
    );

    const criticalStock = stockItems.filter((item) => {
      const remainingDays = getRemainingDays(
        item.son_kullanma_tarihi
      );

      return (
        remainingDays !== null &&
        remainingDays >= 0 &&
        remainingDays <= 30
      );
    }).length;

    return {
      totalCases: cases.length,
      monthCases: currentMonthCases.length,
      monthCenters: uniqueCenters.size,
      monthDoctors: uniqueDoctors.size,
      stockTotal: stockItems.length,
      criticalStock,
    };
  }, [cases, stockItems]);

  const stockSummary = useMemo<StockSummary>(() => {
    return stockItems.reduce<StockSummary>(
      (summary, item) => {
        const remainingDays = getRemainingDays(
          item.son_kullanma_tarihi
        );

        if (remainingDays === null) {
          summary.missingExpiry += 1;
        } else if (remainingDays < 0) {
          summary.expired += 1;
        } else if (remainingDays <= 30) {
          summary.critical += 1;
        } else if (remainingDays <= 90) {
          summary.approaching += 1;
        } else {
          summary.normal += 1;
        }

        return summary;
      },
      {
        normal: 0,
        approaching: 0,
        critical: 0,
        expired: 0,
        missingExpiry: 0,
      }
    );
  }, [stockItems]);

  const monthlyTrend = useMemo<MonthlyTrendItem[]>(() => {
    const now = new Date();

    return Array.from({ length: 6 }, (_, index) => {
      const monthDate = new Date(
        now.getFullYear(),
        now.getMonth() - (5 - index),
        1
      );

      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;

      const value = cases.filter((caseItem) => {
        const caseDate = parseDateOnly(caseItem.vaka_tarihi);

        return (
          caseDate?.getFullYear() === year &&
          caseDate.getMonth() === month
        );
      }).length;

      return {
        key,
        label: monthDate
          .toLocaleDateString('tr-TR', {
            month: 'short',
          })
          .replace('.', ''),
        value,
      };
    });
  }, [cases]);

  const recentCases = useMemo(() => cases.slice(0, 5), [cases]);

  const incompleteCases = useMemo(
    () => cases.filter(hasMissingCaseInformation),
    [cases]
  );

  const sortedCriticalItems = useMemo(() => {
    return stockItems
      .filter((item) => {
        const remainingDays = getRemainingDays(
          item.son_kullanma_tarihi
        );

        return remainingDays !== null && remainingDays <= 30;
      })
      .sort((firstItem, secondItem) => {
        const firstDays =
          getRemainingDays(firstItem.son_kullanma_tarihi) ??
          Number.MAX_SAFE_INTEGER;

        const secondDays =
          getRemainingDays(secondItem.son_kullanma_tarihi) ??
          Number.MAX_SAFE_INTEGER;

        return firstDays - secondDays;
      });
  }, [stockItems]);

  const nearestCriticalItem = sortedCriticalItems[0];

  const maximumTrendValue = Math.max(
    ...monthlyTrend.map((item) => item.value),
    1
  );

  const stockTotalForPercentage = Math.max(stockItems.length, 1);

  const normalPercentage = Math.round(
    (stockSummary.normal / stockTotalForPercentage) * 100
  );

  const approachingPercentage = Math.round(
    (stockSummary.approaching / stockTotalForPercentage) * 100
  );

  const criticalPercentage = Math.round(
    (stockSummary.critical / stockTotalForPercentage) * 100
  );

  const expiredPercentage = Math.round(
    (stockSummary.expired / stockTotalForPercentage) * 100
  );

  const missingExpiryPercentage = Math.round(
    (stockSummary.missingExpiry / stockTotalForPercentage) * 100
  );

  const normalEnd = normalPercentage;
  const approachingEnd = normalEnd + approachingPercentage;
  const criticalEnd = approachingEnd + criticalPercentage;
  const expiredEnd = criticalEnd + expiredPercentage;

  const stockChartBackground =
    stockItems.length === 0
      ? 'conic-gradient(rgb(51 65 85) 0deg 360deg)'
      : `conic-gradient(
          rgb(52 211 153) 0% ${normalEnd}%,
          rgb(251 191 36) ${normalEnd}% ${approachingEnd}%,
          rgb(249 115 22) ${approachingEnd}% ${criticalEnd}%,
          rgb(239 68 68) ${criticalEnd}% ${expiredEnd}%,
          rgb(100 116 139) ${expiredEnd}% 100%
        )`;

  const operationalItems = [
    {
      label: 'Eksik Bilgili Vakalar',
      description: 'Tamamlanması gereken vaka kayıtları',
      value: incompleteCases.length,
      icon: FileWarning,
      iconClassName: 'text-blue-300',
      iconContainerClassName:
        'border-blue-500/20 bg-blue-500/10',
      valueClassName: 'text-blue-300',
      to: '/list',
    },
    {
      label: 'Kritik SKT',
      description: '30 gün içinde süresi dolacak stok',
      value: stockSummary.critical,
      icon: Clock3,
      iconClassName: 'text-orange-300',
      iconContainerClassName:
        'border-orange-500/20 bg-orange-500/10',
      valueClassName: 'text-orange-300',
      to: '/stock',
    },
    {
      label: 'SKT Geçmiş',
      description: 'Süresi geçmiş stok kayıtları',
      value: stockSummary.expired,
      icon: AlertTriangle,
      iconClassName: 'text-red-300',
      iconContainerClassName:
        'border-red-500/20 bg-red-500/10',
      valueClassName: 'text-red-300',
      to: '/stock',
    },
    {
      label: 'Bu Ayki Vakalar',
      description: 'İçinde bulunduğumuz ay',
      value: stats.monthCases,
      icon: Activity,
      iconClassName: 'text-cyan-300',
      iconContainerClassName:
        'border-cyan-500/20 bg-cyan-500/10',
      valueClassName: 'text-cyan-300',
      to: '/list',
    },
  ];

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-5">
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
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />

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
    <div className="space-y-4 pb-4 sm:space-y-5">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-400 sm:text-xs">
            ValveFlow
          </p>

          <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">
            Ana Sayfa
          </h1>

          <p className="mt-1 text-xs text-slate-400 sm:text-sm">
            TAVI vaka ve kapak yönetim özetiniz
          </p>
        </div>

        <Link
          to="/add"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-500 sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Yeni Vaka
        </Link>
      </section>

      <section className="-mx-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:overflow-visible sm:px-0">
        <div className="flex gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Toplam Vaka"
            value={stats.totalCases}
            description="Aktif vaka kaydı"
            icon={Layers}
            iconClassName="text-cyan-300"
            iconContainerClassName="border-cyan-500/20 bg-cyan-500/10"
          />

          <StatCard
            label="Bu Ay Kapak"
            value={stats.monthCases}
            description="Aylık vaka adedi"
            icon={Activity}
            iconClassName="text-cyan-300"
            iconContainerClassName="border-cyan-500/20 bg-cyan-500/10"
          />

          <StatCard
            label="Toplam Stok"
            value={stats.stockTotal}
            description="Stokta bulunan kapak"
            icon={Package}
            iconClassName="text-emerald-300"
            iconContainerClassName="border-emerald-500/20 bg-emerald-500/10"
          />

          <StatCard
            label="Bu Ay Merkez"
            value={stats.monthCenters}
            description="Çalışılan merkez"
            icon={Building2}
            iconClassName="text-sky-300"
            iconContainerClassName="border-sky-500/20 bg-sky-500/10"
          />

          <StatCard
            label="Bu Ay Doktor"
            value={stats.monthDoctors}
            description="Çalışılan doktor"
            icon={User}
            iconClassName="text-violet-300"
            iconContainerClassName="border-violet-500/20 bg-violet-500/10"
          />

          <StatCard
            label="Kritik SKT"
            value={stats.criticalStock}
            description="30 gün içinde dolacak"
            icon={AlertTriangle}
            iconClassName={
              stats.criticalStock > 0
                ? 'text-orange-300'
                : 'text-emerald-300'
            }
            iconContainerClassName={
              stats.criticalStock > 0
                ? 'border-orange-500/20 bg-orange-500/10'
                : 'border-emerald-500/20 bg-emerald-500/10'
            }
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(310px,0.88fr)_minmax(280px,0.72fr)]">
        <div className="overflow-hidden rounded-xl border border-slate-700/90 bg-slate-800/70">
          <div className="flex items-center justify-between border-b border-slate-700/80 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Son Vakalar
              </h2>

              <p className="mt-0.5 text-[11px] text-slate-500">
                Son eklenen aktif vaka kayıtları
              </p>
            </div>

            <Link
              to="/list"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 transition hover:text-cyan-200"
            >
              Tümünü Gör
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {recentCases.length === 0 ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center px-4 py-8 text-center">
              <CalendarDays className="h-7 w-7 text-slate-600" />

              <p className="mt-3 text-sm font-medium text-slate-300">
                Henüz aktif vaka bulunmuyor
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Yeni vaka eklendiğinde burada görüntülenecek.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/70">
              {recentCases.map((caseItem) => (
                <Link
                  key={caseItem.id}
                  to={`/view/${caseItem.id}`}
                  className="group block px-4 py-3 transition hover:bg-slate-700/25"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">
                          {caseItem.merkez_hastane ||
                            'Merkez bilgisi yok'}
                        </p>

                        <span className="rounded-md border border-slate-600/80 bg-slate-900/60 px-1.5 py-0.5 text-[10px] text-slate-400">
                          {formatValve(caseItem)}
                        </span>
                      </div>

                      <p className="mt-1 truncate text-xs text-slate-400">
                        {caseItem.doktor ||
                          'Doktor bilgisi bulunmuyor'}
                      </p>

                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {caseItem.hasta_adi ||
                          'Hasta bilgisi bulunmuyor'}
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
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-700/90 bg-slate-800/70">
            <div className="flex items-center justify-between border-b border-slate-700/80 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Stok Durumu
                </h2>

                <p className="mt-0.5 text-[11px] text-slate-500">
                  Son kullanma tarihi dağılımı
                </p>
              </div>

              <Package className="h-4 w-4 text-emerald-300" />
            </div>

            <div className="p-4">
              <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
                <div
                  className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: stockChartBackground,
                  }}
                >
                  <div className="flex h-[88px] w-[88px] flex-col items-center justify-center rounded-full border border-slate-700 bg-slate-900">
                    <p className="text-2xl font-bold text-white">
                      {stockItems.length}
                    </p>

                    <p className="text-[10px] text-slate-500">
                      Toplam Stok
                    </p>
                  </div>
                </div>

                <div className="w-full space-y-2">
                  {[
                    {
                      label: 'Normal',
                      value: stockSummary.normal,
                      percentage: normalPercentage,
                      dotClassName: 'bg-emerald-400',
                    },
                    {
                      label: 'Yaklaşan SKT',
                      value: stockSummary.approaching,
                      percentage: approachingPercentage,
                      dotClassName: 'bg-amber-400',
                    },
                    {
                      label: 'Kritik SKT',
                      value: stockSummary.critical,
                      percentage: criticalPercentage,
                      dotClassName: 'bg-orange-500',
                    },
                    {
                      label: 'SKT Geçmiş',
                      value: stockSummary.expired,
                      percentage: expiredPercentage,
                      dotClassName: 'bg-red-500',
                    },
                    {
                      label: 'SKT Eksik',
                      value: stockSummary.missingExpiry,
                      percentage: missingExpiryPercentage,
                      dotClassName: 'bg-slate-500',
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${item.dotClassName}`}
                        />

                        <span className="truncate text-slate-400">
                          {item.label}
                        </span>
                      </div>

                      <span className="shrink-0 font-medium text-slate-200">
                        {item.value}{' '}
                        <span className="text-slate-500">
                          (%{item.percentage})
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <Link
                to="/stock"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/10"
              >
                Stok Yönetimine Git
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-700/90 bg-slate-800/70">
            <div className="flex items-center justify-between border-b border-slate-700/80 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Vaka Trendi
                </h2>

                <p className="mt-0.5 text-[11px] text-slate-500">
                  Son 6 ayın karşılaştırması
                </p>
              </div>

              <TrendingUp className="h-4 w-4 text-cyan-300" />
            </div>

            <div className="p-4">
              <div className="flex h-36 items-end gap-2">
                {monthlyTrend.map((item) => {
                  const heightPercentage =
                    item.value === 0
                      ? 4
                      : Math.max(
                          (item.value / maximumTrendValue) * 100,
                          12
                        );

                  return (
                    <div
                      key={item.key}
                      className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                    >
                      <span className="mb-1 text-[10px] font-semibold text-slate-300">
                        {item.value}
                      </span>

                      <div className="flex h-[100px] w-full items-end justify-center">
                        <div
                          className="w-full max-w-8 rounded-t-md bg-gradient-to-t from-cyan-700 to-cyan-400 transition-all"
                          style={{
                            height: `${heightPercentage}%`,
                          }}
                        />
                      </div>

                      <span className="mt-2 text-[10px] capitalize text-slate-500">
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-700/90 bg-slate-800/70">
            <div className="flex items-center justify-between border-b border-slate-700/80 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Operasyon Özeti
                </h2>

                <p className="mt-0.5 text-[11px] text-slate-500">
                  Aksiyon gerektiren kayıtlar
                </p>
              </div>

              <Clock3 className="h-4 w-4 text-cyan-300" />
            </div>

            <div className="space-y-2 p-3">
              {operationalItems.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.label}
                    to={item.to}
                    className="group flex items-center gap-3 rounded-lg border border-slate-700/80 bg-slate-900/35 p-3 transition hover:border-slate-600 hover:bg-slate-700/25"
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${item.iconContainerClassName}`}
                    >
                      <Icon
                        className={`h-4 w-4 ${item.iconClassName}`}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-200">
                        {item.label}
                      </p>

                      <p className="mt-0.5 truncate text-[10px] text-slate-500">
                        {item.description}
                      </p>
                    </div>

                    <span
                      className={`text-lg font-bold ${item.valueClassName}`}
                    >
                      {item.value}
                    </span>

                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-700/90 bg-slate-800/70">
            <div className="flex items-center justify-between border-b border-slate-700/80 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Kritik Uyarılar
                </h2>

                <p className="mt-0.5 text-[11px] text-slate-500">
                  Öncelikli kontrol alanı
                </p>
              </div>

              <AlertTriangle className="h-4 w-4 text-red-300" />
            </div>

            <div className="p-3">
              {nearestCriticalItem ? (
                <Link
                  to="/stock"
                  className="block rounded-lg border border-red-500/20 bg-red-500/[0.07] p-3 transition hover:bg-red-500/10"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10">
                      <AlertTriangle className="h-4 w-4 text-red-300" />
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-red-200">
                        {(() => {
                          const days = getRemainingDays(
                            nearestCriticalItem.son_kullanma_tarihi
                          );

                          if (days === null) {
                            return 'SKT bilgisi eksik';
                          }

                          if (days < 0) {
                            return `${Math.abs(days)} gün önce süresi doldu`;
                          }

                          if (days === 0) {
                            return 'Son kullanım tarihi bugün';
                          }

                          return `${days} gün kaldı`;
                        })()}
                      </p>

                      <p className="mt-1 truncate text-xs text-slate-300">
                        {nearestCriticalItem.urun_adi ||
                          'Ürün bilgisi yok'}
                      </p>

                      <p className="mt-1 text-[11px] text-slate-500">
                        LOT:{' '}
                        {nearestCriticalItem.lot_no || '-'}
                      </p>

                      <p className="mt-0.5 text-[11px] text-slate-500">
                        SKT:{' '}
                        {formatDate(
                          nearestCriticalItem.son_kullanma_tarihi
                        )}
                      </p>
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
                      <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-emerald-200">
                        Kritik uyarı yok
                      </p>

                      <p className="mt-1 text-[11px] leading-4 text-slate-400">
                        Süresi geçmiş veya 30 gün içinde dolacak
                        stok bulunmuyor.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Link
                to="/stock"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-600 px-3 py-2.5 text-xs font-semibold text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-300"
              >
                Tüm Stok Uyarılarını Gör
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
