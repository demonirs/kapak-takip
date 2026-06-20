import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Building2, Layers, Plus, User } from 'lucide-react';
import { Kapak, supabase, timeout } from '../lib/supabase';

type Stats = { total: number; month: number; centers: number; doctors: number };

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ total: 0, month: 0, centers: 0, doctors: 0 });
  const [recent, setRecent] = useState<Kapak[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const [totalRes, monthRes, recentRes] = await Promise.all([
        timeout(supabase.from('kapaklar').select('*', { count: 'exact', head: true }), 10000),
        timeout(supabase.from('kapaklar').select('merkez_hastane,doktor').gte('vaka_tarihi', firstDay), 10000),
        timeout(supabase.from('kapaklar').select('*').order('created_at', { ascending: false }).limit(10), 10000),
      ]);
      if (totalRes.error) throw totalRes.error;
      if (monthRes.error) throw monthRes.error;
      if (recentRes.error) throw recentRes.error;
      const monthData = monthRes.data || [];
      setStats({ total: totalRes.count || 0, month: monthData.length, centers: new Set(monthData.map(x=>x.merkez_hastane)).size, doctors: new Set(monthData.map(x=>x.doktor)).size });
      setRecent((recentRes.data as Kapak[]) || []);
    } catch (e: any) { setError(e.message || 'Dashboard yüklenemedi'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <p className="text-slate-300">Yükleniyor...</p>;
  if (error) return <div className="bg-red-500/10 text-red-300 p-4 rounded-xl">{error}<button onClick={load} className="ml-4 underline">Tekrar dene</button></div>;

  const cards = [
    ['Toplam Vaka', stats.total, Layers], ['Bu Ay Kapak', stats.month, Activity], ['Bu Ay Merkez', stats.centers, Building2], ['Bu Ay Doktor', stats.doctors, User]
  ] as const;

  return <div className="space-y-6">
    <div className="flex justify-between items-center"><div><h1 className="text-2xl font-bold">Ana Sayfa</h1><p className="text-slate-400">TAVI Kapak Takip Sistemi</p></div><Link to="/add" className="bg-cyan-600 px-4 py-3 rounded-xl font-semibold flex gap-2"><Plus /> Yeni Vaka</Link></div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{cards.map(([l,v,Icon])=><div key={l} className="bg-slate-800 border border-slate-700 rounded-2xl p-5"><Icon className="text-cyan-300 mb-3"/><p className="text-3xl font-bold">{v}</p><p className="text-slate-400 text-sm">{l}</p></div>)}</div>
    <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden"><div className="p-4 border-b border-slate-700 flex justify-between"><b>Son 10 Vaka</b><Link className="text-cyan-300" to="/list">Tümü</Link></div>{recent.length===0?<p className="p-6 text-slate-400">Henüz vaka kaydı yok.</p>:recent.map(k=><Link to={`/view/${k.id}`} key={k.id} className="block p-4 border-b border-slate-700 hover:bg-slate-700/40"><b>{k.hasta_adi}</b><p className="text-sm text-slate-400">{k.merkez_hastane} | {k.doktor} | {k.kapak_tipi} {k.kapak_size}</p></Link>)}</div>
  </div>;
}
