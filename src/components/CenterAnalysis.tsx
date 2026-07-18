import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabase';

type CompetitorCase = {
  id: string;
  merkez: string;
  marka: string;
  model: string | null;
  kapak_boyutu: number | null;
  vaka_tarihi: string;
};

type CenterStat = {
  merkez: string;
  toplam: number;
  medtronic: number;
  edwards: number;
  meril: number;
  allegra: number;
  abbott: number;
  hydra: number;
  microport: number;
  diger: number;
  medtronicOran: number;
};

type Period = 'all' | '30' | '90' | '180' | '365';

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'all', label: 'Tüm Zamanlar' },
  { value: '30', label: 'Son 30 Gün' },
  { value: '90', label: 'Son 90 Gün' },
  { value: '180', label: 'Son 6 Ay' },
  { value: '365', label: 'Son 1 Yıl' },
];

type PeriodSelectProps = {
  value: Period;
  onChange: (value: Period) => void;
};

function PeriodSelect({ value, onChange }: PeriodSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel =
    PERIOD_OPTIONS.find(option => option.value === value)?.label ||
    'Tüm Zamanlar';

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
    <div ref={containerRef} className="relative w-full sm:w-56">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border bg-slate-900 px-3 py-2 text-left text-sm text-white transition ${
          isOpen
            ? 'border-cyan-400 ring-2 ring-cyan-500/10'
            : 'border-slate-700 hover:border-slate-600'
        }`}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Merkez analizi dönemi"
          className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-xl border border-slate-600 bg-slate-900 p-1.5 shadow-2xl shadow-black/50"
        >
          {PERIOD_OPTIONS.map(option => {
            const selected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                  selected
                    ? 'bg-cyan-500/15 text-cyan-200'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span>{option.label}</span>
                {selected && <Check className="h-4 w-4 text-cyan-300" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CenterAnalysis() {
  const [items, setItems] = useState<CompetitorCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('all');

  useEffect(() => {
    loadCases();
  }, []);

  async function loadCases() {
    setLoading(true);

    const { data, error } = await supabase
      .from('rakip_vakalar')
      .select('id, merkez, marka, model, kapak_boyutu, vaka_tarihi')
      .order('vaka_tarihi', { ascending: false })
      .limit(1000);

    if (!error && data) setItems(data);

    setLoading(false);
  }

  const filteredItems = useMemo(() => {
    if (period === 'all') return items;

    const now = new Date();
    const from = new Date();

    if (period === '30') from.setDate(now.getDate() - 30);
    if (period === '90') from.setDate(now.getDate() - 90);
    if (period === '180') from.setDate(now.getDate() - 180);
    if (period === '365') from.setDate(now.getDate() - 365);

    return items.filter(item => new Date(item.vaka_tarihi) >= from);
  }, [items, period]);

  const centerStats = useMemo<CenterStat[]>(() => {
    const map = new Map<string, CompetitorCase[]>();

    filteredItems.forEach(item => {
      const key = item.merkez || 'Merkez Yok';
      const current = map.get(key) || [];
      current.push(item);
      map.set(key, current);
    });

    return Array.from(map.entries())
      .map(([merkez, cases]) => {
        const toplam = cases.length;
        const medtronic = cases.filter(i => i.marka === 'Medtronic').length;
        const edwards = cases.filter(i => i.marka === 'Edwards').length;
        const meril = cases.filter(i => i.marka === 'Meril').length;
        const allegra = cases.filter(i => i.marka === 'Allegra').length;
        const abbott = cases.filter(i => i.marka === 'Abbott').length;
        const hydra = cases.filter(i => i.marka === 'Hydra').length;
        const microport = cases.filter(i => i.marka === 'MicroPort').length;
        const diger = cases.filter(i => i.marka === 'Diğer').length;

        return {
          merkez,
          toplam,
          medtronic,
          edwards,
          meril,
          allegra,
          abbott,
          hydra,
          microport,
          diger,
          medtronicOran:
            toplam > 0 ? Math.round((medtronic / toplam) * 100) : 0,
        };
      })
      .sort((a, b) => b.toplam - a.toplam);
  }, [filteredItems]);

  const strongestCenter = useMemo(() => {
    return [...centerStats].sort((a, b) => {
      if (b.medtronicOran !== a.medtronicOran) {
        return b.medtronicOran - a.medtronicOran;
      }

      return b.medtronic - a.medtronic;
    })[0] || null;
  }, [centerStats]);

  function periodText() {
    return (
      PERIOD_OPTIONS.find(option => option.value === period)?.label ||
      'Tüm Zamanlar'
    );
  }

  function competitorEntries(item: CenterStat) {
    return [
      { label: 'Edwards', value: item.edwards },
      { label: 'Meril', value: item.meril },
      { label: 'Allegra', value: item.allegra },
      { label: 'Abbott', value: item.abbott },
      { label: 'Hydra', value: item.hydra },
      { label: 'MicroPort', value: item.microport },
      { label: 'Diğer', value: item.diger },
    ].filter(entry => entry.value > 0);
  }

  return (
    <div className="space-y-4 pb-24">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white sm:text-2xl">
            Merkez Analizi
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Merkez bazında marka dağılımı ve Medtronic pazar payı
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">
            Dönem
          </label>
          <PeriodSelect value={period} onChange={setPeriod} />
        </div>
      </header>

      {loading ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-8 text-center text-sm text-slate-400">
          Merkez analizi yükleniyor...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-3.5">
              <div className="text-xs text-slate-400">Toplam Merkez</div>
              <div className="mt-1 text-xl font-bold text-white">
                {centerStats.length}
              </div>
              <div className="mt-1 truncate text-[11px] text-slate-500">
                {periodText()}
              </div>
            </div>

            <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/[0.07] p-3.5">
              <div className="text-xs text-slate-400">Toplam Vaka</div>
              <div className="mt-1 text-xl font-bold text-cyan-200">
                {filteredItems.length}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Seçili dönem
              </div>
            </div>

            <div className="col-span-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3.5 lg:col-span-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Trophy className="h-3.5 w-3.5 text-amber-300" />
                En Güçlü Medtronic Merkezi
              </div>

              <div className="mt-1 flex min-w-0 items-baseline justify-between gap-3">
                <span className="truncate text-sm font-bold text-white">
                  {strongestCenter?.merkez || '-'}
                </span>
                <span className="shrink-0 text-sm font-semibold text-amber-200">
                  {strongestCenter ? `%${strongestCenter.medtronicOran}` : '-'}
                </span>
              </div>
            </div>
          </div>

          <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/70">
            <div className="flex items-center gap-2 border-b border-slate-700 px-4 py-3">
              <Building2 className="h-4 w-4 text-cyan-300" />
              <div>
                <h2 className="text-base font-semibold text-white">
                  Merkez Bazlı Dağılım
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Merkezler toplam vaka sayısına göre sıralanır.
                </p>
              </div>
            </div>

            {centerStats.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                Bu dönem için merkez kaydı yok.
              </div>
            ) : (
              <>
                <div className="space-y-2.5 p-3 md:hidden">
                  {centerStats.map(item => (
                    <article
                      key={item.merkez}
                      className="rounded-xl border border-slate-700 bg-slate-900/35 p-3.5"
                    >
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="break-words text-sm font-semibold text-slate-100">
                            {item.merkez}
                          </h3>
                          <p className="mt-1 text-xs text-slate-400">
                            {item.toplam} toplam vaka
                          </p>
                        </div>

                        <span className="shrink-0 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs font-bold text-cyan-200">
                          MDT %{item.medtronicOran}
                        </span>
                      </div>

                      <div className="mt-3">
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="text-slate-400">Medtronic</span>
                          <strong className="text-cyan-300">
                            {item.medtronic} vaka
                          </strong>
                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-cyan-500"
                            style={{ width: `${item.medtronicOran}%` }}
                          />
                        </div>
                      </div>

                      {competitorEntries(item).length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-700/70 pt-3">
                          {competitorEntries(item).map(entry => (
                            <span
                              key={entry.label}
                              className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-300"
                            >
                              {entry.label} {entry.value}
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>

                <table className="hidden w-full table-fixed md:table">
                  <thead className="bg-slate-900/50">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      <th className="w-[25%] px-4 py-2.5">Merkez</th>
                      <th className="w-[10%] px-4 py-2.5">Toplam</th>
                      <th className="w-[12%] px-4 py-2.5">Medtronic</th>
                      <th className="w-[15%] px-4 py-2.5">MDT Payı</th>
                      <th className="w-[38%] px-4 py-2.5">Rakip Dağılımı</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-700/70">
                    {centerStats.map(item => (
                      <tr
                        key={item.merkez}
                        className="text-sm transition hover:bg-slate-700/30"
                      >
                        <td className="px-4 py-3">
                          <div
                            className="truncate font-medium text-slate-100"
                            title={item.merkez}
                          >
                            {item.merkez}
                          </div>
                        </td>

                        <td className="px-4 py-3 font-semibold text-white">
                          {item.toplam}
                        </td>

                        <td className="px-4 py-3 font-semibold text-cyan-300">
                          {item.medtronic}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-900">
                              <div
                                className="h-full rounded-full bg-cyan-500"
                                style={{ width: `${item.medtronicOran}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-cyan-200">
                              %{item.medtronicOran}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          {competitorEntries(item).length === 0 ? (
                            <span className="text-xs text-slate-500">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {competitorEntries(item).map(entry => (
                                <span
                                  key={entry.label}
                                  className="rounded-md border border-slate-700 bg-slate-900/50 px-1.5 py-0.5 text-[10px] text-slate-300"
                                >
                                  {entry.label} {entry.value}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
