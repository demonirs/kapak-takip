import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Crown,
  Shield,
  UserCog,
  UsersRound,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type UserRole = 'admin' | 'member';

type Profile = {
  id: string;
  full_name: string | null;
  role: UserRole | string | null;
  created_at?: string | null;
};

const SYSTEM_OWNER_ID = 'ae008984-b1c2-428d-ae82-9d5c883905db';

const USER_ORDER: Record<string, number> = {
  'ae008984-b1c2-428d-ae82-9d5c883905db': 0,
  '4c418bbf-073b-4114-86d0-96fa223ed50d': 1,
  'b4d9cbf3-52c9-4c5a-a611-0ec27a9c0a4d': 2,
  '448f8ffa-6bcc-4ddf-bdf4-352902a5612b': 3,
  'c2aac349-fecc-40df-b347-0102dd70d9e8': 4,
};

type RoleSelectProps = {
  value: UserRole;
  disabled: boolean;
  onChange: (value: UserRole) => void;
  userName: string;
};

function RoleSelect({
  value,
  disabled,
  onChange,
  userName,
}: RoleSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full sm:w-32">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(open => !open)}
        aria-label={`${userName} rolünü değiştir`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
          disabled
            ? 'cursor-not-allowed border-slate-700 bg-slate-900/50 text-slate-500'
            : isOpen
              ? 'border-cyan-400 bg-slate-900 text-white ring-2 ring-cyan-500/10'
              : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600'
        }`}
      >
        <span>{value === 'admin' ? 'Admin' : 'Üye'}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && !disabled && (
        <div
          role="listbox"
          aria-label={`${userName} rol seçenekleri`}
          className="absolute right-0 z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-600 bg-slate-900 p-1.5 shadow-2xl shadow-black/50"
        >
          {(['member', 'admin'] as UserRole[]).map(role => {
            const selected = role === value;

            return (
              <button
                key={role}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(role);
                  setIsOpen(false);
                }}
                className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                  selected
                    ? 'bg-cyan-500/15 text-cyan-200'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span>{role === 'admin' ? 'Admin' : 'Üye'}</span>
                {selected && <Check className="h-4 w-4 text-cyan-300" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Users() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);

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

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const aOrder = USER_ORDER[a.id] ?? Number.MAX_SAFE_INTEGER;
      const bOrder = USER_ORDER[b.id] ?? Number.MAX_SAFE_INTEGER;

      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }

      return (a.full_name || '').localeCompare(b.full_name || '', 'tr');
    });
  }, [users]);

  const adminCount = useMemo(() => {
    return users.filter(user => user.role === 'admin').length;
  }, [users]);

  async function updateRole(userId: string, role: UserRole) {
    setMessage('');

    if (!isAdmin) {
      setMessage('Bu işlem için admin yetkisi gerekli.');
      return;
    }

    if (userId === SYSTEM_OWNER_ID) {
      setMessage('Sistem Sahibinin rolü bu ekrandan değiştirilemez.');
      return;
    }

    const targetUser = users.find(user => user.id === userId);

    if (!targetUser || targetUser.role === role) {
      return;
    }

    const roleText = role === 'admin' ? 'Admin' : 'Üye';
    const ok = window.confirm(
      `${targetUser.full_name || 'Bu kullanıcı'} için rol ${roleText} olarak değiştirilsin mi?`
    );

    if (!ok) return;

    setUpdatingUserId(userId);

    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId);

    if (error) {
      setMessage(error.message);
      setUpdatingUserId(null);
      return;
    }

    setMessage(
      `${targetUser.full_name || 'Kullanıcı'} rolü ${roleText} olarak güncellendi.`
    );
    setUpdatingUserId(null);
    await loadUsers();
  }

  async function copyUserId(user: Profile) {
    try {
      await navigator.clipboard.writeText(user.id);
      setCopiedUserId(user.id);
      setMessage(`${user.full_name || 'Kullanıcı'} kimliği kopyalandı.`);

      window.setTimeout(() => {
        setCopiedUserId(current => (current === user.id ? null : current));
      }, 1800);
    } catch {
      setMessage('Kullanıcı kimliği kopyalanamadı.');
    }
  }

  function normalizedRole(user: Profile): UserRole {
    return user.role === 'admin' ? 'admin' : 'member';
  }

  function isSystemOwner(user: Profile) {
    return user.id === SYSTEM_OWNER_ID;
  }

  function roleBadge(user: Profile) {
    if (isSystemOwner(user)) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-200">
          <Crown className="h-3.5 w-3.5" />
          Sistem Sahibi
        </span>
      );
    }

    if (user.role === 'admin') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold text-cyan-200">
          <Shield className="h-3.5 w-3.5" />
          Admin
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300">
        <UserCog className="h-3.5 w-3.5" />
        Üye
      </span>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <header>
        <h1 className="text-xl font-bold text-white sm:text-2xl">
          Kullanıcı Yönetimi
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Kullanıcı rollerini görüntüleyin ve yetkileri yönetin.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:w-fit sm:min-w-80">
        <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <UsersRound className="h-3.5 w-3.5" />
            Toplam Kullanıcı
          </div>
          <div className="mt-1 text-xl font-bold text-white">{users.length}</div>
        </div>

        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Shield className="h-3.5 w-3.5 text-cyan-300" />
            Admin
          </div>
          <div className="mt-1 text-xl font-bold text-cyan-200">
            {adminCount}
          </div>
        </div>
      </div>

      {!isAdmin && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Bu ekrandaki rolleri yalnızca admin kullanıcılar yönetebilir.
        </div>
      )}

      {message && (
        <div
          role="status"
          className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-300"
        >
          {message}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-8 text-center text-sm text-slate-400">
          Kullanıcılar yükleniyor...
        </div>
      ) : sortedUsers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800/50 p-8 text-center text-sm text-slate-400">
          Kullanıcı bulunamadı.
        </div>
      ) : (
        <>
          <div className="hidden overflow-visible rounded-xl border border-slate-700 bg-slate-800/70 md:block">
            <table className="w-full table-fixed">
              <thead className="border-b border-slate-700 bg-slate-900/50">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="w-[8%] px-4 py-2.5">Sıra</th>
                  <th className="w-[34%] px-4 py-2.5">Kullanıcı</th>
                  <th className="w-[20%] px-4 py-2.5">Yetki</th>
                  <th className="w-[18%] px-4 py-2.5">Kimlik</th>
                  <th className="w-[20%] px-4 py-2.5 text-right">Rol Seçimi</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-700/70">
                {sortedUsers.map((user, index) => {
                  const owner = isSystemOwner(user);
                  const disabled =
                    !isAdmin || owner || updatingUserId === user.id;

                  return (
                    <tr
                      key={user.id}
                      className={`text-sm transition ${
                        owner
                          ? 'bg-gradient-to-r from-amber-500/[0.09] via-cyan-500/[0.04] to-transparent'
                          : 'hover:bg-slate-700/30'
                      }`}
                    >
                      <td className="px-4 py-3 text-xs font-semibold text-slate-500">
                        {index + 1}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                              owner
                                ? 'border border-amber-400/30 bg-amber-500/10 text-amber-200'
                                : 'bg-slate-700 text-cyan-300'
                            }`}
                          >
                            {owner ? (
                              <Crown className="h-4 w-4" />
                            ) : (
                              <UserCog className="h-4 w-4" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div
                              className="truncate font-semibold text-slate-100"
                              title={user.full_name || 'İsimsiz Kullanıcı'}
                            >
                              {user.full_name || 'İsimsiz Kullanıcı'}
                            </div>
                            {owner && (
                              <div className="mt-0.5 text-[11px] text-amber-300/80">
                                Ana yönetici hesabı
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">{roleBadge(user)}</td>

                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => copyUserId(user)}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-700 hover:text-slate-300"
                          title={user.id}
                          aria-label={`${user.full_name || 'Kullanıcı'} kimliğini kopyala`}
                        >
                          <span className="truncate font-mono">
                            {user.id.slice(0, 8)}…
                          </span>
                          {copiedUserId === user.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-300" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <RoleSelect
                            value={normalizedRole(user)}
                            disabled={disabled}
                            userName={user.full_name || 'İsimsiz Kullanıcı'}
                            onChange={role => updateRole(user.id, role)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2.5 md:hidden">
            {sortedUsers.map((user, index) => {
              const owner = isSystemOwner(user);
              const disabled =
                !isAdmin || owner || updatingUserId === user.id;

              return (
                <article
                  key={user.id}
                  className={`rounded-xl border p-3.5 ${
                    owner
                      ? 'border-amber-400/30 bg-gradient-to-br from-amber-500/[0.10] via-slate-800/80 to-cyan-500/[0.06]'
                      : 'border-slate-700 bg-slate-800/70'
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        owner
                          ? 'border border-amber-400/30 bg-amber-500/10 text-amber-200'
                          : 'bg-slate-700 text-cyan-300'
                      }`}
                    >
                      {owner ? (
                        <Crown className="h-4 w-4" />
                      ) : (
                        <span className="text-xs font-bold">{index + 1}</span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h2 className="break-words text-sm font-semibold text-slate-100">
                        {user.full_name || 'İsimsiz Kullanıcı'}
                      </h2>

                      <div className="mt-1.5">{roleBadge(user)}</div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-700/70 pt-3">
                    <button
                      type="button"
                      onClick={() => copyUserId(user)}
                      className="inline-flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-slate-500"
                      aria-label={`${user.full_name || 'Kullanıcı'} kimliğini kopyala`}
                    >
                      <span className="truncate font-mono">
                        {user.id.slice(0, 8)}…
                      </span>
                      {copiedUserId === user.id ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 shrink-0" />
                      )}
                    </button>

                    <RoleSelect
                      value={normalizedRole(user)}
                      disabled={disabled}
                      userName={user.full_name || 'İsimsiz Kullanıcı'}
                      onChange={role => updateRole(user.id, role)}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
