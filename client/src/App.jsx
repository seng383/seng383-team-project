import { useEffect, useState } from 'react';

const STATUS_LABELS = { not_done: 'Yapılmadı', done: 'Yapıldı' };

// Walking skeleton screen: shows that the frontend can reach the API and the API can read the database.
// The real screens (login, dashboards) replace this in v0.1.
export default function App() {
  const [health, setHealth] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(setHealth)
      .catch(() => setError(true));
    fetch('/api/tasks')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(setTasks)
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
      {!tasks && !error && <p>Görevler yükleniyor…</p>}
      {tasks && (
        <>
          <h2>Görevler</h2>
          <ul>
            {tasks.map((task) => (
              <li key={task.id} data-testid="task">
                {task.title} · {STATUS_LABELS[task.status]}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
