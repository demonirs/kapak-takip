import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
} from 'lucide-react';
import { Kapak, supabase, timeout } from '../lib/supabase';

export default function ViewCase() {
  const { id } = useParams();
  const [k, setK] = useState<Kapak | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: loadError } = await timeout(
          supabase
            .from('kapaklar')
            .select('*')
            .eq('id', id)
            .maybeSingle(),
          10000
        );

        if (loadError) throw loadError;
        setK(data as Kapak);
      } catch (loadError: unknown) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Vaka bilgisi yüklenemedi.'
        );
      }
    })();
  }, [id]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />

          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-200">
              Vaka bilgisi yüklenemedi
            </p>

            <p className="mt-1 break-words text-xs text-red-300">
              {error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!k) {
    return (
      <div className="surface p-4 text-sm text-slate-400">
        Vaka bilgisi yükleniyor...
      </div>
    );
  }

  const formattedDate = k.vaka_tarihi
    ? k.vaka_tarihi.split('T')[0].split('-').reverse().join('.')
    : 'Tarih belirtilmedi';

  const mail = `${formattedDate}

${k.hasta_adi} isimli hastaya Medtronic ${k.kapak_tipi} ${k.kapak_size} kapak Lot no (${k.lot_no}) Dr. ${k.doktor} tarafından başarılı bir şekilde implante edildi.

Paravalvüler AY ${String(k.paravalvuler_ay).toLowerCase()}.

${k.pre_balon !== 'Yok' ? `${k.pre_balon} pre balon yapıldı.\n\n` : ''}${k.post_balon !== 'Yok' ? `${k.post_balon} post balon yapıldı.\n\n` : ''}Fokus'tan ${k.proglide_adedi} Proglide kullanıldı.

Saygılarımla,
CRİMP: ${k.crimp_yapan}`;

  async function copyMailText() {
    await navigator.clipboard.writeText(mail);
    setCopied(true);

    window.setTimeout(() => {
      setCopied(false);
    }, 1800);
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3">
      <Link
        to="/list"
        className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-cyan-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Vakalara dön
      </Link>

      <section className="surface min-w-0 overflow-hidden">
        <header className="flex min-w-0 flex-col gap-3 border-b border-slate-800 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-400">
              Mail Önizleme
            </p>

            <h1 className="mt-1 truncate text-lg font-semibold text-white sm:text-xl">
              {k.hasta_adi || 'Hasta adı belirtilmedi'}
            </h1>

            <p className="mt-1 text-xs text-slate-500">
              {formattedDate}
              <span className="mx-1.5 text-slate-700">•</span>
              {k.kapak_tipi || 'Kapak tipi eksik'}
              {k.kapak_size ? ` / ${k.kapak_size} mm` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void copyMailText()}
            className="button-primary w-full shrink-0 sm:w-auto"
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}

            {copied ? 'Kopyalandı' : 'Mail Metnini Kopyala'}
          </button>
        </header>

        <div className="p-3 sm:p-4">
          <pre className="max-w-full whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-950/55 p-3 font-mono text-[13px] leading-6 text-slate-300 sm:p-4 sm:text-sm sm:leading-6">
            {mail}
          </pre>
        </div>
      </section>
    </div>
  );
}
