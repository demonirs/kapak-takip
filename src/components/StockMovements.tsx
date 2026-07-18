import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CalendarDays,
  ExternalLink,
  PackageOpen,
} from 'lucide-react';
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

    const formattedGirisItems: DisplayItem[] = (
      (girisData || []) as StockMovement[]
    ).map(item => ({
      id: item.id,
      islem: item.islem,
      urun_adi: item.urun_adi,
      lot_no: item.lot_no,
      kapak_boyutu: item.kapak_boyutu,
      son_kullanma_tarihi: item.son_kullanma_tarihi,
      created_at: item.created_at,
      vaka_id: item.vaka_id,
      source: 'stok_hareketleri',
    }));

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
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
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
      setMessage(
        'Kullanılan stok kayıtları kapak_stok tablosundan gelir; buradan arşivlenmez.'
      );
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

  function changeTab(tab: ActiveTab) {
    setActiveTab(tab);
    setMessage('');
  }

  function formatDate(date: string | null) {
    if (!date) return '-';

    return new Date(date).toLocaleDateString('tr-TR');
  }

  function formatDateTime(date: string) {
    return new Date(date).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function islemText(islem: MovementType) {
    if (islem === 'giris') return 'Giriş';
    if (islem === 'kullanildi') return 'Kullanım';

    return 'İptal';
  }

  function islemClass(islem: MovementType) {
    if (islem === 'giris') {
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    }

    if (islem === 'kullanildi') {
      return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
    }

    return 'border-red-500/30 bg-red-500/10 text-red-300';
  }

  function tabClass(tab: ActiveTab) {
    return activeTab === tab
      ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-100 shadow-sm'
      : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200';
  }

  function emptyMessage() {
    return activeTab === 'giris'
      ? 'Henüz giriş hareketi bulunmuyor.'
      : 'Henüz kullanım hareketi bulunmuyor.';
  }

  return (
    <div className="space-y-4 pb-24">
      <header>
        <h1 className="text-xl font-bold text-white sm:text-2xl">
          Stok Hareketleri
        </h1>

        <p className="mt-1 text-sm text-slate-400">
          Kapak girişlerini ve kullanım hareketlerini görüntüleyin.
        </p>
      </header>

      <div className="inline-flex w-full rounded-xl border border-slate-700 bg-slate-900/60 p-1 sm:w-auto">
        <button
          type="button"
          onClick={() => changeTab('giris')}
          aria-pressed={activeTab === 'giris'}
          className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition sm:flex-none ${tabClass(
            'giris'
          )}`}
        >
          <span>Giriş</span>

          <span
            className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${
              activeTab === 'giris'
                ? 'bg-cyan-400/20 text-cyan-100'
                : 'bg-slate-700 text-slate-300'
            }`}
          >
            {girisItems.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => changeTab('kullanildi')}
          aria-pressed={activeTab === 'kullanildi'}
          className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition sm:flex-none ${tabClass(
            'kullanildi'
          )}`}
        >
          <span>Kullanım</span>

          <span
            className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${
              activeTab === 'kullanildi'
                ? 'bg-cyan-400/20 text-cyan-100'
                : 'bg-slate-700 text-slate-300'
            }`}
          >
            {kullanildiItems.length}
          </span>
        </button>
      </div>

      {message && (
        <div
          role="status"
          className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-sm text-slate-300"
        >
          {message}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-10 text-center text-sm text-slate-400">
          Stok hareketleri yükleniyor...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-800/40 px-4 py-10 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-700/60 text-slate-400">
            <PackageOpen className="h-5 w-5" />
          </div>

          <h2 className="text-sm font-semibold text-slate-200">
            Kayıt bulunamadı
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            {emptyMessage()}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-700 bg-slate-800/70 md:block">
            <table className="w-full table-fixed">
              <thead className="border-b border-slate-700 bg-slate-900/50">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="w-[18%] px-3 py-2.5">Tarih</th>
                  <th className="w-[13%] px-3 py-2.5">İşlem</th>
                  <th className="w-[27%] px-3 py-2.5">Ürün</th>
                  <th className="w-[18%] px-3 py-2.5">LOT</th>
                  <th className="w-[16%] px-3 py-2.5">SKT</th>
                  <th className="w-[8%] px-3 py-2.5 text-right">
                    İşlem
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-700/70">
                {filteredItems.map(item => (
                  <tr
                    key={`${item.source}-${item.id}`}
                    className="text-sm text-slate-300 transition hover:bg-slate-700/30"
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-400">
                      {formatDateTime(item.created_at)}
                    </td>

                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${islemClass(
                          item.islem
                        )}`}
                      >
                        {islemText(item.islem)}
                      </span>
                    </td>

                    <td className="px-3 py-2.5">
                      <div
                        className="truncate font-medium text-slate-200"
                        title={`${item.urun_adi}${
                          item.kapak_boyutu
                            ? ` ${item.kapak_boyutu} mm`
                            : ''
                        }`}
                      >
                        {item.urun_adi}

                        {item.kapak_boyutu
                          ? ` ${item.kapak_boyutu} mm`
                          : ''}
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => openRelatedCase(item)}
                        className={`inline-flex max-w-full items-center gap-1.5 rounded-md font-mono text-xs font-semibold ${
                          item.vaka_id
                            ? 'text-cyan-300 hover:text-cyan-200'
                            : 'text-slate-400 hover:text-slate-300'
                        }`}
                        title={
                          item.vaka_id
                            ? 'İlgili vakayı aç'
                            : 'Bu kayıt vaka ile ilişkili değil'
                        }
                      >
                        <span className="truncate">{item.lot_no || '-'}</span>

                        {item.vaka_id && (
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        )}
                      </button>
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-300">
                      {formatDate(item.son_kullanma_tarihi)}
                    </td>

                    <td className="px-3 py-2.5 text-right">
                      {item.source === 'stok_hareketleri' ? (
                        <button
                          type="button"
                          onClick={() => archiveMovement(item)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-amber-300 transition hover:bg-amber-500/10 hover:text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                          title="Hareketi arşivle"
                          aria-label={`${item.lot_no} LOT numaralı hareketi arşivle`}
                        >
                          <Archive className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="text-sm text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {filteredItems.map(item => (
              <article
                key={`${item.source}-${item.id}`}
                className="rounded-xl border border-slate-700 bg-slate-800/70 p-3.5"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-medium ${islemClass(
                          item.islem
                        )}`}
                      >
                        {islemText(item.islem)}
                      </span>

                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>

                    <h2 className="break-words text-sm font-semibold text-slate-100">
                      {item.urun_adi}

                      {item.kapak_boyutu
                        ? ` ${item.kapak_boyutu} mm`
                        : ''}
                    </h2>
                  </div>

                  {item.source === 'stok_hareketleri' && (
                    <button
                      type="button"
                      onClick={() => archiveMovement(item)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-amber-300 transition hover:bg-amber-500/10 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                      title="Hareketi arşivle"
                      aria-label={`${item.lot_no} LOT numaralı hareketi arşivle`}
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-700/70 pt-3">
                  <div className="min-w-0 rounded-lg bg-slate-900/40 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      LOT
                    </div>

                    <button
                      type="button"
                      onClick={() => openRelatedCase(item)}
                      className={`mt-1 flex max-w-full items-center gap-1.5 font-mono text-xs font-semibold ${
                        item.vaka_id
                          ? 'text-cyan-300'
                          : 'text-slate-300'
                      }`}
                    >
                      <span className="break-all">{item.lot_no || '-'}</span>

                      {item.vaka_id && (
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      )}
                    </button>
                  </div>

                  <div className="min-w-0 rounded-lg bg-slate-900/40 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Son Kullanma
                    </div>

                    <div className="mt-1 text-xs font-medium text-slate-300">
                      {formatDate(item.son_kullanma_tarihi)}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
