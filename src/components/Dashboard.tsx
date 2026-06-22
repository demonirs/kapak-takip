import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Building2,
  Layers,
  Package,
  Plus,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function kalanGun(date: string) {
    const today = new Date();
    const expiry = new Date(date);
    const diff = expiry.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('tr-TR');
  }

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const firstDay = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      )
        .toISOString()
        .slice(0, 10);

      const activeCaseFilter = 'arsivlendi.eq.false,arsivlendi.is.null';

      const [totalRes, monthRes, stockRes] = await Promise.all([
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
            .select('id, urun_adi, lot_no, son_kullanma_tarihi')
            .eq('durum', 'stokta'),
          10000
        ),
      ]);

      if (totalRes.error) throw totalRes.error;
      if (monthRes.error) throw monthRes.error;
      if (stockRes.error) throw stockRes.error;

      const monthData = monthRes.data || [];
      const stockData = (stockRes.data as StockItem[]) || [];

      const critical = stockData
        .filter(item => kalanGun(item.son_kullanma_tarihi) <= 30)
        .sort(
          (a, b) =>
            kalanGun(a.son_kullanma_tarihi) -
            kalanGun(b.son_kullanma_tarihi)
        );

      setStats({
        total: totalRes.count || 0,
        month: monthData.length,
        centers: new Set(monthData.map(x => x.merkez_hastane)).size,
        doctors: new Set(monthData.map(x => x.doktor)).size,
        stockTotal: stockData.length,
        criticalStock: critical.length,
      });

      setCriticalItems(critical);
    } catch (e: any) {
      setError(e.message || 'Dashboard yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <p className="text-slate-300">Yükleniyor...</p>;

  if (error) {
    return (
      <div className="bg-red-500/10 text-red-300 p-4 rounded-xl">
        {error}
        <button onClick={load} className="ml-4 underline">
          Tekrar dene
        </button>
      </div>
    );
  }

  const cards = [
    ['Toplam Vaka', stats.total, Layers, 'text-cyan-300'],
    ['Bu Ay Kapak', stats.month, Activity, 'text-cyan-300'],
    ['Bu Ay Merkez', stats.centers, Building2, 'text-cyan-300'],
    ['Bu Ay Doktor', stats.doctors, User, 'text-cyan-300'],
    ['Toplam Stok', stats.stockTotal, Package, 'text-emerald-300'],
    ['Kritik SKT', stats.criticalStock, AlertTriangle, 'text-red-300'],
  ] as const;

  const nearestCritical = criticalItems[0];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ana Sayfa</h1>
          <p className="text-slate-400 text-sm">TAVI Kapak Takip Sistemi</p>
        </div>

        <Link
          to="/add"
          className="bg-cyan-600 px-4 py-3 rounded-xl font-semibold flex gap-2 text-sm"
        >
          <Plus className="w-5 h-5" /> Yeni Vaka
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {cards.map(([label, value, Icon, color]) => (
          <div
            key={label}
            className="bg-slate-800 border border-slate-700 rounded-2xl p-4 min-h-[118px]"
          >
            <Icon className={`${color} mb-3 w-5 h-5`} />
            <p className="text-3xl font-bold">{value}</p>
            <p className="text-slate-400 text-sm">{label}</p>
          </div>
        ))}
      </div>

      {nearestCritical ? (
        <Link
          to="/stock"
          className="block bg-red-500/10 border border-red-500/30 text-red-100 rounded-2xl p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-300 mt-0.5" />
            <div>
              <p className="font-bold">Kritik SKT</p>
              <p className="text-sm text-red-100">
                <b>{kalanGun(nearestCritical.son_kullanma_tarihi)} gün</b> kaldı —{' '}
                {nearestCritical.urun_adi} / LOT: {nearestCritical.lot_no}
              </p>
              <p className="text-xs text-red-200 mt-1">
                SKT: {formatDate(nearestCritical.son_kullanma_tarihi)}
              </p>
            </div>
          </div>
        </Link>
      ) : (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-100 rounded-2xl p-4">
          <p className="font-bold">Kritik SKT Yok</p>
          <p className="text-sm text-emerald-100">
            30 gün içinde son kullanma tarihi dolacak stok görünmüyor.
          </p>
        </div>
      )}
    </div>
  );
}
