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
import {
  Kapak,
  supabase,
  timeout,
} from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { downloadExcel } from '../lib/excel';

const DATABASE_PAGE_SIZE = 1000;
const BACKUP_WARNING_LIMIT = 1000;

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

function getMissingFields(item: Kapak): string[] {
  const requiredFields: RequiredField[] = [
    {
      label: 'Hasta Adı',
      value: item.hasta_adi,
    },
    {
      label: 'Vaka Tarihi',
      value: item.vaka_tarihi,
    },
    {
      label: 'Merkez / Hastane',
      value: item.merkez_hastane,
    },
    {
      label: 'Doktor',
      value: item.doktor,
    },
    {
      label: 'Kapak Tipi',
      value: item.kapak_tipi,
    },
    {
      label: 'Kapak Ölçüsü',
      value: item.kapak_size,
    },
    {
      label: 'LOT Numarası',
      value: item.lot_no,
    },
  ];

  return requiredFields
    .filter(field => isEmptyValue(field.value))
    .map(field => field.label);
}

function formatDate(
  value?: string | null
): string {
  if (!value) return 'Tarih eksik';

  const datePart = value.split('T')[0];
  const [year, month, day] =
    datePart.split('-');

  if (!year || !month || !day) {
    return value;
  }

  return `${day}.${month}.${year}`;
}

function formatSize(
  value?: string | number | null
): string {
  if (value === null || value === undefined) {
    return 'Ölçü eksik';
  }

  const text = String(value).trim();

  if (!text) {
    return 'Ölçü eksik';
  }

  return /mm$/i.test(text)
    ? text
    : `${text} mm`;
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .trim();
}

async function fetchAllCases(): Promise<
  Kapak[]
> {
  const allRows: Kapak[] = [];

  for (
    let from = 0;
    ;
    from += DATABASE_PAGE_SIZE
  ) {
    const { data, error } = await timeout(
      supabase
        .from('kapaklar')
        .select('*')
        .order('vaka_tarihi', {
          ascending: false,
        })
        .order('created_at', {
          ascending: false,
        })
        .range(
          from,
          from + DATABASE_PAGE_SIZE - 1
        ),
      15000
    );

    if (error) {
      throw error;
    }

    const batch = (data as Kapak[]) || [];
    allRows.push(...batch);

    if (batch.length < DATABASE_PAGE_SIZE) {
      break;
    }
  }

  return allRows;
}

