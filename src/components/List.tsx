import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive } from 'lucide-react';
import { Kapak, supabase, timeout } from '../lib/supabase';

export default function List() {
  const [items, setItems] = useState<Kapak[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await timeout(
        supabase
          .from('kapaklar')
          .select('*')
          .eq('arsivlendi', false)
          .order('created_at', { ascending: false }),
        10000
      );

      if (error) throw error;

      setItems((data as Kapak[]) || []);
    } catch (e: any) {
      setError(e.message || 'Liste yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const archiveCase = async (id: string) => {
    const ok = confirm('Bu vaka arşive taşınsın mı? Ana listeden kaldırılacak ama silinmeyecek.');

    if (!ok) return;

    const { error } = await timeout(
      supabase
        .from('kapaklar')
        .update({
          arsivlendi: true,
          arsivlenme_tarihi: new Date().toISOString(),
        })
        .eq('id', id),
      10000
    );

    if (error) {
      alert(error.message);
      return;
    }

    setItems(prev => prev.filter(x => x.id !== id));
  };

  if (loading) {
    return <p className="text-slate-300">Yükleniyor...</p>;
  }

  if (error) {
    return <p className="text-red-300">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Vakalar</h1>
          <p className="text-sm text-slate-400">Aktif vaka kayıtları</p>
        </div>

        <Link
          to="/add"
          className="bg-cyan-600 px-4 py-2 rounded-xl text-sm font-semibold"
        >
          Yeni Vaka
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-slate-400 bg-slate-800 p-6 rounded-xl">
          Aktif kayıt yok.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map(k => (
            <div
              key={k.id}
              className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-3"
            >
              <div>
                <b>{k.hasta_adi}</b>

                <p className="text-sm text-slate-400">
                  {k.vaka_tarihi} | {k.merkez_hastane} | {k.doktor}
                </p>

                <p className="text-sm text-cyan-300">
                  {k.kapak_tipi} {k.kapak_size} | Lot: {k.lot_no}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Link
                  className="px-3 py-2 rounded-lg bg-slate-700 text-center text-sm"
                  to={`/view/${k.id}`}
                >
                  Mail
                </Link>

                <Link
                  className="px-3 py-2 rounded-lg bg-blue-700 text-center text-sm"
                  to={`/edit/${k.id}`}
                >
                  Düzenle
                </Link>

                <button
                  className="px-3 py-2 rounded-lg bg-orange-700 text-sm flex items-center justify-center gap-1"
                  onClick={() => archiveCase(k.id)}
                >
                  <Archive className="w-4 h-4" />
                  Arşiv
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
