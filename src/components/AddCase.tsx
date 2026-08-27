import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Save,
} from 'lucide-react';
import {
  BALON_SIZES,
  KAPAK_SIZES,
  KAPAK_TIPLERI,
  Kapak,
  PARAVALVULER_OPTIONS,
  PROGLIDE_OPTIONS,
  supabase,
  timeout,
} from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { notifyAdmins } from '../lib/notifications';

const initial = {
  vaka_tarihi: '',
  merkez_hastane: '',
  doktor: '',
  hasta_adi: '',
  kapak_tipi: 'Evolut Pro+',
  kapak_size: '23 mm',
  lot_no: '',
  son_kul_tarihi: '',
  pre_balon: 'Yok',
  post_balon: 'Yok',
  paravalvuler_ay: 'Yok',
  proglide_adedi: 1,
};

type FormState = typeof initial;

type LockedValveFields = Pick<
  FormState,
  | 'kapak_tipi'
  | 'kapak_size'
  | 'lot_no'
  | 'son_kul_tarihi'
>;

type StockItem = {
  id: string;
  urun_adi: string;
  kapak_boyutu: number;
  lot_no: string;
  son_kullanma_tarihi: string;
};

type CaseWithCrimp = Kapak & {
  crimp_yapan?: string | null;
};

type CrimperProfile = {
  user_id: string;
  full_name: string;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">
        {label} <b className="text-red-400">*</b>
      </span>

      {children}
    </label>
  );
}

const inputClass =
  'field-control';

function CompactSelect({
  value,
  onChange,
  options,
}: {
  value: string | number;
  onChange: (value: string) => void;
  options: readonly (string | number)[];
}) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const selectedValue = String(value);

  function selectOption(option: string | number) {
    onChange(String(option));
    detailsRef.current?.removeAttribute('open');
  }

  return (
    <details ref={detailsRef} className="group relative">
      <summary className="field-control flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate">
          {selectedValue}
        </span>

        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>

      <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-56 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-1.5 shadow-2xl">
        {options.map(option => {
          const optionValue = String(option);
          const isSelected = optionValue === selectedValue;

          return (
            <button
              key={optionValue}
              type="button"
              onClick={() => selectOption(option)}
              className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition ${
                isSelected
                  ? 'bg-cyan-500/10 text-cyan-200'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="min-w-0 truncate">
                {optionValue}
              </span>

              {isSelected && (
                <Check className="h-4 w-4 shrink-0 text-cyan-300" />
              )}
            </button>
          );
        })}
      </div>
    </details>
  );
}

function normalizeLot(value: string) {
  return value
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/\(20\)01$/i, '')
    .replace(/2001$/i, '');
}

function getSizeNumber(size: string) {
  const match = size.match(/\d+/);
  return match ? Number(match[0]) : null;
}

const DIYARBAKIR_STOCK_LOTS = new Set([
  'K006244',
  'K006384',
  'K006254',
  'K006362',
  'K006377',
  'J376433',
  'J376430',
  'J389281',
  'J388910',
  'J389288',
]);

