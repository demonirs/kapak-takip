import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Mail,
  Package,
  PenLine,
  Save,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { notifyAdmins } from '../lib/notifications';
import { supabase, timeout } from '../lib/supabase';

type CaseItem = {
  id: string;
  user_id: string;
  vaka_tarihi: string;
  merkez_hastane: string;
  doktor: string;
  hasta_adi: string;
  kapak_tipi: string;
  kapak_size: string;
  lot_no: string;
  son_kul_tarihi: string;
  pre_balon: string;
  post_balon: string;
  paravalvuler_ay: string;
  proglide_adedi: number;
  crimp_yapan: string;
  created_at: string;
};

type StockItem = {
  id: string;
  urun_adi: string;
  kapak_boyutu: number;
  lot_no: string;
  son_kullanma_tarihi: string;
  durum?: string;
};

type ExistingFocRecord = {
  id: string;
  vaka_id: string;
};

type SecondValveMode = 'stock' | 'manual';

type ManualValveForm = {
  urun_adi: string;
  kapak_boyutu: number;
  lot_no: string;
  son_kullanma_tarihi: string;
};

const initialManualValve: ManualValveForm = {
  urun_adi: 'EVPROPLUS',
  kapak_boyutu: 23,
  lot_no: '',
  son_kullanma_tarihi: '',
};

const VALVE_SIZES = [23, 26, 29, 34] as const;

const inputClass =
  'w-full rounded-xl border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-white outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-500/30 md:px-4 md:py-3 md:text-base';

