import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, FileSpreadsheet, Filter, Search, X } from 'lucide-react';
import { Kapak, supabase, timeout } from '../lib/supabase';

function formatDate(value?: string | null): string {
  if (!value) return '';

  const datePart = value.split('T')[0];
  const parts = datePart.split('-');

  if (parts.length !== 3) return value;

  const [year, month, day] = parts;

  return `${day}.${month}.${year}`;
}

function normalizeText(value?: string | number | null): string {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .trim();
}

function createSafeFileNamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').trim();
}

export default function Export() {
  const [items, setItems] = useState<Kapak[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadItems = async () => {
      setLoading(true);
      setErrorMessage('');

      try {
        const { data, error } = await timeout(
          supabase
            .from('kapaklar')
            .select('*')
            .order('vaka_tarihi', { ascending: false }),
          10000
        );

        if (!isMounted) return;

        if (error) {
          setErrorMessage(error.message);
          setItems([]);
          return;
        }

        setItems((data as Kapak[]) || []);
      } catch (error) {
        if (!isMounted) return;

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Kayıtlar yüklenirken beklenmeyen bir hata oluştu.'
        );

        setItems([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadItems();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedSearchTerm = normalizeText(searchTerm);

    return items.filter((item) => {
      const caseDate = item.vaka_tarihi
        ? item.vaka_tarihi.split('T')[0]
        : '';

      const matchesStartDate =
        !startDate || (caseDate && caseDate >= startDate);

      const matchesEndDate =
        !endDate || (caseDate && caseDate <= endDate);

      const searchableText = [
        item.merkez_hastane,
        item.doktor,
        item.hasta_adi,
        item.kapak_tipi,
        item.kapak_size,
        item.lot_no,
        item.crimp_yapan,
      ]
        .map(normalizeText)
        .join(' ');

      const matchesSearch =
        !normalizedSearchTerm ||
        searchableText.includes(normalizedSearchTerm);

      return matchesStartDate && matchesEndDate && matchesSearch;
    });
  }, [items, searchTerm, startDate, endDate]);

  const clearFilters = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
  };

  const activeFilterCount = [
    Boolean(searchTerm.trim()),
    Boolean(startDate),
    Boolean(endDate),
  ].filter(Boolean).length;

  const exportToExcel = () => {
    if (filteredItems.length === 0 || exporting) return;

    setExporting(true);

    try {
      const rows = filteredItems.map((item, index) => ({
        No: index + 1,
        'Vaka Tarihi': formatDate(item.vaka_tarihi),
        Merkez: item.merkez_hastane || '',
        Doktor: item.doktor || '',
        'Hasta Adı': item.hasta_adi || '',
        'Kapak Tipi': item.kapak_tipi || '',
        'Kapak Size': item.kapak_size || '',
        'LOT No': item.lot_no || '',
        'Son Kullanma Tarihi': formatDate(item.son_kul_tarihi),
        'Pre Balon': item.pre_balon || '',
        'Post Balon': item.post_balon || '',
        'Paravalvüler AY': item.paravalvuler_ay || '',
        'Proglide Adedi': item.proglide_adedi ?? '',
        'Crimp Yapan': item.crimp_yapan || '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);

      worksheet['!cols'] = [
        { wch: 7 },
        { wch: 14 },
        { wch: 30 },
        { wch: 25 },
        { wch: 25 },
        { wch: 18 },
        { wch: 14 },
        { wch: 20 },
        { wch: 20 },
        { wch: 16 },
        { wch: 16 },
        { wch: 20 },
        { wch: 18 },
        { wch: 25 },
      ];

      if (worksheet['!ref']) {
        worksheet['!autofilter'] = {
          ref: worksheet['!ref'],
        };
      }

      const workbook = XLSX.utils.book_new();

      workbook.Props = {
        Title: 'ValveFlow Vaka Raporu',
        Subject: 'TAVI vaka kayıtları',
        Author: 'ValveFlow',
        Company: 'Fokus Sağlık',
        Comments: 'ValveFlow tarafından oluşturulmuştur.',
        CreatedDate: new Date(),
      };

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        'Vaka Kayıtları'
      );

      const today = new Date().toISOString().slice(0, 10);

      let fileNameDatePart = today;

      if (startDate && endDate) {
        fileNameDatePart = `${startDate}_${endDate}`;
      } else if (startDate) {
        fileNameDatePart = `${startDate}_sonrasi`;
      } else if (endDate) {
        fileNameDatePart = `${endDate}_oncesi`;
      }

      const fileName = createSafeFileNamePart(
        `ValveFlow_Vaka_Raporu_${fileNameDatePart}.xlsx`
      );

      XLSX.writeFile(workbook, fileName, {
        compression: true,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Excel dosyası oluşturulurken beklenmeyen bir hata oluştu.';

      window.alert(message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 pb-24">
      <header>
        <h1 className="text-xl font-bold text-white sm:text-2xl">
          Excel Raporu
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Vaka kayıtlarını filtreleyerek Excel formatında indirin.
        </p>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-3">
          <p className="text-xs text-slate-400">Toplam kayıt</p>
          <p className="mt-1 text-xl font-bold text-white">
            {loading ? '...' : items.length}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] p-3">
          <p className="text-xs text-slate-400">Aktarılacak</p>
          <p className="mt-1 text-xl font-bold text-emerald-200">
            {loading ? '...' : filteredItems.length}
          </p>
        </div>

        <div className="col-span-2 flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/70 p-3 sm:col-span-1">
          <div>
            <p className="text-xs text-slate-400">Dosya formatı</p>
            <p className="mt-1 text-lg font-bold text-white">XLSX</p>
          </div>
          <FileSpreadsheet className="h-6 w-6 text-emerald-300" />
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setIsFiltersOpen(open => !open)}
            aria-expanded={isFiltersOpen}
            className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition sm:w-auto ${
              isFiltersOpen || activeFilterCount > 0
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-slate-700 bg-slate-800/70 text-slate-300 hover:border-slate-600 hover:text-white'
            }`}
          >
            <Filter className="h-4 w-4" />
            Rapor Filtreleri
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-emerald-400/20 px-1.5 text-[11px] font-bold text-emerald-100">
                {activeFilterCount}
              </span>
            )}
          </button>

          <span className="text-xs text-slate-400">
            {filteredItems.length} kayıt seçili
          </span>
        </div>

        {!isFiltersOpen && activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {searchTerm.trim() && (
              <span className="max-w-full truncate rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300">
                Arama: {searchTerm.trim()}
              </span>
            )}
            {startDate && (
              <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300">
                Başlangıç: {formatDate(startDate)}
              </span>
            )}
            {endDate && (
              <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300">
                Bitiş: {formatDate(endDate)}
              </span>
            )}
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-red-300 hover:bg-red-500/10"
            >
              <X className="h-3.5 w-3.5" />
              Temizle
            </button>
          </div>
        )}

        {isFiltersOpen && (
          <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-800/70 p-3.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                id="export-search"
                type="text"
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Merkez, doktor, hasta, kapak veya LOT ara..."
                className="min-h-10 w-full rounded-lg border border-slate-600 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="export-start-date" className="mb-1.5 block text-xs font-medium text-slate-300">
                  Başlangıç tarihi
                </label>
                <input
                  id="export-start-date"
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={event => setStartDate(event.target.value)}
                  className="min-h-10 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label htmlFor="export-end-date" className="mb-1.5 block text-xs font-medium text-slate-300">
                  Bitiş tarihi
                </label>
                <input
                  id="export-end-date"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={event => setEndDate(event.target.value)}
                  className="min-h-10 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={clearFilters}
                disabled={activeFilterCount === 0}
                className="min-h-10 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Filtreleri Temizle
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersOpen(false)}
                className="min-h-10 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Sonuçları Göster
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-4">
        {loading ? (
          <div className="py-5 text-center text-sm text-slate-400">
            Kayıtlar yükleniyor...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-4 text-center text-sm text-amber-200">
            Seçilen filtrelere uygun kayıt bulunamadı.
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-100">
                Rapor indirilmeye hazır
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Excel dosyasında {filteredItems.length} vaka kaydı yer alacak.
              </p>
            </div>

            <button
              type="button"
              onClick={exportToExcel}
              disabled={exporting || Boolean(errorMessage)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <Download className="h-4 w-4" />
              {exporting
                ? 'Excel hazırlanıyor...'
                : `${filteredItems.length} Kaydı İndir`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
