import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Kapak, supabase, timeout } from '../lib/supabase';

export default function ViewCase() {
  const { id } = useParams();
  const [k, setK] = useState<Kapak | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { (async()=>{ try { const { data, error } = await timeout(supabase.from('kapaklar').select('*').eq('id', id).maybeSingle(), 10000); if(error) throw error; setK(data as Kapak); } catch(e:any){ setError(e.message); } })(); }, [id]);
  if (error) return <p className="text-red-300">{error}</p>;
  if (!k) return <p>Yükleniyor...</p>;
  const mail = `Merhaba,\n\n${k.vaka_tarihi} tarihinde ${k.merkez_hastane} merkezinde Dr. ${k.doktor} tarafından ${k.hasta_adi} hastasına ${k.kapak_tipi} ${k.kapak_size} kapak kullanılmıştır.\n\nLot No: ${k.lot_no}\nSon Kullanma Tarihi: ${k.son_kul_tarihi}\nPre Balon: ${k.pre_balon}\nPost Balon: ${k.post_balon}\nParavalvüler AY: ${k.paravalvuler_ay}\nProglide Adedi: ${k.proglide_adedi}\nCrimp Yapan: ${k.crimp_yapan}\n\nBilgilerinize.`;
  return <div className="max-w-3xl space-y-4"><Link to="/list" className="text-cyan-300">← Geri</Link><div className="bg-slate-800 p-6 rounded-2xl border border-slate-700"><h1 className="text-2xl font-bold mb-4">{k.hasta_adi}</h1><pre className="whitespace-pre-wrap text-slate-200 bg-slate-900 p-4 rounded-xl">{mail}</pre><button onClick={()=>navigator.clipboard.writeText(mail)} className="mt-4 bg-cyan-600 px-4 py-2 rounded-xl">Mail Metnini Kopyala</button></div></div>;
}
