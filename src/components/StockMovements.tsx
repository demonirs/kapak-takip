import { useEffect, useMemo, useState } from 'react';
import { Archive, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type MovementType = 'giris' | 'kullanildi' | 'iptal';
type ActiveTab = 'giris' | 'kullanildi';

type StockMovement = {
  id: string;
  islem: MovementType;
  urun_adi: string;
  lot_no: string;
  kapak_boyutu: number | null;
  son_kullanma_tarihi: string | null;
  created_at: string;
  vaka_id: string | null;
};

type UsedStockItem = {
  id: string;
  urun_adi: string | null;
  kapak_adi: string | null;
  lot_no: string;
  kapak_boyutu: number | null;
  son_kullanma_tarihi: string | null;
  created_at: string;
  kullanilan_vaka_id: string | null;
  durum: string;
};

type DisplayItem = {
  id: string;
  islem: MovementType;
  urun_adi: string;
  lot_no: string;
  kapak_boyutu: number | null;
  son_kullanma_tarihi: string | null;
  created_at: string;
  vaka_id: string | null;
  source: 'stok_hareketleri' | 'kapak_stok';
};

export default function StockMovements() {
  const navigate = useNavigate();

  const [girisItems, setGirisItems] = useState<DisplayItem[]>([]);
  const [kullanildiItems, setKullanildiItems] = useState<DisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('giris');

  useEffect(() => {
    loadMovements();
  }, []);

  async function loadMovements() {
    setLoading(true);
    setMessage('');

    const { data: girisData, error: girisError } = await supabase
      .from('stok_hareketleri')
      .select(
        'id, islem, urun_adi, lot_no, kapak_boyutu, son_kullanma_tarihi, created_at, vaka_id'
      )
      .eq('islem', 'giris')
      .or('arsivlendi.eq.false,arsivlendi.is.null')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (girisError) {
      setMessage(girisError.message);
      setLoading(false);
      return;
    }

    const { data: usedMovementData, error: usedMovementError } = await supabase
      .from('stok_hareketleri')
      .select(
        'id, islem, urun_adi, lot_no, kapak_boyutu, son_kullanma_tarihi, created_at, vaka_id'
      )
      .eq('islem', 'kullanildi')
      .or('arsivlendi.eq.false,arsivlendi.is.null')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (usedMovementError) {
      setMessage(usedMovementError.message);
      setLoading(false);
      return;
    }

    const { data: usedStockData, error: usedStockError } = await supabase
      .from('kapak_stok')
      .select(
        'id, urun_adi, kapak_adi, lot_no, kapak_boyutu, son_kullanma_tarihi, created_at, kullanilan_vaka_id, durum'
      )
      .eq('durum', 'kullanildi')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (usedStockError) {
      setMessage(usedStockError.message);
      setLoading(false);
      return;
    }

    const formattedGirisItems: DisplayItem[] = ((girisData || []) as StockMovement[]).map(
      item => ({
        id: item.id,
        islem: item.islem,
        urun_adi: item.urun_adi,
        lot_no: item.lot_no,
        kapak_boyutu: item.kapak_boyutu,
        son_kullanma_tarihi: item.son_kullanma_tarihi,
        created_at: item.created_at,
        vaka_id: item.vaka_id,
        source: 'stok_hareketleri',
      })
    );

    const formattedUsedMovementItems: DisplayItem[] = (
      (usedMovementData || []) as StockMovement[]
    ).map(item => ({
      id: item.id,
      islem: 'kullanildi',
      urun_adi: item.urun_adi || 'Kapak',
      lot_no: item.lot_no,
      kapak_boyutu: item.kapak_boyutu,
      son_kullanma_tarihi: item.son_kullanma_tarihi,
      created_at: item.created_at,
      vaka_id: item.vaka_id,
      source: 'stok_hareketleri',
    }));

    const formattedUsedStockItems: DisplayItem[] = (
      (usedStockData || []) as UsedStockItem[]
    ).map(item => ({
      id: item.id,
      islem: 'kullanildi',
      urun_adi: item.urun_adi || item.kapak_adi || 'Kapak',
      lot_no: item.lot_no,
      kapak_boyutu: item.kapak_boyutu,
      son_kullanma_tarihi: item.son_kullanma_tarihi,
      created_at: item.created_at,
      vaka_id: item.kullanilan_vaka_id,
      source: 'kapak_stok',
    }));

    const mergedUsedItemsMap = new Map<string, DisplayItem>();

    [...formattedUsedMovementItems, ...formattedUsedStockItems].forEach(item => {
      const key = `${item.vaka_id || 'no-case'}-${item.lot_no}`;

      if (!mergedUsedItemsMap.has(key)) {
        mergedUsedItemsMap.set(key, item);
      }
    });

    const mergedUsedItems = Array.from(mergedUsedItemsMap.values()).sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    setGirisItems(formattedGirisItems);
    setKullanildiItems(mergedUsedItems);
    setLoading(false);
  }

  const filteredItems = useMemo(() => {
    return activeTab === 'giris' ? girisItems : kullanildiItems;
  }, [activeTab, girisItems, kullanildiItems]);

  async function archiveMovement(item: DisplayItem) {
    if (item.source !== 'stok_hareketleri') {
      setMessage('Kullanılan stok kayıtları kapak_stok tablosundan gelir; buradan arşivlenmez.');
      return;
    }

    const ok = window.confirm('Bu hareket kaydı arşivlensin mi?');

    if (!ok) return;

    const { error } = await supabase
      .from('stok_hareketleri')
      .update({ arsivlendi: true })
      .eq('id', item.id);

    if (error) {
      alert(error.message);
      return;
    }

    loadMovements();
  }

  function openRelatedCase(item: DisplayItem) {
    if (!item.vaka_id) {
      setMessage('Bu kayıt bir vaka ile ilişkili değil.');
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

  function islemText(islem: MovementType) {
    if (islem === 'giris') return 'Giriş';
    if (islem === 'kullanildi') return 'Kullanıldı';
    return 'İptal';
  }

  function islemClass(islem: MovementType) {
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
                    <tr key={`${item.source}-${item.id}`} className="border-t border-slate-700">
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

                      <td className="p-3 whitespace-nowrap">
                        {item.urun_adi}
                        {item.kapak_boyutu ? ` ${item.kapak_boyutu} mm` : ''}
                      </td>

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
                              : 'Bu kayıt vaka ile ilişkili değil'
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
                        {item.source === 'stok_hareketleri' ? (
                          <button
                            type="button"
                            onClick={() => archiveMovement(item)}
                            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-orange-300 hover:bg-orange-500/10"
                            title="Arşivle"
                          >
                            <Archive className="w-4 h-4" />
                            Arşivle
                          </button>
                        ) : (
                          <span className="text-slate-500 text-sm">-</span>
                        )}
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
