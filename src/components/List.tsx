import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Eye,
  FileWarning,
  Mail,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Kapak, supabase, timeout } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

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
    .filter((field) => isEmptyValue(field.value))
    .map((field) => field.label);
}

function formatDate(value?: string | null): string {
  if (!value) return 'Tarih eksik';

  const datePart = value.split('T')[0];
  const [year, month, day] = datePart.split('-');

  if (!year || !month || !day) return value;

  return `${day}.${month}.${year}`;
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .trim();
}

export default function List() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<Kapak[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const activeFilter = searchParams.get('filter');
  const showMissingOnly = activeFilter === 'eksik-bilgi';

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: loadError } = await timeout(
        supabase
          .from('kapaklar')
          .select('*')
          .or('arsivlendi.eq.false,arsivlendi.is.null')
          .order('created_at', { ascending: false }),
        10000
      );

      if (loadError) throw loadError;

      setItems((data as Kapak[]) || []);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Liste yüklenemedi.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const missingCaseCount = useMemo(() => {
    return items.filter((item) => getMissingFields(item).length > 0)
      .length;
  }, [items]);

  const visibleItems = useMemo(() => {
    const normalizedSearchTerm = normalizeText(searchTerm);

    return items.filter((item) => {
      const missingFields = getMissingFields(item);

      if (showMissingOnly && missingFields.length === 0) {
        return false;
      }

      if (!normalizedSearchTerm) {
        return true;
      }

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

      return searchableText.includes(normalizedSearchTerm);
    });
  }, [items, searchTerm, showMissingOnly]);

  const showAllCases = () => {
    const nextParams = new URLSearchParams(searchParams);

    nextParams.delete('filter');
    setSearchParams(nextParams);
  };

  const showMissingCases = () => {
    const nextParams = new URLSearchParams(searchParams);

    nextParams.set('filter', 'eksik-bilgi');
    setSearchParams(nextParams);
  };

  const clearSearch = () => {
    setSearchTerm('');
  };

  const archiveCase = async (id: string) => {
    const ok = window.confirm(
      'Bu vaka arşive taşınsın mı? Ana listeden kaldırılacak ancak silinmeyecek.'
    );

    if (!ok) return;

    setProcessingId(id);

    try {
      const { error: archiveError } = await timeout(
        supabase
          .from('kapaklar')
          .update({
            arsivlendi: true,
            arsivlenme_tarihi: new Date().toISOString(),
          })
          .eq('id', id),
        10000
      );

      if (archiveError) throw archiveError;

      setItems((previousItems) =>
        previousItems.filter((item) => item.id !== id)
      );
    } catch (archiveError: unknown) {
      window.alert(
        archiveError instanceof Error
          ? archiveError.message
          : 'Vaka arşivlenemedi.'
      );
    } finally {
      setProcessingId(null);
    }
  };

  const deleteCase = async (id: string) => {
    if (!isAdmin) {
      window.alert('Bu işlemi sadece admin yapabilir.');
      return;
    }

    const ok = window.confirm(
      'Bu vaka kalıcı olarak silinsin mi? Bu işlem geri alınamaz.'
    );

    if (!ok) return;

    setProcessingId(id);

    try {
      const { error: deleteError } = await timeout(
        supabase.from('kapaklar').delete().eq('id', id),
        10000
      );

      if (deleteError) throw deleteError;

      setItems((previousItems) =>
        previousItems.filter((item) => item.id !== id)
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
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-5 text-sm text-slate-300">
        Vaka kayıtları yükleniyor...
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
            {showMissingOnly
              ? 'Eksik Bilgili Vakalar'
              : 'Vakalar'}
          </h1>

          <p className="page-description">
            {showMissingOnly
              ? 'Hasta ve kullanılan kapak izlenebilirliği için tamamlanması gereken kayıtlar'
              : 'Aktif vaka kayıtları'}
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

      <section className="surface grid grid-cols-2 gap-1 p-1 sm:flex sm:w-fit">
        <button
          type="button"
          onClick={showAllCases}
          className={`min-h-10 rounded-lg px-3 py-2 text-xs font-semibold transition sm:min-w-32 ${
            !showMissingOnly
              ? 'bg-cyan-600 text-white'
              : 'text-slate-400 hover:bg-slate-700 hover:text-white'
          }`}
        >
          Tüm Vakalar
          <span className="ml-1.5 opacity-75">
            ({items.length})
          </span>
        </button>

        <button
          type="button"
          onClick={showMissingCases}
          className={`min-h-10 rounded-lg px-3 py-2 text-xs font-semibold transition sm:min-w-40 ${
            showMissingOnly
              ? 'bg-amber-600 text-white'
              : 'text-slate-400 hover:bg-slate-700 hover:text-white'
          }`}
        >
          Eksik Bilgiler
          <span className="ml-1.5 opacity-75">
            ({missingCaseCount})
          </span>
        </button>
      </section>

      {showMissingOnly && (
        <section className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4">
          <div className="flex items-start gap-3">
            <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />

            <div>
              <p className="text-sm font-semibold text-amber-200">
                İzlenebilirlik kontrolü
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-300">
                Hasta adı, vaka tarihi, merkez, doktor, kapak
                tipi, kapak ölçüsü ve LOT numarasından biri eksik
                olan kayıtlar gösteriliyor.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="relative min-w-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

        <input
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Hasta, merkez, doktor, kapak veya LOT ara..."
          className="field-control pl-10 pr-10"
        />

        {searchTerm && (
          <button
            type="button"
            onClick={clearSearch}
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

        {showMissingOnly && visibleItems.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-amber-300">
            <FileWarning className="h-3.5 w-3.5" />
            Tamamlanması gerekiyor
          </div>
        )}
      </section>

      {visibleItems.length === 0 ? (
        <section className="rounded-xl border border-slate-700 bg-slate-800/70 px-5 py-10 text-center">
          {showMissingOnly && !searchTerm ? (
            <>
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-300" />

              <p className="mt-3 text-sm font-semibold text-emerald-200">
                Eksik bilgili vaka bulunmuyor
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Aktif vakaların kritik izlenebilirlik alanları
                tamamlanmış görünüyor.
              </p>
            </>
          ) : (
            <>
              <Search className="mx-auto h-7 w-7 text-slate-600" />

              <p className="mt-3 text-sm font-semibold text-slate-300">
                Uygun kayıt bulunamadı
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Arama metnini veya seçili filtreyi değiştirin.
              </p>
            </>
          )}
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
                    <th className="w-[12%] px-3 py-2.5">Kapak</th>
                    <th className="w-[10%] px-3 py-2.5">LOT</th>
                    <th className="w-[9%] px-3 py-2.5">Durum</th>
                    <th className="w-[13%] px-3 py-2.5 text-right">İşlemler</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800/80">
                  {visibleItems.map((item) => {
                    const missingFields = getMissingFields(item);
                    const hasMissingInformation = missingFields.length > 0;
                    const isProcessing = processingId === item.id;

                    return (
                      <tr
                        key={item.id}
                        className="h-14 transition-colors hover:bg-slate-800/40"
                      >
                        <td className="px-3 py-2 text-xs text-slate-400">
                          {formatDate(item.vaka_tarihi)}
                        </td>

                        <td className="px-3 py-2">
                          <p className={`truncate text-xs font-semibold ${item.hasta_adi ? 'text-slate-100' : 'text-amber-300'}`}>
                            {item.hasta_adi || 'Hasta adı eksik'}
                          </p>
                        </td>

                        <td className="px-3 py-2">
                          <p className={`truncate text-xs ${item.merkez_hastane ? 'text-slate-300' : 'text-amber-300'}`} title={item.merkez_hastane || undefined}>
                            {item.merkez_hastane || 'Merkez eksik'}
                          </p>
                        </td>

                        <td className="px-3 py-2">
                          <p className={`truncate text-xs ${item.doktor ? 'text-slate-300' : 'text-amber-300'}`} title={item.doktor || undefined}>
                            {item.doktor || 'Doktor eksik'}
                          </p>
                        </td>

                        <td className="px-3 py-2 text-xs text-cyan-300">
                          <p className="truncate">
                            {item.kapak_tipi || 'Tip eksik'}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            {item.kapak_size ? `${item.kapak_size} mm` : 'Ölçü eksik'}
                          </p>
                        </td>

                        <td className="px-3 py-2">
                          <span className={`font-mono text-xs ${item.lot_no ? 'text-slate-300' : 'text-amber-300'}`}>
                            {item.lot_no || 'Eksik'}
                          </span>
                        </td>

                        <td className="px-3 py-2">
                          {hasMissingInformation ? (
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
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              to={`/view/${item.id}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-700 hover:text-cyan-300"
                              title="Vakayı görüntüle ve mail oluştur"
                            >
                              <Mail className="h-4 w-4" />
                            </Link>

                            <Link
                              to={`/edit/${item.id}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-700 hover:text-cyan-300"
                              title={hasMissingInformation ? 'Eksikleri tamamla' : 'Düzenle'}
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>

                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => void archiveCase(item.id)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-amber-500/10 hover:text-amber-300 disabled:opacity-40"
                              title="Arşivle"
                            >
                              <Archive className="h-4 w-4" />
                            </button>

                            {isAdmin && (
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => void deleteCase(item.id)}
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
          {visibleItems.map((item) => {
            const missingFields = getMissingFields(item);
            const hasMissingInformation =
              missingFields.length > 0;
            const isProcessing = processingId === item.id;

            return (
              <article
                key={item.id}
                className={`min-w-0 rounded-xl border p-3 ${
                  hasMissingInformation
                    ? 'border-amber-500/25 bg-amber-500/[0.045]'
                    : 'border-slate-700 bg-slate-800/80'
                }`}
              >
                <div className="min-w-0">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2
                        className={`truncate text-sm font-semibold ${
                          item.hasta_adi
                            ? 'text-white'
                            : 'text-amber-200'
                        }`}
                      >
                        {item.hasta_adi || 'Hasta adı eksik'}
                      </h2>

                      {hasMissingInformation && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200">
                          <FileWarning className="h-3 w-3" />
                          {missingFields.length} eksik alan
                        </span>
                      )}
                    </div>

                    <p className="mt-1.5 break-words text-xs leading-5 text-slate-400">
                      <span
                        className={
                          item.vaka_tarihi
                            ? ''
                            : 'text-amber-300'
                        }
                      >
                        {formatDate(item.vaka_tarihi)}
                      </span>

                      <span className="mx-1.5 text-slate-600">
                        •
                      </span>

                      <span
                        className={
                          item.merkez_hastane
                            ? ''
                            : 'text-amber-300'
                        }
                      >
                        {item.merkez_hastane ||
                          'Merkez bilgisi eksik'}
                      </span>

                      <span className="mx-1.5 text-slate-600">
                        •
                      </span>

                      <span
                        className={
                          item.doktor
                            ? ''
                            : 'text-amber-300'
                        }
                      >
                        {item.doktor || 'Doktor bilgisi eksik'}
                      </span>
                    </p>

                    <p className="mt-1 break-words text-xs leading-5 text-cyan-300">
                      <span
                        className={
                          item.kapak_tipi
                            ? ''
                            : 'text-amber-300'
                        }
                      >
                        {item.kapak_tipi || 'Kapak tipi eksik'}
                      </span>

                      <span className="mx-1.5 text-slate-600">
                        •
                      </span>

                      <span
                        className={
                          item.kapak_size
                            ? ''
                            : 'text-amber-300'
                        }
                      >
                        {item.kapak_size
                          ? `${item.kapak_size} mm`
                          : 'Kapak ölçüsü eksik'}
                      </span>

                      <span className="mx-1.5 text-slate-600">
                        •
                      </span>

                      <span
                        className={
                          item.lot_no
                            ? ''
                            : 'text-amber-300'
                        }
                      >
                        LOT: {item.lot_no || 'Eksik'}
                      </span>
                    </p>
                  </div>

                </div>

                {hasMissingInformation && (
                  <div className="mt-3 rounded-lg border border-amber-500/20 bg-slate-900/30 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                      Eksik alanlar
                    </p>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {missingFields.map((field) => (
                        <span
                          key={field}
                          className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-100"
                        >
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 flex min-w-0 items-center justify-end gap-1 border-t border-slate-700/70 pt-2.5">
                  <Link
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-cyan-300"
                    to={`/view/${item.id}`}
                  >
                    <Eye className="h-4 w-4" />
                    Mail
                  </Link>

                  <Link
                    className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${
                      hasMissingInformation
                        ? 'text-amber-300 hover:bg-amber-500/10'
                        : 'text-cyan-300 hover:bg-cyan-500/10'
                    }`}
                    to={`/edit/${item.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                    {hasMissingInformation
                      ? 'Tamamla'
                      : 'Düzenle'}
                  </Link>

                  <button
                    type="button"
                    disabled={isProcessing}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-amber-500/10 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void archiveCase(item.id)}
                    aria-label="Vakayı arşivle"
                  >
                    <Archive className="h-4 w-4" />
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      disabled={isProcessing}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void deleteCase(item.id)}
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
