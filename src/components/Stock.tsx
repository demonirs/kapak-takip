import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type StockItem = {
  id: string;
  urun_adi: string;
  kapak_boyutu: number;
  lot_no: string;
  son_kullanma_tarihi: string;
};

type ParsedBarcode = {
  gtin: string;
  urun_adi: string;
  kapak_boyutu: number;
  lot_no: string;
  son_kullanma_tarihi: string;
  barkod_raw: string;
};

const GTIN_MAP: Record<string, number> = {
  '00763000655419': 23,
  '00763000655426': 26,
  '00763000655433': 29,
  '00763000655440': 34,
};

const FILTERS = ['Tümü', '23', '26', '29', '34'] as const;

export default function Stock() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [barcode, setBarcode] = useState('');
  const [parsed, setParsed] = useState<ParsedBarcode | null>(null);
  const [message, setMessage] = useState('');
  const [activeFilter, setActiveFilter] = useState<(typeof FILTERS)[number]>('Tümü');

  useEffect(() => {
    loadStock();
  }, []);

  async function loadStock() {
    setLoading(true);

    const { data, error } = await supabase
      .from('kapak_stok')
      .select('id, urun_adi, kapak_boyutu, lot_no, son_kullanma_tarihi')
      .eq('durum', 'stokta')
      .order('kapak_boyutu')
      .order('son_kullanma_tarihi');

    if (!error && data) {
      setItems(data);
    }

    setLoading(false);
  }

  const counts = useMemo(() => {
    return {
      toplam: items.length,
      23: items.filter(i => i.kapak_boyutu === 23).length,
      26: items.filter(i => i.kapak_boyutu === 26).length,
      29: items.filter(i => i.kapak_boyutu === 29).length,
      34: items.filter(i => i.kapak_boyutu === 34).length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    if (activeFilter === 'Tümü') return items;
    return items.filter(item => item.kapak_boyutu === Number(activeFilter));
  }, [items, activeFilter]);

  function parseBarcode() {
    setMessage('');
    setParsed(null);

    const raw = barcode.trim();

    if (!raw) {
      setMessage('Barkod alanı boş.');
      return;
    }

    const gtinMatch = raw.match(/\(01\)(\d{14})/);
    const sktMatch = raw.match(/\(17\)(\d{6})/);
    const lotMatch = raw.match(/\(21\)([A-Za-z0-9]+)/);

    if (!gtinMatch) {
      setMessage('(01) GTIN / UBB bulunamadı.');
      return;
    }

    if (!sktMatch) {
      setMessage('(17) son kullanma tarihi bulunamadı.');
      return;
    }

    if (!lotMatch) {
      setMessage('(21) lot no bulunamadı.');
      return;
    }

    const gtin = gtinMatch[1];
    const kapakBoyutu = GTIN_MAP[gtin];

    if (!kapakBoyutu) {
      setMessage(`Tanımsız GTIN: ${gtin}`);
      return;
    }

    const yy = sktMatch[1].slice(0, 2);
    const mm = sktMatch[1].slice(2, 4);
    const dd = sktMatch[1].slice(4, 6);

    setParsed({
      gtin,
      urun_adi: `EVPROPLUS-${kapakBoyutu}`,
      kapak_boyutu: kapakBoyutu,
      lot_no: lotMatch[1],
      son_kullanma_tarihi: `20${yy}-${mm}-${dd}`,
      barkod_raw: raw,
    });

    setMessage('Barkod çözümlendi.');
  }

  async function addToStock() {
    if (!parsed) {
      setMessage('Önce barkodu çözümle.');
      return;
    }

    const { error } = await supabase.from('kapak_stok').insert({
      urun_adi: parsed.urun_adi,
      gtin: parsed.gtin,
      kapak_adi: 'EVPROPLUS',
      kapak_boyutu: parsed.kapak_boyutu,
      lot_no: parsed.lot_no,
      son_kullanma_tarihi: parsed.son_kullanma_tarihi,
      barkod_raw: parsed.barkod_raw,
      durum: 'stokta',
    });

    if (error) {
      setMessage(`Stoka eklenemedi: ${error.message}`);
      return;
    }

    setBarcode('');
    setParsed(null);
    setMessage('Kapak stoka eklendi.');
    await loadStock();
  }

  function kalanGun(date: string) {
    const today = new Date();
    const expiry = new Date(date);
    const diff = expiry.getTime() - today.getTime();

    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('tr-TR');
  }

  function rowClass(days: number) {
    if (days <= 30) return 'bg-red-500/15 text-red-100';
    if (days <= 90) return 'bg-orange-500/15 text-orange-100';
    return '';
  }

  function badgeClass(days: number) {
    if (days <= 30) return 'bg-red-500/20 text-red-200 border-red-500/30';
    if (days <= 90) return 'bg-orange-500/20 text-orange-200 border-orange-500/30';
    return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30';
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Stok Takip</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400">Toplam Stok</div>
          <div className="text-2xl font-bold">{counts.toplam}</div>
        </div>

        {[23, 26, 29, 34].map(size => (
          <div key={size} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="text-sm text-slate-400">{size} mm</div>
            <div className="text-2xl font-bold">{counts[size as 23 | 26 | 29 | 34]}</div>
          </div>
        ))}
      </div>

      <div className="bg-slate-800 rounded-xl p-4 space-y-4">
        <div>
          <label className="block text-sm text-slate-300 mb-2">
            Barkod Yapıştır / Okut
          </label>

          <input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') parseBarcode();
            }}
            placeholder="(01)00763000655419(17)260625(21)J276941(20)01"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={parseBarcode}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium"
          >
            Çözümle
          </button>

          <button
            onClick={addToStock}
            disabled={!parsed}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Stoka Ekle
          </button>
        </div>

        {message && <div className="text-sm text-slate-300">{message}</div>}

        {parsed && (
          <div className="grid md:grid-cols-4 gap-3 bg-slate-900 rounded-lg p-3 border border-slate-700">
            <div>
              <div className="text-xs text-slate-400">ÜRÜN ADI</div>
              <div className="font-semibold">{parsed.urun_adi}</div>
            </div>

            <div>
              <div className="text-xs text-slate-400">LOT</div>
              <div className="font-semibold">{parsed.lot_no}</div>
            </div>

            <div>
              <div className="text-xs text-slate-400">SKT</div>
              <div className="font-semibold">{formatDate(parsed.son_kullanma_tarihi)}</div>
            </div>

            <div>
              <div className="text-xs text-slate-400">KAPAK BOYUTU</div>
              <div className="font-semibold">{parsed.kapak_boyutu} mm</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(filter => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeFilter === filter
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {filter === 'Tümü' ? 'Tümü' : `${filter} mm`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-slate-400">Yükleniyor...</div>
      ) : (
        <div className="bg-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                <th className="text-left p-3">ÜRÜN ADI</th>
                <th className="text-left p-3">LOT</th>
                <th className="text-left p-3">SKT</th>
                <th className="text-left p-3">KALAN GÜN</th>
              </tr>
            </thead>

            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-slate-400 text-center">
                    Bu filtrede stok yok.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const days = kalanGun(item.son_kullanma_tarihi);

                  return (
                    <tr
                      key={item.id}
                      className={`border-t border-slate-700 ${rowClass(days)}`}
                    >
                      <td className="p-3">{item.urun_adi}</td>
                      <td className="p-3">{item.lot_no}</td>
                      <td className="p-3">{formatDate(item.son_kullanma_tarihi)}</td>
                      <td className="p-3">
                        <span className={`px-3 py-1 rounded-full border text-sm ${badgeClass(days)}`}>
                          {days}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
