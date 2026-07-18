import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as XLSX from 'xlsx';
import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  RotateCcw,
  SearchX,
  Trash2,
  X,
} from 'lucide-react';
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

type AuditResult = {
  status: 'found' | 'not-found';
  lotNo: string;
  size: number;
  stockItemId?: string;
};

type AuditEntry = {
  key: string;
  status: 'found' | 'not-found';
  lotNo: string;
  size: number;
  productName: string;
  expirationDate: string;
  stockItemId?: string;
  scannedAt: string;
  scanCount: number;
};

const GTIN_MAP: Record<string, number> = {
  '00763000655419': 23,
  '00763000655426': 26,
  '00763000655433': 29,
  '00763000655440': 34,
};

const FILTERS = ['Tümü', '23', '26', '29', '34'] as const;

/**
 * ValveFlow LOT standardı:
 *
 * R123456(20)01  -> R123456
 * R1234562001    -> R123456
 * R123456        -> R123456
 *
 * Yalnızca değerin SONUNDA bulunan üretici ekini temizler.
 */
function normalizeLot(value: string) {
  return value
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/\(20\)01$/i, '')
    .replace(/2001$/i, '');
}

function cleanBarcode(value: string) {
  return value
    .trim()
    .replace(/\s/g, '')
    .replace(/\u001D/g, '');
}

function extractLotFromRaw(rawValue: string) {
  const raw = cleanBarcode(rawValue);

  /*
   * Parantezli GS1 örneği:
   * (01)00763000655433(17)271020(21)R123456(20)01
   */
  const parenthesizedSerialMatch = raw.match(
    /\(21\)(.*?)(?=\(\d{2}\)|$)/
  );

  if (parenthesizedSerialMatch?.[1]) {
    return normalizeLot(parenthesizedSerialMatch[1]);
  }

  /*
   * Bazı okuyucular üretici ekini seri alanının devamında verir:
   * (21)R123456(20)01
   *
   * Yukarıdaki regex yalnızca R123456 kısmını alır.
   */

  /*
   * Kompakt GS1 örneği:
   * 01007630006554331727102021R1234562001
   *
   * 01 + 14 hane GTIN
   * 17 + 6 hane SKT
   * 21 + LOT/seri
   */
  const compactGs1Match = raw.match(
    /^01\d{14}17\d{6}21(.+)$/
  );

  if (compactGs1Match?.[1]) {
    return normalizeLot(compactGs1Match[1]);
  }

  /*
   * Barkodun başında başka veri bulunması ihtimaline karşı
   * daha esnek kompakt arama.
   */
  const flexibleCompactMatch = raw.match(
    /01\d{14}17\d{6}21(.+)$/
  );

  if (flexibleCompactMatch?.[1]) {
    return normalizeLot(flexibleCompactMatch[1]);
  }

  /*
   * Son çare:
   * En sondaki 21 AI alanından sonraki harfle başlayan değeri al.
   */
  const fallbackMatch = raw.match(
    /21([A-Za-z][A-Za-z0-9]*(?:\(20\)01|2001)?)$/
  );

  if (fallbackMatch?.[1]) {
    return normalizeLot(fallbackMatch[1]);
  }

  return '';
}

function extractGtinAndSkt(rawValue: string) {
  const raw = cleanBarcode(rawValue);

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
    const compactMatch = raw.match(
      /01(\d{14})17(\d{6})/
    );

    if (compactMatch) {
      gtin = compactMatch[1];
      skt = compactMatch[2];
    }
  }

  return { gtin, skt };
}

function parseDateOnly(
  value: string | null | undefined
) {
  if (!value) {
    return null;
  }

  const datePart = value.split('T')[0];
  const [year, month, day] = datePart
    .split('-')
    .map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);

  return date;
}

