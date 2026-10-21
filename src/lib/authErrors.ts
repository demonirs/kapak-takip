import { getCityLabel, type KavisCity } from './supabase';

type AuthAction = 'login' | 'signup' | 'recovery' | 'password-update';

type AuthErrorLike = {
  code?: string;
  message?: string;
  status?: number;
};

export function formatAuthError(
  error: unknown,
  city: KavisCity,
  action: AuthAction
): string {
  const authError = (error ?? {}) as AuthErrorLike;
  const code = String(authError.code ?? '').toLowerCase();
  const message = String(
    authError.message ?? (error instanceof Error ? error.message : '')
  ).toLowerCase();
  const cityLabel = getCityLabel(city);

  if (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('zaman aşım') ||
    message.includes('timeout')
  ) {
    return `${cityLabel} bağlantısına şu anda ulaşılamıyor. İnternet bağlantını kontrol edip tekrar dene.`;
  }

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return `${cityLabel} hesabı bulunamadı veya e-posta/şifre hatalı. Şehir seçimini ve bilgilerini kontrol et.`;
  }

  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'E-posta adresin henüz doğrulanmamış. Gelen kutundaki doğrulama bağlantısını aç.';
  }

  if (
    code === 'user_already_exists' ||
    message.includes('user already registered') ||
    message.includes('already been registered')
  ) {
    return `Bu e-posta ${cityLabel} sisteminde zaten kayıtlı. Giriş yapmayı veya şifreni yenilemeyi dene.`;
  }

  if (code === 'signup_disabled' || message.includes('signups not allowed')) {
    return `${cityLabel} sisteminde yeni kullanıcı kaydı şu anda kapalı.`;
  }

  if (code === 'weak_password' || message.includes('password should be')) {
    return 'Şifre yeterince güçlü değil. En az 8 karakter kullan.';
  }

  if (
    code === 'over_email_send_rate_limit' ||
    message.includes('email rate limit')
  ) {
    return 'Kısa sürede çok fazla e-posta isteği gönderildi. Birkaç dakika sonra tekrar dene.';
  }

  if (code === 'same_password' || message.includes('same password')) {
    return 'Yeni şifre önceki şifrenle aynı olamaz.';
  }

  if (authError.status === 429 || message.includes('too many requests')) {
    return 'Çok fazla deneme yapıldı. Birkaç dakika bekleyip tekrar dene.';
  }

  if (action === 'recovery') {
    return 'Şifre yenileme bağlantısı gönderilemedi. E-posta adresini ve bağlantını kontrol et.';
  }

  if (action === 'password-update') {
    return 'Yeni şifre kaydedilemedi. Bağlantının süresi dolmuş olabilir; yeniden şifre yenileme bağlantısı iste.';
  }

  if (action === 'signup') {
    return `${cityLabel} kullanıcı kaydı tamamlanamadı. Bilgilerini kontrol edip tekrar dene.`;
  }

  return `${cityLabel} sistemine giriş yapılamadı. Bilgilerini kontrol edip tekrar dene.`;
}
