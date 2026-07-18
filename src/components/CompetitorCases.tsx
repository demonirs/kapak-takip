import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, Filter, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type CompetitorCase = {
  id: string;
  merkez: string;
  doktor: string | null;
  vaka_tarihi: string;
  marka: string;
  notlar: string | null;
  diger_aciklama: string | null;
  created_at: string;
};

const MARKALAR = [
  'Meril',
  'Allegra',
  'Abbott',
  'Hydra',
  'MicroPort',
  'Diğer',
];

type BrandSelectProps = {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  ariaLabel: string;
};

function BrandSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: BrandSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border bg-slate-900 px-3 py-2 text-left text-sm text-white outline-none transition ${
          isOpen
            ? 'border-cyan-400 ring-2 ring-cyan-500/10'
            : 'border-slate-700 hover:border-slate-600'
        }`}
      >
        <span className="truncate">{value}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 z-50 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-slate-600 bg-slate-900 p-1.5 shadow-2xl shadow-black/50"
        >
          {options.map(option => {
            const selected = option === value;

            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
                className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                  selected
                    ? 'bg-cyan-500/15 text-cyan-200'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span>{option}</span>
                {selected && <Check className="h-4 w-4 text-cyan-300" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2.5">
      <div className="truncate text-xs text-slate-400">{title}</div>
      <div className="text-sm font-bold text-white">{value}</div>
    </div>
  );
}

export default function CompetitorCases() {
  const { profile } = useAuth();
  const currentProfile = profile as any;

  const isAdmin =
    currentProfile?.role === 'admin' ||
    currentProfile?.yetki === 'admin' ||
    currentProfile?.is_admin === true;

  const [items, setItems] = useState<CompetitorCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const [merkez, setMerkez] = useState('');
  const [doktor, setDoktor] = useState('');
  const [vakaTarihi, setVakaTarihi] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [marka, setMarka] = useState('Meril');
  const [notlar, setNotlar] = useState('');
  const [digerAciklama, setDigerAciklama] = useState('');

  const [filterBrand, setFilterBrand] = useState('Tümü');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    loadCases();
  }, []);

  async function loadCases() {
    setLoading(true);

    const { data, error } = await supabase
      .from('rakip_vakalar')
      .select(
        'id, merkez, doktor, vaka_tarihi, marka, notlar, diger_aciklama, created_at'
      )
      .order('vaka_tarihi', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) {
      setMessage(error.message);
    }

    if (!error && data) {
      setItems(data);
    }

    setLoading(false);
  }

  async function addCase() {
    setMessage('');

    if (!merkez.trim()) {
      setMessage('Merkez alanı zorunlu.');
      return;
    }

    if (!marka.trim()) {
      setMessage('Marka alanı zorunlu.');
      return;
    }

    if (marka === 'Diğer' && !digerAciklama.trim()) {
      setMessage('Diğer seçildiğinde açıklama alanı zorunlu.');
      return;
    }

    const { error } = await supabase.from('rakip_vakalar').insert({
      merkez: merkez.trim(),
      doktor: doktor.trim() || null,
      vaka_tarihi: vakaTarihi,
      marka,
      notlar: notlar.trim() || null,
      diger_aciklama: digerAciklama.trim() || null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMerkez('');
    setDoktor('');
    setVakaTarihi(new Date().toISOString().slice(0, 10));
    setMarka('Meril');
    setNotlar('');
    setDigerAciklama('');
    setMessage('Rakip vaka eklendi.');
    setIsFormOpen(false);

    await loadCases();
  }

  async function deleteCase(id: string) {
    if (!isAdmin) {
      alert('Bu işlemi sadece admin yapabilir.');
      return;
    }

    const ok = window.confirm('Bu rakip vaka kaydı silinsin mi?');
    if (!ok) return;

    const { error } = await supabase
      .from('rakip_vakalar')
      .delete()
      .eq('id', id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadCases();
  }

  function clearFilters() {
    setFilterBrand('Tümü');
    setStartDate('');
    setEndDate('');
    setSearchText('');
  }

  const filteredItems = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    return items.filter(item => {
      const brandMatch = filterBrand === 'Tümü' || item.marka === filterBrand;

      const dateMatch =
        (!startDate || item.vaka_tarihi >= startDate) &&
        (!endDate || item.vaka_tarihi <= endDate);

      const searchMatch =
        !search ||
        item.merkez.toLowerCase().includes(search) ||
        (item.doktor || '').toLowerCase().includes(search);

      return brandMatch && dateMatch && searchMatch;
    });
  }, [items, filterBrand, startDate, endDate, searchText]);

  const stats = useMemo(() => {
    const countByBrand = (brand: string) =>
      filteredItems.filter(i => i.marka === brand).length;

    return {
      total: filteredItems.length,
      meril: countByBrand('Meril'),
      allegra: countByBrand('Allegra'),
      abbott: countByBrand('Abbott'),
      hydra: countByBrand('Hydra'),
      microport: countByBrand('MicroPort'),
      diger: countByBrand('Diğer'),
    };
  }, [filteredItems]);

  const activeFilterCount = useMemo(() => {
    return [
      filterBrand !== 'Tümü',
      Boolean(startDate),
      Boolean(endDate),
      Boolean(searchText.trim()),
    ].filter(Boolean).length;
  }, [filterBrand, startDate, endDate, searchText]);

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('tr-TR');
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white sm:text-2xl">Rakip Vakalar</h1>
          <p className="mt-1 text-sm text-slate-400">
            Merkez bazlı TAVI rakip kapak kullanım takibi
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsFormOpen(value => !value);
            setMessage('');
          }}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 sm:w-auto"
        >
          {isFormOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {isFormOpen ? 'Formu Kapat' : 'Yeni Rakip Vaka'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <StatCard title="Toplam" value={stats.total} />
        <StatCard title="Meril" value={stats.meril} />
        <StatCard title="Allegra" value={stats.allegra} />
        <StatCard title="Abbott" value={stats.abbott} />
        <StatCard title="Hydra" value={stats.hydra} />
        <StatCard title="MicroPort" value={stats.microport} />
        <StatCard title="Diğer" value={stats.diger} />
      </div>

      {isFormOpen && (
      <div className="space-y-4 rounded-xl border border-cyan-500/25 bg-slate-800/70 p-4">
        <h2 className="text-lg font-semibold text-white">Yeni Rakip Vaka</h2>

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm text-slate-300 mb-2">Merkez *</label>
            <input
              value={merkez}
              onChange={e => setMerkez(e.target.value)}
              placeholder="Örn: KTÜ Farabi"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">Doktor</label>
            <input
              value={doktor}
              onChange={e => setDoktor(e.target.value)}
              placeholder="Operatör / doktor"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">Tarih</label>
            <input
              type="date"
              value={vakaTarihi}
              onChange={e => setVakaTarihi(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">Marka *</label>
            <BrandSelect
              value={marka}
              options={MARKALAR}
              onChange={setMarka}
              ariaLabel="Rakip kapak markası seç"
            />
          </div>

          {marka === 'Diğer' && (
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-300 mb-2">
                Diğer Marka Açıklaması *
              </label>
              <input
                value={digerAciklama}
                onChange={e => setDigerAciklama(e.target.value)}
                placeholder="Örn: farklı kapak markası"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
              />
            </div>
          )}

          <div className={marka === 'Diğer' ? 'md:col-span-3' : 'md:col-span-2'}>
            <label className="block text-sm text-slate-300 mb-2">Not</label>
            <input
              value={notlar}
              onChange={e => setNotlar(e.target.value)}
              placeholder="Kısa not"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        <button
          onClick={addCase}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-white font-medium"
        >
          <Plus className="w-4 h-4" />
          Kaydet
        </button>

        {message && <div className="text-sm text-slate-300">{message}</div>}
      </div>
      )}

      {!isFormOpen && message && (
        <div role="status" className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300">
          {message}
        </div>
      )}

      <div className="space-y-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setIsFiltersOpen(open => !open)}
            aria-expanded={isFiltersOpen}
            className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition sm:w-auto ${
              isFiltersOpen || activeFilterCount > 0
                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                : 'border-slate-700 bg-slate-800/70 text-slate-300 hover:border-slate-600 hover:text-white'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filtreler
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-cyan-400/20 px-1.5 text-[11px] font-bold text-cyan-100">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform ${
                isFiltersOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          <div className="text-xs text-slate-400 sm:text-sm">
            Gösterilen kayıt:{' '}
            <strong className="text-white">{filteredItems.length}</strong>
          </div>
        </div>

        {!isFiltersOpen && activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {filterBrand !== 'Tümü' && (
              <span className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200">
                Marka: {filterBrand}
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

            {searchText.trim() && (
              <span className="max-w-full truncate rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300">
                Arama: {searchText.trim()}
              </span>
            )}

            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-red-300 transition hover:bg-red-500/10"
            >
              <X className="h-3.5 w-3.5" />
              Temizle
            </button>
          </div>
        )}

        {isFiltersOpen && (
        <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-800/70 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">Filtre Seçenekleri</h2>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/10"
              >
                Filtreleri Temizle
              </button>
            )}
          </div>

        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm text-slate-300 mb-2">Marka</label>
            <BrandSelect
              value={filterBrand}
              options={['Tümü', ...MARKALAR]}
              onChange={setFilterBrand}
              ariaLabel="Rakip vaka marka filtresi seç"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">
              Başlangıç Tarihi
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">
              Bitiş Tarihi
            </label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">
              Doktor / Merkez Ara
            </label>
            <input
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Doktor veya merkez yaz"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsFiltersOpen(false)}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500"
          >
            Sonuçları Göster
          </button>
        </div>
        </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-8 text-center text-sm text-slate-400">Rakip vakalar yükleniyor...</div>
      ) : (
        <>
        {filteredItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800/50 p-8 text-center text-sm text-slate-400">
            Filtrelere uygun rakip vaka bulunamadı.
          </div>
        ) : (
          <>
          <div className="space-y-2.5 md:hidden">
            {filteredItems.map(item => (
              <article key={item.id} className="rounded-xl border border-slate-700 bg-slate-800/70 p-3.5">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-300">
                        {item.marka}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(item.vaka_tarihi)}
                      </span>
                    </div>
                    <h2 className="break-words text-sm font-semibold text-slate-100">{item.merkez}</h2>
                    <p className="mt-1 break-words text-xs text-slate-400">{item.doktor || 'Doktor bilgisi yok'}</p>
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => deleteCase(item.id)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-red-300 transition hover:bg-red-500/10"
                      aria-label={`${item.merkez} rakip vaka kaydını sil`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {(item.diger_aciklama || item.notlar) && (
                  <div className="mt-3 space-y-1.5 border-t border-slate-700/70 pt-3 text-xs">
                    {item.diger_aciklama && <p className="break-words text-slate-300"><span className="text-slate-500">Açıklama:</span> {item.diger_aciklama}</p>}
                    {item.notlar && <p className="break-words text-slate-300"><span className="text-slate-500">Not:</span> {item.notlar}</p>}
                  </div>
                )}
              </article>
            ))}
          </div>

        <div className="hidden overflow-hidden rounded-xl border border-slate-700 bg-slate-800/70 md:block">
            <table className="w-full table-fixed">
              <thead className="border-b border-slate-700 bg-slate-900/50">
                <tr>
                  <th className="w-[13%] p-3 text-left text-xs text-slate-400">TARİH</th>
                  <th className="w-[20%] p-3 text-left text-xs text-slate-400">MERKEZ</th>
                  <th className="w-[17%] p-3 text-left text-xs text-slate-400">DOKTOR</th>
                  <th className="w-[12%] p-3 text-left text-xs text-slate-400">MARKA</th>
                  <th className="w-[16%] p-3 text-left text-xs text-slate-400">AÇIKLAMA</th>
                  <th className="w-[16%] p-3 text-left text-xs text-slate-400">NOT</th>
                  {isAdmin && (
                    <th className="w-[6%] p-3 text-right text-xs text-slate-400">İŞLEM</th>
                  )}
                </tr>
              </thead>

              <tbody>
                  {filteredItems.map(item => (
                    <tr key={item.id} className="border-t border-slate-700">
                      <td className="whitespace-nowrap p-3 text-xs text-slate-400">
                        {formatDate(item.vaka_tarihi)}
                      </td>

                      <td className="p-3"><div className="truncate text-sm font-medium text-slate-100" title={item.merkez}>{item.merkez}</div></td>

                      <td className="p-3 text-sm">
                        <div className="truncate" title={item.doktor || '-'}>
                        {item.doktor || '-'}
                        </div>
                      </td>

                      <td className="p-3"><span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs font-semibold text-cyan-300">{item.marka}</span></td>

                      <td className="p-3 text-sm"><div className="truncate" title={item.diger_aciklama || '-'}>
                        {item.diger_aciklama || '-'}
                      </div>
                      </td>

                      <td className="p-3 text-sm"><div className="truncate" title={item.notlar || '-'}>
                        {item.notlar || '-'}
                      </div>
                      </td>

                      {isAdmin && (
                        <td className="p-3 text-right">
                          <button
                            onClick={() => deleteCase(item.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-300 hover:bg-red-500/10"
                            aria-label={`${item.merkez} rakip vaka kaydını sil`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
        </div>
        </>
        )}
        </>
      )}
    </div>
  );
}
