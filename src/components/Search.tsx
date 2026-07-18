import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Building2,
  CalendarDays,
  ExternalLink,
  Search as SearchIcon,
  SearchX,
  Stethoscope,
  UserRound,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Kapak, supabase, timeout } from '../lib/supabase';

type MatchType = 'Hasta' | 'Doktor' | 'Merkez' | 'LOT';

export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Kapak[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [message, setMessage] = useState('');
  const [lastSearch, setLastSearch] = useState('');

  const normalizedLastSearch = useMemo(
    () => lastSearch.trim().toLocaleLowerCase('tr-TR'),
    [lastSearch]
  );

  async function search(event?: FormEvent) {
    event?.preventDefault();

    const cleanQuery = query.trim();

    if (!cleanQuery) {
      setMessage('Arama yapmak için bir kelime veya LOT numarası yazın.');
      return;
    }

    setLoading(true);
    setMessage('');
    setHasSearched(true);
    setLastSearch(cleanQuery);

    const term = `%${cleanQuery}%`;

    try {
      const { data, error } = await timeout(
        supabase
          .from('kapaklar')
          .select('*')
          .or(
            `hasta_adi.ilike.${term},doktor.ilike.${term},merkez_hastane.ilike.${term},lot_no.ilike.${term}`
          )
          .order('created_at', { ascending: false }),
        10000
      );

      if (error) {
        setMessage(error.message);
        setResults([]);
        return;
      }

      setResults((data as Kapak[]) || []);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Arama sırasında beklenmeyen bir hata oluştu.'
      );
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function clearSearch() {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setLastSearch('');
    setMessage('');
  }

  function includesSearch(value: string | number | null | undefined) {
    if (!normalizedLastSearch) return false;

    return String(value ?? '')
      .toLocaleLowerCase('tr-TR')
      .includes(normalizedLastSearch);
  }

  function getMatchTypes(item: Kapak): MatchType[] {
    const matches: MatchType[] = [];

    if (includesSearch(item.hasta_adi)) matches.push('Hasta');
    if (includesSearch(item.doktor)) matches.push('Doktor');
    if (includesSearch(item.merkez_hastane)) matches.push('Merkez');
    if (includesSearch(item.lot_no)) matches.push('LOT');

    return matches;
  }

  function formatDate(value: string | null | undefined) {
    if (!value) return '-';

    const datePart = value.split('T')[0];
    const [year, month, day] = datePart.split('-');

    if (!year || !month || !day) return value;

    return `${day}.${month}.${year}`;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-24">
      <header>
        <h1 className="text-xl font-bold text-white sm:text-2xl">
          Genel Arama
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Hasta, doktor, merkez veya LOT bilgisiyle vaka arayın.
        </p>
      </header>

      <form
        onSubmit={search}
        className="rounded-xl border border-slate-700 bg-slate-800/70 p-3 sm:p-4"
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

            <input
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setMessage('');
              }}
              placeholder="Hasta, doktor, merkez veya LOT ara..."
              autoComplete="off"
              className="min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 py-2.5 pl-10 pr-10 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/10"
            />

            {query && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-white"
                aria-label="Aramayı temizle"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <SearchIcon className="h-4 w-4" />
            {loading ? 'Aranıyor...' : 'Ara'}
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          Aramak için Enter tuşunu da kullanabilirsiniz.
        </p>
      </form>

      {message && (
        <div
          role="status"
          className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
        >
          {message}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-8 text-center text-sm text-slate-400">
          Vaka kayıtları aranıyor...
        </div>
      ) : !hasSearched ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-800/40 px-4 py-10 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-700/60 text-cyan-300">
            <SearchIcon className="h-5 w-5" />
          </div>
          <h2 className="text-sm font-semibold text-slate-200">
            Aramaya hazır
          </h2>
          <p className="mt-1 max-w-md text-sm text-slate-400">
            Bir hastanın vakasını, doktorun kayıtlarını, merkezi veya LOT
            numarasını hızlıca bulabilirsiniz.
          </p>
        </div>
      ) : results.length === 0 && !message ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-800/40 px-4 py-10 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-700/60 text-slate-400">
            <SearchX className="h-5 w-5" />
          </div>
          <h2 className="text-sm font-semibold text-slate-200">
            Sonuç bulunamadı
          </h2>
          <p className="mt-1 max-w-md text-sm text-slate-400">
            “{lastSearch}” ile eşleşen bir vaka kaydı bulunamadı.
          </p>
        </div>
      ) : results.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Arama Sonuçları
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                “{lastSearch}” için {results.length} kayıt bulundu.
              </p>
            </div>
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-slate-700 bg-slate-800/70 md:block">
            <table className="w-full table-fixed">
              <thead className="border-b border-slate-700 bg-slate-900/50">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="w-[13%] px-4 py-2.5">Tarih</th>
                  <th className="w-[22%] px-4 py-2.5">Hasta</th>
                  <th className="w-[19%] px-4 py-2.5">Doktor</th>
                  <th className="w-[22%] px-4 py-2.5">Merkez</th>
                  <th className="w-[14%] px-4 py-2.5">LOT</th>
                  <th className="w-[10%] px-4 py-2.5 text-right">İşlem</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-700/70">
                {results.map(item => (
                  <tr
                    key={item.id}
                    className="text-sm transition hover:bg-slate-700/30"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
                      {formatDate(item.vaka_tarihi)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="truncate font-medium text-slate-100" title={item.hasta_adi || '-'}>
                        {item.hasta_adi || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="truncate text-slate-300" title={item.doktor || '-'}>
                        {item.doktor || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="truncate text-slate-300" title={item.merkez_hastane || '-'}>
                        {item.merkez_hastane || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-cyan-300">
                      {item.lot_no || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/view/${item.id}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-cyan-300 transition hover:bg-cyan-500/10"
                        aria-label={`${item.hasta_adi || 'Vaka'} detayını aç`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2.5 md:hidden">
            {results.map(item => {
              const matchTypes = getMatchTypes(item);

              return (
                <Link
                  key={item.id}
                  to={`/view/${item.id}`}
                  className="block rounded-xl border border-slate-700 bg-slate-800/70 p-3.5 transition active:bg-slate-700/70"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        {matchTypes.map(type => (
                          <span
                            key={type}
                            className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-200"
                          >
                            {type} eşleşmesi
                          </span>
                        ))}
                      </div>

                      <h3 className="break-words text-sm font-semibold text-slate-100">
                        {item.hasta_adi || 'Hasta bilgisi yok'}
                      </h3>

                      <p className="mt-1 inline-flex items-start gap-1.5 break-words text-xs text-slate-400">
                        <Stethoscope className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {item.doktor || 'Doktor bilgisi yok'}
                      </p>
                    </div>

                    <ExternalLink className="h-4 w-4 shrink-0 text-cyan-300" />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-700/70 pt-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
                        <Building2 className="h-3 w-3" />
                        Merkez
                      </p>
                      <p className="mt-1 break-words text-xs text-slate-300">
                        {item.merkez_hastane || '-'}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
                        <CalendarDays className="h-3 w-3" />
                        Tarih
                      </p>
                      <p className="mt-1 text-xs text-slate-300">
                        {formatDate(item.vaka_tarihi)}
                      </p>
                    </div>

                    <div className="col-span-2 min-w-0">
                      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
                        <UserRound className="h-3 w-3" />
                        LOT
                      </p>
                      <p className="mt-1 break-all font-mono text-xs font-semibold text-cyan-300">
                        {item.lot_no || '-'}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
