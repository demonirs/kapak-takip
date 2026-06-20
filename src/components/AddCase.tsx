import { useEffect, useState } from 'react';
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-slate-300 mb-2">
        {label} <b className="text-red-400">*</b>
      </span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full px-4 py-3 rounded-xl bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500';

export default function AddCase() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState>(initial);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [selectedStockId, setSelectedStockId] = useState('');
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crimpYapan = profile?.full_name || user?.email?.split('@')[0] || 'Kullanıcı';

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

    const load = async () => {
      setLoading(true);

      try {
        const { data, error } = await timeout(
          supabase.from('kapaklar').select('*').eq('id', id).maybeSingle(),
          10000
        );

        if (error) throw error;

        if (data) {
          const k = data as Kapak;

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
    };

    load();
  }, [id]);

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

  const set = (name: keyof FormState, value: string | number) =>
    setForm(prev => ({ ...prev, [name]: value }));

  function handleStockSelect(stockId: string) {
    setSelectedStockId(stockId);

    if (!stockId) {
      setSelectedStock(null);
      return;
    }

    const selected = stockItems.find(item => item.id === stockId);

    if (!selected) return;

    setSelectedStock(selected);

    setForm(prev => ({
      ...prev,
      kapak_tipi: 'Evolut Pro+',
      kapak_size: `${selected.kapak_boyutu} mm`,
      lot_no: selected.lot_no,
      son_kul_tarihi: selected.son_kullanma_tarihi,
    }));
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
      crimp_yapan: crimpYapan,
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
            .insert({ ...payload, user_id: user.id })
            .select('id')
            .single(),
          10000
        );

        if (error) throw error;

        if (selectedStockId && data?.id && selectedStock) {
          const { error: stockError } = await timeout(
            supabase
              .from('kapak_stok')
              .update({
                durum: 'kullanildi',
                kullanilan_vaka_id: data.id,
              })
              .eq('id', selectedStockId),
            10000
          );

          if (stockError) throw stockError;

          const { error: hareketError } = await timeout(
            supabase.from('stok_hareketleri').insert({
              kapak_stok_id: selectedStockId,
              islem: 'kullanildi',
              urun_adi: selectedStock.urun_adi,
              lot_no: selectedStock.lot_no,
              kapak_boyutu: selectedStock.kapak_boyutu,
              son_kullanma_tarihi: selectedStock.son_kullanma_tarihi,
              vaka_id: data.id,
            }),
            10000
          );

          if (hareketError) throw hareketError;
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
    <select className={inputClass} value={String(value)} onChange={e => onChange(e.target.value)}>
      {options.map(o => (
        <option key={String(o)} value={String(o)}>
          {o}
        </option>
      ))}
    </select>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate(-1)} className="mb-4 flex gap-2 text-slate-300">
        <ArrowLeft /> Geri
      </button>

      <form onSubmit={submit} className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-6">
        <h1 className="text-2xl font-bold">{isEdit ? 'Vakayı Düzenle' : 'Yeni Vaka Ekle'}</h1>

        {error && (
          <p className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-xl">
            {error}
          </p>
        )}

        {!isEdit && (
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4">
            <label className="block">
              <span className="block text-sm text-cyan-200 mb-2">
                Stoktan Kapak Seç
              </span>

              <select
                className={inputClass}
                value={selectedStockId}
                onChange={e => handleStockSelect(e.target.value)}
              >
                <option value="">Stoktan kapak seçmeden devam et</option>

                {stockItems.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.urun_adi} | LOT: {item.lot_no} | SKT: {new Date(item.son_kullanma_tarihi).toLocaleDateString('tr-TR')}
                  </option>
                ))}
              </select>
            </label>

            {selectedStockId && (
              <p className="text-sm text-cyan-200 mt-3">
                Seçilen kapak vaka kaydedilince otomatik stoktan düşecek ve hareket kaydı oluşturulacaktır.
              </p>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
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
            <Select value={form.kapak_tipi} onChange={v => set('kapak_tipi', v)} options={KAPAK_TIPLERI} />
          </Field>

          <Field label="Kapak Size">
            <Select value={form.kapak_size} onChange={v => set('kapak_size', v)} options={KAPAK_SIZES} />
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
            <Select value={form.pre_balon} onChange={v => set('pre_balon', v)} options={BALON_SIZES} />
          </Field>

          <Field label="Post Balon">
            <Select value={form.post_balon} onChange={v => set('post_balon', v)} options={BALON_SIZES} />
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

        <div className="bg-slate-700/40 p-4 rounded-xl flex justify-between">
          <span>Crimp Yapan</span>
          <b>{crimpYapan}</b>
        </div>

        <button
          disabled={loading}
          className="w-full py-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 font-bold flex justify-center gap-2 disabled:opacity-60"
        >
          <Save /> {loading ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </form>
    </div>
  );
}
