import { canViewWarehouse, canManageWarehouse } from '../lib/permissions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {

  AlertTriangle,

  ArrowDownCircle,

  Barcode,

  Boxes,

  History,

  Loader2,

  PackageCheck,

  RefreshCw,

  ScanLine,

  Search,

} from 'lucide-react';

import { Capacitor } from '@capacitor/core';

import {

  CapacitorBarcodeScanner,

  CapacitorBarcodeScannerAndroidScanningLibrary,

  CapacitorBarcodeScannerCameraDirection,

  CapacitorBarcodeScannerScanOrientation,

  CapacitorBarcodeScannerTypeHint,

} from '@capacitor/barcode-scanner';

import { Navigate } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';

import { getActiveCity, supabase } from '../lib/supabase';



type WarehouseItem = {

  id: string;

  urun_tipi: string;

  urun_adi: string;

  beden_olcu: string | null;

  lot_no: string;

  son_kullanma_tarihi: string | null;

  adet: number;

  kritik_stok: number;

  gtin: string | null;

  ref_no: string | null;

  created_at: string;

};



type WarehouseMovement = {

  id: string;

  urun_id: string;

  islem: string;

  miktar: number;

  onceki_adet: number;

  sonraki_adet: number;

  aciklama: string | null;

  created_at: string;

};



type CaseOption = {

  id: string;

  hasta_adi: string;

  merkez_hastane: string;

  vaka_tarihi: string;

};



type ParsedGs1 = {

  gtin: string;

  lot: string;

  expiry: string;

  production: string | null;

  raw: string;

};



const TYPE_LABELS: Record<string, string> = {

  balon: 'Balon',

  sheath: 'Sentrant Sheath',

  confida: 'Confida',

  loading_system: 'Loading System',

  delivery_catheter: 'Delivery Catheter',

  damar_kapama: 'Damar Kapama',

  diger: 'Diğer',

};



