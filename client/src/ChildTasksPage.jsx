import { useEffect, useState } from 'react';
import { api } from './api.js';
import PageLayout from './PageLayout.jsx';

export const STATUS_LABELS = { not_done: 'Yapılmadı', done: 'Yapıldı' };

export default function ChildTasksPage() {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api('/api/tasks')
      .then(setTasks)
      .catch(() => setError(true));
  }, []);

  return (
    <PageLayout title="Görevlerim">
      {!tasks && !error && <p>Görevler yükleniyor…</p>}
      {error && <p role="alert">Görevler yüklenemedi.</p>}
      {tasks && tasks.length === 0 && <p>Henüz görevin yok.</p>}
      {tasks && tasks.length > 0 && (
        <ul>
          {tasks.map((task) => (
            <li key={task.id} data-testid="task">
              {task.title} · {STATUS_LABELS[task.status]}
            </li>
          ))}
        </ul>
      )}
    </PageLayout>
  );
}
