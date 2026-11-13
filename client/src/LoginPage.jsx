import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, ApiError } from './api.js';
import { START_PATHS, useAuth } from './AuthContext.jsx';

const fieldStyle = { display: 'block', width: '100%', boxSizing: 'border-box', padding: 8, marginTop: 4, marginBottom: 12 };

export default function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [health, setHealth] = useState(null);
  const [healthFailed, setHealthFailed] = useState(false);

  useEffect(() => {
    api('/api/health')
      .then(setHealth)
      .catch(() => setHealthFailed(true));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoginError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setLoginError(
        err instanceof ApiError && err.status === 401
          ? 'E-posta veya şifre hatalı.'
          : 'Sunucuya ulaşılamadı. Sunucunun çalıştığından emin olun.'
      );
      setSubmitting(false);
    }
  }

  if (user) {
    return <Navigate to={START_PATHS[user.role]} replace />;
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 480, margin: '64px auto', padding: '0 16px' }}>
      <h1>Çocuk Gelişim Platformu</h1>
      <p>Ebeveyn · Uzman · Çocuk</p>

      <h2>Giriş yap</h2>
      <p>Kayıtlı e-posta ve şifrenizle giriş yapın.</p>
      <form onSubmit={handleSubmit}>
        <label>
          E-posta
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={fieldStyle}
          />
        </label>
        <label>
          Şifre
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={fieldStyle}
          />
        </label>
        {loginError && (
          <p role="alert" style={{ color: '#b3261e' }}>
            {loginError}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          Giriş yap
        </button>
      </form>

      {!health && !healthFailed && <p>Sunucuya bağlanılıyor…</p>}
      {healthFailed && <p>Sunucuya ulaşılamadı. Sunucunun çalıştığından emin olun.</p>}
      {health && (
        <p data-testid="health">
          Sistem durumu: <strong>çalışıyor</strong> · Kayıtlı kullanıcı: {health.users}
        </p>
      )}
    </main>
  );
}
