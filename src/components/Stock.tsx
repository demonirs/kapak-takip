import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ExternalLink, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type StockStatus = 'stokta' | 'kullanildi';
type Tab = 'mevcut' | 'bu-ay' | 'gecmis';

type StockItem = {
  id: string;
  urun_adi: string;
  kapak_boyutu: number;
  lot_no: string;
  son_kullanma_tarihi: string;
  durum: StockStatus | string | null;
  kullanilan_vaka_id: string | null;
  created_at?: string | null;
};

type CaseInfo = {
  id: string;
  vaka_tarihi: string | null;
  merkez_hastane: string | null;
  doktor: string | null;
  hasta_adi: string | null;
  kapak_tipi: string | null;
  kapak_size: string | null;
  lot_no: string | null;
  son_kul_tarihi: string | null;
};

type HistoricalItem = {
  id: string;
  urun_adi: string;
  kapak_boyutu: number | null;
  lot_no: string;
  son_kullanma_tarihi: string | null;
  kullanim_tarihi: string | null;
  merkez_hastane: string | null;
  doktor: string | null;
  hasta_adi: string | null;
  kaynak: string | null;
};

type ParsedBarcode = {
  gtin: string;
  urun_adi: string;
  kapak_boyutu: number;
  lot_no: string;
  son_kullanma_tarihi: string;
  barkod_raw: string;
};

type UsageRow = {
  key: string;
  source: 'valveflow' | 'eski_excel';
  caseId?: string | null;
  urun_adi: string;
  kapak_boyutu: number | null;
  lot_no: string;
  son_kullanma_tarihi: string | null;
  kullanim_tarihi: string | null;
  hasta_adi: string | null;
  merkez_hastane: string | null;
  doktor: string | null;
};

const GTIN_MAP: Record<string, number> = {
  '00763000655419': 23,
  '00763000655426': 26,
  '00763000655433': 29,
  '00763000655440': 34,
};

const FILTERS = ['Tümü', '23', '26', '29', '34'] as const;

function normalizeLot(value: string) {
  return value
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/\(.*?\)/g, '')
    .replace(/(?:01|17|20|21)\d*$/g, '');
}

function cleanBarcode(value: string) {
  return value.trim().replace(/\s/g, '').replace(/\u001D/g, '');
}

function extractLotFromRaw(raw: string) {
  const lotAiMatch = raw.match(/\(10\)(.*?)(?=\(\d{2}\)|$)/);

  if (lotAiMatch?.[1]) {
    return normalizeLot(lotAiMatch[1]);
  }

  const serialAiMatch = raw.match(/\(21\)(.*?)(?=\(\d{2}\)|$)/);

  if (serialAiMatch?.[1]) {
    return normalizeLot(serialAiMatch[1]);
  }

  const compact10Index = raw.indexOf('10');
  const compact21Index = raw.indexOf('21');

  let startIndex = -1;

  if (compact10Index !== -1) {
    startIndex = compact10Index + 2;
  } else if (compact21Index !== -1) {
    startIndex = compact21Index + 2;
  }

  if (startIndex === -1) {
    return '';
  }

  const lotMatch = raw
    .slice(startIndex)
    .match(/[A-Za-z][A-Za-z0-9]*/);

  return lotMatch?.[0] ? normalizeLot(lotMatch[0]) : '';
}

function extractGtinAndSkt(raw: string) {
  let gtin = '';
  let skt = '';

  const gtinParen = raw.match(/\(01\)(\d{14})/);
  const sktParen = raw.match(/\(17\)(\d{6})/);

  if (gtinParen?.[1]) {
    gtin = gtinParen[1];
  }

  if (sktParen?.[1]) {
    skt = sktParen[1];
  }

  if (!gtin || !skt) {
    const compactMatch = raw.match(/01(\d{14})17(\d{6})/);

    if (compactMatch) {
      gtin = compactMatch[1];
      skt = compactMatch[2];
    }
  }

  return { gtin, skt };
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const datePart = value.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);

  return date;
}

