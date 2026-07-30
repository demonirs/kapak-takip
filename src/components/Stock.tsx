import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  PackageOpen,
  PackagePlus,
  RefreshCw,
  Search,
  SearchX,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { downloadExcel } from '../lib/excel';

const DATABASE_PAGE_SIZE = 1000;

const GTIN_MAP: Record<string, number> = {
  '00763000655419': 23,
  '00763000655426': 26,
  '00763000655433': 29,
  '00763000655440': 34,
};

type SizeFilter = 'Tümü' | '23' | '26' | '29' | '34';
type ScanStatus = 'found' | 'used' | 'not-found';

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

type ParsedBarcode = {
  gtin: string;
  urun_adi: string;
  kapak_boyutu: number;
  lot_no: string;
  son_kullanma_tarihi: string;
  barkod_raw: string;
};

type ScanResult = {
  status: ScanStatus;
  lotNo: string;
  size: number;
};

function normalizeLot(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/\(20\)01$/i, '')
    .replace(/2001$/i, '');
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .trim();
}

function cleanBarcode(value: string): string {
  return value
    .split(String.fromCharCode(29))
    .join('')
    .trim()
    .replace(/\s/g, '');
}

function extractLotFromRaw(rawValue: string): string {
  const raw = cleanBarcode(rawValue);

  const parenthesizedSerialMatch = raw.match(
    /\(21\)(.*?)(?=\(\d{2}\)|$)/
  );

  if (parenthesizedSerialMatch?.[1]) {
    return normalizeLot(parenthesizedSerialMatch[1]);
  }

  const compactGs1Match = raw.match(
    /^01\d{14}17\d{6}21(.+)$/
  );

  if (compactGs1Match?.[1]) {
    return normalizeLot(compactGs1Match[1]);
  }

  const flexibleCompactMatch = raw.match(
    /01\d{14}17\d{6}21(.+)$/
  );

  if (flexibleCompactMatch?.[1]) {
    return normalizeLot(flexibleCompactMatch[1]);
  }

  const fallbackMatch = raw.match(
    /21([A-Za-z][A-Za-z0-9]*(?:\(20\)01|2001)?)$/
  );

  return fallbackMatch?.[1]
    ? normalizeLot(fallbackMatch[1])
    : '';
}

function extractGtinAndExpiry(rawValue: string): {
  gtin: string;
  expiry: string;
} {
  const raw = cleanBarcode(rawValue);
  let gtin = raw.match(/\(01\)(\d{14})/)?.[1] || '';
  let expiry = raw.match(/\(17\)(\d{6})/)?.[1] || '';

  if (!gtin || !expiry) {
    const compactMatch = raw.match(/01(\d{14})17(\d{6})/);

    if (compactMatch) {
      gtin = compactMatch[1];
      expiry = compactMatch[2];
    }
  }

  return { gtin, expiry };
}

function parseBarcodeValue(rawValue: string): ParsedBarcode {
  const raw = cleanBarcode(rawValue);

  if (!raw) {
    throw new Error('Barkod alanı boş.');
  }

  const { gtin, expiry } = extractGtinAndExpiry(raw);
  const lotNo = extractLotFromRaw(raw);

  if (!gtin) {
    throw new Error('GTIN / UBB bulunamadı.');
  }

  if (!expiry) {
    throw new Error('Son kullanma tarihi bulunamadı.');
  }

  if (!lotNo) {
    throw new Error('LOT numarası bulunamadı.');
  }

  const valveSize = GTIN_MAP[gtin];

  if (!valveSize) {
    throw new Error(`Tanımsız GTIN: ${gtin}`);
  }

  return {
    gtin,
    urun_adi: `EVPROPLUS-${valveSize}`,
    kapak_boyutu: valveSize,
    lot_no: normalizeLot(lotNo),
    son_kullanma_tarihi: `20${expiry.slice(0, 2)}-${expiry.slice(
      2,
      4
    )}-${expiry.slice(4, 6)}`,
    barkod_raw: raw,
  };
}

async function fetchAllStockItems(): Promise<StockItem[]> {
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
      .order('created_at', {
        ascending: false,
      })
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

function parseDateOnly(value: string | null): Date | null {
  if (!value) return null;

  const datePart = value.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);

  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);

  return date;
}

function formatDate(value: string | null): string {
  const date = parseDateOnly(value);

  return date ? date.toLocaleDateString('tr-TR') : '-';
}

