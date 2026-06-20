import { useEffect, useMemo, useState } from 'react';
import { PlusCircle, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type CompetitorCase = {
  id: string;
  merkez: string;
  doktor: string | null;
  vaka_tarihi: string;
  marka: string;
  model: string | null;
  kapak_boyutu: number | null;
  firma: string | null;
  notlar: string | null;
  diger_aciklama: string | null;
  created_at: string;
};

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

const MODELLER = [
  'Evolut Pro+',
  'Evolut FX',
  'Evolut FX+',
  'Sapien 3',
  'Sapien 3 Ultra',
  'Myval',
  'Allegra',
  'Navitor',
  'Hydra',
  'VitaFlow',
  'Diğer',
];

const BOYUTLAR = ['20', '23', '25', '26', '27', '29', '30', '31', '34'];

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

  const [merkez, setMerkez] = useState('');
  const [doktor, setDoktor] = useState('');
  const [vakaTarihi, setVakaTarihi] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [marka, setMarka] = useState('Edwards');
  const [model, setModel] = useState('Sapien 3');
  const [kapakBoyutu, setKapakBoyutu] = useState('26');
  const [firma, setFirma] = useState('');
  const [notlar, setNotlar] = useState('');
  const [digerAciklama, setDigerAciklama] = useState('');

  useEffect(() => {
    loadCases();
  }, []);

  async function loadCases() {
    setLoading(true);

    const { data, error } = await supabase
      .from('rakip_vakalar')
      .select('*')
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

    if ((marka === 'Diğer' || model === 'Diğer') && !digerAciklama.trim()) {
      setMessage('Diğer seçildiğinde açıklama alanı zorunlu.');
      return;
    }

    const { error } = await supabase.from('rakip_vakalar').insert({
      merkez: merkez.trim(),
      doktor: doktor.trim() || null,
      vaka_tarihi: vakaTarihi,
      marka,
      model: model || null,
      kapak_boyutu: kapakBoyutu ? Number(kapakBoyutu) : null,
      firma: firma.trim() || null,
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
    setMarka('Edwards');
    setModel('Sapien 3');
    setKapakBoyutu('26');
    setFirma('');
    setNotlar('');
    setDigerAciklama('');
    setMessage('Rakip vaka eklendi.');

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

  const stats = useMemo(() => {
    const total = items.length;

    const countByBrand = (brand: string) =>
      items.filter(i => i.marka === brand).length;

    return {
      total,
      medtronic: countByBrand('Medtronic'),
      edwards: countByBrand('Edwards'),
      meril: countByBrand('Meril'),
      allegra: countByBrand('Allegra'),
      abbott: countByBrand('Abbott'),
      hydra: countByBrand('Hydra'),
      microport: countByBrand('MicroPort'),
      diger: countByBrand('Diğer'),
    };
  }, [items]);

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('tr-TR');
  }

  return (
    <div className="space-y-6 pb-24 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Rakip Vakalar</h1>
        <p className="text-slate-400">
          Merkez bazlı TAVI kapak kullanım takibi
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400">Toplam</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>

        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400">Medtronic</div>
          <div className="text-2xl font-bold">{stats.medtronic}</div>
        </div>

        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400">Edwards</div>
          <div className="text-2xl font-bold">{stats.edwards}</div>
        </div>

        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400">Meril</div>
          <div className="text-2xl font-bold">{stats.meril}</div>
        </div>

        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400">Allegra</div>
          <div className="text-2xl font-bold">{stats.allegra}</div>
        </div>

        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400">Abbott</div>
          <div className="text-2xl font-bold">{stats.abbott}</div>
        </div>

        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400">Hydra</div>
          <div className="text-2xl font-bold">{stats.hydra}</div>
        </div>

        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400">MicroPort</div>
          <div className="text-2xl font-bold">{stats.microport}</div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-4">
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
            <select
              value={marka}
              onChange={e => setMarka(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
            >
              {MARKALAR.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">Model</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
            >
              {MODELLER.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">Boyut</label>
            <select
              value={kapakBoyutu}
              onChange={e => setKapakBoyutu(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
            >
              {BOYUTLAR.map(item => (
                <option key={item} value={item}>
                  {item} mm
                </option>
              ))}
            </select>
          </div>

          {(marka === 'Diğer' || model === 'Diğer') && (
            <div className="md:col-span-3">
              <label className="block text-sm text-slate-300 mb-2">
                Diğer Marka / Model Açıklaması *
              </label>
              <input
                value={digerAciklama}
                onChange={e => setDigerAciklama(e.target.value)}
                placeholder="Örn: farklı kapak markası veya model adı"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
              />
            </div>
          )}

          <div className="md:col-span-3">
            <label className="block text-sm text-slate-300 mb-2">Firma / Not</label>
            <div className="grid md:grid-cols-2 gap-3">
              <input
                value={firma}
                onChange={e => setFirma(e.target.value)}
                placeholder="Firma / distribütör"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
              />

              <input
                value={notlar}
                onChange={e => setNotlar(e.target.value)}
                placeholder="Kısa not"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
              />
            </div>
          </div>
        </div>

        <button
          onClick={addCase}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-white font-medium"
        >
          <PlusCircle className="w-4 h-4" />
          Kaydet
        </button>

        {message && <div className="text-sm text-slate-300">{message}</div>}
      </div>

      {loading ? (
        <div className="text-slate-400">Yükleniyor...</div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="w-full max-w-full overflow-x-auto overflow-y-visible">
            <table className="min-w-[1100px] w-full">
              <thead className="bg-slate-700">
                <tr>
                  <th className="text-left p-3 whitespace-nowrap">TARİH</th>
                  <th className="text-left p-3 whitespace-nowrap">MERKEZ</th>
                  <th className="text-left p-3 whitespace-nowrap">DOKTOR</th>
                  <th className="text-left p-3 whitespace-nowrap">MARKA</th>
                  <th className="text-left p-3 whitespace-nowrap">MODEL</th>
                  <th className="text-left p-3 whitespace-nowrap">BOYUT</th>
                  <th className="text-left p-3 whitespace-nowrap">DİĞER</th>
                  <th className="text-left p-3 whitespace-nowrap">NOT</th>
                  {isAdmin && (
                    <th className="text-left p-3 whitespace-nowrap">SİL</th>
                  )}
                </tr>
              </thead>

              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 9 : 8}
                      className="p-4 text-slate-400 text-center"
                    >
                      Henüz rakip vaka yok.
                    </td>
                  </tr>
                ) : (
                  items.map(item => (
                    <tr key={item.id} className="border-t border-slate-700">
                      <td className="p-3 whitespace-nowrap">
                        {formatDate(item.vaka_tarihi)}
                      </td>

                      <td className="p-3 whitespace-nowrap">{item.merkez}</td>

                      <td className="p-3 whitespace-nowrap">
                        {item.doktor || '-'}
                      </td>

                      <td className="p-3 whitespace-nowrap">{item.marka}</td>

                      <td className="p-3 whitespace-nowrap">
                        {item.model || '-'}
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        {item.kapak_boyutu ? `${item.kapak_boyutu} mm` : '-'}
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        {item.diger_aciklama || '-'}
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        {item.notlar || '-'}
                      </td>

                      {isAdmin && (
                        <td className="p-3 whitespace-nowrap">
                          <button
                            onClick={() => deleteCase(item.id)}
                            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-red-300 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-4 h-4" />
                            Sil
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