function isCurrentMonth(value: string | null | undefined) {
  const date = parseDateOnly(value);

  if (!date) {
    return false;
  }

  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function isBeforeCurrentMonth(value: string | null | undefined) {
  const date = parseDateOnly(value);

  if (!date) {
    return false;
  }

  const now = new Date();

  const firstDayOfCurrentMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  );

  firstDayOfCurrentMonth.setHours(0, 0, 0, 0);

  return date.getTime() < firstDayOfCurrentMonth.getTime();
}

function parseValveSize(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/\d+/);

  if (!match?.[0]) {
    return null;
  }

  const size = Number(match[0]);

  if (![23, 26, 29, 34].includes(size)) {
    return null;
  }

  return size;
}

function buildValveProductName(
  valveType: string | null | undefined,
  valveSize: number | null
) {
  if (valveSize) {
    return `EVPROPLUS-${valveSize}`;
  }

  if (valveType?.trim()) {
    return valveType.trim();
  }

  return 'Evolut Pro+';
}

export default function Stock() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const currentProfile = profile as any;

  const isAdmin =
    currentProfile?.role === 'admin' ||
    currentProfile?.yetki === 'admin' ||
    currentProfile?.is_admin === true;

  const [items, setItems] = useState<StockItem[]>([]);
  const [cases, setCases] = useState<CaseInfo[]>([]);
  const [historicalItems, setHistoricalItems] = useState<
    HistoricalItem[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [barcode, setBarcode] = useState('');
  const [parsed, setParsed] = useState<ParsedBarcode | null>(null);
  const [message, setMessage] = useState('');
  const [exporting, setExporting] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>('mevcut');

  const [activeFilter, setActiveFilter] =
    useState<(typeof FILTERS)[number]>('Tümü');

  useEffect(() => {
    void loadStock();
  }, []);

  async function loadStock() {
    setLoading(true);
    setMessage('');

    const [
      stockResponse,
      casesResponse,
      historicalResponse,
    ] = await Promise.all([
      supabase
        .from('kapak_stok')
        .select(
          `
            id,
            urun_adi,
            kapak_boyutu,
            lot_no,
            son_kullanma_tarihi,
            durum,
            kullanilan_vaka_id,
            created_at
          `
        )
        .in('durum', ['stokta', 'kullanildi'])
        .order('kapak_boyutu')
        .order('son_kullanma_tarihi'),

      supabase
        .from('kapaklar')
        .select(
          `
            id,
            vaka_tarihi,
            merkez_hastane,
            doktor,
            hasta_adi,
            kapak_tipi,
            kapak_size,
            lot_no,
            son_kul_tarihi
          `
        )
        .order('vaka_tarihi', { ascending: false }),

      supabase
        .from('gecmis_kullanilan_kapaklar')
        .select(
          `
            id,
            urun_adi,
            kapak_boyutu,
            lot_no,
            son_kullanma_tarihi,
            kullanim_tarihi,
            merkez_hastane,
            doktor,
            hasta_adi,
            kaynak
          `
        )
        .order('kullanim_tarihi', { ascending: false }),
    ]);

    if (stockResponse.error) {
      setMessage(
        `Stok kayıtları alınamadı: ${stockResponse.error.message}`
      );
      setLoading(false);
      return;
    }

    if (casesResponse.error) {
      setMessage(
        `Vaka kayıtları alınamadı: ${casesResponse.error.message}`
      );
      setLoading(false);
      return;
    }

    if (historicalResponse.error) {
      setMessage(
        `Geçmiş kayıtlar alınamadı: ${historicalResponse.error.message}`
      );
      setLoading(false);
      return;
    }

    setItems((stockResponse.data as StockItem[]) || []);
    setCases((casesResponse.data as CaseInfo[]) || []);

    setHistoricalItems(
      (historicalResponse.data as HistoricalItem[]) || []
    );

    setLoading(false);
  }

  const mevcutItems = useMemo(
    () => items.filter(item => item.durum === 'stokta'),
    [items]
  );

  const valveFlowUsageRows = useMemo<UsageRow[]>(
    () =>
      cases.map(item => {
        const valveSize = parseValveSize(item.kapak_size);

        return {
          key: `valveflow-${item.id}`,
          source: 'valveflow',
          caseId: item.id,
          urun_adi: buildValveProductName(
            item.kapak_tipi,
            valveSize
          ),
          kapak_boyutu: valveSize,
          lot_no: item.lot_no || '',
          son_kullanma_tarihi: item.son_kul_tarihi,
          kullanim_tarihi: item.vaka_tarihi,
          hasta_adi: item.hasta_adi,
          merkez_hastane: item.merkez_hastane,
          doktor: item.doktor,
        };
      }),
    [cases]
  );

  const currentMonthItems = useMemo(
    () =>
      valveFlowUsageRows
        .filter(item => isCurrentMonth(item.kullanim_tarihi))
        .sort((a, b) => {
          const first =
            parseDateOnly(a.kullanim_tarihi)?.getTime() || 0;

          const second =
            parseDateOnly(b.kullanim_tarihi)?.getTime() || 0;

          return second - first;
        }),
    [valveFlowUsageRows]
  );

  const previousValveFlowHistory = useMemo(
    () =>
      valveFlowUsageRows.filter(item =>
        isBeforeCurrentMonth(item.kullanim_tarihi)
      ),
    [valveFlowUsageRows]
  );

  const importedHistory = useMemo<UsageRow[]>(
    () =>
      historicalItems.map(item => ({
        key: `eski-excel-${item.id}`,
        source: 'eski_excel',
        caseId: null,
        urun_adi: item.urun_adi,
        kapak_boyutu: item.kapak_boyutu,
        lot_no: item.lot_no,
        son_kullanma_tarihi: item.son_kullanma_tarihi,
        kullanim_tarihi: item.kullanim_tarihi,
        hasta_adi: item.hasta_adi,
        merkez_hastane: item.merkez_hastane,
        doktor: item.doktor,
      })),
    [historicalItems]
  );

  const allHistoryItems = useMemo(
    () =>
      [...previousValveFlowHistory, ...importedHistory].sort(
        (a, b) => {
          const first =
            parseDateOnly(a.kullanim_tarihi)?.getTime() || 0;

          const second =
            parseDateOnly(b.kullanim_tarihi)?.getTime() || 0;

          return second - first;
        }
      ),
    [previousValveFlowHistory, importedHistory]
  );

  const filteredStockItems = useMemo(() => {
    if (activeFilter === 'Tümü') {
      return mevcutItems;
    }

    return mevcutItems.filter(
      item => item.kapak_boyutu === Number(activeFilter)
    );
  }, [mevcutItems, activeFilter]);

  const activeUsageItems = useMemo(() => {
    if (activeTab === 'bu-ay') {
      return currentMonthItems;
    }

    if (activeTab === 'gecmis') {
      return allHistoryItems;
    }

    return [];
  }, [activeTab, currentMonthItems, allHistoryItems]);

  const filteredUsageItems = useMemo(() => {
    if (activeFilter === 'Tümü') {
      return activeUsageItems;
    }

    return activeUsageItems.filter(
      item => item.kapak_boyutu === Number(activeFilter)
    );
  }, [activeUsageItems, activeFilter]);

  const visibleCount =
    activeTab === 'mevcut'
      ? filteredStockItems.length
      : filteredUsageItems.length;

  const sizeSource =
    activeTab === 'mevcut' ? mevcutItems : activeUsageItems;

  const sizeCounts = {
    23: sizeSource.filter(item => item.kapak_boyutu === 23).length,
    26: sizeSource.filter(item => item.kapak_boyutu === 26).length,
    29: sizeSource.filter(item => item.kapak_boyutu === 29).length,
    34: sizeSource.filter(item => item.kapak_boyutu === 34).length,
  };

  function selectTab(tab: Tab) {
    setActiveTab(tab);
    setActiveFilter('Tümü');
    setMessage('');
  }

  function parseBarcode() {
    setMessage('');
    setParsed(null);

    const raw = cleanBarcode(barcode);

    if (!raw) {
      setMessage('Barkod alanı boş.');
      return;
    }

    const { gtin, skt } = extractGtinAndSkt(raw);
    const lot = extractLotFromRaw(raw);

    if (!gtin) {
      setMessage('GTIN / UBB bulunamadı.');
      return;
    }

    if (!skt) {
      setMessage('Son kullanma tarihi bulunamadı.');
      return;
    }

    if (!lot) {
      setMessage('Lot numarası bulunamadı.');
      return;
    }

    const kapakBoyutu = GTIN_MAP[gtin];

    if (!kapakBoyutu) {
      setMessage(`Tanımsız GTIN: ${gtin}`);
      return;
    }

    setParsed({
      gtin,
      urun_adi: `EVPROPLUS-${kapakBoyutu}`,
      kapak_boyutu: kapakBoyutu,
      lot_no: lot,
      son_kullanma_tarihi: `20${skt.slice(
        0,
        2
      )}-${skt.slice(2, 4)}-${skt.slice(4, 6)}`,
      barkod_raw: raw,
    });

    setMessage('Barkod çözümlendi.');
  }

  async function addToStock() {
    if (!parsed) {
      setMessage('Önce barkodu çözümle.');
      return;
    }

    const lotNo = normalizeLot(parsed.lot_no);

    const { data, error } = await supabase
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

    if (error) {
      setMessage(`Stoka eklenemedi: ${error.message}`);
      return;
    }

    if (data?.id) {
      const { error: movementError } = await supabase
        .from('stok_hareketleri')
        .insert({
          kapak_stok_id: data.id,
          islem: 'giris',
          urun_adi: parsed.urun_adi,
          lot_no: lotNo,
          kapak_boyutu: parsed.kapak_boyutu,
          son_kullanma_tarihi: parsed.son_kullanma_tarihi,
          arsivlendi: false,
        });

      if (movementError) {
        setMessage(
          `Stok eklendi ancak hareket kaydı yazılamadı: ${movementError.message}`
        );

        await loadStock();
        return;
      }
    }

    setBarcode('');
    setParsed(null);
    setActiveTab('mevcut');
    setActiveFilter('Tümü');
    setMessage('Kapak stoka eklendi.');

    await loadStock();
  }

  async function deleteStockItem(id: string) {
    if (!isAdmin) {
      alert('Bu işlemi sadece admin yapabilir.');
      return;
    }

    const confirmed = window.confirm(
      'Bu stok kaydı silinsin mi?'
    );

    if (!confirmed) {
      return;
    }

    const { error } = await supabase
      .from('kapak_stok')
      .delete()
      .eq('id', id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadStock();
  }

  function openCase(vakaId: string | null | undefined) {
    if (!vakaId) {
      setMessage('Bu kapak için bağlı vaka kaydı bulunamadı.');
      return;
    }

    navigate(`/view/${vakaId}`);
  }

  function kalanGun(date: string) {
    const expirationDate = parseDateOnly(date);

    if (!expirationDate) {
      return 0;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Math.ceil(
      (expirationDate.getTime() - today.getTime()) /
        (1000 * 60 * 60 * 24)
    );
  }

  function formatDate(date: string | null | undefined) {
    const parsedDate = parseDateOnly(date);

    return parsedDate
      ? parsedDate.toLocaleDateString('tr-TR')
      : '-';
  }

  function tabClass(tab: Tab) {
    return activeTab === tab
      ? 'border-cyan-400 bg-cyan-600 text-white'
      : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700';
  }

  function safeFileNamePart(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, '-').trim();
  }

  function exportStockToExcel() {
    if (visibleCount === 0 || exporting) {
      return;
    }

    setExporting(true);

    try {
      const rows =
        activeTab === 'mevcut'
          ? filteredStockItems.map((item, index) => ({
              No: index + 1,
              'Ürün Adı': item.urun_adi,
              'Kapak Boyutu': `${item.kapak_boyutu} mm`,
              'LOT No': item.lot_no,
              SKT: formatDate(item.son_kullanma_tarihi),
              'Kalan Gün': kalanGun(
                item.son_kullanma_tarihi
              ),
              Durum: 'Stokta',
            }))
          : filteredUsageItems.map((item, index) => ({
              No: index + 1,
              'Ürün Adı': item.urun_adi,
              'Kapak Boyutu': item.kapak_boyutu
                ? `${item.kapak_boyutu} mm`
                : '',
              'LOT No': item.lot_no,
              SKT: formatDate(item.son_kullanma_tarihi),
              'Kullanım Tarihi': formatDate(
                item.kullanim_tarihi
              ),
              Hasta: item.hasta_adi || '',
              Merkez: item.merkez_hastane || '',
              Doktor: item.doktor || '',
              Kaynak:
                item.source === 'valveflow'
                  ? 'ValveFlow'
                  : 'Eski Excel',
            }));

      const worksheet = XLSX.utils.json_to_sheet(rows);

      if (worksheet['!ref']) {
        worksheet['!autofilter'] = {
          ref: worksheet['!ref'],
        };
      }

      worksheet['!cols'] =
        activeTab === 'mevcut'
          ? [
              { wch: 8 },
              { wch: 22 },
              { wch: 16 },
              { wch: 18 },
              { wch: 14 },
              { wch: 14 },
              { wch: 14 },
            ]
          : [
              { wch: 8 },
              { wch: 22 },
              { wch: 16 },
              { wch: 18 },
              { wch: 14 },
              { wch: 18 },
              { wch: 24 },
              { wch: 34 },
              { wch: 28 },
              { wch: 16 },
            ];

      const workbook = XLSX.utils.book_new();

      const sheetName =
        activeTab === 'mevcut'
          ? 'Mevcut Stok'
          : activeTab === 'bu-ay'
            ? 'Bu Ay Kullanılanlar'
            : 'Geçmiş Kullanımlar';

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        sheetName
      );

      XLSX.writeFile(
        workbook,
        safeFileNamePart(
          `ValveFlow_${sheetName}_${new Date()
            .toISOString()
            .slice(0, 10)}.xlsx`
        ),
        { compression: true }
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5 overflow-y-auto pb-24">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white sm:text-2xl">
            Stok Takip
          </h1>

          <p className="mt-1 text-xs text-slate-400 sm:text-sm">
            Mevcut stokları, bu ay kullanılan kapakları ve
            geçmiş kayıtları yönetin.
          </p>
        </div>

        <button
          type="button"
          onClick={exportStockToExcel}
          disabled={
            loading || exporting || visibleCount === 0
          }
          className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {exporting
            ? 'Excel Hazırlanıyor...'
            : `${visibleCount} Kaydı Excel'e Aktar`}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => selectTab('mevcut')}
          className={`rounded-xl border p-3 text-left transition sm:p-4 ${tabClass(
            'mevcut'
          )}`}
        >
          <div className="text-[11px] opacity-80 sm:text-sm">
            Mevcut
          </div>

          <div className="mt-1 text-2xl font-bold sm:text-3xl">
            {mevcutItems.length}
          </div>
        </button>

        <button
          type="button"
          onClick={() => selectTab('bu-ay')}
          className={`rounded-xl border p-3 text-left transition sm:p-4 ${tabClass(
            'bu-ay'
          )}`}
        >
          <div className="text-[11px] opacity-80 sm:text-sm">
            Bu Ay
          </div>

          <div className="mt-1 text-2xl font-bold sm:text-3xl">
            {currentMonthItems.length}
          </div>
        </button>

        <button
          type="button"
          onClick={() => selectTab('gecmis')}
          className={`rounded-xl border p-3 text-left transition sm:p-4 ${tabClass(
            'gecmis'
          )}`}
        >
          <div className="text-[11px] opacity-80 sm:text-sm">
            Geçmiş
          </div>

          <div className="mt-1 text-2xl font-bold sm:text-3xl">
            {allHistoryItems.length}
          </div>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[23, 26, 29, 34].map(size => (
          <button
            key={size}
            type="button"
            onClick={() =>
              setActiveFilter(String(size) as typeof activeFilter)
            }
            className={`rounded-xl border p-3 text-left transition ${
              activeFilter === String(size)
                ? 'border-cyan-400 bg-cyan-600/20'
                : 'border-slate-700 bg-slate-800 hover:bg-slate-700'
            }`}
          >
            <div className="text-xs text-slate-400">
              {size} mm
            </div>

            <div className="mt-1 text-xl font-bold text-white">
              {sizeCounts[size as 23 | 26 | 29 | 34]}
            </div>
          </button>
        ))}
      </div>

      {activeTab === 'mevcut' && (
        <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-4">
          <div>
            <label
              htmlFor="stock-barcode"
              className="mb-2 block text-sm font-medium text-slate-300"
            >
              Kapak barkodu
            </label>

            <input
              id="stock-barcode"
              value={barcode}
              onChange={event =>
                setBarcode(event.target.value)
              }
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  parseBarcode();
                }
              }}
              placeholder="Barkod okut veya yapıştır"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-500"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={parseBarcode}
              className="rounded-lg bg-cyan-600 px-4 py-2.5 font-medium text-white transition hover:bg-cyan-500"
            >
              Çözümle
            </button>

            <button
              type="button"
              onClick={() => void addToStock()}
              disabled={!parsed}
              className="rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Stoka Ekle
            </button>
          </div>

          {parsed && (
            <div className="grid gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-xs text-slate-400">
                  Ürün
                </div>
                <div className="mt-1 font-semibold text-white">
                  {parsed.urun_adi}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400">
                  Boyut
                </div>
                <div className="mt-1 font-semibold text-white">
                  {parsed.kapak_boyutu} mm
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400">
                  LOT
                </div>
                <div className="mt-1 font-semibold text-white">
                  {parsed.lot_no}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400">
                  SKT
                </div>
                <div className="mt-1 font-semibold text-white">
                  {formatDate(parsed.son_kullanma_tarihi)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200">
          {message}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(filter => (
          <button
            key={filter}
            type="button"
            onClick={() => setActiveFilter(filter)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeFilter === filter
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {filter === 'Tümü'
              ? 'Tümü'
              : `${filter} mm`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-5 text-slate-400">
          Yükleniyor...
        </div>
      ) : activeTab === 'mevcut' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-700">
              <tr>
                <th className="p-3 text-left text-sm font-semibold text-slate-200">
                  ÜRÜN
                </th>

                <th className="p-3 text-left text-sm font-semibold text-slate-200">
                  BOYUT
                </th>

                <th className="p-3 text-left text-sm font-semibold text-slate-200">
                  LOT
                </th>

                <th className="p-3 text-left text-sm font-semibold text-slate-200">
                  SKT
                </th>

                <th className="p-3 text-left text-sm font-semibold text-slate-200">
                  KALAN GÜN
                </th>

                {isAdmin && (
                  <th className="p-3 text-left text-sm font-semibold text-slate-200">
                    İŞLEM
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {filteredStockItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 6 : 5}
                    className="p-8 text-center text-slate-400"
                  >
                    Bu filtreye uygun stok kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredStockItems.map(item => (
                  <tr
                    key={item.id}
                    className="border-t border-slate-700 transition hover:bg-slate-700/40"
                  >
                    <td className="p-3 text-slate-200">
                      {item.urun_adi}
                    </td>

                    <td className="p-3 font-semibold text-white">
                      {item.kapak_boyutu} mm
                    </td>

                    <td className="p-3 font-semibold text-cyan-300">
                      {item.lot_no}
                    </td>

                    <td className="p-3 text-slate-200">
                      {formatDate(
                        item.son_kullanma_tarihi
                      )}
                    </td>

                    <td className="p-3 text-slate-200">
                      {kalanGun(item.son_kullanma_tarihi)}
                    </td>

                    {isAdmin && (
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() =>
                            void deleteStockItem(item.id)
                          }
                          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/10 hover:text-red-200"
                        >
                          <Trash2 className="h-4 w-4" />
                          Sil
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
          <table className="w-full min-w-[1100px]">
            <thead className="bg-slate-700">
              <tr>
                <th className="p-3 text-left text-sm font-semibold text-slate-200">
                  ÜRÜN
                </th>

                <th className="p-3 text-left text-sm font-semibold text-slate-200">
                  BOYUT
                </th>

                <th className="p-3 text-left text-sm font-semibold text-slate-200">
                  LOT
                </th>

                <th className="p-3 text-left text-sm font-semibold text-slate-200">
                  SKT
                </th>

                <th className="p-3 text-left text-sm font-semibold text-slate-200">
                  KULLANIM TARİHİ
                </th>

                <th className="p-3 text-left text-sm font-semibold text-slate-200">
                  HASTA
                </th>

                <th className="p-3 text-left text-sm font-semibold text-slate-200">
                  MERKEZ
                </th>

                <th className="p-3 text-left text-sm font-semibold text-slate-200">
                  DOKTOR
                </th>

                <th className="p-3 text-left text-sm font-semibold text-slate-200">
                  KAYNAK
                </th>

                <th className="p-3 text-left text-sm font-semibold text-slate-200">
                  VAKA
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredUsageItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="p-8 text-center text-slate-400"
                  >
                    Bu filtreye uygun kullanım kaydı
                    bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredUsageItems.map(item => (
                  <tr
                    key={item.key}
                    className="border-t border-slate-700 transition hover:bg-slate-700/40"
                  >
                    <td className="p-3 text-slate-200">
                      {item.urun_adi}
                    </td>

                    <td className="p-3 font-semibold text-white">
                      {item.kapak_boyutu
                        ? `${item.kapak_boyutu} mm`
                        : '-'}
                    </td>

                    <td className="p-3 font-semibold text-cyan-300">
                      {item.lot_no || '-'}
                    </td>

                    <td className="p-3 text-slate-200">
                      {formatDate(
                        item.son_kullanma_tarihi
                      )}
                    </td>

                    <td className="p-3 text-slate-200">
                      {formatDate(item.kullanim_tarihi)}
                    </td>

                    <td className="p-3 text-slate-200">
                      {item.hasta_adi || '-'}
                    </td>

                    <td className="p-3 text-slate-200">
                      {item.merkez_hastane || '-'}
                    </td>

                    <td className="p-3 text-slate-200">
                      {item.doktor || '-'}
                    </td>

                    <td className="p-3">
                      {item.source === 'valveflow' ? (
                        <span className="inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-300">
                          ValveFlow
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
                          Eski Kayıt
                        </span>
                      )}
                    </td>

                    <td className="p-3">
                      {item.caseId ? (
                        <button
                          type="button"
                          onClick={() =>
                            openCase(item.caseId)
                          }
                          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/10 hover:text-cyan-200"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Vakayı Aç
                        </button>
                      ) : (
                        <span className="text-sm text-slate-500">
                          Eski kayıt
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
