import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type CompetitorCase = {
  id: string;
  merkez: string;
  marka: string;
  model: string | null;
  kapak_boyutu: number | null;
  vaka_tarihi: string;
};

type BrandStat = {
  marka: string;
  adet: number;
  oran: number;
};

const MARKALAR = [
  'Medtronic',
  'Edwards',
  'Meril',
  'Allegra',
  'Abbott',
  'Hydra',
  'MicroPort',
  'Diğer',
];

export default function MarketShare() {
  const [items, setItems] = useState<CompetitorCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all');

  useEffect(() => {
    loadCases();
  }, []);

  async function loadCases() {
    setLoading(true);

    const { data, error } = await supabase
      .from('rakip_vakalar')
      .select('id, merkez, marka, model, kapak_boyutu, vaka_tarihi')
      .order('vaka_tarihi', { ascending: false })
      .limit(1000);

    if (!error && data) {
      setItems(data);
    }

    setLoading(false);
  }

  const filteredItems = useMemo(() => {
    if (period === 'all') return items;

    const now = new Date();
    const from = new Date();

    if (period === '30') from.setDate(now.getDate() - 30);
    if (period === '90') from.setDate(now.getDate() - 90);
    if (period === '180') from.setDate(now.getDate() - 180);
    if (period === '365') from.setDate(now.getDate() - 365);

    return items.filter(item => new Date(item.vaka_tarihi) >= from);
  }, [items, period]);

  const stats = useMemo(() => {
    const total = filteredItems.length;

    const brandStats: BrandStat[] = MARKALAR.map(marka => {
      const adet = filteredItems.filter(item => item.marka === marka).length;
      const oran = total > 0 ? Math.round((adet / total) * 100) : 0;

      return { marka, adet, oran };
    }).filter(item => item.adet > 0);

    brandStats.sort((a, b) => b.adet - a.adet);

    const medtronic = brandStats.find(item => item.marka === 'Medtronic');
    const leader = brandStats[0] || null;

    return {
      total,
      brandStats,
      medtronicShare: medtronic?.oran || 0,
      leader,
    };
  }, [filteredItems]);

  const modelStats = useMemo(() => {
    const total = filteredItems.length;
    const map = new Map<string, number>();

    filteredItems.forEach(item => {
      const key = item.model || 'Model Yok';
      map.set(key, (map.get(key) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([model, adet]) => ({
        model,
        adet,
        oran: total > 0 ? Math.round((adet / total) * 100) : 0,
      }))
      .sort((a, b) => b.adet - a.adet);
  }, [filteredItems]);

  function periodText() {
    if (period === '30') return 'Son 30 Gün';
    if (period === '90') return 'Son 90 Gün';
    if (period === '180') return 'Son 6 Ay';
    if (period === '365') return 'Son 1 Yıl';
    return 'Tüm Zamanlar';
  }

  return (
    <div className="space-y-6 pb-24 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Pazar Payı</h1>
        <p className="text-slate-400">
          Rakip vaka kayıtlarına göre marka ve model dağılımı
        </p>
      </div>

      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <label className="block text-sm text-slate-300 mb-2">Dönem</label>

        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="w-full md:w-64 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
        >
          <option value="all">Tüm Zamanlar</option>
          <option value="30">Son 30 Gün</option>
          <option value="90">Son 90 Gün</option>
          <option value="180">Son 6 Ay</option>
          <option value="365">Son 1 Yıl</option>
        </select>
      </div>

      {loading ? (
        <div className="text-slate-400">Yükleniyor...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="text-sm text-slate-400">Dönem</div>
              <div className="text-xl font-bold">{periodText()}</div>
            </div>

            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="text-sm text-slate-400">Toplam Vaka</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </div>

            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="text-sm text-slate-400">Medtronic Payı</div>
              <div className="text-2xl font-bold">%{stats.medtronicShare}</div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Marka Bazlı Pazar Payı
              </h2>
              <p className="text-sm text-slate-400">
                En yüksek kullanım en üstte gösterilir.
              </p>
            </div>

            {stats.brandStats.length === 0 ? (
              <div className="text-slate-400">Bu dönem için kayıt yok.</div>
            ) : (
              <div className="space-y-3">
                {stats.brandStats.map(item => (
                  <div key={item.marka}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{item.marka}</span>
                      <span className="text-sm text-slate-300">
                        {item.adet} vaka / %{item.oran}
                      </span>
                    </div>

                    <div className="h-3 rounded-full bg-slate-900 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-cyan-500"
                        style={{ width: `${item.oran}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">
                Model Dağılımı
              </h2>
            </div>

            <div className="w-full max-w-full overflow-x-auto overflow-y-visible">
              <table className="min-w-[620px] w-full">
                <thead className="bg-slate-700">
                  <tr>
                    <th className="text-left p-3 whitespace-nowrap">MODEL</th>
                    <th className="text-left p-3 whitespace-nowrap">ADET</th>
                    <th className="text-left p-3 whitespace-nowrap">ORAN</th>
                  </tr>
                </thead>

                <tbody>
                  {modelStats.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-4 text-slate-400 text-center">
                        Bu dönem için model kaydı yok.
                      </td>
                    </tr>
                  ) : (
                    modelStats.map(item => (
                      <tr key={item.model} className="border-t border-slate-700">
                        <td className="p-3 whitespace-nowrap">{item.model}</td>
                        <td className="p-3 whitespace-nowrap">{item.adet}</td>
                        <td className="p-3 whitespace-nowrap">%{item.oran}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
