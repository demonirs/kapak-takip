import { useEffect, useState } from 'react';
import { Shield, UserCog } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type Profile = {
  id: string;
  full_name: string | null;
  role: 'admin' | 'member' | string | null;
  created_at?: string | null;
};

export default function Users() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      setMessage(error.message);
    }

    if (data) {
      setUsers(data);
    }

    setLoading(false);
  }

  async function updateRole(userId: string, role: 'admin' | 'member') {
    if (!isAdmin) {
      setMessage('Bu işlem için admin yetkisi gerekli.');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Kullanıcı rolü güncellendi.');
    await loadUsers();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Kullanıcı Yönetimi</h1>
        <p className="text-slate-400 text-sm">
          Kayıt olan kullanıcıların rollerini buradan yönetebilirsin.
        </p>
      </div>

      {!isAdmin && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-2xl p-4 text-sm">
          Bu ekranı sadece admin kullanıcılar yönetebilir.
        </div>
      )}

      {message && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 text-sm text-slate-300">
          {message}
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">Yükleniyor...</p>
      ) : (
        <div className="space-y-3">
          {users.length === 0 ? (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 text-slate-400">
              Kullanıcı bulunamadı.
            </div>
          ) : (
            users.map(user => (
              <div
                key={user.id}
                className="bg-slate-800 border border-slate-700 rounded-2xl p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <UserCog className="w-4 h-4 text-cyan-300" />
                      <p className="font-semibold truncate">
                        {user.full_name || 'İsimsiz Kullanıcı'}
                      </p>
                    </div>

                    <p className="text-xs text-slate-500 mt-1 truncate">
                      ID: {user.id}
                    </p>

                    <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-xs">
                      <Shield className="w-3.5 h-3.5 text-cyan-300" />
                      Rol: <b>{user.role || 'member'}</b>
                    </div>
                  </div>

                  <select
                    disabled={!isAdmin}
                    value={user.role || 'member'}
                    onChange={e =>
                      updateRole(user.id, e.target.value as 'admin' | 'member')
                    }
                    className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-50"
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