export default function AddCase() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();

  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState>(initial);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [selectedStockId, setSelectedStockId] = useState('');
  const [selectedSize, setSelectedSize] = useState<number | null>(null);
  const [originalCrimpYapan, setOriginalCrimpYapan] = useState('');
  const [crimperProfiles, setCrimperProfiles] = useState<
    CrimperProfile[]
  >([]);
  const [selectedCrimper, setSelectedCrimper] = useState('');
  const [lockedValveFields, setLockedValveFields] =
    useState<LockedValveFields | null>(null);
  const [hasFoc, setHasFoc] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedDiyarbakirLot, setDismissedDiyarbakirLot] = useState('');

  const currentCrimpYapan =
    profile?.full_name || user?.email?.split('@')[0] || 'Kullanıcı';

  const crimpYapan = isEdit
    ? originalCrimpYapan || currentCrimpYapan
    : selectedCrimper || currentCrimpYapan;

  const crimperOptions = useMemo(() => {
    const names = [
      currentCrimpYapan,
      ...crimperProfiles.map(item => item.full_name.trim()),
    ].filter(Boolean);

    return Array.from(new Set(names)).sort((first, second) =>
      first.localeCompare(second, 'tr')
    );
  }, [crimperProfiles, currentCrimpYapan]);

  useEffect(() => {
    void loadStockItems();
    void loadCrimperProfiles();

    if (!id) {
      const lastHospital = localStorage.getItem('lastHospital') || '';
      const lastDoctor = localStorage.getItem('lastDoctor') || '';

      setForm(previous => ({
        ...previous,
        merkez_hastane: lastHospital,
        doktor: lastDoctor,
      }));

      return;
    }

    void loadCase(id);
  }, [id]);

  async function loadCase(caseId: string) {
    setLoading(true);
    setError(null);

    try {
      const { data, error: loadError } = await timeout(
        supabase
          .from('kapaklar')
          .select('*')
          .eq('id', caseId)
          .maybeSingle(),
        10000
      );

      if (loadError) {
        throw loadError;
      }

      if (!data) {
        throw new Error('Vaka kaydı bulunamadı.');
      }

      const currentCase = data as CaseWithCrimp;

      setOriginalCrimpYapan(currentCase.crimp_yapan || '');

      setLockedValveFields({
        kapak_tipi: currentCase.kapak_tipi,
        kapak_size: currentCase.kapak_size,
        lot_no: normalizeLot(currentCase.lot_no),
        son_kul_tarihi: currentCase.son_kul_tarihi,
      });

      setForm({
        vaka_tarihi: currentCase.vaka_tarihi,
        merkez_hastane: currentCase.merkez_hastane,
        doktor: currentCase.doktor,
        hasta_adi: currentCase.hasta_adi,
        kapak_tipi: currentCase.kapak_tipi,
        kapak_size: currentCase.kapak_size,
        lot_no: currentCase.lot_no,
        son_kul_tarihi: currentCase.son_kul_tarihi,
        pre_balon: currentCase.pre_balon,
        post_balon: currentCase.post_balon,
        paravalvuler_ay: currentCase.paravalvuler_ay,
        proglide_adedi: currentCase.proglide_adedi,
      });
    } catch (caughtError: unknown) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : 'Vaka yüklenemedi';

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadStockItems() {
    const { data, error: stockError } = await supabase
      .from('kapak_stok')
      .select(
        'id, urun_adi, kapak_boyutu, lot_no, son_kullanma_tarihi'
      )
      .eq('durum', 'stokta')
      .order('kapak_boyutu')
      .order('son_kullanma_tarihi');

    if (stockError) {
      console.error('Stok kayıtları yüklenemedi:', stockError);
      return;
    }

    setStockItems((data as StockItem[]) || []);
  }

  async function loadCrimperProfiles() {
    const { data, error: profileError } = await timeout(
      supabase.rpc('list_crimper_profiles'),
      10000
    );

    if (profileError) {
      console.error(
        'Crimper kullanıcı listesi yüklenemedi:',
        profileError
      );
      return;
    }

    setCrimperProfiles(
      ((data || []) as CrimperProfile[]).filter(
        item => item.full_name?.trim()
      )
    );
  }

  const stockCounts = useMemo(() => {
    return {
      23: stockItems.filter(item => item.kapak_boyutu === 23).length,
      26: stockItems.filter(item => item.kapak_boyutu === 26).length,
      29: stockItems.filter(item => item.kapak_boyutu === 29).length,
      34: stockItems.filter(item => item.kapak_boyutu === 34).length,
    };
  }, [stockItems]);

  const filteredStockItems = useMemo(() => {
    if (!selectedSize) {
      return [];
    }

    return stockItems.filter(
      item => item.kapak_boyutu === selectedSize
    );
  }, [stockItems, selectedSize]);

  const selectedStock = useMemo(() => {
    if (!selectedStockId) {
      return null;
    }

    return (
      stockItems.find(item => item.id === selectedStockId) || null
    );
  }, [stockItems, selectedStockId]);

  const manualMatchedStock = useMemo(() => {
    if (isEdit || selectedStockId) {
      return null;
    }

    const normalizedLot = normalizeLot(form.lot_no);
    const size = getSizeNumber(form.kapak_size);

    if (!normalizedLot || !size) {
      return null;
    }

    return (
      stockItems.find(
        item =>
          normalizeLot(item.lot_no) === normalizedLot &&
          Number(item.kapak_boyutu) === Number(size)
      ) || null
    );
  }, [
    form.lot_no,
    form.kapak_size,
    stockItems,
    selectedStockId,
    isEdit,
  ]);

  const normalizedCurrentLot = normalizeLot(form.lot_no);
  const isDiyarbakirStock =
    !isEdit && DIYARBAKIR_STOCK_LOTS.has(normalizedCurrentLot);
  const showDiyarbakirWarning =
    isDiyarbakirStock && dismissedDiyarbakirLot !== normalizedCurrentLot;

  const set = (
    name: keyof FormState,
    value: string | number
  ) => {
    setForm(previous => ({
      ...previous,
      [name]: value,
    }));
  };

  function formatDate(date: string) {
    if (!date) {
      return '-';
    }

    const [year, month, day] = date.split('T')[0].split('-');

    if (!year || !month || !day) {
      return date;
    }

    return `${day}.${month}.${year}`;
  }

  function handleStockSelect(stockId: string) {
    setSelectedStockId(stockId);

    if (!stockId) {
      return;
    }

    const selected = stockItems.find(item => item.id === stockId);

    if (!selected) {
      return;
    }

    setForm(previous => ({
      ...previous,
      kapak_tipi: 'Evolut Pro+',
      kapak_size: `${selected.kapak_boyutu} mm`,
      lot_no: normalizeLot(selected.lot_no),
      son_kul_tarihi: selected.son_kullanma_tarihi,
    }));

    setSelectedSize(null);
  }

  function clearStockSelection() {
    setSelectedStockId('');
    setSelectedSize(null);

    setForm(previous => ({
      ...previous,
      lot_no: '',
      son_kul_tarihi: '',
    }));
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user?.id) {
      setError('Oturum yok. Tekrar giriş yap.');
      return;
    }

    setLoading(true);
    setError(null);

    const inventorySafeForm =
      isEdit && lockedValveFields
        ? {
            ...form,
            ...lockedValveFields,
          }
        : form;

    const payload = {
      ...inventorySafeForm,
      merkez_hastane: form.merkez_hastane.trim(),
      doktor: form.doktor.trim(),
      hasta_adi: form.hasta_adi.trim(),
      lot_no: normalizeLot(inventorySafeForm.lot_no),
      proglide_adedi: Number(form.proglide_adedi) || 1,
    };

    try {
      localStorage.setItem(
        'lastHospital',
        payload.merkez_hastane
      );

      localStorage.setItem('lastDoctor', payload.doktor);

      if (isEdit) {
        if (!id) {
          throw new Error('Düzenlenecek vaka kimliği bulunamadı.');
        }

        const { error: updateError } = await timeout(
          supabase
            .from('kapaklar')
            .update(payload)
            .eq('id', id),
          10000
        );

        if (updateError) {
          throw updateError;
        }

        try {
          await notifyAdmins({
            title: 'Vaka Güncellendi',
            message: `${currentCrimpYapan} vaka kaydını güncelledi`,
            type: 'info',
            related_table: 'kapaklar',
            related_id: id,
          });
        } catch (notificationError) {
          console.error(
            'Vaka güncellendi ancak bildirim gönderilemedi:',
            notificationError
          );
        }

        if (hasFoc) {
          navigate(`/foc/${id}`);
          return;
        }

        navigate('/list');
        return;
      }

      const valveSize = getSizeNumber(payload.kapak_size);

      if (!valveSize) {
        throw new Error(
          'Kapak ölçüsü belirlenemedi. Kapak seçimini kontrol edin.'
        );
      }

      const { data: newCaseId, error: createError } =
        await timeout(
          supabase.rpc('create_case_atomically', {
            p_vaka_tarihi: payload.vaka_tarihi,
            p_merkez_hastane: payload.merkez_hastane,
            p_doktor: payload.doktor,
            p_hasta_adi: payload.hasta_adi,
            p_kapak_tipi: payload.kapak_tipi,
            p_kapak_size: payload.kapak_size,
            p_lot_no: payload.lot_no,
            p_son_kul_tarihi: payload.son_kul_tarihi,
            p_pre_balon: payload.pre_balon,
            p_post_balon: payload.post_balon,
            p_paravalvuler_ay: payload.paravalvuler_ay,
            p_proglide_adedi: payload.proglide_adedi,
            p_crimp_yapan: crimpYapan,
          }),
        10000
      );

      if (createError) {
        throw createError;
      }

      if (!newCaseId || typeof newCaseId !== 'string') {
        throw new Error(
          'Vaka oluşturuldu ancak vaka kimliği alınamadı.'
        );
      }

      if (hasFoc) {
        navigate(`/foc/${newCaseId}`);
        return;
      }

      navigate('/list');
    } catch (caughtError: unknown) {
      console.error('Kayıt hatası:', caughtError);

      let message = 'Kayıt sırasında hata oluştu';

      if (caughtError instanceof Error) {
        message = caughtError.message;
      } else if (
        typeof caughtError === 'object' &&
        caughtError !== null
      ) {
        const possibleError = caughtError as {
          message?: string;
          details?: string;
        };

        message =
          possibleError.message ||
          possibleError.details ||
          message;
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-3 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-cyan-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Vakalara dön
      </button>

      <form
        onSubmit={submit}
        className="surface space-y-4 p-4 sm:p-5"
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-400">
            Vaka Yönetimi
          </p>

          <h1 className="page-title mt-1">
            {isEdit ? 'Vakayı Düzenle' : 'Yeni Vaka Ekle'}
          </h1>

          <p className="page-description">
            Vaka ve kullanılan malzeme bilgilerini kaydedin.
          </p>
        </div>

        {error && (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 md:text-sm">
            {error}
          </p>
        )}


        {!isEdit && (
          <section className="space-y-3 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06] p-3 sm:p-4">
            <div>
              <span className="mb-2 block text-sm font-semibold text-cyan-200">
                Stoktan Kapak Seç
              </span>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[23, 26, 29, 34].map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      setSelectedSize(
                        selectedSize === size ? null : size
                      );
                      setSelectedStockId('');
                    }}
                    className={`min-h-16 rounded-lg border p-2.5 text-left transition ${
                      selectedSize === size
                        ? 'border-cyan-400 bg-cyan-600 text-white'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500/60'
                    }`}
                  >
                    <div className="text-sm font-semibold">
                      {size} mm
                    </div>

                    <div className="mt-0.5 text-[10px] opacity-75">
                      {
                        stockCounts[
                          size as 23 | 26 | 29 | 34
                        ]
                      }{' '}
                      adet stokta
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {!selectedSize &&
              !selectedStock &&
              !manualMatchedStock && (
                <div className="text-xs leading-5 text-slate-400">
                  Kapak bilgilerini manuel girebilirsin. Kayıt
                  sırasında LOT/SN ve ölçü güncel stokla yeniden
                  doğrulanır. Eşleşme bulunursa kapak otomatik
                  stoktan düşer; bulunamazsa vaka manuel olarak
                  kaydedilir.
                </div>
              )}

            {selectedSize && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-cyan-100">
                    {selectedSize} mm stok listesi
                  </div>

                  <button
                    type="button"
                    onClick={clearStockSelection}
                    className="min-h-9 rounded-lg px-2 text-[11px] text-slate-400 transition hover:bg-slate-800 hover:text-white"
                  >
                    Seçimi temizle
                  </button>
                </div>

                {filteredStockItems.length === 0 ? (
                  <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-400">
                    {selectedSize} mm stokta kapak bulunamadı.
                  </div>
                ) : (
                  <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                    {filteredStockItems.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          handleStockSelect(item.id)
                        }
                        className={`w-full rounded-lg border p-2.5 text-left transition ${
                          selectedStockId === item.id
                            ? 'border-cyan-400 bg-cyan-500/15'
                            : 'border-slate-700 bg-slate-900 hover:border-cyan-500/60'
                        }`}
                      >
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <div>
                            <div className="truncate text-xs font-semibold text-white">
                              {item.urun_adi}
                            </div>

                            <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                              LOT: {normalizeLot(item.lot_no)}
                            </div>
                          </div>

                          <div className="shrink-0 text-right text-[11px] text-slate-400">
                            SKT:{' '}
                            {formatDate(
                              item.son_kullanma_tarihi
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(selectedStock || manualMatchedStock) && (
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-100 md:text-xs">
                      ✓ STOK EŞLEŞTİ
                    </div>

                    <div className="mt-2 text-sm font-semibold text-white">
                      {
                        (selectedStock || manualMatchedStock)
                          ?.urun_adi
                      }
                    </div>

                    <div className="mt-1 font-mono text-xs text-slate-300">
                      LOT:{' '}
                      {normalizeLot(
                        (selectedStock || manualMatchedStock)
                          ?.lot_no || ''
                      )}
                    </div>

                    <div className="text-xs text-slate-400">
                      SKT:{' '}
                      {formatDate(
                        (selectedStock || manualMatchedStock)
                          ?.son_kullanma_tarihi || ''
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={clearStockSelection}
                    className="min-h-9 rounded-lg px-2 text-[11px] text-emerald-200 transition hover:bg-emerald-500/10 hover:text-white"
                  >
                    Değiştir
                  </button>
                </div>

                <p className="mt-2 text-[11px] leading-4 text-emerald-100/80">
                  Vaka kaydedilince bu kapak otomatik stoktan
                  düşecek ve hareket kaydı oluşturulacaktır.
                </p>
              </div>
            )}
          </section>
        )}

        <section className="space-y-3 border-t border-slate-700/70 pt-4">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Vaka Bilgileri
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Tarih, merkez, doktor ve hasta bilgileri
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Vaka Tarihi">
            <input
              className={inputClass}
              type="date"
              value={form.vaka_tarihi}
              onChange={event =>
                set('vaka_tarihi', event.target.value)
              }
              required
            />
          </Field>

          <Field label="Merkez Hastane">
            <input
              className={inputClass}
              value={form.merkez_hastane}
              onChange={event =>
                set('merkez_hastane', event.target.value)
              }
              required
            />
          </Field>

          <Field label="Doktor">
            <input
              className={inputClass}
              value={form.doktor}
              onChange={event =>
                set('doktor', event.target.value)
              }
              required
            />
          </Field>

          <Field label="Hasta Adı">
            <input
              className={inputClass}
              value={form.hasta_adi}
              onChange={event =>
                set('hasta_adi', event.target.value)
              }
              required
            />
          </Field>

          </div>
        </section>

        <section className="space-y-3 border-t border-slate-700/70 pt-4">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Kapak Bilgileri
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {isEdit
                ? 'Stok tutarlılığı için kayıtlı kapak bilgileri değiştirilemez.'
                : 'Kapak, LOT ve son kullanma tarihi'}
            </p>
          </div>

          {isEdit && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
              Yanlış kapak veya LOT kaydedildiyse bu vakayı silin.
              Kullanılan kapak otomatik olarak stoka döner; ardından
              vakayı doğru kapakla yeniden oluşturabilirsiniz.
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

          <Field label="Kapak Tipi">
            {isEdit ? (
              <input
                className={`${inputClass} cursor-not-allowed opacity-70`}
                value={form.kapak_tipi}
                readOnly
              />
            ) : (
              <CompactSelect
                value={form.kapak_tipi}
                onChange={value => set('kapak_tipi', value)}
                options={KAPAK_TIPLERI}
              />
            )}
          </Field>

          <Field label="Kapak Size">
            {isEdit ? (
              <input
                className={`${inputClass} cursor-not-allowed opacity-70`}
                value={form.kapak_size}
                readOnly
              />
            ) : (
              <CompactSelect
                value={form.kapak_size}
                onChange={value => set('kapak_size', value)}
                options={KAPAK_SIZES}
              />
            )}
          </Field>

          <Field label="Lot No">
            <input
              className={`${inputClass} ${
                isEdit
                  ? 'cursor-not-allowed opacity-70'
                  : ''
              }`}
              value={form.lot_no}
              onChange={event =>
                set(
                  'lot_no',
                  normalizeLot(event.target.value)
                )
              }
              readOnly={isEdit}
              required
            />
          </Field>

          <Field label="Son Kullanma Tarihi">
            <input
              className={`${inputClass} ${
                isEdit
                  ? 'cursor-not-allowed opacity-70'
                  : ''
              }`}
              type="date"
              value={form.son_kul_tarihi}
              onChange={event =>
                set('son_kul_tarihi', event.target.value)
              }
              readOnly={isEdit}
              required
            />
          </Field>

          </div>
        </section>

        <section className="space-y-3 border-t border-slate-700/70 pt-4">
          <div>
            <h2 className="text-sm font-semibold text-white">
              İşlem Malzemeleri
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Balon, paravalvüler AY ve Proglide bilgileri
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

          <Field label="Pre Balon">
            <CompactSelect
              value={form.pre_balon}
              onChange={value => set('pre_balon', value)}
              options={BALON_SIZES}
            />
          </Field>

          <Field label="Post Balon">
            <CompactSelect
              value={form.post_balon}
              onChange={value => set('post_balon', value)}
              options={BALON_SIZES}
            />
          </Field>

          <Field label="Paravalvüler AY">
            <CompactSelect
              value={form.paravalvuler_ay}
              onChange={value =>
                set('paravalvuler_ay', value)
              }
              options={PARAVALVULER_OPTIONS}
            />
          </Field>

          <Field label="Proglide Adedi">
            <CompactSelect
              value={form.proglide_adedi}
              onChange={value =>
                set('proglide_adedi', Number(value))
              }
              options={PROGLIDE_OPTIONS}
            />
          </Field>
          </div>
        </section>

        <label
          className={`block cursor-pointer rounded-xl border p-3 transition ${
            hasFoc
              ? 'border-red-400/60 bg-red-500/10'
              : 'border-slate-700 bg-slate-900/70 hover:border-red-500/40'
          }`}
        >
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={hasFoc}
              onChange={event =>
                setHasFoc(event.target.checked)
              }
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-red-500"
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className={`h-4 w-4 shrink-0 ${
                    hasFoc
                      ? 'text-red-300'
                      : 'text-slate-400'
                  }`}
                />

                <p
                  className={`text-sm font-semibold ${
                    hasFoc
                      ? 'text-red-200'
                      : 'text-slate-200'
                  }`}
                >
                  Bu vakada FOC oluştu
                </p>
              </div>

              <p className="mt-1 text-[11px] leading-4 text-slate-400">
                {isEdit
                  ? 'İşaretlendiğinde vaka bilgileri güncellenir ve mevcut vaka için FOC kayıt ekranı açılır.'
                  : 'İşaretlendiğinde vaka önce kaydedilir, ardından ikinci kapağın ve olay açıklamasının girileceği FOC kayıt ekranı açılır.'}
              </p>
            </div>
          </div>
        </label>

        {isEdit ? (
          <div className="flex min-w-0 items-center justify-between gap-3 border-t border-slate-700/70 pt-3 text-xs">
            <span className="text-slate-500">Crimp yapan</span>
            <b className="truncate text-right font-medium text-slate-300">
              {crimpYapan}
            </b>
          </div>
        ) : (
          <div className="border-t border-slate-700/70 pt-3">
            <Field label="Crimp yapan">
              <CompactSelect
                value={crimpYapan}
                onChange={setSelectedCrimper}
                options={crimperOptions}
              />
            </Field>

            <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
              Varsayılan olarak giriş yapan kullanıcı seçilir. Vaka başka
              bir crimper adına giriliyorsa listeden değiştirebilirsiniz.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 sm:ml-auto sm:w-auto ${
            hasFoc
              ? 'bg-red-600 hover:bg-red-500'
              : 'bg-cyan-600 hover:bg-cyan-500'
          }`}
        >
          <Save className="h-4 w-4" />

          {loading
            ? 'Kaydediliyor...'
            : hasFoc
              ? isEdit
                ? 'Değişiklikleri Kaydet ve FOC Ekranına Geç'
                : 'Vakayı Kaydet ve FOC Ekranına Geç'
              : 'Kaydet'}
        </button>
      </form>

      {showDiyarbakirWarning && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="diyarbakir-stock-warning-title"
        >
          <div className="w-full max-w-md rounded-2xl border-2 border-amber-400/70 bg-slate-900 p-5 shadow-2xl shadow-amber-500/20">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-400/50 bg-amber-500/15">
                <AlertTriangle className="h-9 w-9 text-amber-300" />
              </div>

              <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
                Dikkat
              </p>

              <h2
                id="diyarbakir-stock-warning-title"
                className="mt-1 text-2xl font-black text-white"
              >
                Diyarbakır Stok
              </h2>

              <p className="mt-2 text-base font-bold text-amber-200">
                Bildir Fatih Demir
              </p>

              <p className="mt-3 rounded-lg bg-slate-950/60 px-3 py-2 font-mono text-sm font-semibold text-cyan-300">
                LOT: {normalizedCurrentLot}
              </p>

              <button
                type="button"
                onClick={() => setDismissedDiyarbakirLot(normalizedCurrentLot)}
                className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 focus:ring-offset-slate-900"
                aria-label="Diyarbakır stok uyarısını kapat"
              >
                Tamam, gördüm
                <span aria-hidden="true" className="text-xl leading-none">
                  →
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
