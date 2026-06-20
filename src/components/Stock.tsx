import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type StockItem = {
  id: string;
  urun_adi: string;
  lot_no: string;
  son_kullanma_tarihi: string;
};

export default function Stock() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStock();
  }, []);

  async function loadStock() {
    const { data, error } = await supabase
      .from('kapak_stok')
      .select('*')
      .eq('durum', 'stokta')
      .order('kapak_boyutu');

    if (!error && data) {
      setItems(data);
    }

    setLoading(false);
  }

  function kalanGun(date: string) {
    const today = new Date();
    const expiry = new Date(date);

    const diff = expiry.getTime() - today.getTime();

    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">
        Stok Takip
      </h1>

      {loading ? (
        <div className="text-slate-400">
          Yükleniyor...
        </div>
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
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-slate-700"
                >
                  <td className="p-3">
                    {item.urun_adi}
                  </td>

                  <td className="p-3">
                    {item.lot_no}
                  </td>

                  <td className="p-3">
                    {new Date(
                      item.son_kullanma_tarihi
                    ).toLocaleDateString('tr-TR')}
                  </td>

                  <td className="p-3">
                    {kalanGun(item.son_kullanma_tarihi)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
