import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileWarning,
  Mail,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { supabase, timeout } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { downloadExcel } from '../lib/excel';

const DATABASE_PAGE_SIZE = 1000;
const BACKUP_WARNING_LIMIT = 1000;

type CaseSource = 'valveflow' | 'legacy';

type CurrentCaseRow = {
  id: string;
  vaka_tarihi: string | null;
  merkez_hastane: string | null;
  doktor: string | null;
  hasta_adi: string | null;
  kapak_tipi: string | null;
  kapak_size: string | number | null;
  lot_no: string | null;
  son_kul_tarihi: string | null;
  pre_balon: string | null;
  post_balon: string | null;
  paravalvuler_ay: string | null;
  proglide_adedi: number | null;
  crimp_yapan: string | null;
  created_at: string | null;
};

type LegacyCaseRow = {
  id: string;
  urun_adi: string | null;
  kapak_boyutu: number | null;
  lot_no: string | null;
  son_kullanma_tarihi: string | null;
  kullanim_tarihi: string | null;
  merkez_hastane: string | null;
  doktor: string | null;
  hasta_adi: string | null;
  kaynak: string | null;
};

type UnifiedCase = {
  key: string;
  recordId: string;
  source: CaseSource;
  vaka_tarihi: string | null;
  merkez_hastane: string | null;
  doktor: string | null;
  hasta_adi: string | null;
  kapak_tipi: string | null;
  kapak_size: string | number | null;
  lot_no: string | null;
  son_kul_tarihi: string | null;
  pre_balon: string | null;
  post_balon: string | null;
  paravalvuler_ay: string | null;
  proglide_adedi: number | null;
  crimp_yapan: string | null;
  created_at: string | null;
};

type RequiredField = {
  label: string;
  value: unknown;
};

function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  );
}

function getMissingFields(item: UnifiedCase): string[] {
  const requiredFields: RequiredField[] = [
    { label: 'Hasta Adı', value: item.hasta_adi },
    { label: 'Vaka Tarihi', value: item.vaka_tarihi },
    {
      label: 'Merkez / Hastane',
      value: item.merkez_hastane,
    },
    { label: 'Doktor', value: item.doktor },
    { label: 'Kapak Tipi', value: item.kapak_tipi },
    { label: 'Kapak Ölçüsü', value: item.kapak_size },
    { label: 'LOT Numarası', value: item.lot_no },
  ];

  return requiredFields
    .filter(field => isEmptyValue(field.value))
    .map(field => field.label);
}

function formatDate(value?: string | null): string {
  if (!value) return 'Tarih eksik';

  const datePart = value.split('T')[0];
  const [year, month, day] = datePart.split('-');

  if (!year || !month || !day) return value;

  return `${day}.${month}.${year}`;
}

function formatSize(
  value?: string | number | null
): string {
  if (value === null || value === undefined) {
    return 'Ölçü eksik';
  }

  const text = String(value).trim();

  if (!text) return 'Ölçü eksik';

  return /mm$/i.test(text) ? text : `${text} mm`;
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .trim();
}

function normalizeLot(value: string | null): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/\(20\)01$/i, '')
    .replace(/2001$/i, '');
}

function duplicateKey(item: {
  vaka_tarihi: string | null;
  lot_no: string | null;
  hasta_adi: string | null;
}): string {
  return [
    item.vaka_tarihi?.split('T')[0] || '',
    normalizeLot(item.lot_no),
    normalizeText(item.hasta_adi),
  ].join('|');
}

