import { useEffect, useState } from 'react';
import {
  Navigate,
  useNavigate,
} from 'react-router-dom';
import { HeartPulse } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';

export default function Login() {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const isResetPage =
    window.location.pathname === '/reset-password';

  const [mode, setMode] = useState<Mode>(
    isResetPage ? 'reset' : 'login'
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] =
    useState('');
  const [fullName, setFullName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(
    null
  );

  const [message, setMessage] = useState<
    string | null
  >(null);

  useEffect(() => {
    const savedEmail = localStorage.getItem(
      'rememberedEmail'
    );

    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  if (user && mode !== 'reset') {
    return <Navigate to="/" replace />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === 'forgot') {
        const trimmedEmail = email.trim();

        const { error: recoveryError } =
          await supabase.auth.resetPasswordForEmail(
            trimmedEmail,
            {
              redirectTo: `${window.location.origin}/reset-password`,
            }
          );

        if (recoveryError) {
          setError(recoveryError.message);
          return;
        }

        setMessage(
          'Şifre yenileme bağlantısı e-posta adresine gönderildi. Gelen kutusu ve spam klasörünü kontrol et.'
        );

        return;
      }

      if (mode === 'reset') {
        if (password.length < 8) {
          setError(
            'Yeni şifre en az 8 karakter olmalıdır.'
          );
          return;
        }

        if (password !== passwordConfirm) {
          setError('Şifreler birbiriyle eşleşmiyor.');
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setError(
            'Şifre yenileme bağlantısının süresi dolmuş veya bağlantı geçersiz. Giriş ekranından yeniden bağlantı iste.'
          );
          return;
        }

        const { error: updateError } =
          await supabase.auth.updateUser({
            password,
          });

        if (updateError) {
          setError(updateError.message);
          return;
        }

        setMessage(
          'Şifren başarıyla yenilendi. Giriş ekranına yönlendiriliyorsun.'
        );

        await supabase.auth.signOut();

        window.setTimeout(() => {
          navigate('/login', {
            replace: true,
          });
        }, 1500);

        return;
      }

      const trimmedEmail = email.trim();

      const authError =
        mode === 'login'
          ? await signIn(trimmedEmail, password)
          : await signUp(
              trimmedEmail,
              password,
              fullName.trim()
            );

      if (authError) {
        setError(authError);
        return;
      }

      if (rememberMe) {
        localStorage.setItem(
          'rememberedEmail',
          trimmedEmail
        );
      } else {
        localStorage.removeItem('rememberedEmail');
      }
    } catch (submitError) {
      console.error(
        'Kimlik doğrulama hatası:',
        submitError
      );

      setError(
        'İşlem sırasında beklenmeyen bir hata oluştu. Lütfen tekrar dene.'
      );
    } finally {
      setLoading(false);
    }
  };

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
    setMessage(null);
    setPassword('');
    setPasswordConfirm('');
    setFullName('');
  }

  function getSubtitle() {
    if (mode === 'signup') {
      return 'Yeni kullanıcı oluştur';
    }

    if (mode === 'forgot') {
      return 'Şifre yenileme bağlantısı iste';
    }

    if (mode === 'reset') {
      return 'Yeni şifreni belirle';
    }

    return 'Giriş yap';
  }

  function getSubmitLabel() {
    if (loading) {
      return 'Bekle...';
    }

    if (mode === 'signup') {
      return 'Kayıt Ol';
    }

    if (mode === 'forgot') {
      return 'Şifre Yenileme Bağlantısı Gönder';
    }

    if (mode === 'reset') {
      return 'Yeni Şifreyi Kaydet';
    }

    return 'Giriş Yap';
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
      >
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-xl bg-cyan-500 flex items-center justify-center">
            <HeartPulse className="text-white" />
          </div>

          <h1 className="text-2xl font-bold text-white">
            Kapak Takip
          </h1>

          <p className="text-slate-400">
            {getSubtitle()}
          </p>
        </div>

        {mode === 'signup' && (
          <input
            className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none focus:border-cyan-400"
            placeholder="Ad Soyad"
            value={fullName}
            onChange={e =>
              setFullName(e.target.value)
            }
            required
            autoComplete="name"
          />
        )}

        {mode !== 'reset' && (
          <input
            className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none focus:border-cyan-400"
            type="email"
            placeholder="E-posta"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            inputMode="email"
          />
        )}

        {(mode === 'login' ||
          mode === 'signup' ||
          mode === 'reset') && (
          <input
            className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none focus:border-cyan-400"
            type="password"
            placeholder={
              mode === 'reset'
                ? 'Yeni şifre'
                : 'Şifre'
            }
            value={password}
            onChange={e =>
              setPassword(e.target.value)
            }
            required
            minLength={mode === 'reset' ? 8 : 6}
            autoComplete={
              mode === 'login'
                ? 'current-password'
                : 'new-password'
            }
          />
        )}

        {mode === 'reset' && (
          <input
            className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none focus:border-cyan-400"
            type="password"
            placeholder="Yeni şifreyi tekrar yaz"
            value={passwordConfirm}
            onChange={e =>
              setPasswordConfirm(e.target.value)
            }
            required
            minLength={8}
            autoComplete="new-password"
          />
        )}

        {mode === 'login' && (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={e =>
                setRememberMe(e.target.checked)
              }
              className="accent-cyan-500"
            />
            Beni hatırla
          </label>
        )}

        {error && (
          <p className="text-red-300 text-sm bg-red-500/10 border border-red-500/30 p-3 rounded-xl">
            {error}
          </p>
        )}

        {message && (
          <p className="text-emerald-300 text-sm bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl">
            {message}
          </p>
        )}

        <button
          disabled={loading}
          className="w-full p-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold disabled:opacity-60"
        >
          {getSubmitLabel()}
        </button>

        {mode === 'login' && (
          <>
            <button
              type="button"
              onClick={() =>
                switchMode('forgot')
              }
              className="w-full text-slate-300 hover:text-white text-sm"
            >
              Şifremi unuttum
            </button>

            <button
              type="button"
              onClick={() =>
                switchMode('signup')
              }
              className="w-full text-cyan-300 text-sm"
            >
              Hesabın yoksa kayıt ol
            </button>
          </>
        )}

        {mode === 'signup' && (
          <button
            type="button"
            onClick={() => switchMode('login')}
            className="w-full text-cyan-300 text-sm"
          >
            Hesabın varsa giriş yap
          </button>
        )}

        {mode === 'forgot' && (
          <button
            type="button"
            onClick={() => switchMode('login')}
            className="w-full text-cyan-300 text-sm"
          >
            Giriş ekranına dön
          </button>
        )}

        {mode === 'reset' && (
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate('/login', {
                replace: true,
              });
            }}
            className="w-full text-cyan-300 text-sm"
          >
            Giriş ekranına dön
          </button>
        )}
      </form>
    </div>
  );
}