export default function List() {
  const { profile } = useAuth();
  const isAdmin =
    profile?.role === 'admin' ||
    profile?.yetki === 'admin' ||
    profile?.is_admin === true;

  const [items, setItems] =
    useState<Kapak[]>([]);
  const [searchTerm, setSearchTerm] =
    useState('');
  const [loading, setLoading] =
    useState(true);
  const [exporting, setExporting] =
    useState(false);
  const [
    processingId,
    setProcessingId,
  ] = useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const rows = await fetchAllCases();
      setItems(rows);
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

  const missingCaseCount = useMemo(
    () =>
      items.filter(
        item =>
          getMissingFields(item).length > 0
      ).length,
    [items]
  );

  const visibleItems = useMemo(() => {
    const normalizedSearchTerm =
      normalizeText(searchTerm);

    if (!normalizedSearchTerm) {
      return items;
    }

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
      ]
        .map(normalizeText)
        .join(' ');

      return searchableText.includes(
        normalizedSearchTerm
      );
    });
  }, [items, searchTerm]);

  async function downloadCaseBackup() {
    if (items.length === 0 || exporting) {
      return;
    }

    setExporting(true);

    try {
      const rows = items.map(
        (item, index) => ({
          No: index + 1,
          'Vaka Tarihi': formatDate(
            item.vaka_tarihi
          ),
          'Hasta Adı': item.hasta_adi || '',
          Merkez:
            item.merkez_hastane || '',
          Doktor: item.doktor || '',
          'Kapak Tipi':
            item.kapak_tipi || '',
          'Kapak Ölçüsü': formatSize(
            item.kapak_size
          ),
          'LOT No': item.lot_no || '',
          'Son Kullanma Tarihi':
            formatDate(
              item.son_kul_tarihi
            ),
          'Pre Balon':
            item.pre_balon || '',
          'Post Balon':
            item.post_balon || '',
          'Paravalvüler AY':
            item.paravalvuler_ay || '',
          'Proglide Adedi':
            item.proglide_adedi ?? '',
          'Crimp Yapan':
            item.crimp_yapan || '',
        })
      );

      await downloadExcel({
        rows,
        widths: [
          8, 14, 25, 32, 25, 18, 16,
          20, 20, 16, 16, 20, 18, 24,
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

  async function deleteCase(id: string) {
    if (!isAdmin) {
      window.alert(
        'Bu işlemi sadece admin yapabilir.'
      );
      return;
    }

    const confirmed = window.confirm(
      'Bu vaka kalıcı olarak silinsin mi? Bu işlem geri alınamaz.'
    );

    if (!confirmed) return;

    setProcessingId(id);

    try {
      const { error: deleteError } =
        await timeout(
          supabase
            .from('kapaklar')
            .delete()
            .eq('id', id),
          10000
        );

      if (deleteError) {
        throw deleteError;
      }

      setItems(previousItems =>
        previousItems.filter(
          item => item.id !== id
        )
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
        Tüm vaka kayıtları yükleniyor...
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

            <p className="mt-1 text-xs text-red-300">
              {error}
            </p>

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
          <h1 className="page-title">
            Tüm Vakalar
          </h1>

          <p className="page-description">
            Güncel ve geçmiş bütün vaka
            kayıtları tek listede
          </p>
        </div>

        <Link
          to="/add"
          className="button-primary w-full sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Yeni Vaka
        </Link>
      </section>

      {items.length >=
        BACKUP_WARNING_LIMIT && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />

              <div>
                <p className="text-sm font-semibold text-amber-200">
                  Excel yedeği oluşturun
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-300">
                  Toplam {items.length} vaka
                  kaydına ulaştınız. Kayıtlar
                  silinmeyecek; güvenli bir
                  yedek için Excel dosyasını
                  bilgisayarınıza indirin.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={exporting}
              onClick={() =>
                void downloadCaseBackup()
              }
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

      <section className="grid grid-cols-2 gap-2 sm:max-w-md">
        <div className="surface p-3">
          <p className="text-[11px] text-slate-500">
            Toplam Vaka
          </p>
          <p className="mt-1 text-xl font-bold text-white">
            {items.length}
          </p>
        </div>

        <div className="surface p-3">
          <p className="text-[11px] text-slate-500">
            Eksik Bilgili
          </p>
          <p
            className={`mt-1 text-xl font-bold ${
              missingCaseCount > 0
                ? 'text-amber-300'
                : 'text-emerald-300'
            }`}
          >
            {missingCaseCount}
          </p>
        </div>
      </section>

      <section className="relative min-w-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

        <input
          type="text"
          value={searchTerm}
          onChange={event =>
            setSearchTerm(event.target.value)
          }
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

      <section className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Gösterilen kayıt:{' '}
          <strong className="text-slate-300">
            {visibleItems.length}
          </strong>
        </p>
      </section>

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
                    <th className="w-[10%] px-3 py-2.5">
                      Tarih
                    </th>
                    <th className="w-[15%] px-3 py-2.5">
                      Hasta
                    </th>
                    <th className="w-[17%] px-3 py-2.5">
                      Merkez
                    </th>
                    <th className="w-[14%] px-3 py-2.5">
                      Doktor
                    </th>
                    <th className="w-[12%] px-3 py-2.5">
                      Kapak
                    </th>
                    <th className="w-[10%] px-3 py-2.5">
                      LOT
                    </th>
                    <th className="w-[9%] px-3 py-2.5">
                      Durum
                    </th>
                    <th className="w-[13%] px-3 py-2.5 text-right">
                      İşlemler
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800/80">
                  {visibleItems.map(item => {
                    const missingFields =
                      getMissingFields(item);
                    const hasMissingInformation =
                      missingFields.length > 0;
                    const isProcessing =
                      processingId === item.id;

                    return (
                      <tr
                        key={item.id}
                        className="h-14 transition-colors hover:bg-slate-800/40"
                      >
                        <td className="px-3 py-2 text-xs text-slate-400">
                          {formatDate(
                            item.vaka_tarihi
                          )}
                        </td>

                        <td className="px-3 py-2">
                          <p
                            className={`truncate text-xs font-semibold ${
                              item.hasta_adi
                                ? 'text-slate-100'
                                : 'text-amber-300'
                            }`}
                          >
                            {item.hasta_adi ||
                              'Hasta adı eksik'}
                          </p>
                        </td>

                        <td className="px-3 py-2">
                          <p className="truncate text-xs text-slate-300">
                            {item.merkez_hastane ||
                              'Merkez eksik'}
                          </p>
                        </td>

                        <td className="px-3 py-2">
                          <p className="truncate text-xs text-slate-300">
                            {item.doktor ||
                              'Doktor eksik'}
                          </p>
                        </td>

                        <td className="px-3 py-2 text-xs text-cyan-300">
                          <p className="truncate">
                            {item.kapak_tipi ||
                              'Tip eksik'}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            {formatSize(
                              item.kapak_size
                            )}
                          </p>
                        </td>

                        <td className="px-3 py-2">
                          <span className="font-mono text-xs text-slate-300">
                            {item.lot_no ||
                              'Eksik'}
                          </span>
                        </td>

                        <td className="px-3 py-2">
                          {hasMissingInformation ? (
                            <span className="status-badge border-amber-500/25 bg-amber-500/10 text-amber-200">
                              {
                                missingFields.length
                              }{' '}
                              eksik
                            </span>
                          ) : (
                            <span className="status-badge border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                              Tam
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              to={`/view/${item.id}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-700 hover:text-cyan-300"
                              title="Vakayı görüntüle"
                            >
                              <Mail className="h-4 w-4" />
                            </Link>

                            <Link
                              to={`/edit/${item.id}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-700 hover:text-cyan-300"
                              title="Düzenle"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>

                            {isAdmin && (
                              <button
                                type="button"
                                disabled={
                                  isProcessing
                                }
                                onClick={() =>
                                  void deleteCase(
                                    item.id
                                  )
                                }
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                                title="Sil"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
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
              const missingFields =
                getMissingFields(item);
              const hasMissingInformation =
                missingFields.length > 0;
              const isProcessing =
                processingId === item.id;

              return (
                <article
                  key={item.id}
                  className={`min-w-0 rounded-xl border p-3 ${
                    hasMissingInformation
                      ? 'border-amber-500/25 bg-amber-500/[0.045]'
                      : 'border-slate-700 bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-semibold text-white">
                          {item.hasta_adi ||
                            'Hasta adı eksik'}
                        </h2>

                        {hasMissingInformation ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200">
                            <FileWarning className="h-3 w-3" />
                            {
                              missingFields.length
                            }{' '}
                            eksik
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Tam
                          </span>
                        )}
                      </div>

                      <p className="mt-1.5 break-words text-xs leading-5 text-slate-400">
                        {formatDate(
                          item.vaka_tarihi
                        )}
                        <span className="mx-1.5 text-slate-600">
                          •
                        </span>
                        {item.merkez_hastane ||
                          'Merkez eksik'}
                        <span className="mx-1.5 text-slate-600">
                          •
                        </span>
                        {item.doktor ||
                          'Doktor eksik'}
                      </p>

                      <p className="mt-1 break-words text-xs leading-5 text-cyan-300">
                        {item.kapak_tipi ||
                          'Kapak tipi eksik'}
                        <span className="mx-1.5 text-slate-600">
                          •
                        </span>
                        {formatSize(
                          item.kapak_size
                        )}
                        <span className="mx-1.5 text-slate-600">
                          •
                        </span>
                        LOT:{' '}
                        {item.lot_no || 'Eksik'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex min-w-0 items-center justify-end gap-1 border-t border-slate-700/70 pt-2.5">
                    <Link
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-cyan-300"
                      to={`/view/${item.id}`}
                    >
                      <Eye className="h-4 w-4" />
                      Görüntüle
                    </Link>

                    <Link
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/10"
                      to={`/edit/${item.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                      Düzenle
                    </Link>

                    {isAdmin && (
                      <button
                        type="button"
                        disabled={isProcessing}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                        onClick={() =>
                          void deleteCase(item.id)
                        }
                        aria-label="Vakayı sil"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
