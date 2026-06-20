import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, Building2, Layers, Package, Plus, User } from 'lucide-react';
import { Kapak, supabase, timeout } from '../lib/supabase';

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

  const [recent, setRecent] = useState<Kapak[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function kalanGun(date: string) {
    const today = new Date();
    const expiry = new Date(date);
    const diff = expiry.getTime() - today.getTime();

    return Math.ceil(diff / (1000 * 60 * 60 * 24));
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

      const [totalRes, monthRes, recentRes, stockRes] = await Promise.all([
        timeout(
          supabase.from('kapaklar').select('*', { count: 'exact', head: true }),
          10000
        ),
        timeout(
          supabase
            .from('kapaklar')
            .select('merkez_hastane,doktor')
            .gte('vaka_tarihi', firstDay),
          10000
        ),
        timeout(
          supabase
            .from('kapaklar')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10),
          10000
        ),
        timeout(
          supabase
            .from('kapak_stok')
            .select('id, son_kullanma_tarihi')
            .eq('durum', 'stokta'),
          10000
        ),
      ]);

      if (totalRes.error) throw totalRes.error;
      if (monthRes.error) throw monthRes.error;
      if (recentRes.error) throw recentRes.error;
      if (stockRes.error) throw stockRes.error;

      const monthData = monthRes.data || [];
      const stockData = (stockRes.data as StockItem[]) || [];

      setStats({
        total: totalRes.count || 0,
        month: monthData.length,
        centers: new Set(monthData.map(x => x.merkez_hastane)).size,
        doctors: new Set(monthData.map(x => x.doktor)).size,
        stockTotal: stockData.length,
        criticalStock: stockData.filter(item => kalanGun(item.son_kullanma_tarihi) <= 30).length,
      });

      setRecent((recentRes.data as Kapak[]) || []);
    } catch (e: any) {
      setError(e.message || 'Dashboard yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <p className="text-slate-300">Yükleniyor...</p>;
  }

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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Ana Sayfa</h1>
          <p className="text-slate-400">TAVI Kapak Takip Sistemi</p>
        </div>

        <Link
          to="/add"
          className="bg-cyan-600 px-4 py-3 rounded-xl font-semibold flex gap-2"
        >
          <Plus /> Yeni Vaka
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {cards.map(([label, value, Icon, color]) => (
          <div
            key={label}
            className="bg-slate-800 border border-slate-700 rounded-2xl p-5"
          >
            <Icon className={`${color} mb-3`} />
            <p className="text-3xl font-bold">{value}</p>
            <p className="text-slate-400 text-sm">{label}</p>
          </div>
        ))}
      </div>

      {stats.criticalStock > 0 && (
        <Link
          to="/stock"
          className="block bg-red-500/10 border border-red-500/30 text-red-200 rounded-2xl p-4"
        >
          <b>Dikkat:</b> Son kullanma tarihi 30 gün içinde dolacak{' '}
          <b>{stats.criticalStock}</b> kapak var. Stok Takip ekranından kontrol et.
        </Link>
      )}

      <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-700 flex justify-between">
          <b>Son 10 Vaka</b>
          <Link className="text-cyan-300" to="/list">
            Tümü
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="p-6 text-slate-400">Henüz vaka kaydı yok.</p>
        ) : (
          recent.map(k => (
            <Link
              to={`/view/${k.id}`}
              key={k.id}
              className="block p-4 border-b border-slate-700 hover:bg-slate-700/40"
            >
              <b>{k.hasta_adi}</b>
              <p className="text-sm text-slate-400">
                {k.merkez_hastane} | {k.doktor} | {k.kapak_tipi}{' '}
                {k.kapak_size}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
