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
      <span className="block text-xs md:text-sm text-slate-300 mb-1.5 md:mb-2">
        {label} <b className="text-red-400">*</b>
      </span>

      {children}
    </label>
  );
}

const inputClass =
  'w-full px-3 md:px-4 py-2.5 md:py-3 rounded-xl bg-slate-700 border border-slate-600 text-sm md:text-base text-white focus:outline-none focus:ring-2 focus:ring-cyan-500';

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
    loadStockItems();

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

    loadCase();
  }, [id]);

  async function loadCase() {
    setLoading(true);

    try {
      const { data, error: loadError } = await timeout(
        supabase.from('kapaklar').select('*').eq('id', id).maybeSingle(),
        10000
      );

      if (loadError) {
        throw loadError;
      }

      if (data) {
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
      }
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
      .select('id, urun_adi, kapak_boyutu, lot_no, son_kullanma_tarihi')
      .eq('durum', 'stokta')
      .order('kapak_boyutu')
      .order('son_kullanma_tarihi');

    if (!stockError && data) {
      setStockItems(data as StockItem[]);
    }
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

    return stockItems.filter(item => item.kapak_boyutu === selectedSize);
  }, [stockItems, selectedSize]);

  const selectedStock = useMemo(() => {
    if (!selectedStockId) {
      return null;
    }

    return stockItems.find(item => item.id === selectedStockId) || null;
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

  const set = (name: keyof FormState, value: string | number) => {
    setForm(previous => ({
      ...previous,
      [name]: value,
    }));
  };

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('tr-TR');
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

  async function markStockAsUsed(stockId: string, vakaId: string) {
    const selected = stockItems.find(item => item.id === stockId);

    if (!selected) {
      throw new Error(
        'Seçilen stok kaydı bulunamadı veya artık stokta değil.'
      );
    }

    const { error: stockUpdateError } = await timeout(
      supabase
        .from('kapak_stok')
        .update({
          durum: 'kullanildi',
          kullanilan_vaka_id: vakaId,
        })
        .eq('id', stockId)
        .eq('durum', 'stokta'),
      10000
    );

    if (stockUpdateError) {
      throw stockUpdateError;
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
      localStorage.setItem('lastHospital', payload.merkez_hastane);
      localStorage.setItem('lastDoctor', payload.doktor);

      if (isEdit) {
        const { error: updateError } = await timeout(
          supabase.from('kapaklar').update(payload).eq('id', id),
          10000
        );

        if (updateError) {
          throw updateError;
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
        throw new Error('Vaka oluşturuldu ancak vaka kimliği alınamadı.');
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
    <div className="max-w-3xl mx-auto">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-3 md:mb-4 flex items-center gap-2 text-sm md:text-base text-slate-300 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
        Geri
      </button>

      <form
        onSubmit={submit}
        className="bg-slate-800 border border-slate-700 rounded-2xl p-4 md:p-6 space-y-5 md:space-y-6"
      >
        <h1 className="text-xl md:text-2xl font-bold">
          {isEdit ? 'Vakayı Düzenle' : 'Yeni Vaka Ekle'}
        </h1>

        {error && (
          <p className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-xl text-xs md:text-sm">
            {error}
          </p>
        )}

        {!isEdit && (
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3 md:p-4 space-y-3 md:space-y-4">
            <div>
              <span className="block text-xs md:text-sm text-cyan-200 mb-2 md:mb-3">
                Stoktan Kapak Seç
              </span>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
                    className={`rounded-xl p-2.5 md:p-3 text-left border transition ${
                      selectedSize === size
                        ? 'bg-cyan-600 border-cyan-400 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-500/60'
                    }`}
                  >
                    <div className="text-base md:text-lg font-bold">
                      {size} mm
                    </div>

                    <div className="text-[11px] md:text-xs opacity-80">
                      {stockCounts[size as 23 | 26 | 29 | 34]} adet stokta
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {!selectedSize &&
              !selectedStock &&
              !manualMatchedStock && (
                <div className="text-xs md:text-sm text-slate-300">
                  Kapak seçmeden devam etmek istersen aşağıdaki alanları
                  manuel doldurabilirsin.
                </div>
              )}

            {selectedSize && (
              <div className="space-y-2 md:space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs md:text-sm text-cyan-100">
                    {selectedSize} mm stok listesi
                  </div>

                  <button
                    type="button"
                    onClick={clearStockSelection}
                    className="text-[11px] md:text-xs text-slate-300 hover:text-white"
                  >
                    Seçimi temizle
                  </button>
                </div>

                {filteredStockItems.length === 0 ? (
                  <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 md:p-4 text-xs md:text-sm text-slate-400">
                    {selectedSize} mm stokta kapak bulunamadı.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredStockItems.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleStockSelect(item.id)}
                        className={`w-full text-left rounded-xl border p-3 md:p-4 transition ${
                          selectedStockId === item.id
                            ? 'border-cyan-400 bg-cyan-500/15'
                            : 'border-slate-700 bg-slate-900 hover:border-cyan-500/60'
                        }`}
                      >
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1.5 md:gap-2">
                          <div>
                            <div className="font-semibold text-sm md:text-base text-white">
                              {item.urun_adi}
                            </div>

                            <div className="text-xs md:text-sm text-slate-400">
                              LOT: {normalizeLot(item.lot_no)}
                            </div>
                          </div>

                          <div className="text-xs md:text-sm text-slate-300">
                            SKT: {formatDate(item.son_kullanma_tarihi)}
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
                    <div className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1 text-[11px] md:text-xs font-bold text-emerald-100">
                      ✓ STOK EŞLEŞTİ
                    </div>

                    <div className="text-sm md:text-base text-white font-semibold mt-2">
                      {(selectedStock || manualMatchedStock)?.urun_adi}
                    </div>

                    <div className="text-xs md:text-sm text-slate-300 mt-1">
                      LOT:{' '}
                      {normalizeLot(
                        (selectedStock || manualMatchedStock)?.lot_no || ''
                      )}
                    </div>

                    <div className="text-xs md:text-sm text-slate-300">
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
                    className="text-[11px] md:text-xs text-emerald-100 hover:text-white"
                  >
                    Değiştir
                  </button>
                </div>

                <p className="text-xs md:text-sm text-emerald-100 mt-3">
                  Vaka kaydedilince bu kapak otomatik stoktan düşecek ve
                  hareket kaydı oluşturulacaktır.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-3 md:gap-4">
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
              onChange={event => set('doktor', event.target.value)}
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
                set('lot_no', normalizeLot(event.target.value))
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
              onChange={value => set('paravalvuler_ay', value)}
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
            <div className="text-xs md:text-sm text-slate-400 mb-1">
              Son Kontrol — Kullanılacak Kapak
            </div>

            <div className="text-sm md:text-base font-bold text-white">
              {(selectedStock || manualMatchedStock)?.urun_adi} / LOT:{' '}
              {normalizeLot(
                (selectedStock || manualMatchedStock)?.lot_no || ''
              )}
            </div>

            <div className="text-xs md:text-sm text-slate-300 mt-1">
              SKT:{' '}
              {formatDate(
                (selectedStock || manualMatchedStock)
                  ?.son_kullanma_tarihi || ''
              )}{' '}
              • Vaka kaydıyla stoktan düşülecek.
            </div>
          </div>
        )}

        {!isEdit && (
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
                onChange={event => setHasFoc(event.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-red-500"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className={`h-5 w-5 shrink-0 ${
                      hasFoc ? 'text-red-300' : 'text-slate-400'
                    }`}
                  />

                  <p
                    className={`text-sm md:text-base font-bold ${
                      hasFoc ? 'text-red-200' : 'text-slate-200'
                    }`}
                  >
                    Bu vakada FOC oluştu
                  </p>
                </div>

                <p className="mt-1.5 text-xs md:text-sm text-slate-400 leading-relaxed">
                  İşaretlendiğinde vaka önce kaydedilir, ardından ikinci
                  kapağın ve olay açıklamasının girileceği FOC kayıt
                  ekranı açılır.
                </p>
              </div>
            </div>
          </label>
        )}

        {hasFoc && !isEdit && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 md:p-4">
            <p className="text-sm font-semibold text-red-200">
              FOC kaydı oluşturulacak
            </p>

            <p className="mt-1 text-xs md:text-sm text-red-100/80">
              Kaydet butonuna bastıktan sonra ikinci kapağı seçmek ve FOC
              açıklamasını yazmak için ayrı ekrana yönlendirileceksiniz.
            </p>
          </div>
        )}

        <div className="bg-slate-700/40 p-3 md:p-4 rounded-xl flex justify-between gap-4 text-sm md:text-base">
          <span>Crimp Yapan</span>
          <b className="text-right">{crimpYapan}</b>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3 md:py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60 text-sm md:text-base transition ${
            hasFoc && !isEdit
              ? 'bg-red-600 hover:bg-red-500'
              : 'bg-cyan-600 hover:bg-cyan-500'
          }`}
        >
          <Save className="w-4 h-4 md:w-5 md:h-5" />

          {loading
            ? 'Kaydediliyor...'
            : hasFoc && !isEdit
              ? 'Vakayı Kaydet ve FOC Ekranına Geç'
              : 'Kaydet'}
        </button>
      </form>
    </div>
  );
}
