import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  BellRing,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Flashlight,
  ImagePlus,
  PackageOpen,
  PackagePlus,
  RefreshCw,
  RotateCcw,
  Search,
  SearchX,
  ScanLine,
  Sparkles,
  X,
} from 'lucide-react';
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  type IScannerControls,
} from '@zxing/browser';
import { supabase } from '../lib/supabase';
import { downloadExcel } from '../lib/excel';
import { useAuth } from '../contexts/AuthContext';
import { notifyAdmins } from '../lib/notifications';

const DATABASE_PAGE_SIZE = 1000;

const DIYARBAKIR_STOCK_LOTS = new Set([
  'K006244',
  'K006384',
  'K006254',
  'K006362',
  'K006377',
  'J376433',
  'J376430',
  'J389281',
  'J388910',
  'J389288',
]);

const TURKEY_PROVINCES = [
  'Adana',
  'Adıyaman',
  'Afyonkarahisar',
  'Ağrı',
  'Amasya',
  'Ankara',
  'Antalya',
  'Artvin',
  'Aydın',
  'Balıkesir',
  'Bilecik',
  'Bingöl',
  'Bitlis',
  'Bolu',
  'Burdur',
  'Bursa',
  'Çanakkale',
  'Çankırı',
  'Çorum',
  'Denizli',
  'Diyarbakır',
  'Edirne',
  'Elazığ',
  'Erzincan',
  'Erzurum',
  'Eskişehir',
  'Gaziantep',
  'Giresun',
  'Gümüşhane',
  'Hakkâri',
  'Hatay',
  'Isparta',
  'Mersin',
  'İstanbul',
  'İzmir',
  'Kars',
  'Kastamonu',
  'Kayseri',
  'Kırklareli',
  'Kırşehir',
  'Kocaeli',
  'Konya',
  'Kütahya',
  'Malatya',
  'Manisa',
  'Kahramanmaraş',
  'Mardin',
  'Muğla',
  'Muş',
  'Nevşehir',
  'Niğde',
  'Ordu',
  'Rize',
  'Sakarya',
  'Samsun',
  'Siirt',
  'Sinop',
  'Sivas',
  'Tekirdağ',
  'Tokat',
  'Trabzon',
  'Tunceli',
  'Şanlıurfa',
  'Uşak',
  'Van',
  'Yozgat',
  'Zonguldak',
  'Aksaray',
  'Bayburt',
  'Karaman',
  'Kırıkkale',
  'Batman',
  'Şırnak',
  'Bartın',
  'Ardahan',
  'Iğdır',
  'Yalova',
  'Karabük',
  'Kilis',
  'Osmaniye',
  'Düzce',
] as const;

const GTIN_MAP: Record<string, number> = {
  '00763000655419': 23,
  '00763000655426': 26,
  '00763000655433': 29,
  '00763000655440': 34,
};

type SizeFilter = 'Kapalı' | 'Tümü' | '23' | '26' | '29' | '34';
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

type AuditEntry = {
  key: string;
  status: ScanStatus;
  lotNo: string;
  size: number;
  expirationDate: string;
  scannedAt: string;
  scanCount: number;
  addedToStock?: boolean;
  notificationSent?: boolean;
  stockId?: string;
};

type StockEntrySuccess = {
  stockId: string;
  urunAdi: string;
  size: number;
  lotNo: string;
  expirationDate: string;
  notificationStatus: 'pending' | 'sent' | 'failed';
};

type DetectedBarcode = {
  rawValue?: string;
  format?: string;
};

type BarcodeDetectorInstance = {
  detect: (
    source: HTMLVideoElement
  ) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

type CameraTrackCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  torch?: boolean;
  zoom?: {
    max: number;
    min: number;
    step?: number;
  };
};

type CameraAdvancedConstraint = MediaTrackConstraintSet & {
  focusMode?: string;
  torch?: boolean;
  zoom?: number;
};

const VALVE_BARCODE_FORMATS = [
  BarcodeFormat.CODE_128,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.QR_CODE,
];

