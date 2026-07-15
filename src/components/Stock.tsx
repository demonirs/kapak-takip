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

type HistoryRow = {
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
  if (lotAiMatch?.[1]) return normalizeLot(lotAiMatch[1]);

  const serialAiMatch = raw.match(/\(21\)(.*?)(?=\(\d{2}\)|$)/);
  if (serialAiMatch?.[1]) return normalizeLot(serialAiMatch[1]);

  const compact10Index = raw.indexOf('10');
  const compact21Index = raw.indexOf('21');
  let startIndex = -1;

  if (compact10Index !== -1) startIndex = compact10Index + 2;
  else if (compact21Index !== -1) startIndex = compact21Index + 2;

  if (startIndex === -1) return '';

  const lotMatch = raw.slice(startIndex).match(/[A-Za-z][A-Za-z0-9]*/);
  return lotMatch?.[0] ? normalizeLot(lotMatch[0]) : '';
}

function extractGtinAndSkt(raw: string) {
  let gtin = '';
  let skt = '';

  const gtinParen = raw.match(/\(01\)(\d{14})/);
  const sktParen = raw.match(/\(17\)(\d{6})/);

  if (gtinParen?.[1]) gtin = gtinParen[1];
  if (sktParen?.[1]) skt = sktParen[1];

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
  if (!value) return null;

  const [year, month, day] = value.split('T')[0].split('-').map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isCurrentMonth(value: string | null | undefined) {
  const date = parseDateOnly(value);
  if (!date) return false;

  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function isBeforeCurrentMonth(value: string | null | undefined) {
  const date = parseDateOnly(value);
  if (!date) return false;

  const firstDay = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  );
  firstDay.setHours(0, 0, 0, 0);

  return date.getTime() < firstDay.getTime();
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
  const [historicalItems, setHistoricalItems] = useState<HistoricalItem[]>([]);
  const [caseMap, setCaseMap] = useState<Record<string, CaseInfo>>({});
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

    const [stockResponse, historicalResponse] = await Promise.all([
      supabase
        .from('kapak_stok')
        .select(
          'id, urun_adi, kapak_boyutu, lot_no, son_kullanma_tarihi, durum, kullanilan_vaka_id, created_at'
        )
        .in('durum', ['stokta', 'kullanildi'])
        .order('kapak_boyutu')
        .order('son_kullanma_tarihi'),

      supabase
        .from('gecmis_kullanilan_kapaklar')
        .select(
          'id, urun_adi, kapak_boyutu, lot_no, son_kullanma_tarihi, kullanim_tarihi, merkez_hastane, doktor, hasta_adi, kaynak'
        )
        .order('kullanim_tarihi', { ascending: false }),
    ]);

    if (stockResponse.error) {
      setMessage(stockResponse.error.message);
      setLoading(false);
      return;
    }

    if (historicalResponse.error) {
      setMessage(historicalResponse.error.message);
      setLoading(false);
      return;
    }

    const stockData = (stockResponse.data as StockItem[]) || [];
    setItems(stockData);
    setHistoricalItems(
      (historicalResponse.data as HistoricalItem[]) || []
    );

    const vakaIds = Array.from(
      new Set(
        stockData
          .map(item => item.kullanilan_vaka_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    if (vakaIds.length > 0) {
      const { data: cases, error: casesError } = await supabase
        .from('kapaklar')
        .select('id, vaka_tarihi, merkez_hastane, doktor, hasta_adi')
        .in('id', vakaIds);

      if (casesError) {
        setMessage(casesError.message);
        setLoading(false);
        return;
      }

      const nextCaseMap: Record<string, CaseInfo> = {};
      ((cases as CaseInfo[]) || []).forEach(item => {
        nextCaseMap[item.id] = item;
      });
      setCaseMap(nextCaseMap);
    } else {
      setCaseMap({});
    }

    setLoading(false);
  }

  const mevcutItems = useMemo(
    () => items.filter(item => item.durum === 'stokta'),
    [items]
  );

  const kullanilanItems = useMemo(
    () => items.filter(item => item.durum === 'kullanildi'),
    [items]
  );

  const currentMonthItems = useMemo(
    () =>
      kullanilanItems.filter(item => {
        const vaka = item.kullanilan_vaka_id
          ? caseMap[item.kullanilan_vaka_id]
          : null;
        return isCurrentMonth(vaka?.vaka_tarihi);
      }),
    [kullanilanItems, caseMap]
  );

  const previousValveFlowHistory = useMemo<HistoryRow[]>(
    () =>
      kullanilanItems
        .filter(item => {
          const vaka = item.kullanilan_vaka_id
            ? caseMap[item.kullanilan_vaka_id]
            : null;
          return isBeforeCurrentMonth(vaka?.vaka_tarihi);
        })
        .map(item => {
          const vaka = item.kullanilan_vaka_id
            ? caseMap[item.kullanilan_vaka_id]
            : null;

          return {
            key: `valveflow-${item.id}`,
            source: 'valveflow',
            caseId: item.kullanilan_vaka_id,
            urun_adi: item.urun_adi,
            kapak_boyutu: item.kapak_boyutu,
            lot_no: item.lot_no,
            son_kullanma_tarihi: item.son_kullanma_tarihi,
            kullanim_tarihi: vaka?.vaka_tarihi || null,
            hasta_adi: vaka?.hasta_adi || null,
            merkez_hastane: vaka?.merkez_hastane || null,
            doktor: vaka?.doktor || null,
          };
        }),
    [kullanilanItems, caseMap]
  );

  const importedHistory = useMemo<HistoryRow[]>(
    () =>
      historicalItems.map(item => ({
        key: `eski-excel-${item.id}`,
        source: 'eski_excel',
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
      [...previousValveFlowHistory, ...importedHistory].sort((a, b) => {
        const first = parseDateOnly(a.kullanim_tarihi)?.getTime() || 0;
        const second = parseDateOnly(b.kullanim_tarihi)?.getTime() || 0;
        return second - first;
      }),
    [previousValveFlowHistory, importedHistory]
  );

  const visibleStockItems =
    activeTab === 'mevcut' ? mevcutItems : currentMonthItems;

  const filteredStockItems = useMemo(() => {
    if (activeFilter === 'Tümü') return visibleStockItems;
    return visibleStockItems.filter(
      item => item.kapak_boyutu === Number(activeFilter)
    );
  }, [visibleStockItems, activeFilter]);

  const filteredHistoryItems = useMemo(() => {
    if (activeFilter === 'Tümü') return allHistoryItems;
    return allHistoryItems.filter(
      item => item.kapak_boyutu === Number(activeFilter)
    );
  }, [allHistoryItems, activeFilter]);

  const visibleCount =
    activeTab === 'gecmis'
      ? filteredHistoryItems.length
      : filteredStockItems.length;

  const sizeSource =
    activeTab === 'gecmis' ? allHistoryItems : visibleStockItems;

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

    if (!gtin) return setMessage('GTIN / UBB bulunamadı.');
    if (!skt) return setMessage('Son kullanma tarihi bulunamadı.');
    if (!lot) return setMessage('Lot numarası bulunamadı.');

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
      son_kullanma_tarihi: `20${skt.slice(0, 2)}-${skt.slice(
        2,
        4
      )}-${skt.slice(4, 6)}`,
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
          `Stok eklendi ama hareket kaydı yazılamadı: ${movementError.message}`
        );
        await loadStock();
        return;
      }
    }

    setBarcode('');
    setParsed(null);
    setActiveTab('mevcut');
    setMessage('Kapak stoka eklendi.');
    await loadStock();
  }

  async function deleteStockItem(id: string) {
    if (!isAdmin) {
      alert('Bu işlemi sadece admin yapabilir.');
      return;
    }

    if (!window.confirm('Bu stok kaydı silinsin mi?')) return;

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
    return Math.ceil(
      (new Date(date).getTime() - new Date().getTime()) /
        (1000 * 60 * 60 * 24)
    );
  }

  function formatDate(date: string | null | undefined) {
    const parsedDate = parseDateOnly(date);
    return parsedDate ? parsedDate.toLocaleDateString('tr-TR') : '-';
  }

  function tabClass(tab: Tab) {
    return activeTab === tab
      ? 'bg-cyan-600 text-white border-cyan-400'
      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700';
  }

  function safeFileNamePart(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, '-').trim();
  }

  function exportStockToExcel() {
    if (visibleCount === 0 || exporting) return;

    setExporting(true);

    try {
      const rows =
        activeTab === 'gecmis'
          ? filteredHistoryItems.map((item, index) => ({
              No: index + 1,
              'Ürün Adı': item.urun_adi,
              'Kapak Boyutu': item.kapak_boyutu
                ? `${item.kapak_boyutu} mm`
                : '',
              'LOT No': item.lot_no,
              SKT: formatDate(item.son_kullanma_tarihi),
              'Kullanım Tarihi': formatDate(item.kullanim_tarihi),
              Hasta: item.hasta_adi || '',
              Merkez: item.merkez_hastane || '',
              Doktor: item.doktor || '',
              Kaynak:
                item.source === 'valveflow'
                  ? 'ValveFlow'
                  : 'Eski Excel',
            }))
          : filteredStockItems.map((item, index) => {
              const vaka = item.kullanilan_vaka_id
                ? caseMap[item.kullanilan_vaka_id]
                : null;

              return {
                No: index + 1,
                'Ürün Adı': item.urun_adi,
                'Kapak Boyutu': `${item.kapak_boyutu} mm`,
                'LOT No': item.lot_no,
                SKT: formatDate(item.son_kullanma_tarihi),
                ...(activeTab === 'mevcut'
                  ? {
                      'Kalan Gün': kalanGun(
                        item.son_kullanma_tarihi
                      ),
                      Durum: 'Stokta',
                    }
                  : {
                      Hasta: vaka?.hasta_adi || '',
                      Merkez: vaka?.merkez_hastane || '',
                      Doktor: vaka?.doktor || '',
                      'Vaka Tarihi': formatDate(vaka?.vaka_tarihi),
                    }),
              };
            });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      if (worksheet['!ref']) {
        worksheet['!autofilter'] = { ref: worksheet['!ref'] };
      }

      const workbook = XLSX.utils.book_new();
      const sheetName =
        activeTab === 'mevcut'
          ? 'Mevcut Stok'
          : activeTab === 'bu-ay'
          ? 'Bu Ay Kullanılanlar'
          : 'Geçmiş Kullanımlar';

      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

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
    <div className="space-y-5 pb-24 overflow-y-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white sm:text-2xl">
            Stok Takip
          </h1>
          <p className="mt-1 text-xs text-slate-400 sm:text-sm">
            Mevcut stokları, bu ay kullanılanları ve geçmiş kayıtları yönetin.
          </p>
        </div>

        <button
          type="button"
          onClick={exportStockToExcel}
          disabled={loading || exporting || visibleCount === 0}
          className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
        >
          {exporting
            ? 'Excel Hazırlanıyor...'
            : `${visibleCount} Kaydı Excel'e Aktar`}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          ['mevcut', 'Mevcut', mevcutItems.length],
          ['bu-ay', 'Bu Ay', currentMonthItems.length],
          ['gecmis', 'Geçmiş', allHistoryItems.length],
        ].map(([tab, label, count]) => (
          <button
            key={tab}
            type="button"
            onClick={() => selectTab(tab as Tab)}
            className={`rounded-xl border p-3 text-left transition sm:p-4 ${tabClass(
              tab as Tab
            )}`}
          >
            <div className="text-[11px] opacity-80 sm:text-sm">
              {label}
            </div>
            <div className="mt-1 text-2xl font-bold sm:text-3xl">
              {count}
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[23, 26, 29, 34].map(size => (
          <div
            key={size}
            className="rounded-xl border border-slate-700 bg-slate-800 p-3"
          >
            <div className="text-xs text-slate-400">{size} mm</div>
            <div className="mt-1 text-xl font-bold">
              {sizeCounts[size as 23 | 26 | 29 | 34]}
            </div>
          </div>
        ))}
      </div>

      {activeTab === 'mevcut' && (
        <div className="space-y-4 rounded-xl bg-slate-800 p-4">
          <input
            value={barcode}
            onChange={event => setBarcode(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') parseBarcode();
            }}
            placeholder="Barkod okut veya yapıştır"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={parseBarcode}
              className="rounded-lg bg-cyan-600 px-4 py-2"
            >
              Çözümle
            </button>
            <button
              type="button"
              onClick={() => void addToStock()}
              disabled={!parsed}
              className="rounded-lg bg-emerald-600 px-4 py-2 disabled:opacity-40"
            >
              Stoka Ekle
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm">
          {message}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(filter => (
          <button
            key={filter}
            type="button"
            onClick={() => setActiveFilter(filter)}
            className={`rounded-lg px-4 py-2 text-sm ${
              activeFilter === filter
                ? 'bg-cyan-600'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {filter === 'Tümü' ? 'Tümü' : `${filter} mm`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-slate-400">Yükleniyor...</div>
      ) : activeTab === 'gecmis' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
          <table className="w-full min-w-[1080px]">
            <thead className="bg-slate-700">
              <tr>
                {[
                  'ÜRÜN',
                  'LOT',
                  'SKT',
                  'KULLANIM TARİHİ',
                  'HASTA',
                  'MERKEZ',
                  'DOKTOR',
                  'KAYNAK',
                  'VAKA',
                ].map(title => (
                  <th key={title} className="p-3 text-left">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredHistoryItems.map(item => (
                <tr key={item.key} className="border-t border-slate-700">
                  <td className="p-3">{item.urun_adi}</td>
                  <td className="p-3 font-semibold text-cyan-300">
                    {item.lot_no}
                  </td>
                  <td className="p-3">
                    {formatDate(item.son_kullanma_tarihi)}
                  </td>
                  <td className="p-3">
                    {formatDate(item.kullanim_tarihi)}
                  </td>
                  <td className="p-3">{item.hasta_adi || '-'}</td>
                  <td className="p-3">{item.merkez_hastane || '-'}</td>
                  <td className="p-3">{item.doktor || '-'}</td>
                  <td className="p-3">
                    {item.source === 'valveflow'
                      ? 'ValveFlow'
                      : 'Eski Excel'}
                  </td>
                  <td className="p-3">
                    {item.caseId ? (
                      <button
                        type="button"
                        onClick={() => openCase(item.caseId)}
                        className="inline-flex items-center gap-2 text-cyan-300"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Aç
                      </button>
                    ) : (
                      <span className="text-slate-500">Eski kayıt</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-700">
              <tr>
                <th className="p-3 text-left">ÜRÜN</th>
                <th className="p-3 text-left">LOT</th>
                <th className="p-3 text-left">SKT</th>
                {activeTab === 'mevcut' ? (
                  <>
                    <th className="p-3 text-left">KALAN GÜN</th>
                    {isAdmin && <th className="p-3 text-left">SİL</th>}
                  </>
                ) : (
                  <>
                    <th className="p-3 text-left">HASTA</th>
                    <th className="p-3 text-left">MERKEZ</th>
                    <th className="p-3 text-left">DOKTOR</th>
                    <th className="p-3 text-left">VAKA TARİHİ</th>
                    <th className="p-3 text-left">VAKA</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredStockItems.map(item => {
                const vaka = item.kullanilan_vaka_id
                  ? caseMap[item.kullanilan_vaka_id]
                  : null;

                return (
                  <tr key={item.id} className="border-t border-slate-700">
                    <td className="p-3">{item.urun_adi}</td>
                    <td className="p-3">{item.lot_no}</td>
                    <td className="p-3">
                      {formatDate(item.son_kullanma_tarihi)}
                    </td>

                    {activeTab === 'mevcut' ? (
                      <>
                        <td className="p-3">
                          {kalanGun(item.son_kullanma_tarihi)}
                        </td>
                        {isAdmin && (
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() =>
                                void deleteStockItem(item.id)
                              }
                              className="inline-flex items-center gap-2 text-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                              Sil
                            </button>
                          </td>
                        )}
                      </>
                    ) : (
                      <>
                        <td className="p-3">{vaka?.hasta_adi || '-'}</td>
                        <td className="p-3">
                          {vaka?.merkez_hastane || '-'}
                        </td>
                        <td className="p-3">{vaka?.doktor || '-'}</td>
                        <td className="p-3">
                          {formatDate(vaka?.vaka_tarihi)}
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() =>
                              openCase(item.kullanilan_vaka_id)
                            }
                            className="inline-flex items-center gap-2 text-cyan-300"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Aç
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
