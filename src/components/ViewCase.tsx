import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Kapak, supabase, timeout } from '../lib/supabase';

export default function ViewCase() {
  const { id } = useParams();
  const [k, setK] = useState<Kapak | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await timeout(
          supabase.from('kapaklar').select('*').eq('id', id).maybeSingle(),
          10000
        );

        if (error) throw error;
        setK(data as Kapak);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, [id]);

  if (error) return <p className="text-red-300">{error}</p>;
  if (!k) return <p>Yükleniyor...</p>;

  const formattedDate = k.vaka_tarihi.split('-').reverse().join('.');

  const mail = `${formattedDate}

${k.hasta_adi} isimli hastaya Medtronic ${k.kapak_tipi} ${k.kapak_size} kapak Lot no (${k.lot_no}) Dr. ${k.doktor} tarafından başarılı bir şekilde implante edildi.

Paravalvüler AY ${String(k.paravalvuler_ay).toLowerCase()}.

${k.pre_balon !== 'Yok' ? `${k.pre_balon} pre balon yapıldı.\n\n` : ''}${k.post_balon !== 'Yok' ? `${k.post_balon} post balon yapıldı.\n\n` : ''}Fokus'tan ${k.proglide_adedi} Proglide kullanıldı.

Saygılarımla,
CRİMP: ${k.crimp_yapan}`;

  return (
    <div className="max-w-3xl space-y-4">
      <Link to="/list" className="text-cyan-300">
        ← Geri
      </Link>

      <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
        <h1 className="text-2xl font-bold mb-4">{k.hasta_adi}</h1>

        <pre className="whitespace-pre-wrap text-slate-200 bg-slate-900 p-4 rounded-xl">
          {mail}
        </pre>

        <button
          onClick={() => navigator.clipboard.writeText(mail)}
          className="mt-4 bg-cyan-600 px-4 py-2 rounded-xl"
        >
          Mail Metnini Kopyala
        </button>
      </div>
    </div>
  );
}