function remainingDays(value: string | null): number | null {
  const expiryDate = parseDateOnly(value);

  if (!expiryDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil(
    (expiryDate.getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

function productName(item: StockItem): string {
  return item.urun_adi || item.kapak_adi || 'Kapak';
}

function expiryClass(days: number | null): string {
  if (days === null) {
    return 'border-slate-600 bg-slate-700/40 text-slate-300';
  }

  if (days < 0) {
    return 'border-red-500/30 bg-red-500/10 text-red-300';
  }

  if (days <= 30) {
    return 'border-orange-500/30 bg-orange-500/10 text-orange-300';
  }

  if (days <= 90) {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  }

  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
}

function expiryText(days: number | null): string {
  if (days === null) return 'SKT eksik';
  if (days < 0) return `${Math.abs(days)} gün geçmiş`;
  if (days === 0) return 'Bugün doluyor';

  return `${days} gün kaldı`;
}

export default function Stock() {
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);

  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [parsed, setParsed] = useState<ParsedBarcode | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(
    null
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] =
    useState<SizeFilter>('Tümü');
  const [message, setMessage] = useState('');

  const loadStock = useCallback(async () => {
    setLoading(true);
    setMessage('');

    try {
      const rows = await fetchAllStockItems();
      setItems(rows);
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? `Stok alınamadı: ${error.message}`
          : 'Stok alınamadı.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStock();
  }, [loadStock]);

  const currentItems = useMemo(
    () => items.filter(item => item.durum === 'stokta'),
    [items]
  );

  const sizeCounts = useMemo(
    () => ({
      23: currentItems.filter(item => item.kapak_boyutu === 23)
        .length,
      26: currentItems.filter(item => item.kapak_boyutu === 26)
        .length,
      29: currentItems.filter(item => item.kapak_boyutu === 29)
        .length,
      34: currentItems.filter(item => item.kapak_boyutu === 34)
        .length,
    }),
    [currentItems]
  );

  const filteredItems = useMemo(() => {
    const query = normalizeText(searchTerm);

    return currentItems.filter(item => {
      if (
        activeFilter !== 'Tümü' &&
        item.kapak_boyutu !== Number(activeFilter)
      ) {
        return false;
      }

      if (!query) return true;

      const searchableText = [
        productName(item),
        item.kapak_boyutu,
        item.lot_no,
        item.son_kullanma_tarihi,
      ]
        .map(normalizeText)
        .join(' ');

      return searchableText.includes(query);
    });
  }, [activeFilter, currentItems, searchTerm]);

  function solveBarcode() {
    setMessage('');
    setParsed(null);
    setScanResult(null);

    try {
      const parsedBarcode = parseBarcodeValue(barcode);
      const normalizedLot = normalizeLot(parsedBarcode.lot_no);

      const existingItem = items.find(
        item =>
          normalizeLot(item.lot_no || '') === normalizedLot &&
          Number(item.kapak_boyutu) === parsedBarcode.kapak_boyutu
      );

      setParsed(parsedBarcode);
      setActiveFilter(
        String(parsedBarcode.kapak_boyutu) as SizeFilter
      );

      if (existingItem?.durum === 'stokta') {
        setScanResult({
          status: 'found',
          lotNo: normalizedLot,
          size: parsedBarcode.kapak_boyutu,
        });
        setMessage(
          `${normalizedLot} LOT numaralı kapak mevcut stokta bulundu.`
        );
      } else if (existingItem) {
        setScanResult({
          status: 'used',
          lotNo: normalizedLot,
          size: parsedBarcode.kapak_boyutu,
        });
        setMessage(
          `${normalizedLot} LOT numaralı kapak daha önce kullanılmış. Tekrar stoka eklenemez.`
        );
      } else {
        setScanResult({
          status: 'not-found',
          lotNo: normalizedLot,
          size: parsedBarcode.kapak_boyutu,
        });
        setMessage(
          `${normalizedLot} LOT numaralı kapak sistemde bulunamadı. Stoka ekleyebilirsiniz.`
        );
      }
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Barkod çözümlenemedi.'
      );
    } finally {
      setBarcode('');

      window.setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 0);
    }
  }

  async function addToStock() {
    if (!parsed || scanResult?.status !== 'not-found' || saving) {
      return;
    }

    setSaving(true);
    setMessage('');

    const lotNo = normalizeLot(parsed.lot_no);

    try {
      const { data: insertedStock, error: stockError } = await supabase
        .from('kapak_stok')
        .insert({
          urun_adi: parsed.urun_adi,
          gtin: parsed.gtin,
          kapak_adi: 'EVPROPLUS',
          kapak_boyutu: parsed.kapak_boyutu,
          lot_no: lotNo,
          son_kullanma_tarihi: parsed.son_kullanma_tarihi,
          barkod_raw: parsed.barkod_raw,
          durum: 'stokta',
        })
        .select('id')
        .single();

      if (stockError || !insertedStock?.id) {
        throw stockError || new Error('Stok kaydı oluşturulamadı.');
      }

      const { error: movementError } = await supabase
        .from('stok_hareketleri')
        .insert({
          kapak_stok_id: insertedStock.id,
          islem: 'giris',
          urun_adi: parsed.urun_adi,
          lot_no: lotNo,
          kapak_boyutu: parsed.kapak_boyutu,
          son_kullanma_tarihi: parsed.son_kullanma_tarihi,
          arsivlendi: false,
        });

      if (movementError) {
        const { error: rollbackError } = await supabase
          .from('kapak_stok')
          .delete()
          .eq('id', insertedStock.id);

        if (rollbackError) {
          throw new Error(
            `Hareket kaydı yazılamadı ve stok geri alınamadı: ${movementError.message}`
          );
        }

        throw new Error(
          `Hareket kaydı yazılamadı. Eksik kayıt oluşmaması için stok ekleme geri alındı: ${movementError.message}`
        );
      }

      setParsed(null);
      setScanResult(null);
      setMessage(`${lotNo} LOT numaralı kapak stoka eklendi.`);
      await loadStock();
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Kapak stoka eklenemedi.'
      );
    } finally {
      setSaving(false);

      window.setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 0);
    }
  }

  async function exportCurrentStock() {
    if (filteredItems.length === 0 || exporting) return;

    setExporting(true);

    try {
      await downloadExcel({
        rows: filteredItems.map((item, index) => ({
          No: index + 1,
          Ürün: productName(item),
          Ölçü: item.kapak_boyutu
            ? `${item.kapak_boyutu} mm`
            : '',
          LOT: item.lot_no || '',
          SKT: formatDate(item.son_kullanma_tarihi),
          'Kalan Gün': remainingDays(item.son_kullanma_tarihi) ?? '',
        })),
        widths: [8, 25, 12, 20, 16, 14],
        sheetName: 'Mevcut Stok',
        fileName: `ValveFlow_Mevcut_Stok_${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx`,
      });
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Excel dosyası hazırlanamadı.'
      );
    } finally {
      setExporting(false);
    }
  }

  const resultStyle =
    scanResult?.status === 'found'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
      : scanResult?.status === 'used'
        ? 'border-red-500/30 bg-red-500/10 text-red-100'
        : scanResult?.status === 'not-found'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
          : 'border-slate-700 bg-slate-800 text-slate-200';

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-24">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white sm:text-2xl">
            Stok Takip
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Yalnızca şu anda mevcut olan kapaklar.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void loadStock()}
            disabled={loading}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            />
            Yenile
          </button>

          <button
            type="button"
            onClick={() => void exportCurrentStock()}
            disabled={loading || exporting || filteredItems.length === 0}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/10 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Hazırlanıyor...' : "Excel'e Aktar"}
          </button>
        </div>
      </header>

      <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
        <label
          htmlFor="stock-barcode"
          className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400"
        >
          Kapak Barkodu
        </label>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            ref={barcodeInputRef}
            id="stock-barcode"
            value={barcode}
            onChange={event => setBarcode(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                solveBarcode();
              }
            }}
            placeholder="Barkodu okut veya yapıştır"
            autoComplete="off"
            className="min-h-11 flex-1 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
          />

          <button
            type="button"
            onClick={solveBarcode}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500"
          >
            <Search className="h-4 w-4" />
            Kontrol Et
          </button>
        </div>

        {parsed && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-700 bg-slate-900/50 p-3 sm:grid-cols-4">
            <div>
              <div className="text-[10px] font-semibold uppercase text-slate-500">
                Ürün
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {parsed.urun_adi}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase text-slate-500">
                Ölçü
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {parsed.kapak_boyutu} mm
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase text-slate-500">
                LOT
              </div>
              <div className="mt-1 break-all font-mono text-sm font-semibold text-cyan-300">
                {parsed.lot_no}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase text-slate-500">
                SKT
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {formatDate(parsed.son_kullanma_tarihi)}
              </div>
            </div>
          </div>
        )}

        {scanResult && (
          <div className={`mt-3 rounded-xl border p-3 ${resultStyle}`}>
            <div className="flex items-start gap-2">
              {scanResult.status === 'found' ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
              ) : scanResult.status === 'used' ? (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
              ) : (
                <SearchX className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              )}

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {scanResult.status === 'found'
                    ? 'Mevcut stokta bulundu'
                    : scanResult.status === 'used'
                      ? 'Daha önce kullanılmış'
                      : 'Stokta bulunamadı'}
                </p>

                <p className="mt-1 text-xs opacity-80">
                  LOT: {scanResult.lotNo} • {scanResult.size} mm
                </p>
              </div>

              {scanResult.status === 'not-found' && (
                <button
                  type="button"
                  onClick={() => void addToStock()}
                  disabled={saving}
                  className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  <PackagePlus className="h-4 w-4" />
                  {saving ? 'Ekleniyor...' : 'Stoka Ekle'}
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {message && !scanResult && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${resultStyle}`}
        >
          {message}
        </div>
      )}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => setActiveFilter('Tümü')}
          className={`rounded-xl border p-3 text-left transition ${
            activeFilter === 'Tümü'
              ? 'border-cyan-500/40 bg-cyan-500/10'
              : 'border-slate-700 bg-slate-800/60 hover:bg-slate-800'
          }`}
        >
          <div className="text-xs text-slate-400">Tüm Stok</div>
          <div className="mt-1 text-xl font-bold text-white">
            {currentItems.length}
          </div>
        </button>

        {([23, 26, 29, 34] as const).map(size => (
          <button
            key={size}
            type="button"
            onClick={() => setActiveFilter(String(size) as SizeFilter)}
            className={`rounded-xl border p-3 text-left transition ${
              activeFilter === String(size)
                ? 'border-cyan-500/40 bg-cyan-500/10'
                : 'border-slate-700 bg-slate-800/60 hover:bg-slate-800'
            }`}
          >
            <div className="text-xs text-slate-400">{size} mm</div>
            <div className="mt-1 text-xl font-bold text-white">
              {sizeCounts[size]}
            </div>
          </button>
        ))}
      </section>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

        <input
          type="search"
          value={searchTerm}
          onChange={event => setSearchTerm(event.target.value)}
          placeholder="LOT, ürün, ölçü veya SKT ara..."
          className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900/70 py-2.5 pl-10 pr-11 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
        />

        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
            aria-label="Aramayı temizle"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-10 text-center text-sm text-slate-400">
          Mevcut stok yükleniyor...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-800/40 px-4 py-10 text-center">
          <PackageOpen className="h-7 w-7 text-slate-600" />
          <p className="mt-3 text-sm font-semibold text-slate-300">
            Mevcut stok bulunamadı
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Filtreyi değiştirin veya yeni bir kapak ekleyin.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-700 bg-slate-800/70 md:block">
            <table className="w-full table-fixed">
              <thead className="border-b border-slate-700 bg-slate-900/50">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="w-[29%] px-4 py-3">Ürün</th>
                  <th className="w-[12%] px-4 py-3">Ölçü</th>
                  <th className="w-[23%] px-4 py-3">LOT</th>
                  <th className="w-[17%] px-4 py-3">SKT</th>
                  <th className="w-[19%] px-4 py-3">Durum</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-700/70">
                {filteredItems.map(item => {
                  const days = remainingDays(item.son_kullanma_tarihi);

                  return (
                    <tr
                      key={item.id}
                      className="text-sm text-slate-300 transition hover:bg-slate-700/30"
                    >
                      <td className="truncate px-4 py-3 font-semibold text-white">
                        {productName(item)}
                      </td>
                      <td className="px-4 py-3">
                        {item.kapak_boyutu
                          ? `${item.kapak_boyutu} mm`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-cyan-300">
                        {item.lot_no || '-'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {formatDate(item.son_kullanma_tarihi)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${expiryClass(
                            days
                          )}`}
                        >
                          {expiryText(days)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {filteredItems.map(item => {
              const days = remainingDays(item.son_kullanma_tarihi);

              return (
                <article
                  key={item.id}
                  className="rounded-xl border border-slate-700 bg-slate-800/70 p-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-words text-sm font-semibold text-white">
                        {productName(item)}
                      </h2>
                      <p className="mt-1 text-xs text-slate-400">
                        {item.kapak_boyutu
                          ? `${item.kapak_boyutu} mm`
                          : 'Ölçü yok'}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium ${expiryClass(
                        days
                      )}`}
                    >
                      {expiryText(days)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-700/70 pt-3">
                    <div className="rounded-lg bg-slate-900/40 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase text-slate-500">
                        LOT
                      </div>
                      <div className="mt-1 break-all font-mono text-xs font-semibold text-cyan-300">
                        {item.lot_no || '-'}
                      </div>
                    </div>

                    <div className="rounded-lg bg-slate-900/40 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase text-slate-500">
                        SKT
                      </div>
                      <div className="mt-1 text-xs font-medium text-slate-300">
                        {formatDate(item.son_kullanma_tarihi)}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
