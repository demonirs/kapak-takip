import { useEffect, useState } from 'react';
import { Archive } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Movement = {
  id: string;
  islem: 'giris' | 'kullanildi' | 'iptal';
  urun_adi: string;
  lot_no: string;
  kapak_boyutu: number | null;
  son_kullanma_tarihi: string | null;
  created_at: string;
};

export default function StockMovements() {
  const [items, setItems] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMovements();
  }, []);

  async function loadMovements() {
    setLoading(true);

    const { data, error } = await supabase
      .from('stok_hareketleri')
      .select('*')
      .or('arsivlendi.eq.false,arsivlendi.is.null')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      setItems(data);
    }

    setLoading(false);
  }

  async function archiveMovement(id: string) {
    const ok = window.confirm('Bu hareket kaydı arşivlensin mi?');

    if (!ok) return;

    const { error } = await supabase
      .from('stok_hareketleri')
      .update({ arsivlendi: true })
      .eq('id', id);

    if (error) {
      alert(error.message);
      return;
    }

    loadMovements();
  }

  function formatDate(date: string | null) {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('tr-TR');
  }

  function formatDateTime(date: string) {
    return new Date(date).toLocaleString('tr-TR');
  }

  function islemText(islem: Movement['islem']) {
    if (islem === 'giris') return 'Giriş';
    if (islem === 'kullanildi') return 'Kullanıldı';
    return 'İptal';
  }

  function islemClass(islem: Movement['islem']) {
    if (islem === 'giris')
      return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30';

    if (islem === 'kullanildi')
      return 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30';

    return 'bg-red-500/20 text-red-200 border-red-500/30';
  }

  return (
    <div className="space-y-6 pb-24 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Stok Hareketleri
        </h1>

        <p className="text-slate-400">
          Kapak girişleri ve kullanım geçmişi
        </p>
      </div>

      {loading ? (
        <div className="text-slate-400">
          Yükleniyor...
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
          <div className="w-full max-w-full overflow-x-auto overflow-y-visible">
            <table className="min-w-[860px] w-full">
              <thead className="bg-slate-700">
                <tr>
                  <th className="text-left p-3 whitespace-nowrap">TARİH</th>
                  <th className="text-left p-3 whitespace-nowrap">İŞLEM</th>
                  <th className="text-left p-3 whitespace-nowrap">ÜRÜN</th>
                  <th className="text-left p-3 whitespace-nowrap">LOT</th>
                  <th className="text-left p-3 whitespace-nowrap">SKT</th>
                  <th className="text-left p-3 whitespace-nowrap">ARŞİV</th>
                </tr>
              </thead>

              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-slate-400 text-center">
                      Henüz hareket yok.
                    </td>
                  </tr>
                ) : (
                  items.map(item => (
                    <tr key={item.id} className="border-t border-slate-700">
                      <td className="p-3 whitespace-nowrap">
                        {formatDateTime(item.created_at)}
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`px-3 py-1 rounded-full border text-sm ${islemClass(
                            item.islem
                          )}`}
                        >
                          {islemText(item.islem)}
                        </span>
                      </td>

                      <td className="p-3 whitespace-nowrap">{item.urun_adi}</td>

                      <td className="p-3 whitespace-nowrap">{item.lot_no}</td>

                      <td className="p-3 whitespace-nowrap">
                        {formatDate(item.son_kullanma_tarihi)}
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        <button
                          onClick={() => archiveMovement(item.id)}
                          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-orange-300 hover:bg-orange-500/10"
                          title="Arşivle"
                        >
                          <Archive className="w-4 h-4" />
                          Arşivle
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
