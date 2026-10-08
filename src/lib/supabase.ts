import { createClient } from '@supabase/supabase-js';

export type KavisCity = 'ankara' | 'istanbul';

export const ACTIVE_CITY_STORAGE_KEY = 'kavis.activeCity';

const cityConfigs = {
  ankara: {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  },
  istanbul: {
    url: import.meta.env.VITE_SUPABASE_ISTANBUL_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ISTANBUL_ANON_KEY,
  },
} satisfies Record<KavisCity, { url?: string; anonKey?: string }>;

function isKavisCity(value: string | null): value is KavisCity {
  return value === 'ankara' || value === 'istanbul';
}

function resolveInitialCity(): KavisCity {
  if (typeof window === 'undefined') return 'ankara';

  const queryCity = new URLSearchParams(window.location.search).get('city');
  if (isKavisCity(queryCity)) {
    window.localStorage.setItem(ACTIVE_CITY_STORAGE_KEY, queryCity);
    return queryCity;
  }

  const savedCity = window.localStorage.getItem(ACTIVE_CITY_STORAGE_KEY);
  return isKavisCity(savedCity) ? savedCity : 'ankara';
}

export function isCityConfigured(city: KavisCity) {
  const config = cityConfigs[city];
  return Boolean(config.url && config.anonKey);
}

function createCityClient(city: KavisCity) {
  const config = cityConfigs[city];

  if (!config.url || !config.anonKey) {
    throw new Error(
      `${city === 'ankara' ? 'Ankara' : 'İstanbul'} Supabase ENV bilgileri eksik.`
    );
  }

  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: `kavis-auth-${city}`,
    },
  });
}

type KavisSupabaseClient = ReturnType<typeof createCityClient>;

const clients = new Map<KavisCity, KavisSupabaseClient>();

function getCityClient(city: KavisCity) {
  const existing = clients.get(city);
  if (existing) return existing;

  const client = createCityClient(city);
  clients.set(city, client);
  return client;
}

let activeCity = resolveInitialCity();

export let supabase = getCityClient(activeCity);

export function getActiveCity(): KavisCity {
  return activeCity;
}

export function setActiveCity(city: KavisCity) {
  if (!isCityConfigured(city)) {
    throw new Error(
      `${city === 'ankara' ? 'Ankara' : 'İstanbul'} bağlantı bilgileri eksik.`
    );
  }

  activeCity = city;
  window.localStorage.setItem(ACTIVE_CITY_STORAGE_KEY, city);
  supabase = getCityClient(city);
}

export function getCityLabel(city = activeCity) {
  return city === 'ankara' ? 'Ankara' : 'İstanbul';
}

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

export const KAPAK_SIZES = ['23 mm', '26 mm', '29 mm', '34 mm'] as const;

export const BALON_SIZES = [
  'Yok',
  '18 mm',
  '20 mm',
  '23 mm',
  '25 mm',
  '28 mm',
] as const;

export const PARAVALVULER_OPTIONS = ['Yok', 'Hafif', 'Orta', 'Ciddi'] as const;

export const PROGLIDE_OPTIONS = [1, 2, 3, 4] as const;

export function timeout<T>(promise: PromiseLike<T>, ms = 10000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('İstek zaman aşımına uğradı.')), ms)
    ),
  ]);
}
