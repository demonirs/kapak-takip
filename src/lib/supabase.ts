import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase ENV eksik: VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY gerekli.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type Kapak = {
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

export const KAPAK_TIPLERI = [
  'Evolut R',
  'Evolut Pro',
  'Evolut Pro+',
  'Evolut FX',
  'Evolut FX+',
] as const;

export const KAPAK_SIZES = [
  '23 mm',
  '26 mm',
  '29 mm',
  '34 mm',
] as const;

export const BALON_SIZES = [
  'Yok',
  '18 mm',
  '20 mm',
  '23 mm',
  '25 mm',
  '28 mm',
] as const;

export const PARAVALVULER_OPTIONS = [
  'Yok',
  'Hafif',
  'Orta',
  'Ciddi',
] as const;

export const PROGLIDE_OPTIONS = [1, 2, 3, 4] as const;

export function timeout<T>(promise: Promise<T>, ms = 10000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('İstek zaman aşımına uğradı.')), ms)
    ),
  ]);
}
