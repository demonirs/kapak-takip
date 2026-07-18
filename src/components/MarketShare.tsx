import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Check, ChevronDown, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabase';

type CompetitorCase = {
  id: string;
  merkez: string;
  marka: string;
  model: string | null;
  kapak_boyutu: number | null;
  vaka_tarihi: string;
};

type BrandStat = {
  marka: string;
  adet: number;
  oran: number;
};

type Period = 'all' | '30' | '90' | '180' | '365';

const MARKALAR = [
  'Medtronic',
  'Edwards',
  'Meril',
  'Allegra',
  'Abbott',
  'Hydra',
  'MicroPort',
  'Diğer',
];

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
          aria-label="Pazar payı dönemi"
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

export default function MarketShare() {
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

    if (!error && data) {
      setItems(data);
    }

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

  const stats = useMemo(() => {
    const total = filteredItems.length;

    const brandStats: BrandStat[] = MARKALAR.map(marka => {
      const adet = filteredItems.filter(item => item.marka === marka).length;
      const oran = total > 0 ? Math.round((adet / total) * 100) : 0;

      return { marka, adet, oran };
    }).filter(item => item.adet > 0);

    brandStats.sort((a, b) => b.adet - a.adet);

    const medtronic = brandStats.find(item => item.marka === 'Medtronic');
    const leader = brandStats[0] || null;

    return {
      total,
      brandStats,
      medtronicShare: medtronic?.oran || 0,
      leader,
    };
  }, [filteredItems]);

  const modelStats = useMemo(() => {
    const total = filteredItems.length;
    const map = new Map<string, number>();

    filteredItems.forEach(item => {
      const key = item.model || 'Model Yok';
      map.set(key, (map.get(key) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([model, adet]) => ({
        model,
        adet,
        oran: total > 0 ? Math.round((adet / total) * 100) : 0,
      }))
      .sort((a, b) => b.adet - a.adet);
  }, [filteredItems]);

  function periodText() {
    return (
      PERIOD_OPTIONS.find(option => option.value === period)?.label ||
      'Tüm Zamanlar'
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white sm:text-2xl">
            Pazar Payı
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Rakip vaka kayıtlarına göre marka ve model dağılımı
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
          Pazar payı verileri yükleniyor...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-3.5">
              <div className="text-xs text-slate-400">Toplam Vaka</div>
              <div className="mt-1 text-xl font-bold text-white">
                {stats.total}
              </div>
              <div className="mt-1 truncate text-[11px] text-slate-500">
                {periodText()}
              </div>
            </div>

            <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/[0.07] p-3.5">
              <div className="text-xs text-slate-400">Medtronic Payı</div>
              <div className="mt-1 text-xl font-bold text-cyan-200">
                %{stats.medtronicShare}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Seçili dönem
              </div>
            </div>

            <div className="col-span-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3.5 lg:col-span-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Trophy className="h-3.5 w-3.5 text-amber-300" />
                Lider Marka
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-lg font-bold text-white">
                  {stats.leader?.marka || '-'}
                </span>
                <span className="shrink-0 text-sm font-semibold text-amber-200">
                  {stats.leader ? `%${stats.leader.oran}` : '-'}
                </span>
              </div>
            </div>
          </div>

          <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-800/70 p-3.5 sm:p-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                Marka Bazlı Pazar Payı
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                En yüksek kullanım en üstte gösterilir.
              </p>
            </div>

            {stats.brandStats.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">
                Bu dönem için kayıt yok.
              </div>
            ) : (
              <div className="space-y-3">
                {stats.brandStats.map((item, index) => (
                  <div key={item.marka}>
                    <div className="mb-1.5 flex min-w-0 items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-700 text-[10px] font-bold text-slate-300">
                          {index + 1}
                        </span>
                        <span className="truncate text-sm font-medium text-slate-200">
                          {item.marka}
                        </span>
                      </div>

                      <span className="shrink-0 text-xs text-slate-400">
                        <strong className="text-white">{item.adet}</strong> vaka
                        {' · '}
                        <strong className="text-cyan-300">%{item.oran}</strong>
                      </span>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-slate-900">
                      <div
                        className={`h-full rounded-full ${
                          item.marka === 'Medtronic'
                            ? 'bg-cyan-500'
                            : 'bg-slate-500'
                        }`}
                        style={{ width: `${item.oran}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/70">
            <div className="flex items-center gap-2 border-b border-slate-700 px-4 py-3">
              <BarChart3 className="h-4 w-4 text-cyan-300" />
              <h2 className="text-base font-semibold text-white">
                Model Dağılımı
              </h2>
            </div>

            {modelStats.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">
                Bu dönem için model kaydı yok.
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-700/70 md:hidden">
                  {modelStats.map(item => (
                    <div
                      key={item.model}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <span className="min-w-0 break-words text-sm font-medium text-slate-200">
                        {item.model}
                      </span>

                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold text-white">
                          {item.adet} vaka
                        </div>
                        <div className="text-xs text-cyan-300">%{item.oran}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <table className="hidden w-full table-fixed md:table">
                  <thead className="bg-slate-900/50">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      <th className="w-[65%] px-4 py-2.5">Model</th>
                      <th className="w-[18%] px-4 py-2.5">Adet</th>
                      <th className="w-[17%] px-4 py-2.5">Oran</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-700/70">
                    {modelStats.map(item => (
                      <tr
                        key={item.model}
                        className="text-sm transition hover:bg-slate-700/30"
                      >
                        <td className="px-4 py-2.5 font-medium text-slate-200">
                          {item.model}
                        </td>
                        <td className="px-4 py-2.5 text-slate-300">
                          {item.adet}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-cyan-300">
                          %{item.oran}
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
