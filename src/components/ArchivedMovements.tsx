import { useEffect, useState } from 'react';
import {
  ArchiveX,
  CalendarDays,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Kapak, supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type ArchiveTab = 'cases' | 'movements';

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
  const [activeTab, setActiveTab] = useState<ArchiveTab>('cases');
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
      setMessage(
        casesError?.message ||
          movementsError?.message ||
          'Arşiv yüklenemedi.'
      );
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

    const ok = window.confirm(
      'Bu arşivlenmiş vaka kalıcı olarak silinsin mi?'
    );

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
    const ok = window.confirm(
      'Bu stok hareketi arşivden çıkarılsın mı?'
    );

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

    const ok = window.confirm(
      'Bu stok hareket arşiv kaydı kalıcı olarak silinsin mi?'
    );

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

  function changeTab(tab: ArchiveTab) {
    setActiveTab(tab);
    setMessage('');
  }

  function formatDate(date: string | null | undefined) {
    if (!date) return '-';

    return new Date(date).toLocaleDateString('tr-TR');
  }

  function formatDateTime(date: string | null | undefined) {
    if (!date) return '-';

    return new Date(date).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function islemText(islem: Movement['islem']) {
    if (islem === 'giris') return 'Giriş';
    if (islem === 'kullanildi') return 'Kullanım';

    return 'İptal';
  }

  function islemClass(islem: Movement['islem']) {
    if (islem === 'giris') {
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    }

    if (islem === 'kullanildi') {
      return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
    }

    return 'border-red-500/30 bg-red-500/10 text-red-300';
  }

  function tabClass(tab: ArchiveTab) {
    return activeTab === tab
      ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-100 shadow-sm'
      : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200';
  }

  function caseProduct(item: Kapak) {
    const product = [item.kapak_tipi, item.kapak_size]
      .filter(Boolean)
      .join(' ');

    return product || 'Kapak bilgisi yok';
  }

  return (
    <div className="space-y-4 pb-24">
      <header>
        <h1 className="text-xl font-bold text-white sm:text-2xl">
          Arşiv
        </h1>

        <p className="mt-1 text-sm text-slate-400">
          Arşivlenen vakaları ve stok hareketlerini yönetin.
        </p>
      </header>

      <div className="inline-flex w-full rounded-xl border border-slate-700 bg-slate-900/60 p-1 sm:w-auto">
        <button
          type="button"
          onClick={() => changeTab('cases')}
          aria-pressed={activeTab === 'cases'}
          className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition sm:flex-none ${tabClass(
            'cases'
          )}`}
        >
          <span>Vakalar</span>

          <span
            className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${
              activeTab === 'cases'
                ? 'bg-cyan-400/20 text-cyan-100'
                : 'bg-slate-700 text-slate-300'
            }`}
          >
            {archivedCases.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => changeTab('movements')}
          aria-pressed={activeTab === 'movements'}
          className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition sm:flex-none ${tabClass(
            'movements'
          )}`}
        >
          <span>Stok Hareketleri</span>

          <span
            className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${
              activeTab === 'movements'
                ? 'bg-cyan-400/20 text-cyan-100'
                : 'bg-slate-700 text-slate-300'
            }`}
          >
            {archivedMovements.length}
          </span>
        </button>
      </div>

      {message && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {message}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-10 text-center text-sm text-slate-400">
          Arşiv kayıtları yükleniyor...
        </div>
      ) : activeTab === 'cases' ? (
        archivedCases.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-800/40 px-4 py-10 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-700/60 text-slate-400">
              <ArchiveX className="h-5 w-5" />
            </div>

            <h2 className="text-sm font-semibold text-slate-200">
              Arşivlenmiş vaka yok
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Arşivlenen vakalar burada görüntülenecek.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border border-slate-700 bg-slate-800/70 md:block">
              <table className="w-full table-fixed">
                <thead className="border-b border-slate-700 bg-slate-900/50">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <th className="w-[18%] px-3 py-2.5">
                      Vaka Tarihi
                    </th>
                    <th className="w-[20%] px-3 py-2.5">
                      Hasta
                    </th>
                    <th className="w-[22%] px-3 py-2.5">
                      Merkez / Doktor
                    </th>
                    <th className="w-[20%] px-3 py-2.5">
                      Kapak
                    </th>
                    <th className="w-[12%] px-3 py-2.5">
                      LOT
                    </th>
                    <th className="w-[8%] px-3 py-2.5 text-right">
                      İşlem
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-700/70">
                  {archivedCases.map(item => (
                    <tr
                      key={item.id}
                      className="text-sm text-slate-300 transition hover:bg-slate-700/30"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-400">
                        {formatDate(item.vaka_tarihi)}
                      </td>

                      <td className="px-3 py-2.5">
                        <div
                          className="truncate font-medium text-slate-100"
                          title={item.hasta_adi || '-'}
                        >
                          {item.hasta_adi || '-'}
                        </div>
                      </td>

                      <td className="px-3 py-2.5">
                        <div
                          className="truncate text-xs text-slate-300"
                          title={item.merkez_hastane || '-'}
                        >
                          {item.merkez_hastane || '-'}
                        </div>

                        <div
                          className="mt-0.5 truncate text-xs text-slate-500"
                          title={item.doktor || '-'}
                        >
                          {item.doktor || '-'}
                        </div>
                      </td>

                      <td className="px-3 py-2.5">
                        <div
                          className="truncate text-xs text-slate-300"
                          title={caseProduct(item)}
                        >
                          {caseProduct(item)}
                        </div>
                      </td>

                      <td className="px-3 py-2.5">
                        <span className="font-mono text-xs font-semibold text-cyan-300">
                          {item.lot_no || '-'}
                        </span>
                      </td>

                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => restoreCase(item.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-cyan-300 transition hover:bg-cyan-500/10 hover:text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                            title="Vakayı geri al"
                            aria-label={`${item.hasta_adi || 'Vaka'} kaydını arşivden geri al`}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => deleteCase(item.id)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-300 transition hover:bg-red-500/10 hover:text-red-200 focus:outline-none focus:ring-2 focus:ring-red-400/50"
                              title="Vakayı kalıcı olarak sil"
                              aria-label={`${item.hasta_adi || 'Vaka'} kaydını kalıcı olarak sil`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {archivedCases.map(item => (
                <article
                  key={item.id}
                  className="rounded-xl border border-slate-700 bg-slate-800/70 p-3.5"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(item.vaka_tarihi)}
                      </div>

                      <h2 className="break-words text-sm font-semibold text-slate-100">
                        {item.hasta_adi || 'Hasta bilgisi yok'}
                      </h2>

                      <p className="mt-1 break-words text-xs text-slate-400">
                        {item.merkez_hastane || 'Merkez bilgisi yok'}
                      </p>

                      <p className="mt-0.5 break-words text-xs text-slate-500">
                        {item.doktor || 'Doktor bilgisi yok'}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => restoreCase(item.id)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-cyan-300 transition hover:bg-cyan-500/10 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                        title="Vakayı geri al"
                        aria-label={`${item.hasta_adi || 'Vaka'} kaydını arşivden geri al`}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => deleteCase(item.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-300 transition hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-400/50"
                          title="Vakayı kalıcı olarak sil"
                          aria-label={`${item.hasta_adi || 'Vaka'} kaydını kalıcı olarak sil`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-700/70 pt-3">
                    <div className="min-w-0 rounded-lg bg-slate-900/40 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Kapak
                      </div>

                      <div className="mt-1 break-words text-xs font-medium text-slate-300">
                        {caseProduct(item)}
                      </div>
                    </div>

                    <div className="min-w-0 rounded-lg bg-slate-900/40 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        LOT
                      </div>

                      <div className="mt-1 break-all font-mono text-xs font-semibold text-cyan-300">
                        {item.lot_no || '-'}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )
      ) : archivedMovements.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-800/40 px-4 py-10 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-700/60 text-slate-400">
            <ArchiveX className="h-5 w-5" />
          </div>

          <h2 className="text-sm font-semibold text-slate-200">
            Arşivlenmiş stok hareketi yok
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Arşivlenen stok hareketleri burada görüntülenecek.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-700 bg-slate-800/70 md:block">
            <table className="w-full table-fixed">
              <thead className="border-b border-slate-700 bg-slate-900/50">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="w-[19%] px-3 py-2.5">Tarih</th>
                  <th className="w-[13%] px-3 py-2.5">Tür</th>
                  <th className="w-[27%] px-3 py-2.5">Ürün</th>
                  <th className="w-[18%] px-3 py-2.5">LOT</th>
                  <th className="w-[15%] px-3 py-2.5">SKT</th>
                  <th className="w-[8%] px-3 py-2.5 text-right">
                    İşlem
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-700/70">
                {archivedMovements.map(item => (
                  <tr
                    key={item.id}
                    className="text-sm text-slate-300 transition hover:bg-slate-700/30"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-400">
                      {formatDateTime(item.created_at)}
                    </td>

                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${islemClass(
                          item.islem
                        )}`}
                      >
                        {islemText(item.islem)}
                      </span>
                    </td>

                    <td className="px-3 py-2.5">
                      <div
                        className="truncate font-medium text-slate-200"
                        title={`${item.urun_adi || 'Kapak'}${
                          item.kapak_boyutu
                            ? ` ${item.kapak_boyutu} mm`
                            : ''
                        }`}
                      >
                        {item.urun_adi || 'Kapak'}

                        {item.kapak_boyutu
                          ? ` ${item.kapak_boyutu} mm`
                          : ''}
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs font-semibold text-cyan-300">
                        {item.lot_no || '-'}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                      {formatDate(item.son_kullanma_tarihi)}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => restoreMovement(item.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-cyan-300 transition hover:bg-cyan-500/10 hover:text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                          title="Stok hareketini geri al"
                          aria-label={`${item.lot_no || 'Stok'} hareketini arşivden geri al`}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => deleteMovement(item.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-300 transition hover:bg-red-500/10 hover:text-red-200 focus:outline-none focus:ring-2 focus:ring-red-400/50"
                            title="Stok hareketini kalıcı olarak sil"
                            aria-label={`${item.lot_no || 'Stok'} hareketini kalıcı olarak sil`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {archivedMovements.map(item => (
              <article
                key={item.id}
                className="rounded-xl border border-slate-700 bg-slate-800/70 p-3.5"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-medium ${islemClass(
                          item.islem
                        )}`}
                      >
                        {islemText(item.islem)}
                      </span>

                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>

                    <h2 className="break-words text-sm font-semibold text-slate-100">
                      {item.urun_adi || 'Kapak'}

                      {item.kapak_boyutu
                        ? ` ${item.kapak_boyutu} mm`
                        : ''}
                    </h2>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => restoreMovement(item.id)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-cyan-300 transition hover:bg-cyan-500/10 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                      title="Stok hareketini geri al"
                      aria-label={`${item.lot_no || 'Stok'} hareketini arşivden geri al`}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => deleteMovement(item.id)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-300 transition hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-400/50"
                        title="Stok hareketini kalıcı olarak sil"
                        aria-label={`${item.lot_no || 'Stok'} hareketini kalıcı olarak sil`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-700/70 pt-3">
                  <div className="min-w-0 rounded-lg bg-slate-900/40 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      LOT
                    </div>

                    <div className="mt-1 break-all font-mono text-xs font-semibold text-cyan-300">
                      {item.lot_no || '-'}
                    </div>
                  </div>

                  <div className="min-w-0 rounded-lg bg-slate-900/40 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Son Kullanma
                    </div>

                    <div className="mt-1 text-xs font-medium text-slate-300">
                      {formatDate(item.son_kullanma_tarihi)}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
