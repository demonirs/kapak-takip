import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Save } from 'lucide-react';
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-slate-300 md:mb-2 md:text-sm">
        {label} <b className="text-red-400">*</b>
      </span>

      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 md:px-4 md:py-3 md:text-base';

function normalizeLot(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

function getSizeNumber(size: string) {
  const match = size.match(/\d+/);
  return match ? Number(match[0]) : null;
}

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
  const [hasFoc, setHasFoc] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentCrimpYapan =
    profile?.full_name || user?.email?.split('@')[0] || 'Kullanıcı';

  const crimpYapan = isEdit
    ? originalCrimpYapan || currentCrimpYapan
    : currentCrimpYapan;

  useEffect(() => {
    void loadStockItems();

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

    void loadCase();
  }, [id]);

  async function loadCase() {
    setLoading(true);
    setError(null);

    try {
      const { data, error: loadError } = await timeout(
        supabase.from('kapaklar').select('*').eq('id', id).maybeSingle(),
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

  async function markStockAsUsed(
    stockId: string,
    vakaId: string
  ) {
    const selected = stockItems.find(item => item.id === stockId);

    if (!selected) {
      throw new Error(
        'Seçilen stok kaydı bulunamadı veya artık stokta değil.'
      );
    }

    const { data: updatedStock, error: stockUpdateError } =
      await timeout(
        supabase
          .from('kapak_stok')
          .update({
            durum: 'kullanildi',
            kullanilan_vaka_id: vakaId,
          })
          .eq('id', stockId)
          .eq('durum', 'stokta')
          .select('id')
          .maybeSingle(),
        10000
      );

    if (stockUpdateError) {
      throw stockUpdateError;
    }

    if (!updatedStock) {
      throw new Error(
        'Kapak stoktan düşürülemedi. Kayıt başka bir işlemde kullanılmış olabilir.'
      );
    }

    const { error: movementError } = await timeout(
      supabase.from('stok_hareketleri').insert({
        kapak_stok_id: stockId,
        islem: 'kullanildi',
        urun_adi: selected.urun_adi,
        lot_no: normalizeLot(selected.lot_no),
        kapak_boyutu: selected.kapak_boyutu,
        son_kullanma_tarihi: selected.son_kullanma_tarihi,
        vaka_id: vakaId,
        created_by: user?.id,
      }),
      10000
    );

    if (movementError) {
      throw movementError;
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user?.id) {
      setError('Oturum yok. Tekrar giriş yap.');
      return;
    }

    setLoading(true);
    setError(null);

    const payload = {
      ...form,
      merkez_hastane: form.merkez_hastane.trim(),
      doktor: form.doktor.trim(),
      hasta_adi: form.hasta_adi.trim(),
      lot_no: normalizeLot(form.lot_no),
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

        if (hasFoc) {
          navigate(`/foc/${id}`);
          return;
        }

        navigate('/list');
        return;
      }

      const stockIdToUse =
        selectedStockId || manualMatchedStock?.id || '';

      const { data, error: insertError } = await timeout(
        supabase
          .from('kapaklar')
          .insert({
            ...payload,
            user_id: user.id,
            crimp_yapan: currentCrimpYapan,
          })
          .select('id')
          .single(),
        10000
      );

      if (insertError) {
        throw insertError;
      }

      if (!data?.id) {
        throw new Error(
          'Vaka oluşturuldu ancak vaka kimliği alınamadı.'
        );
      }

      const newCaseId = data.id as string;

      if (stockIdToUse) {
        await markStockAsUsed(stockIdToUse, newCaseId);
      }

      await notifyAdmins({
        title: 'Yeni Vaka',
        message: `${currentCrimpYapan} vaka ekledi`,
        type: 'success',
        related_table: 'kapaklar',
        related_id: newCaseId,
      });

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

  const Select = ({
    value,
    onChange,
    options,
  }: {
    value: string | number;
    onChange: (value: string) => void;
    options: readonly (string | number)[];
  }) => (
    <select
      className={inputClass}
      value={String(value)}
      onChange={event => onChange(event.target.value)}
    >
      {options.map(option => (
        <option key={String(option)} value={String(option)}>
          {option}
        </option>
      ))}
    </select>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-3 flex items-center gap-2 text-sm text-slate-300 hover:text-white md:mb-4 md:text-base"
      >
        <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
        Geri
      </button>

      <form
        onSubmit={submit}
        className="space-y-5 rounded-2xl border border-slate-700 bg-slate-800 p-4 md:space-y-6 md:p-6"
      >
        <h1 className="text-xl font-bold md:text-2xl">
          {isEdit ? 'Vakayı Düzenle' : 'Yeni Vaka Ekle'}
        </h1>

        {error && (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 md:text-sm">
            {error}
          </p>
        )}

        {!isEdit && (
          <div className="space-y-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 md:space-y-4 md:p-4">
            <div>
              <span className="mb-2 block text-xs text-cyan-200 md:mb-3 md:text-sm">
                Stoktan Kapak Seç
              </span>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
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
                    className={`rounded-xl border p-2.5 text-left transition md:p-3 ${
                      selectedSize === size
                        ? 'border-cyan-400 bg-cyan-600 text-white'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500/60'
                    }`}
                  >
                    <div className="text-base font-bold md:text-lg">
                      {size} mm
                    </div>

                    <div className="text-[11px] opacity-80 md:text-xs">
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
                <div className="text-xs text-slate-300 md:text-sm">
                  Kapak seçmeden devam etmek istersen aşağıdaki
                  alanları manuel doldurabilirsin.
                </div>
              )}

            {selectedSize && (
              <div className="space-y-2 md:space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-cyan-100 md:text-sm">
                    {selectedSize} mm stok listesi
                  </div>

                  <button
                    type="button"
                    onClick={clearStockSelection}
                    className="text-[11px] text-slate-300 hover:text-white md:text-xs"
                  >
                    Seçimi temizle
                  </button>
                </div>

                {filteredStockItems.length === 0 ? (
                  <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-400 md:p-4 md:text-sm">
                    {selectedSize} mm stokta kapak bulunamadı.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredStockItems.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          handleStockSelect(item.id)
                        }
                        className={`w-full rounded-xl border p-3 text-left transition md:p-4 ${
                          selectedStockId === item.id
                            ? 'border-cyan-400 bg-cyan-500/15'
                            : 'border-slate-700 bg-slate-900 hover:border-cyan-500/60'
                        }`}
                      >
                        <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between md:gap-2">
                          <div>
                            <div className="text-sm font-semibold text-white md:text-base">
                              {item.urun_adi}
                            </div>

                            <div className="text-xs text-slate-400 md:text-sm">
                              LOT: {normalizeLot(item.lot_no)}
                            </div>
                          </div>

                          <div className="text-xs text-slate-300 md:text-sm">
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
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 md:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-100 md:text-xs">
                      ✓ STOK EŞLEŞTİ
                    </div>

                    <div className="mt-2 text-sm font-semibold text-white md:text-base">
                      {
                        (selectedStock || manualMatchedStock)
                          ?.urun_adi
                      }
                    </div>

                    <div className="mt-1 text-xs text-slate-300 md:text-sm">
                      LOT:{' '}
                      {normalizeLot(
                        (selectedStock || manualMatchedStock)
                          ?.lot_no || ''
                      )}
                    </div>

                    <div className="text-xs text-slate-300 md:text-sm">
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
                    className="text-[11px] text-emerald-100 hover:text-white md:text-xs"
                  >
                    Değiştir
                  </button>
                </div>

                <p className="mt-3 text-xs text-emerald-100 md:text-sm">
                  Vaka kaydedilince bu kapak otomatik stoktan
                  düşecek ve hareket kaydı oluşturulacaktır.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
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

          <Field label="Kapak Tipi">
            <Select
              value={form.kapak_tipi}
              onChange={value => set('kapak_tipi', value)}
              options={KAPAK_TIPLERI}
            />
          </Field>

          <Field label="Kapak Size">
            <Select
              value={form.kapak_size}
              onChange={value => set('kapak_size', value)}
              options={KAPAK_SIZES}
            />
          </Field>

          <Field label="Lot No">
            <input
              className={inputClass}
              value={form.lot_no}
              onChange={event =>
                set(
                  'lot_no',
                  normalizeLot(event.target.value)
                )
              }
              required
            />
          </Field>

          <Field label="Son Kullanma Tarihi">
            <input
              className={inputClass}
              type="date"
              value={form.son_kul_tarihi}
              onChange={event =>
                set('son_kul_tarihi', event.target.value)
              }
              required
            />
          </Field>

          <Field label="Pre Balon">
            <Select
              value={form.pre_balon}
              onChange={value => set('pre_balon', value)}
              options={BALON_SIZES}
            />
          </Field>

          <Field label="Post Balon">
            <Select
              value={form.post_balon}
              onChange={value => set('post_balon', value)}
              options={BALON_SIZES}
            />
          </Field>

          <Field label="Paravalvüler AY">
            <Select
              value={form.paravalvuler_ay}
              onChange={value =>
                set('paravalvuler_ay', value)
              }
              options={PARAVALVULER_OPTIONS}
            />
          </Field>

          <Field label="Proglide Adedi">
            <Select
              value={form.proglide_adedi}
              onChange={value =>
                set('proglide_adedi', Number(value))
              }
              options={PROGLIDE_OPTIONS}
            />
          </Field>
        </div>

        {(selectedStock || manualMatchedStock) && !isEdit && (
          <div className="rounded-xl border border-emerald-500/30 bg-slate-900 p-3 md:p-4">
            <div className="mb-1 text-xs text-slate-400 md:text-sm">
              Son Kontrol — Kullanılacak Kapak
            </div>

            <div className="text-sm font-bold text-white md:text-base">
              {
                (selectedStock || manualMatchedStock)
                  ?.urun_adi
              }{' '}
              / LOT:{' '}
              {normalizeLot(
                (selectedStock || manualMatchedStock)
                  ?.lot_no || ''
              )}
            </div>

            <div className="mt-1 text-xs text-slate-300 md:text-sm">
              SKT:{' '}
              {formatDate(
                (selectedStock || manualMatchedStock)
                  ?.son_kullanma_tarihi || ''
              )}{' '}
              • Vaka kaydıyla stoktan düşülecek.
            </div>
          </div>
        )}

        <label
          className={`block cursor-pointer rounded-2xl border p-4 transition ${
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
              className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-red-500"
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className={`h-5 w-5 shrink-0 ${
                    hasFoc
                      ? 'text-red-300'
                      : 'text-slate-400'
                  }`}
                />

                <p
                  className={`text-sm font-bold md:text-base ${
                    hasFoc
                      ? 'text-red-200'
                      : 'text-slate-200'
                  }`}
                >
                  Bu vakada FOC oluştu
                </p>
              </div>

              <p className="mt-1.5 text-xs leading-relaxed text-slate-400 md:text-sm">
                {isEdit
                  ? 'İşaretlendiğinde vaka bilgileri güncellenir ve mevcut vaka için FOC kayıt ekranı açılır.'
                  : 'İşaretlendiğinde vaka önce kaydedilir, ardından ikinci kapağın ve olay açıklamasının girileceği FOC kayıt ekranı açılır.'}
              </p>
            </div>
          </div>
        </label>

        {hasFoc && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 md:p-4">
            <p className="text-sm font-semibold text-red-200">
              {isEdit
                ? 'Bu vaka için FOC kaydı açılacak'
                : 'FOC kaydı oluşturulacak'}
            </p>

            <p className="mt-1 text-xs text-red-100/80 md:text-sm">
              {isEdit
                ? 'Değişiklikler kaydedildikten sonra ikinci kapağı ve FOC bilgilerini kaydetmek için FOC ekranına yönlendirileceksiniz.'
                : 'Kaydet butonuna bastıktan sonra ikinci kapağı seçmek ve FOC açıklamasını yazmak için ayrı ekrana yönlendirileceksiniz.'}
            </p>
          </div>
        )}

        <div className="flex justify-between gap-4 rounded-xl bg-slate-700/40 p-3 text-sm md:p-4 md:text-base">
          <span>Crimp Yapan</span>
          <b className="text-right">{crimpYapan}</b>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition disabled:opacity-60 md:py-4 md:text-base ${
            hasFoc
              ? 'bg-red-600 hover:bg-red-500'
              : 'bg-cyan-600 hover:bg-cyan-500'
          }`}
        >
          <Save className="h-4 w-4 md:h-5 md:w-5" />

          {loading
            ? 'Kaydediliyor...'
            : hasFoc
              ? isEdit
                ? 'Değişiklikleri Kaydet ve FOC Ekranına Geç'
                : 'Vakayı Kaydet ve FOC Ekranına Geç'
              : 'Kaydet'}
        </button>
      </form>
    </div>
  );
}