function rowTime(item: UnifiedCase): number {
  const value = item.vaka_tarihi || item.created_at;

  if (!value) return 0;

  const timestamp = new Date(value).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

async function fetchAllCurrentCases(): Promise<CurrentCaseRow[]> {
  const allRows: CurrentCaseRow[] = [];

  for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
    const { data, error } = await timeout(
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
            son_kul_tarihi,
            pre_balon,
            post_balon,
            paravalvuler_ay,
            proglide_adedi,
            crimp_yapan,
            created_at
          `
        )
        .order('vaka_tarihi', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, from + DATABASE_PAGE_SIZE - 1),
      15000
    );

    if (error) throw error;

    const batch = (data || []) as CurrentCaseRow[];
    allRows.push(...batch);

    if (batch.length < DATABASE_PAGE_SIZE) break;
  }

  return allRows;
}

async function fetchAllLegacyCases(): Promise<LegacyCaseRow[]> {
  const allRows: LegacyCaseRow[] = [];

  for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
    const { data, error } = await timeout(
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
        .order('kullanim_tarihi', { ascending: false })
        .range(from, from + DATABASE_PAGE_SIZE - 1),
      15000
    );

    if (error) throw error;

    const batch = (data || []) as LegacyCaseRow[];
    allRows.push(...batch);

    if (batch.length < DATABASE_PAGE_SIZE) break;
  }

  return allRows;
}

function mergeCases(
  currentRows: CurrentCaseRow[],
  legacyRows: LegacyCaseRow[]
): UnifiedCase[] {
  const currentItems: UnifiedCase[] = currentRows.map(item => ({
    key: `valveflow-${item.id}`,
    recordId: item.id,
    source: 'valveflow',
    vaka_tarihi: item.vaka_tarihi,
    merkez_hastane: item.merkez_hastane,
    doktor: item.doktor,
    hasta_adi: item.hasta_adi,
    kapak_tipi: item.kapak_tipi,
    kapak_size: item.kapak_size,
    lot_no: item.lot_no,
    son_kul_tarihi: item.son_kul_tarihi,
    pre_balon: item.pre_balon,
    post_balon: item.post_balon,
    paravalvuler_ay: item.paravalvuler_ay,
    proglide_adedi: item.proglide_adedi,
    crimp_yapan: item.crimp_yapan,
    created_at: item.created_at,
  }));

  const currentDuplicateKeys = new Set(
    currentItems.map(duplicateKey)
  );

  const legacyItems: UnifiedCase[] = legacyRows
    .map(item => ({
      key: `legacy-${item.id}`,
      recordId: item.id,
      source: 'legacy' as const,
      vaka_tarihi: item.kullanim_tarihi,
      merkez_hastane: item.merkez_hastane,
      doktor: item.doktor,
      hasta_adi: item.hasta_adi,
      kapak_tipi: item.urun_adi || 'Evolut Pro+',
      kapak_size: item.kapak_boyutu,
      lot_no: item.lot_no,
      son_kul_tarihi: item.son_kullanma_tarihi,
      pre_balon: null,
      post_balon: null,
      paravalvuler_ay: null,
      proglide_adedi: null,
      crimp_yapan: item.kaynak || 'Eski Liste',
      created_at: item.kullanim_tarihi,
    }))
    .filter(item => !currentDuplicateKeys.has(duplicateKey(item)));

  return [...currentItems, ...legacyItems].sort(
    (first, second) => rowTime(second) - rowTime(first)
  );
}

export default function List() {
  const { profile } = useAuth();
  const isAdmin =
    profile?.role === 'admin' ||
    profile?.yetki === 'admin' ||
    profile?.is_admin === true;

  const [items, setItems] = useState<UnifiedCase[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [processingId, setProcessingId] =
    useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [currentRows, legacyRows] = await Promise.all([
        fetchAllCurrentCases(),
        fetchAllLegacyCases(),
      ]);

      setItems(mergeCases(currentRows, legacyRows));
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Vaka listesi yüklenemedi.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sourceCounts = useMemo(
    () => ({
      valveflow: items.filter(item => item.source === 'valveflow')
        .length,
      legacy: items.filter(item => item.source === 'legacy').length,
    }),
    [items]
  );

  const visibleItems = useMemo(() => {
    const query = normalizeText(searchTerm);

    if (!query) return items;

    return items.filter(item => {
      const searchableText = [
        item.hasta_adi,
        item.vaka_tarihi,
        item.merkez_hastane,
        item.doktor,
        item.kapak_tipi,
        item.kapak_size,
        item.lot_no,
        item.crimp_yapan,
        item.source === 'legacy' ? 'eski liste' : 'valveflow',
      ]
        .map(normalizeText)
        .join(' ');

      return searchableText.includes(query);
    });
  }, [items, searchTerm]);

  async function downloadCaseBackup() {
    if (items.length === 0 || exporting) return;

    setExporting(true);

    try {
      await downloadExcel({
        rows: items.map((item, index) => ({
          No: index + 1,
          Kaynak:
            item.source === 'legacy' ? 'Eski Liste' : 'ValveFlow',
          'Vaka Tarihi': formatDate(item.vaka_tarihi),
          'Hasta Adı': item.hasta_adi || '',
          Merkez: item.merkez_hastane || '',
          Doktor: item.doktor || '',
          'Kapak Tipi': item.kapak_tipi || '',
          'Kapak Ölçüsü': formatSize(item.kapak_size),
          'LOT No': item.lot_no || '',
          'Son Kullanma Tarihi': formatDate(
            item.son_kul_tarihi
          ),
          'Pre Balon': item.pre_balon || '',
          'Post Balon': item.post_balon || '',
          'Paravalvüler AY': item.paravalvuler_ay || '',
          'Proglide Adedi': item.proglide_adedi ?? '',
          'Crimp Yapan / Kaynak': item.crimp_yapan || '',
        })),
        widths: [
          8, 14, 14, 25, 32, 25, 18, 16, 20, 20, 16, 16,
          20, 18, 24,
        ],
        sheetName: 'Tüm Vakalar',
        fileName: `ValveFlow_Tum_Vakalar_${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx`,
      });
    } catch (exportError: unknown) {
      window.alert(
        exportError instanceof Error
          ? exportError.message
          : 'Excel yedeği oluşturulamadı.'
      );
    } finally {
      setExporting(false);
    }
  }

  async function deleteCase(item: UnifiedCase) {
    if (!isAdmin || item.source !== 'valveflow') {
      window.alert(
        'Yalnızca ValveFlow kayıtları admin tarafından silinebilir.'
      );
      return;
    }

    const confirmed = window.confirm(
      'Bu vaka kalıcı olarak silinsin mi? Vakada kullanılan kapaklar yeniden stoka alınacaktır.'
    );

    if (!confirmed) return;

    setProcessingId(item.key);

    try {
      const { data, error: deleteError } = await timeout(
        supabase.rpc(
          'delete_case_and_restore_stock',
          {
            p_case_id: item.recordId,
          }
        ),
        15000
      );

      if (deleteError) throw deleteError;

      const result = data as {
        success?: boolean;
      } | null;

      if (!result?.success) {
        throw new Error(
          'Vaka silme işlemi veritabanı tarafından doğrulanamadı.'
        );
      }

      setItems(previous =>
        previous.filter(row => row.key !== item.key)
      );
    } catch (deleteError: unknown) {
      window.alert(
        deleteError instanceof Error
          ? deleteError.message
          : 'Vaka silinemedi.'
      );
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-5 text-sm text-slate-300">
        Yeni ve eski vaka kayıtları yükleniyor...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />

          <div>
            <p className="text-sm font-semibold text-red-200">
              Vaka listesi yüklenemedi
            </p>
            <p className="mt-1 text-xs text-red-300">{error}</p>

            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 rounded-lg border border-red-400/30 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/10"
            >
              Tekrar Dene
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 pb-16">
      <section className="page-header">
        <div>
          <h1 className="page-title">Tüm Vakalar</h1>
          <p className="page-description">
            ValveFlow kayıtları ve eski listeniz tek ekranda
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button
            type="button"
            disabled={exporting || items.length === 0}
            onClick={() => void downloadCaseBackup()}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-4 py-2.5 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Hazırlanıyor...' : "Excel'e Aktar"}
          </button>

          <Link
            to="/add"
            className="button-primary w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Yeni Vaka
          </Link>
        </div>
      </section>

      {items.length >= BACKUP_WARNING_LIMIT && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <div>
                <p className="text-sm font-semibold text-amber-200">
                  Excel yedeği oluşturun
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  Toplam {items.length} vaka kaydına ulaştınız.
                  Kayıtlar silinmeyecek; güvenli bir yedek için Excel
                  dosyasını bilgisayarınıza indirin.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={exporting}
              onClick={() => void downloadCaseBackup()}
              className="button-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {exporting
                ? 'Hazırlanıyor...'
                : 'Excel Yedeğini İndir'}
            </button>
          </div>
        </section>
      )}

      <section className="grid grid-cols-3 gap-2 sm:max-w-xl">
        <div className="surface p-3">
          <p className="text-[11px] text-slate-500">Toplam</p>
          <p className="mt-1 text-xl font-bold text-white">
            {items.length}
          </p>
        </div>

        <div className="surface p-3">
          <p className="text-[11px] text-slate-500">ValveFlow</p>
          <p className="mt-1 text-xl font-bold text-cyan-300">
            {sourceCounts.valveflow}
          </p>
        </div>

        <div className="surface p-3">
          <p className="text-[11px] text-slate-500">Eski Liste</p>
          <p className="mt-1 text-xl font-bold text-violet-300">
            {sourceCounts.legacy}
          </p>
        </div>
      </section>

      <section className="relative min-w-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={event => setSearchTerm(event.target.value)}
          placeholder="Hasta, merkez, doktor, kapak veya LOT ara..."
          className="field-control pl-10 pr-10"
        />

        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            aria-label="Aramayı temizle"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 transition hover:bg-slate-700 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </section>

      <p className="text-xs text-slate-500">
        Gösterilen kayıt:{' '}
        <strong className="text-slate-300">{visibleItems.length}</strong>
      </p>

      {visibleItems.length === 0 ? (
        <section className="rounded-xl border border-slate-700 bg-slate-800/70 px-5 py-10 text-center">
          <Search className="mx-auto h-7 w-7 text-slate-600" />
          <p className="mt-3 text-sm font-semibold text-slate-300">
            Uygun kayıt bulunamadı
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Arama metnini değiştirin.
          </p>
        </section>
      ) : (
        <>
          <section className="surface hidden min-w-0 overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left">
                <thead className="border-b border-slate-800 bg-slate-900/70">
                  <tr className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <th className="w-[10%] px-3 py-2.5">Tarih</th>
                    <th className="w-[15%] px-3 py-2.5">Hasta</th>
                    <th className="w-[17%] px-3 py-2.5">Merkez</th>
                    <th className="w-[14%] px-3 py-2.5">Doktor</th>
                    <th className="w-[13%] px-3 py-2.5">Kapak</th>
                    <th className="w-[11%] px-3 py-2.5">LOT</th>
                    <th className="w-[10%] px-3 py-2.5">Kaynak</th>
                    <th className="w-[10%] px-3 py-2.5 text-right">
                      İşlem
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800/80">
                  {visibleItems.map(item => {
                    const missingFields = getMissingFields(item);
                    const isLegacy = item.source === 'legacy';
                    const isProcessing = processingId === item.key;

                    return (
                      <tr
                        key={item.key}
                        className="h-14 transition-colors hover:bg-slate-800/40"
                      >
                        <td className="px-3 py-2 text-xs text-slate-400">
                          {formatDate(item.vaka_tarihi)}
                        </td>
                        <td className="px-3 py-2">
                          <p className="truncate text-xs font-semibold text-slate-100">
                            {item.hasta_adi || 'Hasta adı eksik'}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <p className="truncate text-xs text-slate-300">
                            {item.merkez_hastane || 'Merkez eksik'}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <p className="truncate text-xs text-slate-300">
                            {item.doktor || 'Doktor eksik'}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-xs text-cyan-300">
                          <p className="truncate">
                            {item.kapak_tipi || 'Tip eksik'}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            {formatSize(item.kapak_size)}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs text-slate-300">
                            {item.lot_no || 'Eksik'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {isLegacy ? (
                            <span className="status-badge border-violet-500/25 bg-violet-500/10 text-violet-200">
                              Eski Liste
                            </span>
                          ) : missingFields.length > 0 ? (
                            <span className="status-badge border-amber-500/25 bg-amber-500/10 text-amber-200">
                              {missingFields.length} eksik
                            </span>
                          ) : (
                            <span className="status-badge border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                              Tam
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isLegacy ? (
                            <div className="text-right text-xs text-slate-600">
                              —
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <Link
                                to={`/view/${item.recordId}`}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-700 hover:text-cyan-300"
                                title="Vakayı görüntüle"
                              >
                                <Mail className="h-4 w-4" />
                              </Link>
                              <Link
                                to={`/edit/${item.recordId}`}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-700 hover:text-cyan-300"
                                title="Düzenle"
                              >
                                <Pencil className="h-4 w-4" />
                              </Link>

                              {isAdmin && (
                                <button
                                  type="button"
                                  disabled={isProcessing}
                                  onClick={() => void deleteCase(item)}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                                  title="Sil"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2 md:hidden">
            {visibleItems.map(item => {
              const missingFields = getMissingFields(item);
              const isLegacy = item.source === 'legacy';
              const isProcessing = processingId === item.key;

              return (
                <article
                  key={item.key}
                  className={`min-w-0 rounded-2xl border bg-slate-950/20 p-4 ${
                    isLegacy
                      ? 'border-violet-500/30'
                      : missingFields.length > 0
                        ? 'border-amber-500/30'
                        : 'border-cyan-500/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-semibold text-white">
                          {item.hasta_adi || 'Hasta adı eksik'}
                        </h2>

                        {isLegacy ? (
                          <span className="rounded-md border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-200">
                            Eski Liste
                          </span>
                        ) : missingFields.length > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200">
                            <FileWarning className="h-3 w-3" />
                            {missingFields.length} eksik
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Tam
                          </span>
                        )}
                      </div>

                      <p className="mt-1.5 break-words text-xs leading-5 text-slate-400">
                        {formatDate(item.vaka_tarihi)}
                        <span className="mx-1.5 text-slate-600">•</span>
                        {item.merkez_hastane || 'Merkez eksik'}
                        <span className="mx-1.5 text-slate-600">•</span>
                        {item.doktor || 'Doktor eksik'}
                      </p>

                      <p className="mt-1 break-words text-xs leading-5 text-cyan-300">
                        {item.kapak_tipi || 'Kapak tipi eksik'}
                        <span className="mx-1.5 text-slate-600">•</span>
                        {formatSize(item.kapak_size)}
                        <span className="mx-1.5 text-slate-600">•</span>
                        LOT: {item.lot_no || 'Eksik'}
                      </p>
                    </div>
                  </div>

                  {isLegacy ? (
                    <div className="mt-4 border-t border-violet-500/15 pt-3 text-right text-xs text-violet-300/70">
                      Geçmiş liste kaydı
                    </div>
                  ) : (
                    <div className="mt-4 flex min-w-0 items-center justify-end gap-1 border-t border-cyan-500/10 pt-3">
                      <Link
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-cyan-300"
                        to={`/view/${item.recordId}`}
                        title="Vakayı görüntüle"
                        aria-label="Vakayı görüntüle"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      <Link
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-cyan-300 transition hover:bg-cyan-500/10"
                        to={`/edit/${item.recordId}`}
                        title="Vakayı düzenle"
                        aria-label="Vakayı düzenle"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>

                      {isAdmin && (
                        <button
                          type="button"
                          disabled={isProcessing}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                          onClick={() => void deleteCase(item)}
                          title="Vakayı sil"
                          aria-label="Vakayı sil"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
