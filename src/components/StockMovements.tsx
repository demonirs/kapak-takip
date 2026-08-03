import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ArrowRightLeft,
  CalendarClock,
  MapPin,
  PackageOpen,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const DATABASE_PAGE_SIZE = 1000;

type StockItem = {
  id: string;
  urun_adi: string | null;
  kapak_adi: string | null;
  kapak_boyutu: number | null;
  lot_no: string | null;
  son_kullanma_tarihi: string | null;
  durum: string | null;
  created_at: string | null;
};

type TransferItem = {
  id: string;
  kapak_stok_id: string;
  hedef_il: string;
  urun_adi: string | null;
  kapak_boyutu: number | null;
  lot_no: string | null;
  son_kullanma_tarihi: string | null;
  transfer_tarihi: string | null;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    const candidate = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };

    const parts = [
      candidate.message,
      candidate.details,
      candidate.hint,
      candidate.code ? `Kod: ${String(candidate.code)}` : null,
    ]
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0
      )
      .map(value => value.trim());

    if (parts.length > 0) {
      return Array.from(new Set(parts)).join(' — ');
    }
  }

  return 'Bilinmeyen veritabanı hatası.';
}

async function fetchAllStockEntries(): Promise<StockItem[]> {
  const allRows: StockItem[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('kapak_stok')
      .select(
        `
          id,
          urun_adi,
          kapak_adi,
          kapak_boyutu,
          lot_no,
          son_kullanma_tarihi,
          durum,
          created_at
        `
      )
      .order('created_at', { ascending: false })
      .range(from, from + DATABASE_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const rows = (data || []) as StockItem[];
    allRows.push(...rows);

    if (rows.length < DATABASE_PAGE_SIZE) {
      break;
    }

    from += DATABASE_PAGE_SIZE;
  }

  return allRows;
}

async function fetchAllTransfers(): Promise<TransferItem[]> {
  const allRows: TransferItem[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('stok_transferleri')
      .select(
        'id, kapak_stok_id, hedef_il, urun_adi, kapak_boyutu, lot_no, son_kullanma_tarihi, transfer_tarihi'
      )
      .order('transfer_tarihi', { ascending: false })
      .range(from, from + DATABASE_PAGE_SIZE - 1);

    if (error) throw error;

    const rows = (data || []) as TransferItem[];
    allRows.push(...rows);

    if (rows.length < DATABASE_PAGE_SIZE) break;

    from += DATABASE_PAGE_SIZE;
  }

  return allRows;
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .trim();
}

function formatDate(date: string | null): string {
  if (!date) return '-';

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return parsedDate.toLocaleDateString('tr-TR');
}

function formatDateTime(date: string | null): string {
  if (!date) return 'Tarih bilgisi yok';

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return parsedDate.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function productName(item: StockItem): string {
  return item.urun_adi || item.kapak_adi || 'Kapak';
}

function sizeText(size: number | null): string {
  return size ? `${size} mm` : '-';
}

function statusText(status: string | null): string {
  if (status === 'stokta') return 'Stokta';
  if (status === 'kullanildi') return 'Kullanıldı';
  if (status === 'transfer_edildi') return 'Transfer Edildi';

  return status || 'Bilinmiyor';
}

function statusClass(status: string | null): string {
  if (status === 'stokta') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  }

  if (status === 'kullanildi') {
    return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
  }

  if (status === 'transfer_edildi') {
    return 'border-violet-500/30 bg-violet-500/10 text-violet-300';
  }

  return 'border-slate-600 bg-slate-700/50 text-slate-300';
}

export default function StockMovements() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setMessage('');

    const [stockResult, transferResult] = await Promise.allSettled([
        fetchAllStockEntries(),
        fetchAllTransfers(),
    ]);

    const errors: string[] = [];

    if (stockResult.status === 'fulfilled') {
      setItems(stockResult.value);
    } else {
      setItems([]);
      errors.push(
        `Stok girişleri alınamadı: ${getErrorMessage(
          stockResult.reason
        )}`
      );
    }

    if (transferResult.status === 'fulfilled') {
      setTransfers(transferResult.value);
    } else {
      setTransfers([]);
      errors.push(
        `Transfer kayıtları alınamadı: ${getErrorMessage(
          transferResult.reason
        )}`
      );
    }

    setMessage(errors.join(' '));
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const filteredItems = useMemo(() => {
    const query = normalize(searchTerm);

    if (!query) return items;

    return items.filter(item => {
      const searchableText = [
        productName(item),
        item.kapak_boyutu,
        item.lot_no,
        item.son_kullanma_tarihi,
        statusText(item.durum),
        formatDateTime(item.created_at),
      ]
        .map(normalize)
        .join(' ');

      return searchableText.includes(query);
    });
  }, [items, searchTerm]);

  const filteredTransfers = useMemo(() => {
    const query = normalize(searchTerm);

    if (!query) return transfers;

    return transfers.filter(item => {
      const searchableText = [
        item.hedef_il,
        item.urun_adi,
        item.kapak_boyutu,
        item.lot_no,
        item.son_kullanma_tarihi,
        formatDateTime(item.transfer_tarihi),
        'transfer edildi',
      ]
        .map(normalize)
        .join(' ');

      return searchableText.includes(query);
    });
  }, [searchTerm, transfers]);

  return (
    <div className="space-y-4 pb-24">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white sm:text-2xl">
            Stok Girişleri
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Stoka eklenen tüm kapaklar ve giriş zamanları.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadEntries()}
          disabled={loading}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
          />
          Yenile
        </button>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Toplam Giriş
          </div>

          <div className="mt-1 text-2xl font-bold text-white">
            {items.length}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300/70">
            Stokta
          </div>

          <div className="mt-1 text-2xl font-bold text-emerald-300">
            {items.filter(item => item.durum === 'stokta').length}
          </div>
        </div>

        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-300/70">
            Kullanılmış
          </div>

          <div className="mt-1 text-2xl font-bold text-cyan-300">
            {items.filter(item => item.durum === 'kullanildi').length}
          </div>
        </div>

        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-violet-300/70">
            Transfer Edildi
          </div>

          <div className="mt-1 text-2xl font-bold text-violet-300">
            {transfers.length}
          </div>
        </div>
      </section>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

        <input
          type="search"
          value={searchTerm}
          onChange={event => setSearchTerm(event.target.value)}
          placeholder="LOT, ürün, ölçü, durum veya giriş tarihi ara..."
          className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900/70 py-2.5 pl-10 pr-11 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
        />

        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-700 hover:text-white"
            aria-label="Aramayı temizle"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <section className="overflow-hidden rounded-xl border border-violet-500/25 bg-violet-500/[0.045]">
        <div className="flex items-center gap-2 border-b border-violet-500/15 px-4 py-3">
          <ArrowRightLeft className="h-4 w-4 text-violet-300" />
          <div>
            <h2 className="text-sm font-semibold text-white">
              Transfer Geçmişi
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Gönderilen kapaklar, hedef iller ve transfer zamanları
            </p>
          </div>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            Transfer kayıtları yükleniyor...
          </div>
        ) : filteredTransfers.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            {searchTerm
              ? 'Aramaya uygun transfer kaydı bulunamadı.'
              : 'Henüz transfer kaydı bulunmuyor.'}
          </div>
        ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full table-fixed">
                <thead className="border-b border-violet-500/20 bg-violet-500/[0.06]">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-violet-200/70">
                    <th className="w-[20%] px-3 py-2.5">
                      Transfer Tarihi ve Saati
                    </th>
                    <th className="w-[14%] px-3 py-2.5">
                      Hedef İl
                    </th>
                    <th className="w-[20%] px-3 py-2.5">Ürün</th>
                    <th className="w-[10%] px-3 py-2.5">Ölçü</th>
                    <th className="w-[15%] px-3 py-2.5">LOT</th>
                    <th className="w-[12%] px-3 py-2.5">SKT</th>
                    <th className="w-[9%] px-3 py-2.5">Durum</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-violet-500/15">
                  {filteredTransfers.map(item => (
                    <tr
                      key={item.id}
                      className="text-sm text-slate-300 transition hover:bg-violet-500/[0.06]"
                    >
                      <td className="whitespace-nowrap px-3 py-3 text-xs font-medium text-slate-300">
                        {formatDateTime(item.transfer_tarihi)}
                      </td>

                      <td className="px-3 py-3">
                        <span className="flex items-center gap-1.5 font-semibold text-violet-200">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {item.hedef_il}
                          </span>
                        </span>
                      </td>

                      <td
                        className="truncate px-3 py-3 font-semibold text-white"
                        title={item.urun_adi || 'Kapak'}
                      >
                        {item.urun_adi || 'Kapak'}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        {sizeText(item.kapak_boyutu)}
                      </td>

                      <td className="px-3 py-3 font-mono text-xs font-semibold text-cyan-300">
                        <span
                          className="block truncate"
                          title={item.lot_no || '-'}
                        >
                          {item.lot_no || '-'}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-xs">
                        {formatDate(item.son_kullanma_tarihi)}
                      </td>

                      <td className="px-3 py-3">
                        <span className="inline-flex rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-xs font-medium text-violet-200">
                          Transfer
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        )}
      </section>

      {message && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {message}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-10 text-center text-sm text-slate-400">
          Stok girişleri yükleniyor...
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
            {searchTerm
              ? 'Arama ölçütüne uygun stok girişi yok.'
              : 'Henüz stok girişi bulunmuyor.'}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-700 bg-slate-800/70 md:block">
            <table className="w-full table-fixed">
              <thead className="border-b border-slate-700 bg-slate-900/50">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="w-[21%] px-3 py-2.5">
                    Giriş Tarihi ve Saati
                  </th>
                  <th className="w-[25%] px-3 py-2.5">Ürün</th>
                  <th className="w-[12%] px-3 py-2.5">Ölçü</th>
                  <th className="w-[18%] px-3 py-2.5">LOT</th>
                  <th className="w-[13%] px-3 py-2.5">SKT</th>
                  <th className="w-[11%] px-3 py-2.5">Durum</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-700/70">
                {filteredItems.map(item => (
                  <tr
                    key={item.id}
                    className="text-sm text-slate-300 transition hover:bg-slate-700/30"
                  >
                    <td className="whitespace-nowrap px-3 py-3 text-xs font-medium text-slate-300">
                      {formatDateTime(item.created_at)}
                    </td>

                    <td
                      className="truncate px-3 py-3 font-medium text-slate-100"
                      title={productName(item)}
                    >
                      {productName(item)}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 text-sm">
                      {sizeText(item.kapak_boyutu)}
                    </td>

                    <td className="px-3 py-3 font-mono text-xs font-semibold text-cyan-300">
                      <span className="block truncate" title={item.lot_no || '-'}>
                        {item.lot_no || '-'}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 text-xs">
                      {formatDate(item.son_kullanma_tarihi)}
                    </td>

                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${statusClass(
                          item.durum
                        )}`}
                      >
                        {statusText(item.durum)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {filteredItems.map(item => (
              <article
                key={item.id}
                className="rounded-xl border border-slate-700 bg-slate-800/70 p-3.5"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-sm font-semibold text-slate-100">
                      {productName(item)} {sizeText(item.kapak_boyutu)}
                    </h2>

                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                      <span>{formatDateTime(item.created_at)}</span>
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium ${statusClass(
                      item.durum
                    )}`}
                  >
                    {statusText(item.durum)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-700/70 pt-3">
                  <div className="min-w-0 rounded-lg bg-slate-900/40 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      LOT
                    </div>

                    <div className="mt-1 break-all font-mono text-xs font-semibold text-cyan-300">
                      {item.lot_no || '-'}
                    </div>
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
