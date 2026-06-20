import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { HeartPulse } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { user, signIn, signUp } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError(null);

    const err =
      mode === 'login'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, fullName.trim());

    setLoading(false);

    if (err) {
      setError(err);
      return;
    }

    if (rememberMe) {
      localStorage.setItem('rememberedEmail', email.trim());
    } else {
      localStorage.removeItem('rememberedEmail');
    }
  };

  function toggleMode() {
    setError(null);
    setPassword('');
    setFullName('');
    setMode(prev => (prev === 'login' ? 'signup' : 'login'));
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
            {mode === 'login' ? 'Giriş yap' : 'Yeni kullanıcı oluştur'}
          </p>
        </div>

        {mode === 'signup' && (
          <input
            className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none focus:border-cyan-400"
            placeholder="Ad Soyad"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
            autoComplete="name"
          />
        )}

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

        <input
          className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none focus:border-cyan-400"
          type="password"
          placeholder="Şifre"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />

        {mode === 'login' && (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
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

        <button
          disabled={loading}
          className="w-full p-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold disabled:opacity-60"
        >
          {loading ? 'Bekle...' : mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
        </button>

        <button
          type="button"
          onClick={toggleMode}
          className="w-full text-cyan-300 text-sm"
        >
          {mode === 'login'
            ? 'Hesabın yoksa kayıt ol'
            : 'Hesabın varsa giriş yap'}
        </button>
      </form>
    </div>
  );
}
