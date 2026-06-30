import { useEffect, useMemo, useState } from 'react';
import { Archive, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type MovementType = 'giris' | 'kullanildi' | 'iptal';
type ActiveTab = 'giris' | 'kullanildi';

type Movement = {
  id: string;
  islem: MovementType;
  urun_adi: string;
  lot_no: string;
  kapak_boyutu: number | null;
  son_kullanma_tarihi: string | null;
  created_at: string;
  vaka_id: string | null;
};

export default function StockMovements() {
  const navigate = useNavigate();

  const [items, setItems] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('giris');

  useEffect(() => {
    loadMovements();
  }, []);

  async function loadMovements() {
    setLoading(true);

    const { data, error } = await supabase
      .from('stok_hareketleri')
      .select(
        'id, islem, urun_adi, lot_no, kapak_boyutu, son_kullanma_tarihi, created_at, vaka_id'
      )
      .or('arsivlendi.eq.false,arsivlendi.is.null')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      setMessage(error.message);
    }

    if (!error && data) {
      setItems(data);
    }

    setLoading(false);
  }

  const girisItems = useMemo(
    () => items.filter(item => item.islem === 'giris'),
    [items]
  );

  const kullanildiItems = useMemo(
    () => items.filter(item => item.islem === 'kullanildi'),
    [items]
  );

  const filteredItems = activeTab === 'giris' ? girisItems : kullanildiItems;

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

  function openRelatedCase(item: Movement) {
    if (!item.vaka_id) {
      setMessage('Bu hareket bir vaka ile ilişkili değil.');
      return;
    }

    navigate(`/view/${item.vaka_id}`);
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

  function tabClass(tab: ActiveTab) {
    return activeTab === tab
      ? 'bg-cyan-600 text-white border-cyan-400'
      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700';
  }

  return (
    <div className="space-y-6 pb-24 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Stok Hareketleri</h1>

        <p className="text-slate-400">
          Kapak girişleri ve kullanım hareketleri
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => {
            setActiveTab('giris');
            setMessage('');
          }}
          className={`rounded-xl p-4 border text-left transition ${tabClass('giris')}`}
        >
          <div className="text-sm opacity-80">Giriş Hareketleri</div>
          <div className="text-3xl font-bold">{girisItems.length}</div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('kullanildi');
            setMessage('');
          }}
          className={`rounded-xl p-4 border text-left transition ${tabClass('kullanildi')}`}
        >
          <div className="text-sm opacity-80">Kullanım Hareketleri</div>
          <div className="text-3xl font-bold">{kullanildiItems.length}</div>
        </button>
      </div>

      {message && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-slate-300">
          {message}
        </div>
      )}

      {loading ? (
        <div className="text-slate-400">Yükleniyor...</div>
      ) : (
        <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
          <div className="w-full max-w-full overflow-x-auto overflow-y-visible">
            <table className="min-w-[900px] w-full">
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
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-slate-400 text-center">
                      {activeTab === 'giris'
                        ? 'Henüz giriş hareketi yok.'
                        : 'Henüz kullanım hareketi yok.'}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map(item => (
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

                      <td className="p-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openRelatedCase(item)}
                          className={`inline-flex items-center gap-1.5 font-semibold ${
                            item.vaka_id
                              ? 'text-cyan-300 hover:text-cyan-200 hover:underline'
                              : 'text-slate-400 hover:text-slate-300'
                          }`}
                          title={
                            item.vaka_id
                              ? 'İlgili vakayı aç'
                              : 'Bu hareket vaka ile ilişkili değil'
                          }
                        >
                          {item.lot_no}
                          {item.vaka_id && <ExternalLink className="w-3.5 h-3.5" />}
                        </button>
                      </td>

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
