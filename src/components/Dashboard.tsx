import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  Building2,
  CalendarDays,
  FileSpreadsheet,
  Layers,
  Package,
  Plus,
  Search,
  User,
} from 'lucide-react';
import { supabase, timeout } from '../lib/supabase';

type Stats = {
  total: number;
  month: number;
  centers: number;
  doctors: number;
  stockTotal: number;
  criticalStock: number;
};

type StockItem = {
  id: string;
  urun_adi: string;
  lot_no: string;
  son_kullanma_tarihi: string;
};

type RecentCase = {
  id: string;
  vaka_tarihi: string;
  merkez_hastane: string | null;
  doktor: string | null;
  hasta_adi: string | null;
  kapak_tipi: string | null;
  kapak_size: string | number | null;
};

type StatCardProps = {
  label: string;
  value: number;
  description: string;
  icon: typeof Layers;
  iconClassName: string;
  featured?: boolean;
};

function StatCard({
  label,
  value,
  description,
  icon: Icon,
  iconClassName,
  featured = false,
}: StatCardProps) {
  return (
    <div
      className={`rounded-xl border p-4 transition ${
        featured
          ? 'border-cyan-500/25 bg-cyan-500/[0.07]'
          : 'border-slate-700 bg-slate-800/90'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {label}
          </p>

          <p className="mt-2 text-2xl font-bold text-white">
            {value}
          </p>
        </div>

        <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
          <Icon className={`h-4 w-4 ${iconClassName}`} />
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {description}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    total: 0,
    month: 0,
    centers: 0,
    doctors: 0,
    stockTotal: 0,
    criticalStock: 0,
  });

  const [criticalItems, setCriticalItems] = useState<StockItem[]>([]);
  const [recentCases, setRecentCases] = useState<RecentCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function kalanGun(date: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(date);
    expiry.setHours(0, 0, 0, 0);

    const diff = expiry.getTime() - today.getTime();

    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function formatDate(date?: string | null) {
    if (!date) return '-';

    return new Date(date).toLocaleDateString('tr-TR');
  }

  function getValveLabel(item: RecentCase) {
    const parts = [
      item.kapak_tipi,
      item.kapak_size ? `${item.kapak_size}` : null,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' / ') : 'Kapak bilgisi yok';
  }

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const now = new Date();

      const firstDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      )
        .toISOString()
        .slice(0, 10);

      const activeCaseFilter =
        'arsivlendi.eq.false,arsivlendi.is.null';

      const [
        totalRes,
        monthRes,
        stockRes,
        recentCasesRes,
      ] = await Promise.all([
        timeout(
          supabase
            .from('kapaklar')
            .select('*', { count: 'exact', head: true })
            .or(activeCaseFilter),
          10000
        ),

        timeout(
          supabase
            .from('kapaklar')
            .select('merkez_hastane,doktor')
            .or(activeCaseFilter)
            .gte('vaka_tarihi', firstDay),
          10000
        ),

        timeout(
          supabase
            .from('kapak_stok')
            .select(
              'id, urun_adi, lot_no, son_kullanma_tarihi'
            )
            .eq('durum', 'stokta'),
          10000
        ),

        timeout(
          supabase
            .from('kapaklar')
            .select(
              'id, vaka_tarihi, merkez_hastane, doktor, hasta_adi, kapak_tipi, kapak_size'
            )
            .or(activeCaseFilter)
            .order('vaka_tarihi', { ascending: false })
            .limit(5),
          10000
        ),
      ]);

      if (totalRes.error) throw totalRes.error;
      if (monthRes.error) throw monthRes.error;
      if (stockRes.error) throw stockRes.error;
      if (recentCasesRes.error) throw recentCasesRes.error;

      const monthData = monthRes.data || [];
      const stockData = (stockRes.data as StockItem[]) || [];
      const recentData =
        (recentCasesRes.data as RecentCase[]) || [];

      const critical = stockData
        .filter((item) => {
          if (!item.son_kullanma_tarihi) return false;

          return kalanGun(item.son_kullanma_tarihi) <= 30;
        })
        .sort(
          (a, b) =>
            kalanGun(a.son_kullanma_tarihi) -
            kalanGun(b.son_kullanma_tarihi)
        );

      const uniqueCenters = new Set(
        monthData
          .map((item) => item.merkez_hastane)
          .filter(Boolean)
      );

      const uniqueDoctors = new Set(
        monthData
          .map((item) => item.doktor)
          .filter(Boolean)
      );

      setStats({
        total: totalRes.count || 0,
        month: monthData.length,
        centers: uniqueCenters.size,
        doctors: uniqueDoctors.size,
        stockTotal: stockData.length,
        criticalStock: critical.length,
      });

      setCriticalItems(critical);
      setRecentCases(recentData);
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : 'Dashboard yüklenemedi';

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-5">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
          Ana sayfa yükleniyor...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
        <p className="text-sm font-medium">
          Ana sayfa yüklenemedi.
        </p>

        <p className="mt-1 text-xs text-red-300">
          {error}
        </p>

        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold transition hover:bg-red-500/20"
        >
          Tekrar Dene
        </button>
      </div>
    );
  }

  const nearestCritical = criticalItems[0];

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-400">
            ValveFlow
          </p>

          <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">
            Ana Sayfa
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            TAVI vaka ve kapak yönetim özeti
          </p>
        </div>

        <Link
          to="/add"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500 sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Yeni Vaka
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Toplam Vaka"
          value={stats.total}
          description="Aktif vaka kaydı"
          icon={Layers}
          iconClassName="text-cyan-300"
          featured
        />

        <StatCard
          label="Bu Ay Kapak"
          value={stats.month}
          description="Aylık vaka adedi"
          icon={Activity}
          iconClassName="text-cyan-300"
          featured
        />

        <StatCard
          label="Toplam Stok"
          value={stats.stockTotal}
          description="Stokta bulunan kapak"
          icon={Package}
          iconClassName="text-emerald-300"
          featured
        />

        <StatCard
          label="Bu Ay Merkez"
          value={stats.centers}
          description="Çalışılan merkez"
          icon={Building2}
          iconClassName="text-sky-300"
        />

        <StatCard
          label="Bu Ay Doktor"
          value={stats.doctors}
          description="Çalışılan doktor"
          icon={User}
          iconClassName="text-violet-300"
        />

        <StatCard
          label="Kritik SKT"
          value={stats.criticalStock}
          description="30 gün içinde dolacak"
          icon={AlertTriangle}
          iconClassName={
            stats.criticalStock > 0
              ? 'text-red-300'
              : 'text-emerald-300'
          }
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
        <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/90">
          <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Son Vakalar
              </h2>

              <p className="mt-0.5 text-xs text-slate-500">
                Son eklenen aktif vaka kayıtları
              </p>
            </div>

            <Link
              to="/list"
              className="inline-flex items-center gap-1 text-xs font-medium text-cyan-300 transition hover:text-cyan-200"
            >
              Tümünü Gör
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {recentCases.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <CalendarDays className="mx-auto h-6 w-6 text-slate-600" />

              <p className="mt-2 text-sm text-slate-400">
                Henüz aktif vaka bulunmuyor.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/80">
              {recentCases.map((item) => (
                <Link
                  key={item.id}
                  to={`/view/${item.id}`}
                  className="block px-4 py-3 transition hover:bg-slate-700/35"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">
                          {item.merkez_hastane || 'Merkez bilgisi yok'}
                        </p>

                        <span className="rounded-md border border-slate-600 bg-slate-900/70 px-1.5 py-0.5 text-[10px] text-slate-400">
                          {getValveLabel(item)}
                        </span>
                      </div>

                      <p className="mt-1 truncate text-xs text-slate-400">
                        {item.doktor || 'Doktor bilgisi yok'}
                      </p>

                      {item.hasta_adi && (
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {item.hasta_adi}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-xs font-medium text-slate-300">
                        {formatDate(item.vaka_tarihi)}
                      </p>

                      <ArrowRight className="ml-auto mt-2 h-3.5 w-3.5 text-slate-600" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/90">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Stok Durumu
                </h2>

                <p className="mt-0.5 text-xs text-slate-500">
                  Son kullanma tarihi takibi
                </p>
              </div>

              <Package className="h-4 w-4 text-emerald-300" />
            </div>

            {nearestCritical ? (
              <Link
                to="/stock"
                className="block p-4 transition hover:bg-slate-700/25"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-2">
                    <AlertTriangle className="h-4 w-4 text-red-300" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-200">
                      Kritik SKT Uyarısı
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-300">
                      <strong className="text-red-200">
                        {kalanGun(
                          nearestCritical.son_kullanma_tarihi
                        )}{' '}
                        gün
                      </strong>{' '}
                      kaldı.
                    </p>

                    <p className="mt-2 truncate text-xs text-slate-400">
                      {nearestCritical.urun_adi}
                    </p>

                    <p className="mt-0.5 text-xs text-slate-500">
                      LOT: {nearestCritical.lot_no || '-'}
                    </p>

                    <p className="mt-0.5 text-xs text-slate-500">
                      SKT:{' '}
                      {formatDate(
                        nearestCritical.son_kullanma_tarihi
                      )}
                    </p>
                  </div>
                </div>
              </Link>
            ) : (
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-2">
                    <Package className="h-4 w-4 text-emerald-300" />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-emerald-200">
                      Kritik SKT Yok
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      30 gün içinde son kullanma tarihi dolacak stok
                      görünmüyor.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {criticalItems.length > 1 && (
              <div className="border-t border-slate-700 px-4 py-3">
                <Link
                  to="/stock"
                  className="inline-flex items-center gap-1 text-xs font-medium text-red-300 hover:text-red-200"
                >
                  Diğer {criticalItems.length - 1} kritik ürünü gör
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/90">
            <div className="border-b border-slate-700 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">
                Hızlı İşlemler
              </h2>

              <p className="mt-0.5 text-xs text-slate-500">
                Sık kullanılan ekranlar
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 p-3">
              <Link
                to="/search"
                className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2.5 text-xs font-medium text-slate-300 transition hover:border-cyan-500/40 hover:text-white"
              >
                <Search className="h-4 w-4 text-cyan-300" />
                Vaka Ara
              </Link>

              <Link
                to="/export"
                className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2.5 text-xs font-medium text-slate-300 transition hover:border-emerald-500/40 hover:text-white"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-300" />
                Excel
              </Link>

              <Link
                to="/stock"
                className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2.5 text-xs font-medium text-slate-300 transition hover:border-violet-500/40 hover:text-white"
              >
                <Package className="h-4 w-4 text-violet-300" />
                Stok
              </Link>

              <Link
                to="/archive"
                className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2.5 text-xs font-medium text-slate-300 transition hover:border-amber-500/40 hover:text-white"
              >
                <Archive className="h-4 w-4 text-amber-300" />
                Arşiv
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
