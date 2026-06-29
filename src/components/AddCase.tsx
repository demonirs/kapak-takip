import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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

      setForm(prev => ({
        ...prev,
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
      const { data, error } = await timeout(
        supabase.from('kapaklar').select('*').eq('id', id).maybeSingle(),
        10000
      );

      if (error) throw error;

      if (data) {
        const k = data as CaseWithCrimp;

        setOriginalCrimpYapan(k.crimp_yapan || '');

        setForm({
          vaka_tarihi: k.vaka_tarihi,
          merkez_hastane: k.merkez_hastane,
          doktor: k.doktor,
          hasta_adi: k.hasta_adi,
          kapak_tipi: k.kapak_tipi,
          kapak_size: k.kapak_size,
          lot_no: k.lot_no,
          son_kul_tarihi: k.son_kul_tarihi,
          pre_balon: k.pre_balon,
          post_balon: k.post_balon,
          paravalvuler_ay: k.paravalvuler_ay,
          proglide_adedi: k.proglide_adedi,
        });
      }
    } catch (e: any) {
      setError(e.message || 'Vaka yüklenemedi');
    } finally {
      setLoading(false);
    }
  }

  async function loadStockItems() {
    const { data, error } = await supabase
      .from('kapak_stok')
      .select('id, urun_adi, kapak_boyutu, lot_no, son_kullanma_tarihi')
      .eq('durum', 'stokta')
      .order('kapak_boyutu')
      .order('son_kullanma_tarihi');

    if (!error && data) {
      setStockItems(data);
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
    if (!selectedSize) return [];
    return stockItems.filter(item => item.kapak_boyutu === selectedSize);
  }, [stockItems, selectedSize]);

  const selectedStock = useMemo(() => {
    if (!selectedStockId) return null;
    return stockItems.find(item => item.id === selectedStockId) || null;
  }, [stockItems, selectedStockId]);

  const set = (name: keyof FormState, value: string | number) =>
    setForm(prev => ({ ...prev, [name]: value }));

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('tr-TR');
  }

  function handleStockSelect(stockId: string) {
    setSelectedStockId(stockId);

    if (!stockId) return;

    const selected = stockItems.find(item => item.id === stockId);

    if (!selected) return;

    setForm(prev => ({
      ...prev,
      kapak_tipi: 'Evolut Pro+',
      kapak_size: `${selected.kapak_boyutu} mm`,
      lot_no: selected.lot_no,
      son_kul_tarihi: selected.son_kullanma_tarihi,
    }));

    setSelectedSize(null);
  }

  function clearStockSelection() {
    setSelectedStockId('');
    setSelectedSize(null);

    setForm(prev => ({
      ...prev,
      lot_no: '',
      son_kul_tarihi: '',
    }));
  }

  async function markStockAsUsed(stockId: string, vakaId: string) {
    const selected = stockItems.find(item => item.id === stockId);

    if (!selected) {
      throw new Error('Seçilen stok kaydı bulunamadı.');
    }

    const { error: stockError } = await timeout(
      supabase
        .from('kapak_stok')
        .update({
          durum: 'kullanildi',
          kullanilan_vaka_id: vakaId,
        })
        .eq('id', stockId),
      10000
    );

    if (stockError) throw stockError;

    const { error: movementError } = await timeout(
      supabase.from('stok_hareketleri').insert({
        kapak_stok_id: stockId,
        islem: 'kullanildi',
        urun_adi: selected.urun_adi,
        lot_no: selected.lot_no,
        kapak_boyutu: selected.kapak_boyutu,
        son_kullanma_tarihi: selected.son_kullanma_tarihi,
        vaka_id: vakaId,
        created_by: user?.id,
      }),
      10000
    );

    if (movementError) throw movementError;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

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
      lot_no: form.lot_no.trim(),
      proglide_adedi: Number(form.proglide_adedi) || 1,
    };

    try {
      localStorage.setItem('lastHospital', payload.merkez_hastane);
      localStorage.setItem('lastDoctor', payload.doktor);

      if (isEdit) {
        const { error } = await timeout(
          supabase.from('kapaklar').update(payload).eq('id', id),
          10000
        );

        if (error) throw error;
      } else {
        const { data, error } = await timeout(
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

        if (error) throw error;

        if (selectedStockId && data?.id) {
          await markStockAsUsed(selectedStockId, data.id);
        }
      }

      navigate('/list');
    } catch (e: any) {
      console.error('Kayıt hatası:', e);
      setError(e.message || e.details || 'Kayıt sırasında hata oluştu');
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
    onChange: (v: string) => void;
    options: readonly (string | number)[];
  }) => (
    <select
      className={inputClass}
      value={String(value)}
      onChange={e => onChange(e.target.value)}
    >
      {options.map(o => (
        <option key={String(o)} value={String(o)}>
          {o}
        </option>
      ))}
    </select>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="mb-3 md:mb-4 flex gap-2 text-sm md:text-base text-slate-300"
      >
        <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" /> Geri
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
                      setSelectedSize(selectedSize === size ? null : size);
                      setSelectedStockId('');
                    }}
                    className={`rounded-xl p-2.5 md:p-3 text-left border transition ${
                      selectedSize === size
                        ? 'bg-cyan-600 border-cyan-400 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-500/60'
                    }`}
                  >
                    <div className="text-base md:text-lg font-bold">{size} mm</div>
                    <div className="text-[11px] md:text-xs opacity-80">
                      {stockCounts[size as 23 | 26 | 29 | 34]} adet stokta
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {!selectedSize && !selectedStock && (
              <div className="text-xs md:text-sm text-slate-300">
                Kapak seçmeden devam etmek istersen aşağıdaki alanları manuel doldurabilirsin.
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
                              LOT: {item.lot_no}
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

            {selectedStock && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 md:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1 text-[11px] md:text-xs font-bold text-emerald-100">
                      ✓ STOKTAN SEÇİLDİ
                    </div>

                    <div className="text-sm md:text-base text-white font-semibold mt-2">
                      {selectedStock.urun_adi}
                    </div>

                    <div className="text-xs md:text-sm text-slate-300 mt-1">
                      LOT: {selectedStock.lot_no}
                    </div>

                    <div className="text-xs md:text-sm text-slate-300">
                      SKT: {formatDate(selectedStock.son_kullanma_tarihi)}
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
                  Vaka kaydedilince bu kapak otomatik stoktan düşecek ve hareket kaydı oluşturulacaktır.
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
              onChange={e => set('vaka_tarihi', e.target.value)}
              required
            />
          </Field>

          <Field label="Merkez Hastane">
            <input
              className={inputClass}
              value={form.merkez_hastane}
              onChange={e => set('merkez_hastane', e.target.value)}
              required
            />
          </Field>

          <Field label="Doktor">
            <input
              className={inputClass}
              value={form.doktor}
              onChange={e => set('doktor', e.target.value)}
              required
            />
          </Field>

          <Field label="Hasta Adı">
            <input
              className={inputClass}
              value={form.hasta_adi}
              onChange={e => set('hasta_adi', e.target.value)}
              required
            />
          </Field>

          <Field label="Kapak Tipi">
            <Select
              value={form.kapak_tipi}
              onChange={v => set('kapak_tipi', v)}
              options={KAPAK_TIPLERI}
            />
          </Field>

          <Field label="Kapak Size">
            <Select
              value={form.kapak_size}
              onChange={v => set('kapak_size', v)}
              options={KAPAK_SIZES}
            />
          </Field>

          <Field label="Lot No">
            <input
              className={inputClass}
              value={form.lot_no}
              onChange={e => set('lot_no', e.target.value)}
              required
            />
          </Field>

          <Field label="Son Kullanma Tarihi">
            <input
              className={inputClass}
              type="date"
              value={form.son_kul_tarihi}
              onChange={e => set('son_kul_tarihi', e.target.value)}
              required
            />
          </Field>

          <Field label="Pre Balon">
            <Select
              value={form.pre_balon}
              onChange={v => set('pre_balon', v)}
              options={BALON_SIZES}
            />
          </Field>

          <Field label="Post Balon">
            <Select
              value={form.post_balon}
              onChange={v => set('post_balon', v)}
              options={BALON_SIZES}
            />
          </Field>

          <Field label="Paravalvüler AY">
            <Select
              value={form.paravalvuler_ay}
              onChange={v => set('paravalvuler_ay', v)}
              options={PARAVALVULER_OPTIONS}
            />
          </Field>

          <Field label="Proglide Adedi">
            <Select
              value={form.proglide_adedi}
              onChange={v => set('proglide_adedi', Number(v))}
              options={PROGLIDE_OPTIONS}
            />
          </Field>
        </div>

        {selectedStock && !isEdit && (
          <div className="rounded-xl border border-emerald-500/30 bg-slate-900 p-3 md:p-4">
            <div className="text-xs md:text-sm text-slate-400 mb-1">
              Son Kontrol — Kullanılacak Kapak
            </div>

            <div className="text-sm md:text-base font-bold text-white">
              {selectedStock.urun_adi} / LOT: {selectedStock.lot_no}
            </div>

            <div className="text-xs md:text-sm text-slate-300 mt-1">
              SKT: {formatDate(selectedStock.son_kullanma_tarihi)} • Vaka kaydıyla stoktan düşülecek.
            </div>
          </div>
        )}

        <div className="bg-slate-700/40 p-3 md:p-4 rounded-xl flex justify-between text-sm md:text-base">
          <span>Crimp Yapan</span>
          <b>{crimpYapan}</b>
        </div>

        <button
          disabled={loading}
          className="w-full py-3 md:py-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 font-bold flex justify-center gap-2 disabled:opacity-60 text-sm md:text-base"
        >
          <Save className="w-4 h-4 md:w-5 md:h-5" />{' '}
          {loading ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </form>
    </div>
  );
}