function normalizeLot(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

function getSizeNumber(size: string) {
  const match = size.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function formatDateForScreen(date: string) {
  if (!date) {
    return '-';
  }

  return new Date(`${date.split('T')[0]}T00:00:00`).toLocaleDateString(
    'tr-TR'
  );
}

function formatProductName(productName: string) {
  return productName
    .replace(/\+/g, 'PLUS')
    .replace(/\s+/g, '-')
    .toUpperCase();
}

function buildManualProductName(
  productName: string,
  valveSize: number
) {
  const cleanName = productName.trim();

  if (!cleanName) {
    return `EVPROPLUS-${valveSize}`;
  }

  if (
    cleanName.toUpperCase().includes(String(valveSize))
  ) {
    return cleanName;
  }

  return `${cleanName}-${valveSize}`;
}

function Field({
  label,
  children,
  required = false,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-slate-300 md:mb-2 md:text-sm">
        {label}

        {required && (
          <b className="ml-1 text-red-400">*</b>
        )}
      </span>

      {children}
    </label>
  );
}

export default function FocCase() {
  const { vakaId } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [caseItem, setCaseItem] =
    useState<CaseItem | null>(null);

  const [stockItems, setStockItems] = useState<
    StockItem[]
  >([]);

  const [secondValveMode, setSecondValveMode] =
    useState<SecondValveMode>('stock');

  const [selectedSize, setSelectedSize] =
    useState<number | null>(null);

  const [selectedStockId, setSelectedStockId] =
    useState('');

  const [manualValve, setManualValve] =
    useState<ManualValveForm>(initialManualValve);

  const [description, setDescription] = useState('');

  const [existingFoc, setExistingFoc] =
    useState<ExistingFocRecord | null>(null);

  const [pageLoading, setPageLoading] =
    useState(true);

  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const currentUserName =
    profile?.full_name ||
    user?.email?.split('@')[0] ||
    caseItem?.crimp_yapan ||
    'Kullanıcı';

  const selectedStock = useMemo(() => {
    if (!selectedStockId) {
      return null;
    }

    return (
      stockItems.find(
        stockItem => stockItem.id === selectedStockId
      ) || null
    );
  }, [selectedStockId, stockItems]);

  const filteredStockItems = useMemo(() => {
    if (!selectedSize) {
      return [];
    }

    return stockItems.filter(
      stockItem =>
        Number(stockItem.kapak_boyutu) ===
        selectedSize
    );
  }, [selectedSize, stockItems]);

  const stockCounts = useMemo(() => {
    return {
      23: stockItems.filter(
        item => item.kapak_boyutu === 23
      ).length,

      26: stockItems.filter(
        item => item.kapak_boyutu === 26
      ).length,

      29: stockItems.filter(
        item => item.kapak_boyutu === 29
      ).length,

      34: stockItems.filter(
        item => item.kapak_boyutu === 34
      ).length,
    };
  }, [stockItems]);

  const firstStock = useMemo(() => {
    if (!caseItem) {
      return null;
    }

    const caseSize = getSizeNumber(
      caseItem.kapak_size
    );

    const caseLot = normalizeLot(
      caseItem.lot_no
    );

    return (
      stockItems.find(
        stockItem =>
          normalizeLot(stockItem.lot_no) ===
            caseLot &&
          Number(stockItem.kapak_boyutu) ===
            Number(caseSize)
      ) || null
    );
  }, [caseItem, stockItems]);

  const secondValveDetails = useMemo(() => {
    if (secondValveMode === 'stock') {
      return {
        stockId: selectedStock?.id || null,
        productName:
          selectedStock?.urun_adi || '',
        size:
          selectedStock?.kapak_boyutu || null,
        lotNo: selectedStock
          ? normalizeLot(selectedStock.lot_no)
          : '',
        expirationDate:
          selectedStock?.son_kullanma_tarihi ||
          '',
      };
    }

    return {
      stockId: null,
      productName: buildManualProductName(
        manualValve.urun_adi,
        manualValve.kapak_boyutu
      ),
      size: manualValve.kapak_boyutu,
      lotNo: normalizeLot(
        manualValve.lot_no
      ),
      expirationDate:
        manualValve.son_kullanma_tarihi,
    };
  }, [
    secondValveMode,
    selectedStock,
    manualValve,
  ]);

  const mailText = useMemo(() => {
    if (!caseItem) {
      return '';
    }

    const caseDate = formatDateForScreen(
      caseItem.vaka_tarihi
    );

    const firstSize =
      getSizeNumber(caseItem.kapak_size) ||
      caseItem.kapak_size;

    const firstLot = normalizeLot(
      caseItem.lot_no
    );

    const secondProduct =
      secondValveDetails.productName ||
      'FOC KAPAĞI GİRİLMEDİ';

    const secondSize =
      secondValveDetails.size || '-';

    const secondLot =
      secondValveDetails.lotNo || '-';

    const cleanDescription =
      description.trim() ||
      '[FOC olay açıklaması girilmedi.]';

    const paravalvularText =
      caseItem.paravalvuler_ay
        .toLocaleLowerCase('tr-TR') === 'yok'
        ? 'Paravalvüler AY yok.'
        : `Paravalvüler AY: ${caseItem.paravalvuler_ay}.`;

    const preBalloonText =
      caseItem.pre_balon
        .toLocaleLowerCase('tr-TR') === 'yok'
        ? 'Pre balon yapılmadı.'
        : `${caseItem.pre_balon} pre balon yapıldı.`;

    const postBalloonText =
      caseItem.post_balon
        .toLocaleLowerCase('tr-TR') === 'yok'
        ? ''
        : `${caseItem.post_balon} post balon yapıldı.`;

    return `${caseDate}

${caseItem.hasta_adi} isimli hastaya Medtronic ${caseItem.kapak_tipi} ${firstSize} kapak Lot no (${firstLot}) Dr. ${caseItem.doktor} tarafından implante edilmek istendi. ${cleanDescription}

FATURA EDİLEN KAPAK ${formatProductName(
      caseItem.kapak_tipi
    )} ${firstSize} (${firstLot})

FOC DÜŞÜLEN KAPAK ${formatProductName(
      secondProduct
    )} ${secondSize}MM (${secondLot})

${paravalvularText}

${preBalloonText}${
      postBalloonText
        ? `\n${postBalloonText}`
        : ''
    }

Fokus'tan ${caseItem.proglide_adedi} Proglide kullanıldı.

Saygılarımla,
CRİMP: ${
      caseItem.crimp_yapan ||
      currentUserName
    }`;
  }, [
    caseItem,
    secondValveDetails,
    description,
    currentUserName,
  ]);

  useEffect(() => {
    void loadPage();
  }, [vakaId]);

  async function loadPage() {
    if (!vakaId) {
      setError('Vaka kimliği bulunamadı.');
      setPageLoading(false);
      return;
    }

    setPageLoading(true);
    setError(null);

    try {
      const [
        caseResponse,
        stockResponse,
        existingFocResponse,
      ] = await Promise.all([
        timeout(
          supabase
            .from('kapaklar')
            .select(
              'id, user_id, vaka_tarihi, merkez_hastane, doktor, hasta_adi, kapak_tipi, kapak_size, lot_no, son_kul_tarihi, pre_balon, post_balon, paravalvuler_ay, proglide_adedi, crimp_yapan, created_at'
            )
            .eq('id', vakaId)
            .maybeSingle(),
          10000
        ),

        timeout(
          supabase
            .from('kapak_stok')
            .select(
              'id, urun_adi, kapak_boyutu, lot_no, son_kullanma_tarihi, durum'
            )
            .eq('durum', 'stokta')
            .order('kapak_boyutu')
            .order('son_kullanma_tarihi'),
          10000
        ),

        timeout(
          supabase
            .from('foc_kayitlari')
            .select('id, vaka_id')
            .eq('vaka_id', vakaId)
            .maybeSingle(),
          10000
        ),
      ]);

      if (caseResponse.error) {
        throw caseResponse.error;
      }

      if (stockResponse.error) {
        throw stockResponse.error;
      }

      if (existingFocResponse.error) {
        throw existingFocResponse.error;
      }

      if (!caseResponse.data) {
        throw new Error(
          'FOC oluşturulacak vaka bulunamadı.'
        );
      }

      setCaseItem(
        caseResponse.data as CaseItem
      );

      setStockItems(
        (stockResponse.data || []) as StockItem[]
      );

      setExistingFoc(
        (existingFocResponse.data as ExistingFocRecord | null) ||
          null
      );
    } catch (caughtError: unknown) {
      console.error(
        'FOC ekranı yükleme hatası:',
        caughtError
      );

      if (caughtError instanceof Error) {
        setError(caughtError.message);
      } else {
        setError(
          'FOC ekranı yüklenirken hata oluştu.'
        );
      }
    } finally {
      setPageLoading(false);
    }
  }

  function selectSecondValveMode(
    mode: SecondValveMode
  ) {
    setSecondValveMode(mode);
    setError(null);

    if (mode === 'stock') {
      setManualValve(initialManualValve);
      return;
    }

    setSelectedSize(null);
    setSelectedStockId('');
  }

  function updateManualValve<
    Key extends keyof ManualValveForm,
  >(
    field: Key,
    value: ManualValveForm[Key]
  ) {
    setManualValve(previous => ({
      ...previous,
      [field]: value,
    }));
  }

  async function markFocStockAsUsed(
    stockItem: StockItem,
    currentVakaId: string
  ) {
    const {
      data: updatedStock,
      error: stockError,
    } = await timeout(
      supabase
        .from('kapak_stok')
        .update({
          durum: 'kullanildi',
          kullanilan_vaka_id:
            currentVakaId,
        })
        .eq('id', stockItem.id)
        .eq('durum', 'stokta')
        .select('id')
        .maybeSingle(),
      10000
    );

    if (stockError) {
      throw stockError;
    }

    if (!updatedStock) {
      throw new Error(
        'Seçilen FOC kapağı artık stokta değil. Stok listesini yenileyip tekrar deneyin.'
      );
    }

    const { error: movementError } =
      await timeout(
        supabase
          .from('stok_hareketleri')
          .insert({
            kapak_stok_id: stockItem.id,
            islem: 'kullanildi',
            urun_adi: stockItem.urun_adi,
            lot_no: normalizeLot(
              stockItem.lot_no
            ),
            kapak_boyutu:
              stockItem.kapak_boyutu,
            son_kullanma_tarihi:
              stockItem.son_kullanma_tarihi,
            vaka_id: currentVakaId,
            created_by: user?.id,
          }),
        10000
      );

    if (movementError) {
      throw movementError;
    }
  }

  function validateSecondValve() {
    if (!caseItem) {
      return 'Vaka bilgileri bulunamadı.';
    }

    if (secondValveMode === 'stock') {
      if (!selectedStock) {
        return 'FOC düşülecek ikinci kapağı stoktan seçin.';
      }
    } else {
      if (!manualValve.urun_adi.trim()) {
        return 'FOC kapağının ürün adını yazın.';
      }

      if (
        !VALVE_SIZES.includes(
          manualValve.kapak_boyutu as
            | 23
            | 26
            | 29
            | 34
        )
      ) {
        return 'Geçerli bir kapak boyutu seçin.';
      }

      if (!normalizeLot(manualValve.lot_no)) {
        return 'FOC kapağının LOT numarasını yazın.';
      }

      if (
        !manualValve.son_kullanma_tarihi
      ) {
        return 'FOC kapağının son kullanma tarihini girin.';
      }
    }

    if (
      normalizeLot(
        secondValveDetails.lotNo
      ) ===
      normalizeLot(caseItem.lot_no)
    ) {
      return 'Fatura edilen kapak ile FOC düşülen kapağın LOT numarası aynı olamaz.';
    }

    return null;
  }

  async function handleSave() {
    if (!user?.id) {
      setError(
        'Oturum bulunamadı. Tekrar giriş yapın.'
      );
      return;
    }

    if (!vakaId || !caseItem) {
      setError('Vaka bilgileri bulunamadı.');
      return;
    }

    if (existingFoc) {
      setError(
        'Bu vaka için daha önce FOC kaydı oluşturulmuş.'
      );
      return;
    }

    if (!description.trim()) {
      setError(
        'FOC olay açıklamasını yazın.'
      );
      return;
    }

    const validationError =
      validateSecondValve();

    if (validationError) {
      setError(validationError);
      return;
    }

    const firstSize = getSizeNumber(
      caseItem.kapak_size
    );

    if (!firstSize) {
      setError(
        'Fatura edilen kapağın boyutu okunamadı.'
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (
        secondValveMode === 'stock' &&
        selectedStock
      ) {
        await markFocStockAsUsed(
          selectedStock,
          vakaId
        );
      }

      const { error: focInsertError } =
        await timeout(
          supabase
            .from('foc_kayitlari')
            .insert({
              vaka_id: vakaId,
              user_id: user.id,
              aciklama: description.trim(),

              fatura_edilen_stok_id:
                firstStock?.id || null,

              fatura_edilen_urun_adi:
                caseItem.kapak_tipi,

              fatura_edilen_kapak_boyutu:
                firstSize,

              fatura_edilen_lot_no:
                normalizeLot(
                  caseItem.lot_no
                ),

              fatura_edilen_skt:
                caseItem.son_kul_tarihi ||
                null,

              foc_stok_id:
                secondValveDetails.stockId,

              foc_urun_adi:
                secondValveDetails.productName,

              foc_kapak_boyutu:
                secondValveDetails.size,

              foc_lot_no:
                secondValveDetails.lotNo,

              foc_skt:
                secondValveDetails.expirationDate ||
                null,

              mail_metni: mailText,
            }),
          10000
        );

      if (focInsertError) {
        throw focInsertError;
      }

      try {
        await notifyAdmins({
          title: 'Yeni FOC Kaydı',

          message: `${currentUserName} FOC kaydı oluşturdu`,

          type: 'warning',

          related_table:
            'foc_kayitlari',

          related_id: vakaId,
        });
      } catch (notificationError) {
        console.error(
          'FOC kaydedildi ancak bildirim gönderilemedi:',
          notificationError
        );
      }

      navigate(`/view/${vakaId}`);
    } catch (caughtError: unknown) {
      console.error(
        'FOC kayıt hatası:',
        caughtError
      );

      if (caughtError instanceof Error) {
        setError(caughtError.message);
      } else if (
        typeof caughtError === 'object' &&
        caughtError !== null
      ) {
        const possibleError =
          caughtError as {
            message?: string;
            details?: string;
          };

        setError(
          possibleError.message ||
            possibleError.details ||
            'FOC kaydı oluşturulamadı.'
        );
      } else {
        setError(
          'FOC kaydı oluşturulamadı.'
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function copyMailText() {
    try {
      await navigator.clipboard.writeText(
        mailText
      );

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2500);
    } catch (copyError) {
      console.error(
        'Mail metni kopyalanamadı:',
        copyError
      );

      setError(
        'Mail metni panoya kopyalanamadı.'
      );
    }
  }

  function openMailClient() {
    if (!caseItem) {
      return;
    }

    const subject = `FOC Bildirimi - ${
      caseItem.hasta_adi
    } - ${formatDateForScreen(
      caseItem.vaka_tarihi
    )}`;

    const mailUrl = `mailto:?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(mailText)}`;

    window.location.href = mailUrl;
  }

  if (pageLoading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-8 text-center text-sm text-slate-400">
          FOC ekranı yükleniyor...
        </div>
      </div>
    );
  }

  if (!caseItem) {
    return (
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={() =>
            navigate('/list')
          }
          className="mb-4 flex items-center gap-2 text-sm text-slate-300 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Vakalara Dön
        </button>

        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
          <p className="font-bold text-red-200">
            FOC ekranı açılamadı
          </p>

          <p className="mt-2 text-sm text-red-100/80">
            {error ||
              'Vaka bilgisi bulunamadı.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <button
        type="button"
        onClick={() =>
          navigate(`/view/${caseItem.id}`)
        }
        className="mb-3 flex items-center gap-2 text-sm text-slate-300 hover:text-white md:mb-4 md:text-base"
      >
        <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
        Vaka Detayına Dön
      </button>

      <div className="space-y-5">
        <section className="rounded-2xl border border-red-500/30 bg-slate-800 p-4 md:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-300">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-xl font-bold text-white md:text-2xl">
                FOC Kaydı Oluştur
              </h1>

              <p className="mt-1 text-xs leading-relaxed text-slate-400 md:text-sm">
                İkinci kapağı stoktan seçebilir veya
                stokta bulunmayan kapağı manuel
                girebilirsiniz.
              </p>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200 md:p-4 md:text-sm">
            {error}
          </div>
        )}

        {existingFoc && (
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-4">
            <p className="font-bold text-orange-200">
              Bu vaka için FOC kaydı zaten
              mevcut
            </p>

            <p className="mt-1 text-sm text-orange-100/80">
              Aynı vaka için ikinci bir FOC kaydı
              oluşturulamaz.
            </p>
          </div>
        )}

        <section className="rounded-2xl border border-slate-700 bg-slate-800 p-4 md:p-6">
          <h2 className="mb-4 text-base font-bold text-white md:text-lg">
            Vaka Bilgileri
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-900 p-3">
              <p className="text-xs text-slate-500">
                Hasta
              </p>

              <p className="mt-1 font-semibold text-slate-100">
                {caseItem.hasta_adi}
              </p>
            </div>

            <div className="rounded-xl bg-slate-900 p-3">
              <p className="text-xs text-slate-500">
                Doktor
              </p>

              <p className="mt-1 font-semibold text-slate-100">
                {caseItem.doktor}
              </p>
            </div>

            <div className="rounded-xl bg-slate-900 p-3">
              <p className="text-xs text-slate-500">
                Hastane
              </p>

              <p className="mt-1 font-semibold text-slate-100">
                {caseItem.merkez_hastane}
              </p>
            </div>

            <div className="rounded-xl bg-slate-900 p-3">
              <p className="text-xs text-slate-500">
                Vaka Tarihi
              </p>

              <p className="mt-1 font-semibold text-slate-100">
                {formatDateForScreen(
                  caseItem.vaka_tarihi
                )}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 md:p-6">
          <h2 className="text-base font-bold text-emerald-200 md:text-lg">
            Fatura Edilen Kapak
          </h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-500/20 bg-slate-900 p-3">
              <p className="text-xs text-slate-500">
                Ürün
              </p>

              <p className="mt-1 font-semibold text-white">
                {caseItem.kapak_tipi}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-slate-900 p-3">
              <p className="text-xs text-slate-500">
                Boyut
              </p>

              <p className="mt-1 font-semibold text-white">
                {caseItem.kapak_size}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-slate-900 p-3">
              <p className="text-xs text-slate-500">
                LOT
              </p>

              <p className="mt-1 font-semibold text-white">
                {normalizeLot(
                  caseItem.lot_no
                )}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-red-500/30 bg-slate-800 p-4 md:p-6">
          <h2 className="text-base font-bold text-red-200 md:text-lg">
            FOC Düşülecek İkinci Kapak
          </h2>

          <p className="mt-1 text-xs text-slate-400 md:text-sm">
            Kapağın sisteme daha önce stok girişi
            yapıldıysa stoktan seçin. Kayıtlı değilse
            manuel giriş yapın.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={Boolean(existingFoc)}
              onClick={() =>
                selectSecondValveMode('stock')
              }
              className={`rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                secondValveMode === 'stock'
                  ? 'border-red-400 bg-red-500/15'
                  : 'border-slate-700 bg-slate-900 hover:border-red-500/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <Package
                  className={`mt-0.5 h-5 w-5 ${
                    secondValveMode ===
                    'stock'
                      ? 'text-red-300'
                      : 'text-slate-400'
                  }`}
                />

                <div>
                  <p className="font-bold text-white">
                    Stoktan Seç
                  </p>

                  <p className="mt-1 text-xs text-slate-400 md:text-sm">
                    Kapak stoktan düşer ve hareket
                    kaydı oluşur.
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              disabled={Boolean(existingFoc)}
              onClick={() =>
                selectSecondValveMode('manual')
              }
              className={`rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                secondValveMode === 'manual'
                  ? 'border-amber-400 bg-amber-500/15'
                  : 'border-slate-700 bg-slate-900 hover:border-amber-500/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <PenLine
                  className={`mt-0.5 h-5 w-5 ${
                    secondValveMode ===
                    'manual'
                      ? 'text-amber-300'
                      : 'text-slate-400'
                  }`}
                />

                <div>
                  <p className="font-bold text-white">
                    Manuel Gir
                  </p>

                  <p className="mt-1 text-xs text-slate-400 md:text-sm">
                    Stokta olmayan kapak yalnızca
                    FOC kaydına eklenir.
                  </p>
                </div>
              </div>
            </button>
          </div>

          {secondValveMode === 'stock' ? (
            <>
              <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
                {VALVE_SIZES.map(size => (
                  <button
                    key={size}
                    type="button"
                    disabled={Boolean(existingFoc)}
                    onClick={() => {
                      setSelectedSize(
                        selectedSize === size
                          ? null
                          : size
                      );

                      setSelectedStockId('');
                    }}
                    className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      selectedSize === size
                        ? 'border-red-400 bg-red-500/15 text-white'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-red-500/50'
                    }`}
                  >
                    <div className="font-bold">
                      {size} mm
                    </div>

                    <div className="mt-1 text-[11px] opacity-80 md:text-xs">
                      {
                        stockCounts[
                          size as
                            | 23
                            | 26
                            | 29
                            | 34
                        ]
                      }{' '}
                      adet stokta
                    </div>
                  </button>
                ))}
              </div>

              {selectedSize && (
                <div className="mt-4 space-y-2">
                  {filteredStockItems.length ===
                  0 ? (
                    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-400">
                      {selectedSize} mm stokta
                      kapak bulunamadı. Manuel giriş
                      seçeneğini kullanabilirsiniz.
                    </div>
                  ) : (
                    filteredStockItems.map(
                      stockItem => (
                        <button
                          key={stockItem.id}
                          type="button"
                          onClick={() =>
                            setSelectedStockId(
                              stockItem.id
                            )
                          }
                          className={`w-full rounded-xl border p-3 text-left transition md:p-4 ${
                            selectedStockId ===
                            stockItem.id
                              ? 'border-red-400 bg-red-500/15'
                              : 'border-slate-700 bg-slate-900 hover:border-red-500/50'
                          }`}
                        >
                          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                            <div>
                              <p className="font-semibold text-white">
                                {
                                  stockItem.urun_adi
                                }{' '}
                                {
                                  stockItem.kapak_boyutu
                                }{' '}
                                mm
                              </p>

                              <p className="mt-1 text-xs text-slate-400 md:text-sm">
                                LOT:{' '}
                                {normalizeLot(
                                  stockItem.lot_no
                                )}
                              </p>
                            </div>

                            <p className="text-xs text-slate-400 md:text-sm">
                              SKT:{' '}
                              {formatDateForScreen(
                                stockItem.son_kullanma_tarihi
                              )}
                            </p>
                          </div>
                        </button>
                      )
                    )
                  )}
                </div>
              )}

              {selectedStock && (
                <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />

                    <div>
                      <p className="font-bold text-red-100">
                        FOC kapağı seçildi
                      </p>

                      <p className="mt-1 text-sm text-red-100/80">
                        {
                          selectedStock.urun_adi
                        }{' '}
                        {
                          selectedStock.kapak_boyutu
                        }{' '}
                        mm — LOT:{' '}
                        {normalizeLot(
                          selectedStock.lot_no
                        )}
                      </p>

                      <p className="mt-2 text-xs text-red-100/70">
                        FOC kaydı
                        tamamlandığında bu kapak
                        stoktan düşülecektir.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="mb-4">
                <p className="font-bold text-amber-200">
                  Manuel FOC Kapağı
                </p>

                <p className="mt-1 text-xs text-amber-100/70 md:text-sm">
                  Bu işlem stok miktarını
                  değiştirmez. Girilen bilgiler FOC
                  kaydına ve mail metnine eklenir.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Kapak Ürün Adı"
                  required
                >
                  <input
                    type="text"
                    disabled={Boolean(existingFoc)}
                    value={manualValve.urun_adi}
                    onChange={event =>
                      updateManualValve(
                        'urun_adi',
                        event.target.value
                      )
                    }
                    className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
                    placeholder="Örnek: EVPROPLUS"
                  />
                </Field>

                <Field
                  label="Kapak Boyutu"
                  required
                >
                  <select
                    disabled={Boolean(existingFoc)}
                    value={
                      manualValve.kapak_boyutu
                    }
                    onChange={event =>
                      updateManualValve(
                        'kapak_boyutu',
                        Number(
                          event.target.value
                        )
                      )
                    }
                    className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {VALVE_SIZES.map(size => (
                      <option
                        key={size}
                        value={size}
                      >
                        {size} mm
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="LOT No"
                  required
                >
                  <input
                    type="text"
                    disabled={Boolean(existingFoc)}
                    value={manualValve.lot_no}
                    onChange={event =>
                      updateManualValve(
                        'lot_no',
                        normalizeLot(
                          event.target.value
                        )
                      )
                    }
                    className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
                    placeholder="Örnek: R230513"
                  />
                </Field>

                <Field
                  label="Son Kullanma Tarihi"
                  required
                >
                  <input
                    type="date"
                    disabled={Boolean(existingFoc)}
                    value={
                      manualValve.son_kullanma_tarihi
                    }
                    onChange={event =>
                      updateManualValve(
                        'son_kullanma_tarihi',
                        event.target.value
                      )
                    }
                    className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
                  />
                </Field>
              </div>

              {manualValve.lot_no && (
                <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />

                    <div>
                      <p className="font-bold text-amber-100">
                        Manuel FOC kapağı
                      </p>

                      <p className="mt-1 text-sm text-amber-100/80">
                        {buildManualProductName(
                          manualValve.urun_adi,
                          manualValve.kapak_boyutu
                        )}{' '}
                        — LOT:{' '}
                        {normalizeLot(
                          manualValve.lot_no
                        )}
                      </p>

                      <p className="mt-2 text-xs text-amber-100/70">
                        Stokta kayıt olmadığı için
                        herhangi bir stok düşümü
                        yapılmayacaktır.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-800 p-4 md:p-6">
          <Field
            label="FOC Olay Açıklaması"
            required
          >
            <textarea
              value={description}
              disabled={Boolean(existingFoc)}
              onChange={event =>
                setDescription(event.target.value)
              }
              rows={5}
              className={`${inputClass} resize-y disabled:cursor-not-allowed disabled:opacity-60`}
              placeholder="Örnek: Kapak implante edildikten sonra sistem çıkarılırken pop-out oldu. AY geliştiği için ikinci kapak kullanıldı."
            />
          </Field>

          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Buraya yazdığınız metin FOC mailine
            aynen aktarılır.
          </p>
        </section>

        <section className="rounded-2xl border border-cyan-500/30 bg-slate-800 p-4 md:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-cyan-200 md:text-lg">
                FOC Mail Önizlemesi
              </h2>

              <p className="mt-1 text-xs text-slate-400 md:text-sm">
                Kaydetmeden önce oluşacak mail
                metnini kontrol edin.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyMailText}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-500/50 hover:text-white"
              >
                {copied ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                ) : (
                  <Clipboard className="h-4 w-4" />
                )}

                {copied
                  ? 'Kopyalandı'
                  : 'Metni Kopyala'}
              </button>

              <button
                type="button"
                onClick={openMailClient}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-500"
              >
                <ExternalLink className="h-4 w-4" />
                Mail Uygulamasını Aç
              </button>
            </div>
          </div>

          <div className="mt-4 whitespace-pre-wrap rounded-xl border border-slate-700 bg-slate-950 p-4 text-xs leading-relaxed text-slate-300 md:text-sm">
            {mailText}
          </div>
        </section>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() =>
              navigate(
                `/view/${caseItem.id}`
              )
            }
            className="rounded-xl border border-slate-600 bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            Vazgeç
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={
              saving ||
              Boolean(existingFoc)
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-5 w-5" />

            {saving
              ? 'FOC Kaydediliyor...'
              : 'FOC Kaydını Tamamla'}
          </button>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-500">
          <div className="flex items-start gap-2">
            <Mail className="mt-0.5 h-4 w-4 shrink-0" />

            <p>
              Stoktan seçilen kapak stoktan düşer ve
              hareket kaydı oluşturulur. Manuel girilen
              kapak yalnızca FOC kaydına eklenir.
              Yöneticilere otomatik bildirim gönderilir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