function gs1Date(value: string) {

  if (!/^\d{6}$/.test(value)) throw new Error('GS1 tarih alanı geçersiz.');

  const year = 2000 + Number(value.slice(0, 2));

  const month = Number(value.slice(2, 4));

  const day = Number(value.slice(4, 6));

  const date = new Date(Date.UTC(year, month - 1, day));

  if (

    date.getUTCFullYear() !== year ||

    date.getUTCMonth() !== month - 1 ||

    date.getUTCDate() !== day

  ) {

    throw new Error('Barkoddaki tarih geçersiz.');

  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

}



function parseGs1(rawValue: string): ParsedGs1 {
  const source = rawValue.trim();
  if (!source) throw new Error('Barkod alanı boş.');

  // ASCII 29 = GS / FNC1 ayırıcı. Regex literalinde kontrol karakteri
  // kullanmıyoruz; böylece no-control-regex kuralı ihlal edilmiyor.
  const groupSeparator = String.fromCharCode(29);
  const escapedGroupSeparator = '\\u001d';
  const aiBoundary = `(?:^|${escapedGroupSeparator})`;

  const compact = source
    .replace(/\(?(01|10|11|17|20)\)?/g, groupSeparator + '$1')
    .replace(/\s/g, '')
    .replace(new RegExp(`^${escapedGroupSeparator}`), '');

  const gtin = compact.match(new RegExp(`${aiBoundary}01(\\d{14})`))?.[1] || '';
  let expiryCode = '';
  let productionCode = '';
  let lot = '';

  if (compact.includes(groupSeparator)) {
    expiryCode = compact.match(new RegExp(`${aiBoundary}17(\\d{6})`))?.[1] || '';
    productionCode = compact.match(new RegExp(`${aiBoundary}11(\\d{6})`))?.[1] || '';
    lot = compact.match(new RegExp(`${aiBoundary}10([^${escapedGroupSeparator}]+)`))?.[1] || '';
  } else if (gtin && compact.startsWith(`01${gtin}`)) {
    let cursor = 16;
    while (cursor + 2 <= compact.length) {
      const ai = compact.slice(cursor, cursor + 2);
      if (ai === '11' || ai === '17') {
        const value = compact.slice(cursor + 2, cursor + 8);
        if (!/^\d{6}$/.test(value)) break;
        if (ai === '11') productionCode = value;
        if (ai === '17') expiryCode = value;
        cursor += 8;
      } else if (ai === '20') {
        cursor += 4;
      } else if (ai === '10') {
        lot = compact.slice(cursor + 2);
        break;
      } else {
        break;
      }
    }
  }

  lot = lot.replace(/2001$/, '').split(groupSeparator).join('').trim().toUpperCase();

  if (!gtin) throw new Error('ÜBB / GTIN (01) bulunamadı.');
  if (!expiryCode) throw new Error('SKT (17) bulunamadı.');
  if (!lot) throw new Error('LOT (10) bulunamadı.');

  return {
    gtin,
    lot,
    expiry: gs1Date(expiryCode),
    production: productionCode ? gs1Date(productionCode) : null,
    raw: source.split(groupSeparator).join(''),
  };
}

function formatDate(value: string | null) {

  if (!value) return '-';

  const [year, month, day] = value.split('-');

  return `${day}.${month}.${year}`;

}



function formatDateTime(value: string) {

  return new Date(value).toLocaleString('tr-TR', {

    dateStyle: 'short',

    timeStyle: 'short',

  });

}



export default function MainWarehouse() {

  const { profile } = useAuth();

  const [items, setItems] = useState<WarehouseItem[]>([]);

  const [movements, setMovements] = useState<WarehouseMovement[]>([]);

  const [cases, setCases] = useState<CaseOption[]>([]);

  const [loading, setLoading] = useState(true);

  const [busy, setBusy] = useState(false);

  const [message, setMessage] = useState('');

  const [error, setError] = useState('');

  const [barcode, setBarcode] = useState('');

  const [search, setSearch] = useState('');

  const [selectedItem, setSelectedItem] = useState<WarehouseItem | null>(null);

  const [selectedCase, setSelectedCase] = useState('');

  const [quantity, setQuantity] = useState(1);

  const scanLock = useRef(false);



  const canView = canViewWarehouse(profile?.role);
  const canManage = canManageWarehouse(profile?.role);



  const loadData = useCallback(async () => {

    if (!canView) return;
    setLoading(true);

    setError('');

    const [itemResult, movementResult, caseResult] = await Promise.all([

      supabase

        .from('ana_depo_urunleri')

        .select('id, urun_tipi, urun_adi, beden_olcu, lot_no, son_kullanma_tarihi, adet, kritik_stok, gtin, ref_no, created_at')

        .eq('aktif', true)

        .order('urun_tipi')

        .order('son_kullanma_tarihi'),

      supabase

        .from('ana_depo_hareketleri')

        .select('id, urun_id, islem, miktar, onceki_adet, sonraki_adet, aciklama, created_at')

        .order('created_at', { ascending: false })

        .limit(40),

      supabase

        .from('kapaklar')

        .select('id, hasta_adi, merkez_hastane, vaka_tarihi')

        .order('vaka_tarihi', { ascending: false })

        .limit(100),

    ]);



    if (itemResult.error) setError(itemResult.error.message);

    else setItems((itemResult.data || []) as WarehouseItem[]);

    if (!movementResult.error) setMovements((movementResult.data || []) as WarehouseMovement[]);

    if (!caseResult.error) setCases((caseResult.data || []) as CaseOption[]);

    setLoading(false);

  }, [canView]);



  useEffect(() => {

    void loadData();

  }, [loadData]);



  const filteredItems = useMemo(() => {

    const query = search.trim().toLocaleUpperCase('tr-TR');

    if (!query) return items;

    return items.filter(item =>

      [item.urun_adi, item.beden_olcu, item.lot_no, item.ref_no, item.gtin]

        .filter(Boolean)

        .some(value => String(value).toLocaleUpperCase('tr-TR').includes(query))

    );

  }, [items, search]);



  const total = items.reduce((sum, item) => sum + item.adet, 0);

  const critical = items.filter(item => item.adet <= item.kritik_stok).length;



  async function registerBarcode(rawValue: string) {

    if (!canManage) return;

    setBusy(true);

    setError('');

    setMessage('');

    try {

      const parsed = parseGs1(rawValue);

      const { error: rpcError } = await supabase.rpc('ana_depo_barkod_girisi', {

        p_gtin: parsed.gtin,

        p_lot_no: parsed.lot,

        p_son_kullanma_tarihi: parsed.expiry,

        p_barkod_raw: parsed.raw,

        p_uretim_tarihi: parsed.production,

      });

      if (rpcError) throw rpcError;

      setBarcode('');

      setMessage(`${parsed.lot} lotlu ürün stoğa eklendi.`);

      await loadData();

    } catch (caught) {

      setError(caught instanceof Error ? caught.message : 'Barkod kaydedilemedi.');

    } finally {

      setBusy(false);

    }

  }



  async function scanNative() {

    if (!canManage || scanLock.current) return;

    if (!Capacitor.isNativePlatform()) {

      setError('PWA üzerinde barkodu alana okutun veya yapıştırın. Kamera taraması Android uygulamasında çalışır.');

      return;

    }

    scanLock.current = true;

    setError('');

    try {

      const result = await CapacitorBarcodeScanner.scanBarcode({

        hint: CapacitorBarcodeScannerTypeHint.CODE_128,

        scanInstructions: 'GS1-128 barkodu çerçeve içine alın',

        scanButton: false,

        scanText: 'Barkodu Tara',

        cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,

        scanOrientation: CapacitorBarcodeScannerScanOrientation.LANDSCAPE,

        cancelButtonAccessibilityLabel: 'Taramayı iptal et',

        torchButtonOnAccessibilityLabel: 'Feneri kapat',

        torchButtonOffAccessibilityLabel: 'Feneri aç',

        android: {

          scanningLibrary: CapacitorBarcodeScannerAndroidScanningLibrary.ZXING,

        },

      });

      if (result.ScanResult?.trim()) await registerBarcode(result.ScanResult);

    } catch (caught) {

      const text = caught instanceof Error ? caught.message : String(caught ?? '');

      if (!/cancel|iptal/i.test(text)) setError(`Barkod tarayıcı açılamadı: ${text}`);

    } finally {

      scanLock.current = false;

    }

  }



  async function consumeStock() {

    if (!canManage || !selectedItem || !selectedCase || !Number.isInteger(quantity) || quantity < 1) return;

    setBusy(true);

    setError('');

    setMessage('');

    const { error: rpcError } = await supabase.rpc('ana_depo_stok_islemi', {

      p_urun_id: selectedItem.id,

      p_islem: 'kullanim',

      p_miktar: quantity,

      p_vaka_id: selectedCase,

      p_aciklama: 'Vaka için depo çıkışı',

    });

    if (rpcError) setError(rpcError.message);

    else {

      setMessage(`${selectedItem.lot_no} lotundan ${quantity} adet düşüldü.`);

      setSelectedItem(null);

      setSelectedCase('');

      setQuantity(1);

      await loadData();

    }

    setBusy(false);

  }



  if (getActiveCity() !== 'istanbul' || !canView) return <Navigate to="/" replace />;



  return (

    <div className="space-y-5 pb-8">

      <section className="card-surface p-4 sm:p-5">

        <div className="flex flex-wrap items-start justify-between gap-3">

          <div>

            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-400">İstanbul</p>

            <h1 className="mt-1 text-2xl font-bold text-white">Ana Depo</h1>

            <p className="mt-1 text-sm text-slate-400">Sarf malzeme, lot ve son kullanma tarihi takibi</p>

          </div>

          <button type="button" onClick={() => void loadData()} className="icon-button" aria-label="Yenile">

            <RefreshCw className="h-5 w-5" />

          </button>

        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">

          <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3">

            <Boxes className="h-5 w-5 text-cyan-400" />

            <p className="mt-2 text-2xl font-bold text-white">{total}</p>

            <p className="text-xs text-slate-400">Toplam adet</p>

          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3">

            <AlertTriangle className="h-5 w-5 text-amber-400" />

            <p className="mt-2 text-2xl font-bold text-white">{critical}</p>

            <p className="text-xs text-slate-400">Kritik lot</p>

          </div>

        </div>

      </section>



      {canManage && (

        <section className="card-surface p-4 sm:p-5">

          <div className="flex items-center gap-2">

            <Barcode className="h-5 w-5 text-cyan-400" />

            <h2 className="font-semibold text-white">Barkodla stok girişi</h2>

          </div>

          <form

            className="mt-4 space-y-3"

            onSubmit={event => {

              event.preventDefault();

              void registerBarcode(barcode);

            }}

          >

            <input

              value={barcode}

              onChange={event => setBarcode(event.target.value)}

              className="input-field w-full"

              placeholder="GS1-128 barkodu okutun veya yapıştırın"

              autoComplete="off"

            />

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">

              <button type="submit" disabled={busy || !barcode.trim()} className="button-secondary justify-center">

                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}

                Stoğa Ekle

              </button>

              <button type="button" disabled={busy} onClick={() => void scanNative()} className="button-primary justify-center">

                <ScanLine className="h-4 w-4" />

                Barkodu Tara

              </button>

            </div>

          </form>

        </section>

      )}



      {(message || error) && (

        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'}`}>

          {error || message}

        </div>

      )}



      {selectedItem && canManage && (

        <section className="card-surface border-cyan-500/40 p-4 sm:p-5">

          <div className="flex items-center gap-2">

            <ArrowDownCircle className="h-5 w-5 text-cyan-400" />

            <h2 className="font-semibold text-white">Vaka için stok düş</h2>

          </div>

          <p className="mt-2 text-sm text-slate-300">{selectedItem.urun_adi} · {selectedItem.beden_olcu} · LOT {selectedItem.lot_no}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_110px]">

            <select value={selectedCase} onChange={event => setSelectedCase(event.target.value)} className="input-field w-full">

              <option value="">Vaka seçin</option>

              {cases.map(item => (

                <option key={item.id} value={item.id}>{formatDate(item.vaka_tarihi)} · {item.hasta_adi} · {item.merkez_hastane}</option>

              ))}

            </select>

            <input type="number" min={1} max={selectedItem.adet} value={quantity} onChange={event => setQuantity(Number(event.target.value))} className="input-field w-full" />

          </div>

          <div className="mt-3 flex gap-2">

            <button type="button" onClick={() => setSelectedItem(null)} className="button-secondary">Vazgeç</button>

            <button type="button" disabled={busy || !selectedCase || quantity < 1 || quantity > selectedItem.adet} onClick={() => void consumeStock()} className="button-primary">Stoktan Düş</button>

          </div>

        </section>

      )}



      <section className="space-y-3">

        <div className="relative">

          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

          <input value={search} onChange={event => setSearch(event.target.value)} className="input-field w-full pl-10" placeholder="Ürün, REF, LOT veya ÜBB ara" />

        </div>

        {loading ? (

          <div className="card-surface flex min-h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-cyan-400" /></div>

        ) : filteredItems.length === 0 ? (

          <div className="card-surface p-8 text-center text-sm text-slate-400">Ana Depo’da kayıtlı ürün bulunmuyor.</div>

        ) : (

          <div className="grid gap-3 lg:grid-cols-2">

            {filteredItems.map(item => {

              const isCritical = item.adet <= item.kritik_stok;

              return (

                <article key={item.id} className="card-surface p-4">

                  <div className="flex items-start justify-between gap-3">

                    <div className="min-w-0">

                      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-400">{TYPE_LABELS[item.urun_tipi] || item.urun_tipi}</p>

                      <h3 className="mt-1 font-semibold text-white">{item.urun_adi}</h3>

                      <p className="mt-1 text-sm text-slate-400">{item.ref_no || '-'} · {item.beden_olcu || '-'}</p>

                    </div>

                    <div className={`rounded-lg border px-3 py-2 text-center ${isCritical ? 'border-amber-500/50 bg-amber-500/10' : 'border-cyan-500/40 bg-cyan-500/10'}`}>

                      <p className="text-xl font-bold text-white">{item.adet}</p>

                      <p className="text-[10px] text-slate-400">ADET</p>

                    </div>

                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-700 pt-3 text-sm">

                    <div><p className="text-[10px] uppercase text-slate-500">LOT</p><p className="font-medium text-slate-200">{item.lot_no}</p></div>

                    <div><p className="text-[10px] uppercase text-slate-500">SKT</p><p className="font-medium text-slate-200">{formatDate(item.son_kullanma_tarihi)}</p></div>

                    <div className="col-span-2"><p className="text-[10px] uppercase text-slate-500">ÜBB / GTIN</p><p className="break-all font-mono text-xs text-slate-300">{item.gtin || '-'}</p></div>

                  </div>

                  {canManage && item.adet > 0 && (

                    <button type="button" onClick={() => { setSelectedItem(item); setQuantity(1); }} className="button-secondary mt-4 w-full justify-center">

                      <ArrowDownCircle className="h-4 w-4" /> Vaka İçin Kullan

                    </button>

                  )}

                </article>

              );

            })}

          </div>

        )}

      </section>



      <section className="card-surface p-4 sm:p-5">

        <div className="flex items-center gap-2"><History className="h-5 w-5 text-cyan-400" /><h2 className="font-semibold text-white">Son depo hareketleri</h2></div>

        <div className="mt-4 divide-y divide-slate-700">

          {movements.length === 0 ? <p className="py-4 text-sm text-slate-400">Henüz hareket yok.</p> : movements.map(movement => {

            const item = items.find(row => row.id === movement.urun_id);

            return (

              <div key={movement.id} className="py-3">

                <div className="flex items-start justify-between gap-3">

                  <div><p className="text-sm font-medium text-slate-200">{item?.urun_adi || 'Depo ürünü'}</p><p className="mt-0.5 text-xs text-slate-500">LOT {item?.lot_no || '-'} · {formatDateTime(movement.created_at)}</p></div>

                  <span className={`text-sm font-semibold ${movement.islem === 'giris' || movement.islem === 'duzeltme_artis' ? 'text-emerald-400' : 'text-amber-400'}`}>{movement.islem === 'giris' || movement.islem === 'duzeltme_artis' ? '+' : '-'}{movement.miktar}</span>

                </div>

              </div>

            );

          })}

        </div>

      </section>

    </div>

  );

}
