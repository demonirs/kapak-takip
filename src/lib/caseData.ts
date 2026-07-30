import { supabase, timeout } from './supabase';

const DATABASE_PAGE_SIZE = 1000;

export type CaseSource = 'valveflow' | 'legacy';

type CurrentCaseRow = {
  id: string;
  vaka_tarihi: string | null;
  merkez_hastane: string | null;
  doktor: string | null;
  hasta_adi: string | null;
  kapak_tipi: string | null;
  kapak_size: string | number | null;
  lot_no: string | null;
  son_kul_tarihi: string | null;
  pre_balon: string | null;
  post_balon: string | null;
  paravalvuler_ay: string | null;
  proglide_adedi: number | null;
  crimp_yapan: string | null;
  created_at: string | null;
};

type LegacyCaseRow = {
  id: string;
  urun_adi: string | null;
  kapak_boyutu: number | null;
  lot_no: string | null;
  son_kullanma_tarihi: string | null;
  kullanim_tarihi: string | null;
  merkez_hastane: string | null;
  doktor: string | null;
  hasta_adi: string | null;
  kaynak: string | null;
};

export type UnifiedCase = {
  key: string;
  recordId: string;
  source: CaseSource;
  vaka_tarihi: string | null;
  merkez_hastane: string | null;
  doktor: string | null;
  hasta_adi: string | null;
  kapak_tipi: string | null;
  kapak_size: string | number | null;
  lot_no: string | null;
  son_kul_tarihi: string | null;
  pre_balon: string | null;
  post_balon: string | null;
  paravalvuler_ay: string | null;
  proglide_adedi: number | null;
  crimp_yapan: string | null;
  created_at: string | null;
};

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .trim();
}

function normalizeLot(value: string | null): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/\(20\)01$/i, '')
    .replace(/2001$/i, '');
}

function duplicateKey(item: {
  vaka_tarihi: string | null;
  lot_no: string | null;
  hasta_adi: string | null;
}): string {
  return [
    item.vaka_tarihi?.split('T')[0] || '',
    normalizeLot(item.lot_no),
    normalizeText(item.hasta_adi),
  ].join('|');
}

function rowTime(item: UnifiedCase): number {
  const value = item.vaka_tarihi || item.created_at;

  if (!value) return 0;

  const timestamp = new Date(value).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

async function fetchAllCurrentCases(): Promise<CurrentCaseRow[]> {
  const allRows: CurrentCaseRow[] = [];

  for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
    const { data, error } = await timeout(
      supabase
        .from('kapaklar')
        .select(
          `
            id,
            vaka_tarihi,
            merkez_hastane,
            doktor,
            hasta_adi,
            kapak_tipi,
            kapak_size,
            lot_no,
            son_kul_tarihi,
            pre_balon,
            post_balon,
            paravalvuler_ay,
            proglide_adedi,
            crimp_yapan,
            created_at
          `
        )
        .order('vaka_tarihi', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + DATABASE_PAGE_SIZE - 1),
      15000
    );

    if (error) throw error;

    const batch = (data || []) as CurrentCaseRow[];
    allRows.push(...batch);

    if (batch.length < DATABASE_PAGE_SIZE) break;
  }

  return allRows;
}

async function fetchAllLegacyCases(): Promise<LegacyCaseRow[]> {
  const allRows: LegacyCaseRow[] = [];

  for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
    const { data, error } = await timeout(
      supabase
        .from('gecmis_kullanilan_kapaklar')
        .select(
          `
            id,
            urun_adi,
            kapak_boyutu,
            lot_no,
            son_kullanma_tarihi,
            kullanim_tarihi,
            merkez_hastane,
            doktor,
            hasta_adi,
            kaynak
          `
        )
        .order('kullanim_tarihi', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + DATABASE_PAGE_SIZE - 1),
      15000
    );

    if (error) throw error;

    const batch = (data || []) as LegacyCaseRow[];
    allRows.push(...batch);

    if (batch.length < DATABASE_PAGE_SIZE) break;
  }

  return allRows;
}

function mergeCases(
  currentRows: CurrentCaseRow[],
  legacyRows: LegacyCaseRow[]
): UnifiedCase[] {
  const currentItems: UnifiedCase[] = currentRows.map(item => ({
    key: `valveflow-${item.id}`,
    recordId: item.id,
    source: 'valveflow',
    vaka_tarihi: item.vaka_tarihi,
    merkez_hastane: item.merkez_hastane,
    doktor: item.doktor,
    hasta_adi: item.hasta_adi,
    kapak_tipi: item.kapak_tipi,
    kapak_size: item.kapak_size,
    lot_no: item.lot_no,
    son_kul_tarihi: item.son_kul_tarihi,
    pre_balon: item.pre_balon,
    post_balon: item.post_balon,
    paravalvuler_ay: item.paravalvuler_ay,
    proglide_adedi: item.proglide_adedi,
    crimp_yapan: item.crimp_yapan,
    created_at: item.created_at,
  }));

  const currentDuplicateKeys = new Set(
    currentItems.map(duplicateKey)
  );

  const legacyItems: UnifiedCase[] = legacyRows
    .map(item => ({
      key: `legacy-${item.id}`,
      recordId: item.id,
      source: 'legacy' as const,
      vaka_tarihi: item.kullanim_tarihi,
      merkez_hastane: item.merkez_hastane,
      doktor: item.doktor,
      hasta_adi: item.hasta_adi,
      kapak_tipi: item.urun_adi || 'Evolut Pro+',
      kapak_size: item.kapak_boyutu,
      lot_no: item.lot_no,
      son_kul_tarihi: item.son_kullanma_tarihi,
      pre_balon: null,
      post_balon: null,
      paravalvuler_ay: null,
      proglide_adedi: null,
      crimp_yapan: item.kaynak || 'Eski Liste',
      created_at: item.kullanim_tarihi,
    }))
    .filter(item => !currentDuplicateKeys.has(duplicateKey(item)));

  return [...currentItems, ...legacyItems].sort(
    (first, second) => rowTime(second) - rowTime(first)
  );
}

export async function fetchUnifiedCases(): Promise<UnifiedCase[]> {
  const [currentRows, legacyRows] = await Promise.all([
    fetchAllCurrentCases(),
    fetchAllLegacyCases(),
  ]);

  return mergeCases(currentRows, legacyRows);
}
