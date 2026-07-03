import { supabase, timeout } from './supabase';

export type NotificationType =
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

type NotifyAdminsParams = {
  title: string;
  message: string;
  type?: NotificationType;
  related_table?: string | null;
  related_id?: string | null;
};

export async function notifyAdmins({
  title,
  message,
  type = 'info',
  related_table = null,
  related_id = null,
}: NotifyAdminsParams) {
  // Admin kullanıcıları al
  const { data: admins, error: adminError } = await timeout(
    supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin'),
    10000
  );

  if (adminError) throw adminError;

  if (!admins || admins.length === 0) {
    return;
  }

  // Bildirimleri hazırla
  const notifications = admins.map((admin) => ({
    user_id: admin.id,
    title,
    message,
    type,
    related_table,
    related_id,
    is_read: false,
  }));

  // Bildirimleri ekle
  const { error } = await timeout(
    supabase
      .from('notifications')
      .insert(notifications),
    10000
  );

  if (error) throw error;
}
