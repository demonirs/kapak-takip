import { useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Kapak, supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type Movement = {
  id: string;
  islem: 'giris' | 'kullanildi' | 'iptal';
  urun_adi: string;
  lot_no: string;
  kapak_boyutu: number | null;
  son_kullanma_tarihi: string | null;
  created_at: string;
  arsivlendi: boolean | null;
};

export default function ArchivedMovements() {
  const { profile } = useAuth();
  const currentProfile = profile as any;
  const isAdmin =
    currentProfile?.role === 'admin' ||
    currentProfile?.yetki === 'admin' ||
    currentProfile?.is_admin === true;

  const [archivedCases, setArchivedCases] = useState<Kapak[]>([]);
  const [archivedMovements, setArchivedMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadArchive();
  }, []);

  async function loadArchive() {
    setLoading(true);
    setMessage('');

    const { data: casesData, error: casesError } = await supabase
      .from('kapaklar')
      .select('*')
      .eq('arsivlendi', true)
      .order('created_at', { ascending: false })
      .limit(300);

    const { data: movementsData, error: movementsError } = await supabase
      .from('stok_hareketleri')
      .select('*')
      .eq('arsivlendi', true)
      .order('created_at', { ascending: false })
      .limit(300);

    if (casesError || movementsError) {
      setMessage(casesError?.message || movementsError?.message || 'Arşiv yüklenemedi.');
    }

    setArchivedCases((casesData as Kapak[]) || []);
    setArchivedMovements((movementsData as Movement[]) || []);
    setLoading(false);
  }

  async function restoreCase(id: string) {
    const ok = window.confirm('Bu vaka arşivden çıkarılsın mı?');
    if (!ok) return;

    const { error } = await supabase
      .from('kapaklar')
      .update({
        arsivlendi: false,
        arsivlenme_tarihi: null,
      })
      .eq('id', id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadArchive();
  }

  async function deleteCase(id: string) {
    if (!isAdmin) {
      alert('Bu işlemi sadece admin yapabilir.');
      return;
    }

    const ok = window.confirm('Bu arşivlenmiş vaka kalıcı olarak silinsin mi?');
    if (!ok) return;

    const { error } = await supabase
      .from('kapaklar')
      .delete()
      .eq('id', id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadArchive();
  }

  async function restoreMovement(id: string) {
    const ok = window.confirm('Bu stok hareketi arşivden çıkarılsın mı?');
    if (!ok) return;

    const { error } = await supabase
      .from('stok_hareketleri')
      .update({ arsivlendi: false })
      .eq('id', id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadArchive();
  }

  async function deleteMovement(id: string) {
    if (!isAdmin) {
      alert('Bu işlemi sadece admin yapabilir.');
      return;
    }

    const ok = window.confirm('Bu stok hareket arşiv kaydı kalıcı olarak silinsin mi?');
    if (!ok) return;

    const { error } = await supabase
      .from('stok_hareketleri')
      .delete()
      .eq('id', id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadArchive();
  }

  function formatDate(date: string | null | undefined) {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('tr-TR');
  }

  function formatDateTime(date: string | null | undefined) {
    if (!date) return '-';
    return new Date(date).toLocaleString('tr-TR');
  }

  function islemText(islem: Movement['islem']) {
    if (islem === 'giris') return 'Giriş';
    if (islem === 'kullanildi') return 'Kullanıldı';
    return 'İptal';
  }

  function islemClass(islem: Movement['islem']) {
    if (islem === 'giris')
      return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30';

    if (islem === 'kullanildi')
      return 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30';

    return 'bg-red-500/20 text-red-200 border-red-500/30';
  }

  return (
    <div className="space-y-8 pb-24 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Arşiv</h1>
        <p className="text-slate-400">
          Arşivlenen vakalar ve stok hareketleri
        </p>
      </div>

      {message && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-xl p-4 text-sm">
          {message}
        </div>
      )}

      {loading ? (
        <div className="text-slate-400">Yükleniyor...</div>
      ) : (
        <>
          <section className="space-y-3">
            <div>
              <h2 className="text-xl font-bold text-white">Vaka Arşivi</h2>
              <p className="text-sm text-slate-400">
                Vaka listesinden arşive alınan kayıtlar
              </p>
            </div>

            {archivedCases.length === 0 ? (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-slate-400">
                Arşivlenmiş vaka yok.
              </div>
            ) : (
              <div className="space-y-3">
                {archivedCases.map(item => (
                  <div
                    key={item.id}
                    className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-3"
                  >
                    <div>
                      <b>{item.hasta_adi}</b>

                      <p className="text-sm text-slate-400">
                        {item.vaka_tarihi} | {item.merkez_hastane} | {item.doktor}
                      </p>

                      <p className="text-sm text-cyan-300">
                        {item.kapak_tipi} {item.kapak_size} | Lot: {item.lot_no}
                      </p>
                    </div>

                    <div className={`grid gap-2 ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      <button
                        onClick={() => restoreCase(item.id)}
                        className="px-3 py-2 rounded-lg bg-cyan-700 text-sm flex items-center justify-center gap-1"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Geri Al
                      </button>

                      {isAdmin && (
                        <button
                          onClick={() => deleteCase(item.id)}
                          className="px-3 py-2 rounded-lg bg-red-700 text-sm flex items-center justify-center gap-1"
                        >
                          <Trash2 className="w-4 h-4" />
                          Sil
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-xl font-bold text-white">Stok Hareket Arşivi</h2>
              <p className="text-sm text-slate-400">
                Stok hareketlerinden arşive alınan kayıtlar
              </p>
            </div>

            <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
              <div className="w-full max-w-full overflow-x-auto overflow-y-visible">
                <table className="min-w-[980px] w-full">
                  <thead className="bg-slate-700">
                    <tr>
                      <th className="text-left p-3 whitespace-nowrap">TARİH</th>
                      <th className="text-left p-3 whitespace-nowrap">İŞLEM</th>
                      <th className="text-left p-3 whitespace-nowrap">ÜRÜN</th>
                      <th className="text-left p-3 whitespace-nowrap">LOT</th>
                      <th className="text-left p-3 whitespace-nowrap">SKT</th>
                      <th className="text-left p-3 whitespace-nowrap">İŞLEM</th>
                    </tr>
                  </thead>

                  <tbody>
                    {archivedMovements.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-slate-400 text-center">
                          Arşivde stok hareketi yok.
                        </td>
                      </tr>
                    ) : (
                      archivedMovements.map(item => (
                        <tr key={item.id} className="border-t border-slate-700">
                          <td className="p-3 whitespace-nowrap">
                            {formatDateTime(item.created_at)}
                          </td>

                          <td className="p-3 whitespace-nowrap">
                            <span className={`px-3 py-1 rounded-full border text-sm ${islemClass(item.islem)}`}>
                              {islemText(item.islem)}
                            </span>
                          </td>

                          <td className="p-3 whitespace-nowrap">{item.urun_adi}</td>

                          <td className="p-3 whitespace-nowrap">{item.lot_no}</td>

                          <td className="p-3 whitespace-nowrap">
                            {formatDate(item.son_kullanma_tarihi)}
                          </td>

                          <td className="p-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => restoreMovement(item.id)}
                                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-cyan-300 hover:bg-cyan-500/10"
                              >
                                <RotateCcw className="w-4 h-4" />
                                Geri Al
                              </button>

                              {isAdmin && (
                                <button
                                  onClick={() => deleteMovement(item.id)}
                                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-red-300 hover:bg-red-500/10"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Sil
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