function createValveBarcodeReader(): BrowserMultiFormatReader {
  const reader = new BrowserMultiFormatReader(undefined, {
    delayBetweenScanAttempts: 120,
    delayBetweenScanSuccess: 500,
  });

  reader.possibleFormats = VALVE_BARCODE_FORMATS;
  return reader;
}

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
  const { profile } = useAuth();
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraScanTimerRef = useRef<number | null>(null);
  const cameraZxingControlsRef = useRef<IScannerControls | null>(null);
  const cameraDetectingRef = useRef(false);
  const lastCameraCodeRef = useRef({ value: '', detectedAt: 0 });

  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notifyingStockEntries, setNotifyingStockEntries] =
    useState(false);
  const [exporting, setExporting] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferCity, setTransferCity] = useState('');
  const [selectedTransferIds, setSelectedTransferIds] = useState<
    string[]
  >([]);
  const [barcode, setBarcode] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraMode, setCameraMode] = useState<
    'native' | 'zxing' | 'hybrid' | ''
  >('');
  const [cameraPhotoScanning, setCameraPhotoScanning] =
    useState(false);
  const [cameraTorchAvailable, setCameraTorchAvailable] =
    useState(false);
  const [cameraTorchOn, setCameraTorchOn] = useState(false);
  const [cameraZoom, setCameraZoom] = useState(1);
  const [cameraZoomRange, setCameraZoomRange] = useState<{
    min: number;
    max: number;
    step: number;
  } | null>(null);
  const [parsed, setParsed] = useState<ParsedBarcode | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(
    null
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] =
    useState<SizeFilter>('Kapalı');
  const [message, setMessage] = useState('');
  const [stockEntrySuccess, setStockEntrySuccess] =
    useState<StockEntrySuccess | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>(
    () => {
      try {
        const stored = window.sessionStorage.getItem(
          'valveflow-stock-audit'
        );

        return stored ? (JSON.parse(stored) as AuditEntry[]) : [];
      } catch {
        return [];
      }
    }
  );

  const loadStock = useCallback(async () => {
    setLoading(true);
    setMessage('');

    try {
      const rows = await fetchAllStockItems();
      setItems(rows);
      setSelectedTransferIds(previous =>
        previous.filter(selectedId =>
          rows.some(
            item =>
              item.id === selectedId && item.durum === 'stokta'
          )
        )
      );
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

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        'valveflow-stock-audit',
        JSON.stringify(auditEntries)
      );
    } catch {
      // Tarayıcı depolaması kapalıysa liste mevcut oturumda kalır.
    }
  }, [auditEntries]);

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
    if (activeFilter === 'Kapalı') {
      return [];
    }

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

  const auditCounts = useMemo(
    () => ({
      found: auditEntries.filter(entry => entry.status === 'found')
        .length,
      used: auditEntries.filter(entry => entry.status === 'used')
        .length,
      missing: auditEntries.filter(
        entry => entry.status === 'not-found'
      ).length,
    }),
    [auditEntries]
  );

  const pendingStockEntries = useMemo(
    () =>
      auditEntries.filter(
        entry =>
          entry.addedToStock === true &&
          entry.notificationSent !== true
      ),
    [auditEntries]
  );

  function toggleTransferSelection(stockId: string) {
    setSelectedTransferIds(previous =>
      previous.includes(stockId)
        ? previous.filter(id => id !== stockId)
        : [...previous, stockId]
    );
  }

  function selectAllVisibleForTransfer() {
    const visibleIds = filteredItems.map(item => item.id);

    setSelectedTransferIds(previous =>
      Array.from(new Set([...previous, ...visibleIds]))
    );
  }

  async function transferSelectedStock() {
    if (transferring) return;

    const destination = TURKEY_PROVINCES.find(
      city =>
        city.toLocaleLowerCase('tr-TR') ===
        transferCity.trim().toLocaleLowerCase('tr-TR')
    );

    if (selectedTransferIds.length === 0) {
      setMessage('Transfer edilecek kapakları seçin.');
      return;
    }

    if (!destination) {
      setMessage('Listeden geçerli bir hedef il seçin.');
      return;
    }

    const confirmed = window.confirm(
      `${selectedTransferIds.length} kapak ${destination} iline transfer edilsin mi?`
    );

    if (!confirmed) return;

    setTransferring(true);
    setMessage('');

    try {
      const { data, error } = await supabase.rpc(
        'transfer_stock_items',
        {
          p_stock_ids: selectedTransferIds,
          p_hedef_il: destination,
        }
      );

      if (error) throw error;

      const result = data as {
        success?: boolean;
        transferred_count?: number;
      } | null;

      if (!result?.success) {
        throw new Error(
          'Transfer işlemi veritabanı tarafından doğrulanamadı.'
        );
      }

      const transferredCount =
        result.transferred_count || selectedTransferIds.length;

      try {
        await notifyAdmins({
          title: 'Stok Transferi',
          message: `${profile?.full_name || 'Bir kullanıcı'} ${transferredCount} kapağı ${destination} iline transfer etti`,
          type: 'info',
          related_table: 'stok_transferleri',
        });
      } catch (notificationError) {
        console.error(
          'Stok transferi tamamlandı ancak bildirim gönderilemedi:',
          notificationError
        );
      }

      setSelectedTransferIds([]);
      setTransferCity('');
      setTransferModalOpen(false);
      await loadStock();
      setMessage(
        `${transferredCount} kapak ${destination} iline transfer edildi.`
      );
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Transfer işlemi tamamlanamadı.'
      );
    } finally {
      setTransferring(false);
    }
  }

  function addOrUpdateAuditEntry(
    parsedBarcode: ParsedBarcode,
    status: ScanStatus
  ) {
    const key = `${normalizeLot(parsedBarcode.lot_no)}-${
      parsedBarcode.kapak_boyutu
    }`;

    setAuditEntries(previous => {
      const existing = previous.find(entry => entry.key === key);

      const nextEntry: AuditEntry = {
        key,
        status,
        lotNo: normalizeLot(parsedBarcode.lot_no),
        size: parsedBarcode.kapak_boyutu,
        expirationDate: parsedBarcode.son_kullanma_tarihi,
        scannedAt: new Date().toISOString(),
        scanCount: existing ? existing.scanCount + 1 : 1,
      };

      return [
        nextEntry,
        ...previous.filter(entry => entry.key !== key),
      ];
    });
  }

  function markAuditEntryAsFound(
    parsedBarcode: ParsedBarcode,
    stockId: string
  ) {
    const key = `${normalizeLot(parsedBarcode.lot_no)}-${
      parsedBarcode.kapak_boyutu
    }`;

    setAuditEntries(previous =>
      previous.map(entry =>
        entry.key === key
          ? {
              ...entry,
              status: 'found',
              scannedAt: new Date().toISOString(),
              addedToStock: true,
              notificationSent: false,
              stockId,
            }
          : entry
      )
    );
  }

  function removeAuditEntry(key: string) {
    setAuditEntries(previous =>
      previous.filter(entry => entry.key !== key)
    );
  }

  function clearAuditEntries() {
    if (auditEntries.length === 0) return;

    if (pendingStockEntries.length > 0) {
      setMessage(
        `Önce ${pendingStockEntries.length} stok girişinin özet bildirimini gönderin.`
      );
      return;
    }

    const confirmed = window.confirm(
      'Stok kontrol listesi temizlensin mi?'
    );

    if (!confirmed) return;

    setAuditEntries([]);
    setScanResult(null);
    setParsed(null);
    window.sessionStorage.removeItem('valveflow-stock-audit');
  }

  function closeStockEntrySuccessAndFocus() {
    setStockEntrySuccess(null);

    window.setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 0);
  }

  async function notifyPendingStockEntries() {
    if (
      pendingStockEntries.length === 0 ||
      notifyingStockEntries
    ) {
      return;
    }

    setNotifyingStockEntries(true);
    setMessage('');

    const sizeSummary = [23, 26, 29, 34]
      .map(size => {
        const count = pendingStockEntries.filter(
          entry => entry.size === size
        ).length;

        return count > 0 ? `${count} adet ${size} mm` : null;
      })
      .filter(Boolean)
      .join(', ');

    try {
      await notifyAdmins({
        title: 'Yeni Stok Girişi',
        message: `${profile?.full_name || 'Bir kullanıcı'} ${pendingStockEntries.length} adet kapağı stoka ekledi${
          sizeSummary ? ` (${sizeSummary})` : ''
        }`,
        type: 'success',
        related_table: 'kapak_stok',
        related_id:
          pendingStockEntries.find(entry => entry.stockId)?.stockId ||
          null,
      });

      const notifiedKeys = new Set(
        pendingStockEntries.map(entry => entry.key)
      );

      setAuditEntries(previous =>
        previous.map(entry =>
          notifiedKeys.has(entry.key)
            ? {
                ...entry,
                notificationSent: true,
              }
            : entry
        )
      );

      setStockEntrySuccess(previous =>
        previous
          ? {
              ...previous,
              notificationStatus: 'sent',
            }
          : previous
      );

      setMessage(
        `${pendingStockEntries.length} stok girişi için tek özet bildirim gönderildi.`
      );
    } catch (notificationError) {
      console.error(
        'Stok girişleri tamamlandı ancak özet bildirim gönderilemedi:',
        notificationError
      );

      setStockEntrySuccess(previous =>
        previous
          ? {
              ...previous,
              notificationStatus: 'failed',
            }
          : previous
      );

      setMessage(
        notificationError instanceof Error
          ? `Özet bildirim gönderilemedi: ${notificationError.message}`
          : 'Özet bildirim gönderilemedi.'
      );
    } finally {
      setNotifyingStockEntries(false);
    }
  }

  function processBarcodeValue(rawBarcode: string) {
    setMessage('');
    setParsed(null);
    setScanResult(null);

    try {
      const parsedBarcode = parseBarcodeValue(rawBarcode);
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
        addOrUpdateAuditEntry(parsedBarcode, 'found');
        setScanResult({
          status: 'found',
          lotNo: normalizedLot,
          size: parsedBarcode.kapak_boyutu,
        });
        setMessage(
          `${normalizedLot} LOT numaralı kapak mevcut stokta bulundu.`
        );
      } else if (existingItem) {
        addOrUpdateAuditEntry(parsedBarcode, 'used');
        setScanResult({
          status: 'used',
          lotNo: normalizedLot,
          size: parsedBarcode.kapak_boyutu,
        });
        setMessage(
          `${normalizedLot} LOT numaralı kapak daha önce kullanılmış. Tekrar stoka eklenemez.`
        );
      } else {
        addOrUpdateAuditEntry(parsedBarcode, 'not-found');
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

  function solveBarcode() {
    processBarcodeValue(barcode);
  }

  function stopCamera() {
    if (cameraScanTimerRef.current !== null) {
      window.clearInterval(cameraScanTimerRef.current);
      cameraScanTimerRef.current = null;
    }

    cameraZxingControlsRef.current?.stop();
    cameraZxingControlsRef.current = null;
    cameraDetectingRef.current = false;

    cameraStreamRef.current?.getTracks().forEach(track => {
      track.stop();
    });

    cameraStreamRef.current = null;

    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }

    setCameraMode('');
    setCameraTorchAvailable(false);
    setCameraTorchOn(false);
    setCameraZoomRange(null);
    setCameraZoom(1);
  }

  function closeCamera() {
    stopCamera();
    setCameraOpen(false);
    setCameraStarting(false);
    setCameraError('');
    setCameraPhotoScanning(false);
  }

  function processDetectedCameraCode(rawValue: string) {
    const normalizedValue = rawValue.trim();

    if (!normalizedValue) return;

    const now = Date.now();
    const previous = lastCameraCodeRef.current;

    if (
      previous.value === normalizedValue &&
      now - previous.detectedAt < 2500
    ) {
      return;
    }

    lastCameraCodeRef.current = {
      value: normalizedValue,
      detectedAt: now,
    };

    stopCamera();
    setCameraOpen(false);
    setCameraStarting(false);
    setCameraError('');
    setCameraPhotoScanning(false);
    processBarcodeValue(normalizedValue);
  }

  async function selectPreferredRearCameraId(
    currentStream: MediaStream
  ): Promise<string | null> {
    try {
      const currentDeviceId =
        currentStream.getVideoTracks()[0]?.getSettings().deviceId;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(
        device => device.kind === 'videoinput'
      );
      const undesirableLens =
        /ultra|wide|macro|tele|geniş|makro/i;
      const rearLens = /back|rear|environment|arka/i;
      const preferred =
        cameras.find(
          camera =>
            rearLens.test(camera.label) &&
            !undesirableLens.test(camera.label)
        );

      if (!preferred?.deviceId || preferred.deviceId === currentDeviceId) {
        return null;
      }

      return preferred.deviceId;
    } catch (deviceError) {
      console.warn('Arka kamera seçimi yapılamadı:', deviceError);
      return null;
    }
  }

  async function configureCameraTrack(track: MediaStreamTrack) {
    const capabilities =
      track.getCapabilities?.() as CameraTrackCapabilities;
    const advanced: CameraAdvancedConstraint[] = [];

    if (capabilities?.focusMode?.includes('continuous')) {
      advanced.push({ focusMode: 'continuous' });
    }

    if (advanced.length > 0) {
      try {
        await track.applyConstraints({ advanced });
      } catch (constraintError) {
        console.warn(
          'Kamera otomatik odak ayarı uygulanamadı:',
          constraintError
        );
      }
    }

    setCameraTorchAvailable(Boolean(capabilities?.torch));

    if (capabilities?.zoom) {
      const min = Number(capabilities.zoom.min);
      const max = Number(capabilities.zoom.max);
      const step = Number(capabilities.zoom.step) || 0.1;
      const currentZoom = Number(
        (track.getSettings() as MediaTrackSettings & { zoom?: number })
          .zoom
      ) || min;

      setCameraZoomRange({ min, max, step });
      setCameraZoom(
        Math.min(max, Math.max(min, currentZoom))
      );
    }
  }

  async function applyCameraZoom(nextZoom: number) {
    const track = cameraStreamRef.current?.getVideoTracks()[0];

    if (!track || !cameraZoomRange) return;

    const safeZoom = Math.min(
      cameraZoomRange.max,
      Math.max(cameraZoomRange.min, nextZoom)
    );

    try {
      await track.applyConstraints({
        advanced: [
          { zoom: safeZoom } as CameraAdvancedConstraint,
        ],
      });
      setCameraZoom(safeZoom);
    } catch (zoomError) {
      console.warn('Kamera zoom ayarı uygulanamadı:', zoomError);
    }
  }

  async function toggleCameraTorch() {
    const track = cameraStreamRef.current?.getVideoTracks()[0];

    if (!track || !cameraTorchAvailable) return;

    const nextTorchState = !cameraTorchOn;

    try {
      await track.applyConstraints({
        advanced: [
          { torch: nextTorchState } as CameraAdvancedConstraint,
        ],
      });
      setCameraTorchOn(nextTorchState);
    } catch (torchError) {
      console.warn('Kamera fener ayarı uygulanamadı:', torchError);
    }
  }

  async function scanBarcodePhoto(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || cameraPhotoScanning) return;

    setCameraPhotoScanning(true);
    setCameraError('');

    const imageUrl = URL.createObjectURL(file);

    try {
      const image = new Image();
      image.src = imageUrl;
      await image.decode();

      const reader = createValveBarcodeReader();
      const result = await reader.decodeFromImageElement(image);
      processDetectedCameraCode(result.getText());
    } catch (photoError) {
      console.warn('Fotoğraftaki barkod çözümlenemedi:', photoError);
      setCameraError(
        'Fotoğraftaki çizgisel barkod okunamadı. Etiketi iyi ışıkta, kameraya paralel ve net biçimde yeniden çekin veya LOT/SN bilgisini manuel girin.'
      );
    } finally {
      URL.revokeObjectURL(imageUrl);
      setCameraPhotoScanning(false);
    }
  }

  useEffect(() => {
    if (!cameraOpen) {
      return undefined;
    }

    let cancelled = false;

    async function startPhoneCameraScanner() {
      setCameraStarting(true);
      setCameraError('');

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            'Kamera erişimi bu tarayıcıda kullanılamıyor.'
          );
        }

        let stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: {
              ideal: 'environment',
            },
            width: {
              ideal: 2560,
            },
            height: {
              ideal: 1440,
            },
            frameRate: { ideal: 30 },
          },
        });

        const preferredRearCameraId =
          await selectPreferredRearCameraId(stream);

        if (preferredRearCameraId) {
          stream.getTracks().forEach(track => track.stop());

          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                deviceId: { exact: preferredRearCameraId },
                width: { ideal: 2560 },
                height: { ideal: 1440 },
                frameRate: { ideal: 30 },
              },
            });
          } catch (preferredCameraError) {
            console.warn(
              'Ana arka kamera açılamadı, standart arka kameraya dönülüyor:',
              preferredCameraError
            );
            stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
            });
          }
        }

        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        cameraStreamRef.current = stream;

        const video = cameraVideoRef.current;

        if (!video) {
          throw new Error('Kamera görüntüsü başlatılamadı.');
        }

        video.srcObject = stream;
        await video.play();

        const videoTrack = stream.getVideoTracks()[0];

        if (videoTrack) {
          await configureCameraTrack(videoTrack);
        }

        const BarcodeDetectorApi = (
          window as Window & {
            BarcodeDetector?: BarcodeDetectorConstructor;
          }
        ).BarcodeDetector;

        async function startValveZxingScanner(): Promise<boolean> {
          try {
            const reader = createValveBarcodeReader();
            const controls = await reader.decodeFromVideoElement(
              video as HTMLVideoElement,
              result => {
                const rawValue = result?.getText().trim();

                if (rawValue && !cancelled) {
                  processDetectedCameraCode(rawValue);
                }
              }
            );

            if (cancelled || !cameraStreamRef.current) {
              controls.stop();
              return false;
            }

            cameraZxingControlsRef.current = controls;
            return true;
          } catch (zxingError) {
            console.warn(
              'GS1-128 uyumlu ZXing taraması başlatılamadı:',
              zxingError
            );
            return false;
          }
        }

        const zxingStarted = await startValveZxingScanner();

        if (cancelled || !cameraStreamRef.current) {
          stopCamera();
          return;
        }

        if (!BarcodeDetectorApi) {
          if (!zxingStarted) {
            throw new Error(
              'Bu tarayıcıda uyumlu barkod çözümleyici başlatılamadı.'
            );
          }

          setCameraMode('zxing');
          setCameraStarting(false);
          return;
        }

        let detector: BarcodeDetectorInstance;

        if (BarcodeDetectorApi.getSupportedFormats) {
          const supportedFormats =
            await BarcodeDetectorApi.getSupportedFormats();

          const preferredFormats = [
            'code_128',
            'ean_13',
            'data_matrix',
            'qr_code',
          ].filter(format => supportedFormats.includes(format));

          detector =
            preferredFormats.length > 0
              ? new BarcodeDetectorApi({
                  formats: preferredFormats,
                })
              : new BarcodeDetectorApi();
        } else {
          detector = new BarcodeDetectorApi();
        }

        setCameraMode(zxingStarted ? 'hybrid' : 'native');
        if (cancelled) {
          stopCamera();
          return;
        }

        setCameraStarting(false);

        cameraScanTimerRef.current = window.setInterval(
          async () => {
            const activeVideo = cameraVideoRef.current;

            if (
              !activeVideo ||
              activeVideo.readyState < 2 ||
              cameraDetectingRef.current
            ) {
              return;
            }

            cameraDetectingRef.current = true;

            try {
              const detected = await detector.detect(activeVideo);
              const rawValue = detected
                .map(result => result.rawValue?.trim() || '')
                .find(Boolean);

              if (!rawValue || cancelled) {
                return;
              }

              processDetectedCameraCode(rawValue);
            } catch (detectError) {
              console.warn(
                'Kamera barkod tarama karesi çözümlenemedi:',
                detectError
              );
            } finally {
              cameraDetectingRef.current = false;
            }
          },
          250
        );
      } catch (error: unknown) {
        stopCamera();

        if (cancelled) {
          return;
        }

        setCameraStarting(false);

        if (
          error instanceof DOMException &&
          (error.name === 'NotAllowedError' ||
            error.name === 'PermissionDeniedError')
        ) {
          setCameraError(
            'Kamera izni verilmedi. Tarayıcı/site ayarlarından ValveFlow için kamera iznini açın.'
          );
          return;
        }

        setCameraError(
          error instanceof Error
            ? error.message
            : 'Telefon kamerası başlatılamadı.'
        );
      }
    }

    void startPhoneCameraScanner();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [cameraOpen]);

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

      const successSnapshot: StockEntrySuccess = {
        stockId: insertedStock.id,
        urunAdi: parsed.urun_adi,
        size: parsed.kapak_boyutu,
        lotNo,
        expirationDate: parsed.son_kullanma_tarihi,
        notificationStatus: 'pending',
      };

      setParsed(null);
      setScanResult(null);
      markAuditEntryAsFound(parsed, insertedStock.id);
      setStockEntrySuccess(successSnapshot);
      setMessage(
        `${lotNo} LOT numaralı kapak stoka eklendi. Seri giriş tamamlanınca özet bildirimi gönderin.`
      );
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
      {transferModalOpen && (
        <div
          className="fixed inset-0 z-[135] flex items-center justify-center overflow-y-auto bg-slate-950/85 px-3 py-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stock-transfer-modal-title"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-violet-400/30 bg-slate-900 shadow-2xl shadow-violet-500/10">
            <div className="flex items-start justify-between gap-4 border-b border-slate-700 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-violet-300">
                  <ArrowRightLeft className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-[0.16em]">
                    Stok İşlemi
                  </span>
                </div>

                <h2
                  id="stock-transfer-modal-title"
                  className="mt-1 text-xl font-black text-white"
                >
                  Stok Transferi
                </h2>

                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Transfer edilecek kapakları stok listesinden seçin ve hedef ili belirleyin.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setTransferModalOpen(false)}
                disabled={transferring}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white disabled:opacity-50"
                aria-label="Stok transferini kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Seçili Kapak
                  </div>
                  <div className="mt-1 text-2xl font-black text-white">
                    {selectedTransferIds.length}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Görünen Kapak
                  </div>
                  <div className="mt-1 text-2xl font-black text-white">
                    {filteredItems.length}
                  </div>
                </div>
              </div>

              {activeFilter === 'Kapalı' && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs leading-5 text-amber-100">
                  Önce aşağıdaki stok kartlarından Tüm Stok veya bir ölçü seçin. Ardından transfer edilecek kapakları işaretleyebilirsiniz.
                </div>
              )}

              <div>
                <label
                  htmlFor="transfer-city"
                  className="mb-1.5 block text-xs font-semibold text-slate-300"
                >
                  Hedef İl
                </label>

                <input
                  id="transfer-city"
                  type="search"
                  list="turkey-provinces"
                  value={transferCity}
                  onChange={event => setTransferCity(event.target.value)}
                  placeholder="İl yazarak ara..."
                  autoComplete="off"
                  className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                />

                <datalist id="turkey-provinces">
                  {TURKEY_PROVINCES.map(city => (
                    <option key={city} value={city} />
                  ))}
                </datalist>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={selectAllVisibleForTransfer}
                  disabled={filteredItems.length === 0 || transferring}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Görünenleri Seç
                </button>

                {selectedTransferIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedTransferIds([])}
                    disabled={transferring}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 px-3 py-2.5 text-sm font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-40"
                  >
                    Seçimi Temizle
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => void transferSelectedStock()}
                disabled={selectedTransferIds.length === 0 || transferring}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowRightLeft className="h-4 w-4" />
                {transferring
                  ? 'Transfer ediliyor...'
                  : selectedTransferIds.length > 0
                    ? `${selectedTransferIds.length} Kapağı Transfer Et`
                    : 'Transfer İçin Kapak Seçin'}
              </button>

              <p className="text-center text-[11px] leading-4 text-slate-500">
                Transfer yalnızca seçili kapaklara uygulanır. Mevcut transfer RPC akışı değiştirilmedi.
              </p>
            </div>
          </div>
        </div>
      )}

      {cameraOpen && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center overflow-y-auto bg-slate-950/95 px-3 py-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="camera-stock-scanner-title"
        >
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-cyan-400/30 bg-slate-900 shadow-2xl shadow-cyan-500/10">
            <div className="flex items-start justify-between gap-4 border-b border-slate-700 px-4 py-4 sm:px-5">
              <div>
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-cyan-300" />
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">
                    Telefon Kamerası
                  </p>
                </div>

                <h2
                  id="camera-stock-scanner-title"
                  className="mt-1 text-xl font-black text-white"
                >
                  Kapak barkodunu tara
                </h2>

                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Öncelikle etiketteki yan yana çizgili barkodu çerçeveye
                  alın. Kod algılanınca ValveFlow otomatik kontrol eder.
                </p>
              </div>

              <button
                type="button"
                onClick={closeCamera}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white"
                aria-label="Kamerayı kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 sm:p-5">
              <input
                ref={cameraPhotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={scanBarcodePhoto}
              />

              <div className="relative aspect-[3/4] max-h-[68vh] w-full overflow-hidden rounded-2xl border border-slate-700 bg-black sm:aspect-[4/3]">
                <video
                  ref={cameraVideoRef}
                  className="h-full w-full object-contain"
                  playsInline
                  muted
                  autoPlay
                />

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
                  <div className="relative h-[28%] w-full max-w-lg rounded-2xl border-2 border-cyan-300/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]">
                    <span className="absolute -left-0.5 -top-0.5 h-7 w-7 rounded-tl-xl border-l-4 border-t-4 border-cyan-300" />
                    <span className="absolute -right-0.5 -top-0.5 h-7 w-7 rounded-tr-xl border-r-4 border-t-4 border-cyan-300" />
                    <span className="absolute -bottom-0.5 -left-0.5 h-7 w-7 rounded-bl-xl border-b-4 border-l-4 border-cyan-300" />
                    <span className="absolute -bottom-0.5 -right-0.5 h-7 w-7 rounded-br-xl border-b-4 border-r-4 border-cyan-300" />

                    {!cameraError && (
                      <div className="absolute inset-x-5 top-1/2 h-px bg-cyan-300/90 shadow-[0_0_12px_rgba(103,232,249,0.9)]" />
                    )}
                  </div>
                </div>

                {cameraStarting && !cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/70 text-center">
                    <RefreshCw className="h-7 w-7 animate-spin text-cyan-300" />
                    <p className="text-sm font-bold text-white">
                      Kamera hazırlanıyor...
                    </p>
                  </div>
                )}

                {cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 p-5">
                    <div className="max-w-sm text-center">
                      <AlertTriangle className="mx-auto h-9 w-9 text-amber-300" />
                      <p className="mt-3 text-sm font-bold text-white">
                        Kamera taraması başlatılamadı
                      </p>
                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        {cameraError}
                      </p>
                    </div>
                  </div>
                )}

                {!cameraStarting && !cameraError && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-slate-950/80 px-3 py-2 text-xs font-bold text-cyan-100 backdrop-blur">
                      <ScanLine className="h-4 w-4 text-cyan-300" />
                      Çizgisel barkodu çerçevenin içine alın
                    </div>
                  </div>
                )}
              </div>

              {!cameraStarting && !cameraError && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/40 p-3">
                  <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-bold text-cyan-200">
                    {cameraMode === 'native'
                      ? 'Hızlı Tarama'
                      : cameraMode === 'hybrid'
                        ? 'GS1-128 Hibrit Tarama'
                        : 'Uyumlu ZXing Tarama'}
                  </span>

                  {cameraTorchAvailable && (
                    <button
                      type="button"
                      onClick={() => void toggleCameraTorch()}
                      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-bold transition ${
                        cameraTorchOn
                          ? 'border-amber-300/50 bg-amber-400/20 text-amber-100'
                          : 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      <Flashlight className="h-4 w-4" />
                      {cameraTorchOn ? 'Fener Açık' : 'Fener'}
                    </button>
                  )}

                  {cameraZoomRange && (
                    <label className="flex min-w-[180px] flex-1 items-center gap-2 text-xs font-bold text-slate-300">
                      Zoom
                      <input
                        type="range"
                        min={cameraZoomRange.min}
                        max={cameraZoomRange.max}
                        step={cameraZoomRange.step}
                        value={cameraZoom}
                        onChange={event =>
                          void applyCameraZoom(
                            Number(event.target.value)
                          )
                        }
                        className="min-w-0 flex-1 accent-cyan-400"
                        aria-label="Kamera zoom seviyesi"
                      />
                      <span className="w-9 text-right text-cyan-200">
                        {cameraZoom.toFixed(1)}×
                      </span>
                    </label>
                  )}
                </div>
              )}

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => cameraPhotoInputRef.current?.click()}
                  disabled={cameraPhotoScanning}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60"
                >
                  {cameraPhotoScanning ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                  {cameraPhotoScanning
                    ? 'Fotoğraf Taranıyor...'
                    : 'Fotoğraf Çek ve Tara'}
                </button>

                {cameraError ? (
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setCameraError('');
                      setCameraOpen(false);

                      window.setTimeout(() => {
                        setCameraOpen(true);
                      }, 50);
                    }}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-cyan-500"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Tekrar Dene
                  </button>
                ) : (
                  <div className="flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/40 px-3 text-center text-xs leading-5 text-slate-400">
                    İyi ışıkta, etikete 15–30 cm mesafeden tutun.
                  </div>
                )}

                <button
                  type="button"
                  onClick={closeCamera}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-slate-700"
                >
                  <X className="h-4 w-4" />
                  Kamerayı Kapat
                </button>

                <div className="flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/40 px-3 text-center text-xs leading-5 text-slate-400">
                  Okunmazsa LOT/SN bilgisini barkod alanına manuel girebilirsiniz.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {stockEntrySuccess && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-950/85 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stock-entry-success-title"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-emerald-400/40 bg-slate-900 shadow-2xl shadow-emerald-500/15">
            <div className="border-b border-emerald-400/20 bg-emerald-500/[0.07] px-5 py-5 sm:px-6">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/15">
                  <PackagePlus className="h-7 w-7 text-emerald-300" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                      Stok işlemi tamamlandı
                    </p>
                  </div>

                  <h2
                    id="stock-entry-success-title"
                    className="mt-1 text-2xl font-black text-white"
                  >
                    Kapak stoka eklendi
                  </h2>

                  <p className="mt-1 text-sm text-slate-400">
                    Stok kaydı ve giriş hareketi başarıyla oluşturuldu.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-5 sm:p-6">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-700 bg-slate-950/45 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Ürün
                  </p>
                  <p className="mt-1 break-words text-sm font-semibold text-white">
                    {stockEntrySuccess.urunAdi}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-950/45 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Ölçü
                  </p>
                  <p className="mt-1 text-sm font-bold text-cyan-200">
                    {stockEntrySuccess.size} mm
                  </p>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-950/45 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    LOT / SN
                  </p>
                  <p className="mt-1 break-all font-mono text-sm font-bold text-cyan-300">
                    {stockEntrySuccess.lotNo}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-950/45 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Son kullanma tarihi
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {formatDate(stockEntrySuccess.expirationDate)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Stok durumu
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    <p className="text-sm font-bold text-emerald-200">
                      Mevcut stoğa eklendi
                    </p>
                  </div>
                </div>

                <div
                  className={`rounded-xl border p-3 ${
                    stockEntrySuccess.notificationStatus === 'sent'
                      ? 'border-emerald-500/30 bg-emerald-500/[0.07]'
                      : stockEntrySuccess.notificationStatus === 'failed'
                        ? 'border-red-500/30 bg-red-500/[0.07]'
                        : 'border-amber-500/30 bg-amber-500/[0.07]'
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Bildirim
                  </p>

                  <div className="mt-1.5 flex items-center gap-2">
                    {stockEntrySuccess.notificationStatus === 'sent' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    ) : stockEntrySuccess.notificationStatus === 'failed' ? (
                      <AlertTriangle className="h-4 w-4 text-red-300" />
                    ) : (
                      <BellRing className="h-4 w-4 text-amber-300" />
                    )}

                    <p
                      className={`text-sm font-bold ${
                        stockEntrySuccess.notificationStatus === 'sent'
                          ? 'text-emerald-200'
                          : stockEntrySuccess.notificationStatus === 'failed'
                            ? 'text-red-200'
                            : 'text-amber-200'
                      }`}
                    >
                      {stockEntrySuccess.notificationStatus === 'sent'
                        ? 'Özet bildirim gönderildi'
                        : stockEntrySuccess.notificationStatus === 'failed'
                          ? 'Bildirim gönderilemedi'
                          : 'Özet bildirim bekliyor'}
                    </p>
                  </div>
                </div>
              </div>

              {stockEntrySuccess.notificationStatus === 'pending' && (
                <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-xs leading-5 text-amber-100/80">
                  Seri stok girişine devam edebilirsiniz. Bildirimler tek tek
                  değil, bekleyen tüm girişler için tek özet olarak gönderilir.
                </p>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={closeStockEntrySuccessAndFocus}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-400"
                >
                  <PackagePlus className="h-4 w-4" />
                  Yeni Kapak Tara
                </button>

                {pendingStockEntries.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => void notifyPendingStockEntries()}
                    disabled={notifyingStockEntries}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-200 transition hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <BellRing className="h-4 w-4" />
                    {notifyingStockEntries
                      ? 'Gönderiliyor...'
                      : `${pendingStockEntries.length} Girişi Bildir`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={closeStockEntrySuccessAndFocus}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-700"
                  >
                    <X className="h-4 w-4" />
                    Kapat
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
            onClick={() => setTransferModalOpen(true)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm font-medium text-violet-200 transition hover:bg-violet-500/15"
            title="Stok transferini aç"
            aria-label="Stok transferini aç"
          >
            <ArrowRightLeft className="h-4 w-4" />
            <span className="sm:hidden">Stok Transferi</span>
          </button>

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
            onClick={() => {
              if (barcode.trim()) {
                solveBarcode();
                return;
              }

              setCameraError('');
              setCameraOpen(true);
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500"
            title={
              barcode.trim()
                ? 'Barkodu kontrol et'
                : 'Telefon kamerası ile tara'
            }
          >
            <Camera className="h-4 w-4" />
            <Search className="h-4 w-4" />
            Kontrol Et
          </button>
        </div>

        <p className="mt-2 text-[11px] leading-4 text-slate-500">
          Barkod alanı boşken <span className="font-semibold text-slate-300">Kontrol Et</span>{' '}
          düğmesindeki kamera ikonu telefon kamerasını açar. Barkod girilmişse
          aynı düğme mevcut kodu kontrol eder.
        </p>

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

      <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/60">
        <div className="flex flex-col gap-3 border-b border-slate-700 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-cyan-300" />
              <h2 className="text-sm font-semibold text-white">
                Stok Kontrol Listesi
              </h2>
            </div>

            <p className="mt-1 text-xs text-slate-400">
              Arka arkaya okuttuğunuz kapakların kontrol sonuçları.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {pendingStockEntries.length > 0 && (
              <button
                type="button"
                onClick={() => void notifyPendingStockEntries()}
                disabled={notifyingStockEntries}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BellRing className="h-4 w-4" />
                {notifyingStockEntries
                  ? 'Gönderiliyor...'
                  : `${pendingStockEntries.length} Girişi Bildir`}
              </button>
            )}

            <button
              type="button"
              onClick={clearAuditEntries}
              disabled={auditEntries.length === 0}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-red-500/50 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
              Kontrolü Temizle
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 border-b border-slate-700 bg-slate-900/40 text-center">
          <div className="px-2 py-3">
            <div className="text-lg font-bold text-white">
              {auditEntries.length}
            </div>
            <div className="text-[10px] uppercase text-slate-500">
              Okutulan
            </div>
          </div>

          <div className="border-l border-slate-700 px-2 py-3">
            <div className="text-lg font-bold text-emerald-300">
              {auditCounts.found}
            </div>
            <div className="text-[10px] uppercase text-slate-500">
              Stokta
            </div>
          </div>

          <div className="border-l border-slate-700 px-2 py-3">
            <div className="text-lg font-bold text-red-300">
              {auditCounts.used}
            </div>
            <div className="text-[10px] uppercase text-slate-500">
              Kullanılmış
            </div>
          </div>

          <div className="border-l border-slate-700 px-2 py-3">
            <div className="text-lg font-bold text-amber-300">
              {auditCounts.missing}
            </div>
            <div className="text-[10px] uppercase text-slate-500">
              Eksik
            </div>
          </div>
        </div>

        {auditEntries.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            Henüz stok kontrolü yapılmadı.
          </div>
        ) : (
          <div className="max-h-80 divide-y divide-slate-700/70 overflow-y-auto">
            {auditEntries.map(entry => (
              <div
                key={entry.key}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      entry.status === 'found'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : entry.status === 'used'
                          ? 'bg-red-500/15 text-red-300'
                          : 'bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {entry.status === 'found'
                      ? '✓'
                      : entry.status === 'used'
                        ? '!'
                        : '×'}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-all font-mono text-sm font-bold text-white">
                        {entry.lotNo}
                      </p>

                      <span
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                          entry.status === 'found'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : entry.status === 'used'
                              ? 'border-red-500/30 bg-red-500/10 text-red-300'
                              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                        }`}
                      >
                        {entry.status === 'found'
                          ? 'STOKTA'
                          : entry.status === 'used'
                            ? 'KULLANILMIŞ'
                            : 'EKSİK'}
                      </span>

                      {entry.scanCount > 1 && (
                        <span className="rounded-md bg-slate-700 px-2 py-0.5 text-[10px] text-slate-300">
                          {entry.scanCount} kez
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-xs text-slate-400">
                      {entry.size} mm • SKT{' '}
                      {formatDate(entry.expirationDate)}
                    </p>

                    <p className="mt-1 text-[11px] text-slate-500">
                      Son kontrol:{' '}
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
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-700 hover:text-red-300"
                  aria-label={`${entry.lotNo} kontrol kaydını kaldır`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
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
          onClick={() =>
            setActiveFilter(current =>
              current === 'Tümü' ? 'Kapalı' : 'Tümü'
            )
          }
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
            onClick={() =>
              setActiveFilter(current =>
                current === String(size)
                  ? 'Kapalı'
                  : (String(size) as SizeFilter)
              )
            }
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
      {activeFilter === 'Kapalı' && (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800/30 px-4 py-5 text-center">
          <p className="text-sm font-semibold text-slate-300">
            Stok listesini görmek için bir kart seçin
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Tüm Stok veya 23 / 26 / 29 / 34 mm kartlarından birine dokunun.
          </p>
        </div>
      )}

      {activeFilter !== 'Kapalı' && (
        <>


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
                  <th className="w-[7%] px-4 py-3">Seç</th>
                  <th className="w-[23%] px-4 py-3">Ürün</th>
                  <th className="w-[11%] px-4 py-3">Ölçü</th>
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
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedTransferIds.includes(item.id)}
                          onChange={() => toggleTransferSelection(item.id)}
                          className="h-4 w-4 cursor-pointer accent-violet-500"
                          aria-label={`${item.lot_no || 'Kapak'} transfer için seç`}
                        />
                      </td>
                      <td className="truncate px-4 py-3 font-semibold text-white">
                        {productName(item)}
                      </td>
                      <td className="px-4 py-3">
                        {item.kapak_boyutu
                          ? `${item.kapak_boyutu} mm`
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-cyan-300">
                            {item.lot_no || '-'}
                          </span>
                          {DIYARBAKIR_STOCK_LOTS.has(
                            normalizeLot(item.lot_no || '')
                          ) && (
                            <span className="inline-flex rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                              Diyarbakır
                            </span>
                          )}
                        </div>
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

                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-md border px-2 py-1 text-[11px] font-medium ${expiryClass(
                          days
                        )}`}
                      >
                        {expiryText(days)}
                      </span>

                      <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10">
                        <input
                          type="checkbox"
                          checked={selectedTransferIds.includes(item.id)}
                          onChange={() => toggleTransferSelection(item.id)}
                          className="h-4 w-4 cursor-pointer accent-violet-500"
                          aria-label={`${item.lot_no || 'Kapak'} transfer için seç`}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-700/70 pt-3">
                    <div className="rounded-lg bg-slate-900/40 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase text-slate-500">
                        LOT
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="break-all font-mono text-xs font-semibold text-cyan-300">
                          {item.lot_no || '-'}
                        </span>
                        {DIYARBAKIR_STOCK_LOTS.has(
                          normalizeLot(item.lot_no || '')
                        ) && (
                          <span className="inline-flex rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                            Diyarbakır
                          </span>
                        )}
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
        </>
      )}

    </div>
  );
}