function isCurrentMonth(
  value: string | null | undefined
) {
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

function isBeforeCurrentMonth(
  value: string | null | undefined
) {
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

  return (
    date.getTime() <
    firstDayOfCurrentMonth.getTime()
  );
}

function parseValveSize(
  value: string | null | undefined
) {
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

  const highlightedRowRef =
    useRef<HTMLTableRowElement | null>(null);

  const barcodeInputRef =
    useRef<HTMLInputElement | null>(null);

  const [items, setItems] = useState<StockItem[]>(
    []
  );

  const [cases, setCases] = useState<CaseInfo[]>(
    []
  );

  const [
    historicalItems,
    setHistoricalItems,
  ] = useState<HistoricalItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [barcode, setBarcode] = useState('');
  const [parsed, setParsed] =
    useState<ParsedBarcode | null>(null);

  const [message, setMessage] = useState('');
  const [exporting, setExporting] =
    useState(false);

  const [activeTab, setActiveTab] =
    useState<Tab>('mevcut');

  const [activeFilter, setActiveFilter] =
    useState<(typeof FILTERS)[number]>('Tümü');

  const [auditResult, setAuditResult] =
    useState<AuditResult | null>(null);

  const [auditEntries, setAuditEntries] =
    useState<AuditEntry[]>(() => {
      try {
        const stored = window.sessionStorage.getItem(
          'valveflow-stock-audit'
        );

        return stored
          ? (JSON.parse(stored) as AuditEntry[])
          : [];
      } catch {
        return [];
      }
    });

  useEffect(() => {
    void loadStock();
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        'valveflow-stock-audit',
        JSON.stringify(auditEntries)
      );
    } catch {
      // Tarayıcı depolaması kapalıysa denetim listesi
      // yalnızca mevcut sayfa oturumu boyunca tutulur.
    }
  }, [auditEntries]);

  useEffect(() => {
    if (
      auditResult?.status !== 'found' ||
      !auditResult.stockItemId
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      highlightedRowRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 150);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    auditResult,
    activeTab,
    activeFilter,
  ]);

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
        .order('vaka_tarihi', {
          ascending: false,
        }),

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
        .order('kullanim_tarihi', {
          ascending: false,
        }),
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

    setItems(
      (stockResponse.data as StockItem[]) || []
    );

    setCases(
      (casesResponse.data as CaseInfo[]) || []
    );

    setHistoricalItems(
      (historicalResponse.data as HistoricalItem[]) ||
        []
    );

    setLoading(false);
  }

  const mevcutItems = useMemo(
    () =>
      items.filter(
        item => item.durum === 'stokta'
      ),
    [items]
  );

  const valveFlowUsageRows =
    useMemo<UsageRow[]>(
      () =>
        cases.map(item => {
          const valveSize = parseValveSize(
            item.kapak_size
          );

          return {
            key: `valveflow-${item.id}`,
            source: 'valveflow',
            caseId: item.id,
            urun_adi: buildValveProductName(
              item.kapak_tipi,
              valveSize
            ),
            kapak_boyutu: valveSize,
            lot_no: normalizeLot(
              item.lot_no || ''
            ),
            son_kullanma_tarihi:
              item.son_kul_tarihi,
            kullanim_tarihi:
              item.vaka_tarihi,
            hasta_adi: item.hasta_adi,
            merkez_hastane:
              item.merkez_hastane,
            doktor: item.doktor,
          };
        }),
      [cases]
    );

  const currentMonthItems = useMemo(
    () =>
      valveFlowUsageRows
        .filter(item =>
          isCurrentMonth(
            item.kullanim_tarihi
          )
        )
        .sort((a, b) => {
          const first =
            parseDateOnly(
              a.kullanim_tarihi
            )?.getTime() || 0;

          const second =
            parseDateOnly(
              b.kullanim_tarihi
            )?.getTime() || 0;

          return second - first;
        }),
    [valveFlowUsageRows]
  );

  const previousValveFlowHistory =
    useMemo(
      () =>
        valveFlowUsageRows.filter(item =>
          isBeforeCurrentMonth(
            item.kullanim_tarihi
          )
        ),
      [valveFlowUsageRows]
    );

  const importedHistory =
    useMemo<UsageRow[]>(
      () =>
        historicalItems.map(item => ({
          key: `eski-excel-${item.id}`,
          source: 'eski_excel',
          caseId: null,
          urun_adi: item.urun_adi,
          kapak_boyutu:
            item.kapak_boyutu,
          lot_no: normalizeLot(
            item.lot_no
          ),
          son_kullanma_tarihi:
            item.son_kullanma_tarihi,
          kullanim_tarihi:
            item.kullanim_tarihi,
          hasta_adi: item.hasta_adi,
          merkez_hastane:
            item.merkez_hastane,
          doktor: item.doktor,
        })),
      [historicalItems]
    );

  const allHistoryItems = useMemo(
    () =>
      [
        ...previousValveFlowHistory,
        ...importedHistory,
      ].sort((a, b) => {
        const first =
          parseDateOnly(
            a.kullanim_tarihi
          )?.getTime() || 0;

        const second =
          parseDateOnly(
            b.kullanim_tarihi
          )?.getTime() || 0;

        return second - first;
      }),
    [
      previousValveFlowHistory,
      importedHistory,
    ]
  );

  const filteredStockItems = useMemo(() => {
    if (activeFilter === 'Tümü') {
      return mevcutItems;
    }

    return mevcutItems.filter(
      item =>
        item.kapak_boyutu ===
        Number(activeFilter)
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
  }, [
    activeTab,
    currentMonthItems,
    allHistoryItems,
  ]);

  const filteredUsageItems = useMemo(() => {
    if (activeFilter === 'Tümü') {
      return activeUsageItems;
    }

    return activeUsageItems.filter(
      item =>
        item.kapak_boyutu ===
        Number(activeFilter)
    );
  }, [activeUsageItems, activeFilter]);

  const visibleCount =
    activeTab === 'mevcut'
      ? filteredStockItems.length
      : filteredUsageItems.length;

  const sizeSource =
    activeTab === 'mevcut'
      ? mevcutItems
      : activeUsageItems;

  const sizeCounts = {
    23: sizeSource.filter(
      item => item.kapak_boyutu === 23
    ).length,

    26: sizeSource.filter(
      item => item.kapak_boyutu === 26
    ).length,

    29: sizeSource.filter(
      item => item.kapak_boyutu === 29
    ).length,

    34: sizeSource.filter(
      item => item.kapak_boyutu === 34
    ).length,
  };

  const auditFoundCount = useMemo(
    () =>
      auditEntries.filter(
        entry => entry.status === 'found'
      ).length,
    [auditEntries]
  );

  const auditMissingCount = useMemo(
    () =>
      auditEntries.filter(
        entry => entry.status === 'not-found'
      ).length,
    [auditEntries]
  );

  const auditedFoundStockIds = useMemo(
    () =>
      new Set(
        auditEntries
          .filter(
            entry =>
              entry.status === 'found' &&
              entry.stockItemId
          )
          .map(entry => entry.stockItemId as string)
      ),
    [auditEntries]
  );

  function addOrUpdateAuditEntry(
    parsedBarcode: ParsedBarcode,
    result: AuditResult
  ) {
    const key = `${normalizeLot(
      parsedBarcode.lot_no
    )}-${parsedBarcode.kapak_boyutu}`;

    const nextEntry: AuditEntry = {
      key,
      status: result.status,
      lotNo: normalizeLot(parsedBarcode.lot_no),
      size: parsedBarcode.kapak_boyutu,
      productName: parsedBarcode.urun_adi,
      expirationDate:
        parsedBarcode.son_kullanma_tarihi,
      stockItemId: result.stockItemId,
      scannedAt: new Date().toISOString(),
      scanCount: 1,
    };

    setAuditEntries(previous => {
      const existing = previous.find(
        entry => entry.key === key
      );

      if (!existing) {
        return [nextEntry, ...previous];
      }

      return [
        {
          ...existing,
          ...nextEntry,
          scanCount: existing.scanCount + 1,
        },
        ...previous.filter(
          entry => entry.key !== key
        ),
      ];
    });
  }

  function clearAuditList() {
    if (auditEntries.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      'Kapak denetim listesi temizlensin mi?'
    );

    if (!confirmed) {
      return;
    }

    setAuditEntries([]);
    setAuditResult(null);
    setMessage('');
    window.sessionStorage.removeItem(
      'valveflow-stock-audit'
    );
  }

  function removeAuditEntry(key: string) {
    setAuditEntries(previous =>
      previous.filter(entry => entry.key !== key)
    );
  }

  function selectTab(tab: Tab) {
    setActiveTab(tab);
    setActiveFilter('Tümü');
    setMessage('');
    setAuditResult(null);
  }

  function runStockAudit(
    parsedBarcode: ParsedBarcode
  ) {
    const targetLot = normalizeLot(
      parsedBarcode.lot_no
    );

    const matchingStock =
      mevcutItems.find(
        item =>
          normalizeLot(item.lot_no) ===
            targetLot &&
          Number(item.kapak_boyutu) ===
            Number(
              parsedBarcode.kapak_boyutu
            )
      ) || null;

    setActiveTab('mevcut');

    setActiveFilter(
      String(
        parsedBarcode.kapak_boyutu
      ) as (typeof FILTERS)[number]
    );

    if (matchingStock) {
      const result: AuditResult = {
        status: 'found',
        lotNo: targetLot,
        size:
          parsedBarcode.kapak_boyutu,
        stockItemId: matchingStock.id,
      };

      setAuditResult(result);
      addOrUpdateAuditEntry(parsedBarcode, result);

      setMessage(
        `${targetLot} LOT numaralı ${parsedBarcode.kapak_boyutu} mm kapak mevcut stokta bulundu.`
      );

      return;
    }

    const result: AuditResult = {
      status: 'not-found',
      lotNo: targetLot,
      size:
        parsedBarcode.kapak_boyutu,
    };

    setAuditResult(result);
    addOrUpdateAuditEntry(parsedBarcode, result);

    setMessage(
      `${targetLot} LOT numaralı ${parsedBarcode.kapak_boyutu} mm kapak mevcut stokta bulunamadı.`
    );
  }

  function parseBarcode() {
    setMessage('');
    setParsed(null);

    const raw = cleanBarcode(barcode);

    if (!raw) {
      setMessage('Barkod alanı boş.');
      return;
    }

    const { gtin, skt } =
      extractGtinAndSkt(raw);

    const lot = extractLotFromRaw(raw);

    if (!gtin) {
      setMessage(
        'GTIN / UBB bulunamadı.'
      );
      return;
    }

    if (!skt) {
      setMessage(
        'Son kullanma tarihi bulunamadı.'
      );
      return;
    }

    if (!lot) {
      setMessage(
        'LOT numarası bulunamadı.'
      );
      return;
    }

    const kapakBoyutu =
      GTIN_MAP[gtin];

    if (!kapakBoyutu) {
      setMessage(
        `Tanımsız GTIN: ${gtin}`
      );
      return;
    }

    const parsedBarcode: ParsedBarcode = {
      gtin,
      urun_adi: `EVPROPLUS-${kapakBoyutu}`,
      kapak_boyutu: kapakBoyutu,
      lot_no: normalizeLot(lot),
      son_kullanma_tarihi: `20${skt.slice(
        0,
        2
      )}-${skt.slice(
        2,
        4
      )}-${skt.slice(4, 6)}`,
      barkod_raw: raw,
    };

    setParsed(parsedBarcode);
    runStockAudit(parsedBarcode);
    setBarcode('');

    window.setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 0);
  }

  async function addToStock() {
    if (!parsed) {
      setMessage(
        'Önce barkodu çözümle.'
      );
      return;
    }

    const lotNo = normalizeLot(
      parsed.lot_no
    );

    const existingStock =
      mevcutItems.find(
        item =>
          normalizeLot(item.lot_no) ===
            lotNo &&
          Number(item.kapak_boyutu) ===
            Number(
              parsed.kapak_boyutu
            )
      );

    if (existingStock) {
      const result: AuditResult = {
        status: 'found',
        lotNo,
        size:
          parsed.kapak_boyutu,
        stockItemId: existingStock.id,
      };

      setAuditResult(result);
      addOrUpdateAuditEntry(parsed, result);

      setMessage(
        `${lotNo} LOT numaralı kapak zaten mevcut stokta. Tekrar eklenmedi.`
      );

      setActiveTab('mevcut');

      setActiveFilter(
        String(
          parsed.kapak_boyutu
        ) as (typeof FILTERS)[number]
      );

      return;
    }

    const { data, error } =
      await supabase
        .from('kapak_stok')
        .insert({
          urun_adi:
            parsed.urun_adi,
          gtin: parsed.gtin,
          kapak_adi:
            'EVPROPLUS',
          kapak_boyutu:
            parsed.kapak_boyutu,
          lot_no: lotNo,
          son_kullanma_tarihi:
            parsed.son_kullanma_tarihi,
          barkod_raw:
            parsed.barkod_raw,
          durum: 'stokta',
        })
        .select('id')
        .single();

    if (error) {
      setMessage(
        `Stoka eklenemedi: ${error.message}`
      );
      return;
    }

    if (data?.id) {
      const {
        error: movementError,
      } = await supabase
        .from('stok_hareketleri')
        .insert({
          kapak_stok_id: data.id,
          islem: 'giris',
          urun_adi:
            parsed.urun_adi,
          lot_no: lotNo,
          kapak_boyutu:
            parsed.kapak_boyutu,
          son_kullanma_tarihi:
            parsed.son_kullanma_tarihi,
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

    const insertedResult: AuditResult = {
      status: 'found',
      lotNo,
      size: parsed.kapak_boyutu,
      stockItemId: data?.id,
    };

    setBarcode('');
    setAuditResult(insertedResult);
    addOrUpdateAuditEntry(parsed, insertedResult);
    setParsed(null);
    setActiveTab('mevcut');
    setActiveFilter(
      String(
        parsed.kapak_boyutu
      ) as (typeof FILTERS)[number]
    );

    setMessage(
      `${lotNo} LOT numaralı kapak stoka eklendi ve denetim listesinde bulundu olarak işaretlendi.`
    );

    await loadStock();

    window.setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 0);
  }

  async function deleteStockItem(
    id: string
  ) {
    if (!isAdmin) {
      alert(
        'Bu işlemi sadece admin yapabilir.'
      );
      return;
    }

    const confirmed =
      window.confirm(
        'Bu stok kaydı silinsin mi?'
      );

    if (!confirmed) {
      return;
    }

    const { error } =
      await supabase
        .from('kapak_stok')
        .delete()
        .eq('id', id);

    if (error) {
      alert(error.message);
      return;
    }

    if (
      auditResult?.stockItemId === id
    ) {
      setAuditResult(null);
    }

    await loadStock();
  }

  function openCase(
    vakaId: string | null | undefined
  ) {
    if (!vakaId) {
      setMessage(
        'Bu kapak için bağlı vaka kaydı bulunamadı.'
      );
      return;
    }

    navigate(`/view/${vakaId}`);
  }

  function kalanGun(date: string) {
    const expirationDate =
      parseDateOnly(date);

    if (!expirationDate) {
      return 0;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Math.ceil(
      (expirationDate.getTime() -
        today.getTime()) /
        (1000 * 60 * 60 * 24)
    );
  }

  function formatDate(
    date: string | null | undefined
  ) {
    const parsedDate =
      parseDateOnly(date);

    return parsedDate
      ? parsedDate.toLocaleDateString(
          'tr-TR'
        )
      : '-';
  }

  function tabClass(tab: Tab) {
    return activeTab === tab
      ? 'border-white/10 bg-white/[0.08] text-white shadow-sm'
      : 'border-transparent bg-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-200';
  }

  function safeFileNamePart(
    value: string
  ) {
    return value
      .replace(/[\\/:*?"<>|]/g, '-')
      .trim();
  }

  function exportStockToExcel() {
    if (
      visibleCount === 0 ||
      exporting
    ) {
      return;
    }

    setExporting(true);

    try {
      const rows =
        activeTab === 'mevcut'
          ? filteredStockItems.map(
              (item, index) => ({
                No: index + 1,
                'Ürün Adı':
                  item.urun_adi,
                'Kapak Boyutu': `${item.kapak_boyutu} mm`,
                'LOT No':
                  normalizeLot(
                    item.lot_no
                  ),
                SKT: formatDate(
                  item.son_kullanma_tarihi
                ),
                'Kalan Gün':
                  kalanGun(
                    item.son_kullanma_tarihi
                  ),
                Durum: 'Stokta',
              })
            )
          : filteredUsageItems.map(
              (item, index) => ({
                No: index + 1,
                'Ürün Adı':
                  item.urun_adi,
                'Kapak Boyutu':
                  item.kapak_boyutu
                    ? `${item.kapak_boyutu} mm`
                    : '',
                'LOT No':
                  normalizeLot(
                    item.lot_no
                  ),
                SKT: formatDate(
                  item.son_kullanma_tarihi
                ),
                'Kullanım Tarihi':
                  formatDate(
                    item.kullanim_tarihi
                  ),
                Hasta:
                  item.hasta_adi || '',
                Merkez:
                  item.merkez_hastane ||
                  '',
                Doktor:
                  item.doktor || '',
                Kaynak:
                  item.source ===
                  'valveflow'
                    ? 'ValveFlow'
                    : 'Eski Excel',
              })
            );

      const worksheet =
        XLSX.utils.json_to_sheet(rows);

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

      const workbook =
        XLSX.utils.book_new();

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
    <div className="mx-auto max-w-[1600px] space-y-4 pb-24">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white sm:text-2xl">
            Stok Takip
          </h1>

          <p className="mt-1 text-xs text-slate-400 sm:text-sm">
            Barkodla stok denetimi yapın,
            mevcut stokları ve kullanım
            geçmişini yönetin.
          </p>
        </div>

        <button
          type="button"
          onClick={exportStockToExcel}
          disabled={
            loading ||
            exporting ||
            visibleCount === 0
          }
          className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {exporting
            ? 'Excel Hazırlanıyor...'
            : `${visibleCount} Kaydı Excel'e Aktar`}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.08] bg-slate-900/50 p-1">
        <button
          type="button"
          onClick={() =>
            selectTab('mevcut')
          }
          className={`rounded-lg border px-2.5 py-2 text-left transition sm:px-4 ${tabClass(
            'mevcut'
          )}`}
        >
          <div className="text-[11px] opacity-80 sm:text-sm">
            Mevcut
          </div>

          <div className="mt-0.5 text-lg font-semibold sm:text-xl">
            {mevcutItems.length}
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            selectTab('bu-ay')
          }
          className={`rounded-lg border px-2.5 py-2 text-left transition sm:px-4 ${tabClass(
            'bu-ay'
          )}`}
        >
          <div className="text-[11px] opacity-80 sm:text-sm">
            Bu Ay
          </div>

          <div className="mt-0.5 text-lg font-semibold sm:text-xl">
            {currentMonthItems.length}
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            selectTab('gecmis')
          }
          className={`rounded-lg border px-2.5 py-2 text-left transition sm:px-4 ${tabClass(
            'gecmis'
          )}`}
        >
          <div className="text-[11px] opacity-80 sm:text-sm">
            Geçmiş
          </div>

          <div className="mt-0.5 text-lg font-semibold sm:text-xl">
            {allHistoryItems.length}
          </div>
        </button>
      </div>

      <div className="hidden">
        {[23, 26, 29, 34].map(
          size => (
            <button
              key={size}
              type="button"
              onClick={() =>
                setActiveFilter(
                  String(
                    size
                  ) as typeof activeFilter
                )
              }
              className={`rounded-xl border p-3 text-left transition ${
                activeFilter ===
                String(size)
                  ? 'border-cyan-400 bg-cyan-600/20'
                  : 'border-slate-700 bg-slate-800 hover:bg-slate-700'
              }`}
            >
              <div className="text-xs text-slate-400">
                {size} mm
              </div>

              <div className="mt-1 text-xl font-bold text-white">
                {
                  sizeCounts[
                    size as
                      | 23
                      | 26
                      | 29
                      | 34
                  ]
                }
              </div>
            </button>
          )
        )}
      </div>

      {activeTab === 'mevcut' && (
        <div className="space-y-4 rounded-xl border border-white/[0.08] bg-slate-900/50 p-3.5 shadow-xl shadow-black/10 sm:p-5">
          <div>
            <label
              htmlFor="stock-barcode"
              className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400"
            >
              Kapak barkodu
            </label>

            <input
              ref={barcodeInputRef}
              id="stock-barcode"
              value={barcode}
              onChange={event => {
                setBarcode(
                  event.target.value
                );
              }}
              onKeyDown={event => {
                if (
                  event.key === 'Enter'
                ) {
                  event.preventDefault();
                  parseBarcode();
                }
              }}
              placeholder="Barkod okut veya yapıştır"
              autoFocus
              autoComplete="off"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-base font-medium text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-500/10 sm:text-lg"
            />
            <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400/80">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Otomatik okuma aktif
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={parseBarcode}
              className="rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-cyan-500"
            >
              Çözümle ve Denetle
            </button>

            <button
              type="button"
              onClick={() =>
                void addToStock()
              }
              disabled={
                !parsed ||
                auditResult?.status ===
                  'found'
              }
              className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Stoka Ekle
            </button>
          </div>

          {parsed && (
            <div className="grid gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 sm:grid-cols-2 lg:grid-cols-4">
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
                  {parsed.kapak_boyutu}{' '}
                  mm
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
                  {formatDate(
                    parsed.son_kullanma_tarihi
                  )}
                </div>
              </div>
            </div>
          )}

          {auditResult && (
            <div
              className={`rounded-xl border p-4 ${
                auditResult.status ===
                'found'
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-amber-500/40 bg-amber-500/10'
              }`}
            >
              <div className="flex items-start gap-3">
                {auditResult.status ===
                'found' ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                ) : (
                  <SearchX className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                )}

                <div>
                  <p
                    className={`font-bold ${
                      auditResult.status ===
                      'found'
                        ? 'text-emerald-200'
                        : 'text-amber-200'
                    }`}
                  >
                    {auditResult.status ===
                    'found'
                      ? 'Mevcut stokta bulundu'
                      : 'Mevcut stokta bulunamadı'}
                  </p>

                  <p className="mt-1 text-sm text-slate-300">
                    LOT:{' '}
                    <strong>
                      {
                        auditResult.lotNo
                      }
                    </strong>{' '}
                    •{' '}
                    {
                      auditResult.size
                    }{' '}
                    mm
                  </p>

                  {auditResult.status ===
                    'not-found' && (
                    <p className="mt-2 text-xs text-amber-100/70">
                      Fiziksel denetimde
                      elinizde olan bu kapak
                      sistemde görünmüyorsa
                      Stoka Ekle butonunu
                      kullanabilirsiniz.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-white/[0.08] pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-cyan-300" />

                  <h3 className="font-bold text-white">
                    Kapak Denetimi
                  </h3>
                </div>

                <p className="mt-1 text-xs text-slate-400">
                  Yeni barkod okutulduğunda önceki sonuçlar kaybolmaz.
                </p>
              </div>

              <button
                type="button"
                onClick={clearAuditList}
                disabled={auditEntries.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-red-500/50 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" />
                Denetimi Temizle
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-black/20 px-3 py-2.5 text-center text-xs sm:flex sm:items-center sm:gap-6 sm:text-left sm:text-sm">
              <p className="text-slate-400">Okutulan <strong className="ml-1 text-white">{auditEntries.length}</strong></p>
              <p className="text-slate-400">Bulunan <strong className="ml-1 text-emerald-400">{auditFoundCount}</strong></p>
              <p className="text-slate-400">Eksik <strong className="ml-1 text-amber-400">{auditMissingCount}</strong></p>
            </div>

            {auditEntries.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-700 p-5 text-center text-sm text-slate-500">
                Henüz kapak okutulmadı.
              </div>
            ) : (
              <div className="mt-3 max-h-[360px] divide-y divide-white/[0.06] overflow-y-auto">
                {auditEntries.map(entry => (
                  <div
                    key={entry.key}
                    className={`px-1 py-3 transition ${
                      entry.status === 'found'
                        ? 'hover:bg-emerald-500/[0.04]'
                        : 'hover:bg-amber-500/[0.04]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            entry.status === 'found'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {entry.status === 'found' ? '✓' : '×'}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-white">
                              {entry.lotNo}
                            </p>

                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                entry.status === 'found'
                                  ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200'
                                  : 'border-amber-400/40 bg-amber-500/20 text-amber-200'
                              }`}
                            >
                              {entry.status === 'found'
                                ? 'BULUNDU'
                                : 'BULUNAMADI'}
                            </span>

                            {entry.scanCount > 1 && (
                              <span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                                {entry.scanCount} kez okutuldu
                              </span>
                            )}
                          </div>

                          <p className="mt-1 text-xs text-slate-400">
                            {entry.size} mm • SKT {formatDate(entry.expirationDate)}
                          </p>

                          <p className="mt-1 text-[11px] text-slate-500">
                            Son okutma:{' '}
                            {new Date(entry.scannedAt).toLocaleTimeString(
                              'tr-TR',
                              {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              }
                            )}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeAuditEntry(entry.key)}
                        className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-red-300"
                        aria-label={`${entry.lotNo} denetim kaydını kaldır`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {message && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            auditResult?.status ===
            'found'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
              : auditResult?.status ===
                  'not-found'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                : 'border-slate-700 bg-slate-800 text-slate-200'
          }`}
        >
          {message}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map(filter => (
          <button
            key={filter}
            type="button"
            onClick={() => {
              setActiveFilter(filter);
              setAuditResult(null);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              activeFilter === filter
                ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
                : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:bg-white/[0.07] hover:text-slate-200'
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
        <>
        <div className="space-y-2.5 md:hidden">
          {filteredStockItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800/60 p-6 text-center text-sm text-slate-400">
              Bu filtreye uygun stok kaydı bulunamadı.
            </div>
          ) : filteredStockItems.map(item => {
            const isHighlighted =
              auditResult?.status === 'found' &&
              auditResult.stockItemId === item.id;
            const isAuditedFound = auditedFoundStockIds.has(item.id);

            return (
              <article
                key={item.id}
                ref={isHighlighted ? highlightedRowRef : null}
                className={`rounded-xl border p-3.5 transition ${
                  isHighlighted
                    ? 'border-emerald-400 bg-emerald-500/15 ring-1 ring-emerald-400/60'
                    : isAuditedFound
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : 'border-slate-700 bg-slate-800/70'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="break-words text-sm font-semibold text-slate-100">
                        {item.urun_adi}
                      </h2>
                      {isAuditedFound && (
                        <span className="rounded-md border border-emerald-400/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                          {isHighlighted ? 'SON BULUNAN' : 'DENETLENDİ'}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-xs font-semibold text-cyan-300">
                      {normalizeLot(item.lot_no)}
                    </p>
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => void deleteStockItem(item.id)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-red-300 hover:bg-red-500/10"
                      aria-label={`${normalizeLot(item.lot_no)} stok kaydını sil`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-700/70 pt-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Boyut</p>
                    <p className="mt-1 text-xs font-semibold text-white">{item.kapak_boyutu} mm</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">SKT</p>
                    <p className="mt-1 text-xs text-slate-300">{formatDate(item.son_kullanma_tarihi)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Kalan</p>
                    <p className="mt-1 text-xs text-slate-300">{kalanGun(item.son_kullanma_tarihi)} gün</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="hidden overflow-hidden rounded-xl border border-slate-700 bg-slate-800 md:block">
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
              {filteredStockItems.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={
                      isAdmin ? 6 : 5
                    }
                    className="p-8 text-center text-slate-400"
                  >
                    Bu filtreye uygun stok
                    kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredStockItems.map(
                  item => {
                    const isHighlighted =
                      auditResult?.status ===
                        'found' &&
                      auditResult.stockItemId ===
                        item.id;

                    const isAuditedFound =
                      auditedFoundStockIds.has(item.id);

                    return (
                      <tr
                        key={item.id}
                        ref={
                          isHighlighted
                            ? highlightedRowRef
                            : null
                        }
                        className={`border-t transition ${
                          isHighlighted
                            ? 'border-emerald-400 bg-emerald-500/20 ring-2 ring-inset ring-emerald-400/70'
                            : isAuditedFound
                              ? 'border-emerald-500/40 bg-emerald-500/10'
                              : 'border-slate-700 hover:bg-slate-700/40'
                        }`}
                      >
                        <td className="p-3 text-slate-200">
                          <div className="flex items-center gap-2">
                            {
                              item.urun_adi
                            }

                            {isAuditedFound && (
                              <span className="rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                                {isHighlighted
                                  ? 'SON BULUNAN'
                                  : 'DENETLENDİ'}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="p-3 font-semibold text-white">
                          {
                            item.kapak_boyutu
                          }{' '}
                          mm
                        </td>

                        <td className="p-3 font-mono text-xs font-semibold text-cyan-300">
                          {normalizeLot(
                            item.lot_no
                          )}
                        </td>

                        <td className="p-3 text-slate-200">
                          {formatDate(
                            item.son_kullanma_tarihi
                          )}
                        </td>

                        <td className="p-3 text-slate-200">
                          {kalanGun(
                            item.son_kullanma_tarihi
                          )}
                        </td>

                        {isAdmin && (
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() =>
                                void deleteStockItem(
                                  item.id
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/10 hover:text-red-200"
                            >
                              <Trash2 className="h-4 w-4" />
                              Sil
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  }
                )
              )}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <>
        <div className="space-y-2.5 md:hidden">
          {filteredUsageItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800/60 p-6 text-center text-sm text-slate-400">
              Bu filtreye uygun kullanım kaydı bulunamadı.
            </div>
          ) : filteredUsageItems.map(item => (
            <article key={item.key} className="rounded-xl border border-slate-700 bg-slate-800/70 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-words text-sm font-semibold text-slate-100">{item.urun_adi}</h2>
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                      item.source === 'valveflow'
                        ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    }`}>
                      {item.source === 'valveflow' ? 'ValveFlow' : 'Eski Kayıt'}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs font-semibold text-cyan-300">
                    {item.lot_no ? normalizeLot(item.lot_no) : '-'}
                  </p>
                </div>

                {item.caseId && (
                  <button
                    type="button"
                    onClick={() => openCase(item.caseId)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-cyan-300 hover:bg-cyan-500/10"
                    aria-label="İlgili vakayı aç"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-700/70 pt-3 text-xs">
                <div><span className="text-slate-500">Boyut:</span> <span className="text-slate-300">{item.kapak_boyutu ? `${item.kapak_boyutu} mm` : '-'}</span></div>
                <div><span className="text-slate-500">Kullanım:</span> <span className="text-slate-300">{formatDate(item.kullanim_tarihi)}</span></div>
                <div className="min-w-0"><span className="text-slate-500">Hasta:</span> <span className="break-words text-slate-300">{item.hasta_adi || '-'}</span></div>
                <div className="min-w-0"><span className="text-slate-500">Doktor:</span> <span className="break-words text-slate-300">{item.doktor || '-'}</span></div>
                <div className="col-span-2 min-w-0"><span className="text-slate-500">Merkez:</span> <span className="break-words text-slate-300">{item.merkez_hastane || '-'}</span></div>
              </div>
            </article>
          ))}
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-slate-700 bg-slate-800 md:block">
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
              {filteredUsageItems.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="p-8 text-center text-slate-400"
                  >
                    Bu filtreye uygun kullanım
                    kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredUsageItems.map(
                  item => (
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

                      <td className="p-3 font-mono text-xs font-semibold text-cyan-300">
                        {item.lot_no
                          ? normalizeLot(
                              item.lot_no
                            )
                          : '-'}
                      </td>

                      <td className="p-3 text-slate-200">
                        {formatDate(
                          item.son_kullanma_tarihi
                        )}
                      </td>

                      <td className="p-3 text-slate-200">
                        {formatDate(
                          item.kullanim_tarihi
                        )}
                      </td>

                      <td className="p-3 text-slate-200">
                        {item.hasta_adi ||
                          '-'}
                      </td>

                      <td className="p-3 text-slate-200">
                        {item.merkez_hastane ||
                          '-'}
                      </td>

                      <td className="p-3 text-slate-200">
                        {item.doktor || '-'}
                      </td>

                      <td className="p-3">
                        {item.source ===
                        'valveflow' ? (
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
                              openCase(
                                item.caseId
                              )
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
                  )
                )
              )}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
