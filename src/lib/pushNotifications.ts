import { supabase } from './supabase';

export type PushNotificationStatus =
  | 'unsupported'
  | 'unconfigured'
  | 'denied'
  | 'disabled'
  | 'enabled';

function isPushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat(
    (4 - (value.length % 4)) % 4
  );

  const base64 = (value + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);

  return Uint8Array.from(
    [...rawData].map(character =>
      character.charCodeAt(0)
    )
  );
}

function getVapidPublicKey() {
  return String(
    import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
  ).trim();
}

export async function getPushNotificationStatus():
  Promise<PushNotificationStatus> {
  if (!isPushSupported()) {
    return 'unsupported';
  }

  if (!getVapidPublicKey()) {
    return 'unconfigured';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  const registration =
    await navigator.serviceWorker.ready;

  const subscription =
    await registration.pushManager.getSubscription();

  return subscription ? 'enabled' : 'disabled';
}

export async function enablePushNotifications(
  userId: string
) {
  if (!isPushSupported()) {
    throw new Error(
      'Bu tarayıcı telefon bildirimlerini desteklemiyor.'
    );
  }

  const vapidPublicKey = getVapidPublicKey();

  if (!vapidPublicKey) {
    throw new Error(
      'Telefon bildirimi anahtarı henüz yapılandırılmamış.'
    );
  }

  let permission = Notification.permission;

  if (permission === 'default') {
    permission =
      await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Bildirim izni engellendi. Tarayıcı ayarlarından izin vermeniz gerekiyor.'
        : 'Telefon bildirimi izni verilmedi.'
    );
  }

  const registration =
    await navigator.serviceWorker.ready;

  let subscription =
    await registration.pushManager.getSubscription();

  let createdNewSubscription = false;

  if (!subscription) {
    subscription =
      await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey:
          urlBase64ToUint8Array(vapidPublicKey),
      });

    createdNewSubscription = true;
  }

  const subscriptionJson = subscription.toJSON();

  const p256dh =
    subscriptionJson.keys?.p256dh;

  const authKey =
    subscriptionJson.keys?.auth;

  if (!p256dh || !authKey) {
    if (createdNewSubscription) {
      await subscription.unsubscribe();
    }

    throw new Error(
      'Cihaz abonelik anahtarları alınamadı.'
    );
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh,
        auth_key: authKey,
        user_agent: navigator.userAgent,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'endpoint',
      }
    );

  if (error) {
    if (createdNewSubscription) {
      await subscription.unsubscribe();
    }

    throw new Error(error.message);
  }

  return subscription;
}

export async function disablePushNotifications(
  userId: string
) {
  if (!isPushSupported()) {
    return;
  }

  const registration =
    await navigator.serviceWorker.ready;

  const subscription =
    await registration.pushManager.getSubscription();

  if (!subscription) {
    return;
  }

  const endpoint = subscription.endpoint;

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint);

  if (error) {
    throw new Error(error.message);
  }

  const unsubscribed =
    await subscription.unsubscribe();

  if (!unsubscribed) {
    throw new Error(
      'Tarayıcı bildirim aboneliğini kapatamadı.'
    );
  }
}
