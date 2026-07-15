import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
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

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Vaka Kayıtları');

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
    <div className="mx-auto w-full max-w-5xl">
      <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 shadow-xl">
        <div className="border-b border-slate-700 bg-slate-900/50 px-5 py-5 sm:px-6">
          <h1 className="text-2xl font-bold text-white">
            Excel Raporu
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Vaka kayıtlarını filtreleyerek Excel formatında indirebilirsiniz.
          </p>
        </div>

        <div className="space-y-6 p-5 sm:p-6">
          {errorMessage && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-3">
              <label
                htmlFor="export-search"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Arama
              </label>

              <input
                id="export-search"
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Merkez, doktor, hasta, kapak veya LOT ara..."
                className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label
                htmlFor="export-start-date"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Başlangıç tarihi
              </label>

              <input
                id="export-start-date"
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(event) => setStartDate(event.target.value)}
                className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label
                htmlFor="export-end-date"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Bitiş tarihi
              </label>

              <input
                id="export-end-date"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
                className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={clearFilters}
                disabled={!searchTerm && !startDate && !endDate}
                className="w-full rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 font-medium text-slate-200 transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Filtreleri Temizle
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
              <p className="text-sm text-slate-400">Toplam kayıt</p>
              <p className="mt-1 text-2xl font-bold text-white">
                {loading ? '...' : items.length}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-sm text-emerald-300">
                Excel'e aktarılacak
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-200">
                {loading ? '...' : filteredItems.length}
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
              <p className="text-sm text-slate-400">Dosya formatı</p>
              <p className="mt-1 text-2xl font-bold text-white">
                XLSX
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-8 text-slate-400">
              Kayıtlar yükleniyor...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-5 text-center text-amber-200">
              Seçilen filtrelere uygun kayıt bulunamadı.
            </div>
          ) : (
            <div className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-4 text-sm text-slate-300">
              Excel dosyasında yalnızca ekranda filtrelenen{' '}
              <strong className="text-white">
                {filteredItems.length}
              </strong>{' '}
              kayıt yer alacaktır.
            </div>
          )}

          <button
            type="button"
            onClick={exportToExcel}
            disabled={
              loading ||
              exporting ||
              filteredItems.length === 0 ||
              Boolean(errorMessage)
            }
            className="w-full rounded-xl bg-emerald-600 px-5 py-3.5 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {exporting
              ? 'Excel Hazırlanıyor...'
              : `${filteredItems.length} Kaydı Excel Olarak İndir`}
          </button>
        </div>
      </div>
    </div>
  );
}
