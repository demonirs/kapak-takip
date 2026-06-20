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

type CenterStat = {
  merkez: string;
  toplam: number;
  medtronic: number;
  edwards: number;
  meril: number;
  allegra: number;
  abbott: number;
  hydra: number;
  microport: number;
  diger: number;
  medtronicOran: number;
};

export default function CenterAnalysis() {
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

    if (!error && data) setItems(data);

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

  const centerStats = useMemo<CenterStat[]>(() => {
    const map = new Map<string, CompetitorCase[]>();

    filteredItems.forEach(item => {
      const key = item.merkez || 'Merkez Yok';
      const current = map.get(key) || [];
      current.push(item);
      map.set(key, current);
    });

    return Array.from(map.entries())
      .map(([merkez, cases]) => {
        const toplam = cases.length;
        const medtronic = cases.filter(i => i.marka === 'Medtronic').length;
        const edwards = cases.filter(i => i.marka === 'Edwards').length;
        const meril = cases.filter(i => i.marka === 'Meril').length;
        const allegra = cases.filter(i => i.marka === 'Allegra').length;
        const abbott = cases.filter(i => i.marka === 'Abbott').length;
        const hydra = cases.filter(i => i.marka === 'Hydra').length;
        const microport = cases.filter(i => i.marka === 'MicroPort').length;
        const diger = cases.filter(i => i.marka === 'Diğer').length;

        return {
          merkez,
          toplam,
          medtronic,
          edwards,
          meril,
          allegra,
          abbott,
          hydra,
          microport,
          diger,
          medtronicOran: toplam > 0 ? Math.round((medtronic / toplam) * 100) : 0,
        };
      })
      .sort((a, b) => b.toplam - a.toplam);
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
        <h1 className="text-2xl font-bold text-white">Merkez Analizi</h1>
        <p className="text-slate-400">
          Merkez bazında marka dağılımı ve Medtronic pazar payı
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
              <div className="text-sm text-slate-400">Toplam Merkez</div>
              <div className="text-2xl font-bold">{centerStats.length}</div>
            </div>

            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="text-sm text-slate-400">Toplam Vaka</div>
              <div className="text-2xl font-bold">{filteredItems.length}</div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">
                Merkez Bazlı Dağılım
              </h2>
            </div>

            <div className="w-full max-w-full overflow-x-auto overflow-y-visible">
              <table className="min-w-[1150px] w-full">
                <thead className="bg-slate-700">
                  <tr>
                    <th className="text-left p-3 whitespace-nowrap">MERKEZ</th>
                    <th className="text-left p-3 whitespace-nowrap">TOPLAM</th>
                    <th className="text-left p-3 whitespace-nowrap">MEDTRONIC</th>
                    <th className="text-left p-3 whitespace-nowrap">EDWARDS</th>
                    <th className="text-left p-3 whitespace-nowrap">MERIL</th>
                    <th className="text-left p-3 whitespace-nowrap">ALLEGRA</th>
                    <th className="text-left p-3 whitespace-nowrap">ABBOTT</th>
                    <th className="text-left p-3 whitespace-nowrap">HYDRA</th>
                    <th className="text-left p-3 whitespace-nowrap">MICROPORT</th>
                    <th className="text-left p-3 whitespace-nowrap">DİĞER</th>
                    <th className="text-left p-3 whitespace-nowrap">MDT PAYI</th>
                  </tr>
                </thead>

                <tbody>
                  {centerStats.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-4 text-slate-400 text-center">
                        Bu dönem için merkez kaydı yok.
                      </td>
                    </tr>
                  ) : (
                    centerStats.map(item => (
                      <tr key={item.merkez} className="border-t border-slate-700">
                        <td className="p-3 whitespace-nowrap font-medium">
                          {item.merkez}
                        </td>
                        <td className="p-3 whitespace-nowrap">{item.toplam}</td>
                        <td className="p-3 whitespace-nowrap">{item.medtronic}</td>
                        <td className="p-3 whitespace-nowrap">{item.edwards}</td>
                        <td className="p-3 whitespace-nowrap">{item.meril}</td>
                        <td className="p-3 whitespace-nowrap">{item.allegra}</td>
                        <td className="p-3 whitespace-nowrap">{item.abbott}</td>
                        <td className="p-3 whitespace-nowrap">{item.hydra}</td>
                        <td className="p-3 whitespace-nowrap">{item.microport}</td>
                        <td className="p-3 whitespace-nowrap">{item.diger}</td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="px-3 py-1 rounded-full border text-sm bg-cyan-500/20 text-cyan-200 border-cyan-500/30">
                            %{item.medtronicOran}
                          </span>
                        </td>
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
