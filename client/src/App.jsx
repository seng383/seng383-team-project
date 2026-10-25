import { useEffect, useState } from 'react';

// Walking skeleton screen: shows that the frontend can reach the API and the API can read the database.
// The real screens (login, dashboards) replace this in v0.1.
export default function App() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 480, margin: '64px auto', padding: '0 16px' }}>
      <h1>Çocuk Gelişim Platformu</h1>
      {!health && !error && <p>Sunucuya bağlanılıyor…</p>}
      {error && <p role="alert">Sunucuya ulaşılamadı. Sunucunun çalıştığından emin olun.</p>}
      {health && (
        <p data-testid="health">
          Sistem durumu: <strong>çalışıyor</strong> · Kayıtlı kullanıcı: {health.users}
        </p>
      )}
    </main>
  );
}
