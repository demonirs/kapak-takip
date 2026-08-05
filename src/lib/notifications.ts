import { supabase, timeout } from './supabase';

export type NotificationType =
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

type NotifyUsersParams = {
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
}: NotifyUsersParams) {
  const { error } = await timeout(
    supabase.rpc('notify_all_users', {
      p_title: title,
      p_message: message,
      p_type: type,
      p_related_table: related_table,
      p_related_id: related_id,
    }),
    10000
  );

  if (error) throw error;
}
