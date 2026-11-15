import { useEffect, useState } from 'react';
import { api } from './api.js';
import ChildNav from './ChildNav.jsx';
import { dayMonthAndName } from './dates.js';
import PageLayout from './PageLayout.jsx';

export const STATUS_LABELS = { not_done: 'Yapılmadı', done: 'Yapıldı' };
// The development areas of FR-M4-01, in the order of the task form.
export const AREA_LABELS = {
  language: 'Dil',
  motor_skills: 'Motor beceriler',
  social_emotional: 'Sosyal-duygusal',
  cognitive: 'Bilişsel',
  self_care: 'Öz bakım',
};

const errorStyle = { color: '#b3261e' };
const taskStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 12,
  padding: 12,
  marginBottom: 8,
  background: '#f2f2f2',
  border: '1px solid #999999',
  borderRadius: 6,
};
const doneButtonStyle = { padding: 8, color: '#ffffff', background: '#3b6ea5', border: 'none', borderRadius: 4, fontWeight: 'bold' };

// FR-M4-03: the child's own tasks; a task that is not done yet has a button that marks it done.
// The API decides whose tasks these are and refuses a task of another child (FR-M4-04).
export default function ChildTasksPage() {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    api('/api/tasks')
      .then(setTasks)
      .catch(() => setError(true));
  }, []);

  async function markDone(id) {
    setSaveError(null);
    setSavingId(id);
    try {
      const updated = await api(`/api/tasks/${id}`, { method: 'PATCH', body: { status: 'done' } });
      setTasks((current) => current.map((task) => (task.id === id ? updated : task)));
    } catch {
      setSaveError('Görev güncellenemedi. Lütfen tekrar deneyin.');
    }
    setSavingId(null);
  }

  return (
    <PageLayout title="Görevlerim">
      <ChildNav />
      {!tasks && !error && <p>Görevler yükleniyor…</p>}
      {error && <p role="alert">Görevler yüklenemedi.</p>}
      {saveError && (
        <p role="alert" style={errorStyle}>
          {saveError}
        </p>
      )}
      {tasks && tasks.length === 0 && <p>Henüz görevin yok.</p>}
      {tasks && tasks.length > 0 && (
        <ul style={{ padding: 0, listStyle: 'none' }}>
          {tasks.map((task) => (
            <li key={task.id} data-testid="task" style={taskStyle}>
              <div style={{ flex: 1 }}>
                <strong>{task.title}</strong> · {STATUS_LABELS[task.status]}
                <div style={{ fontSize: 13 }}>
                  {AREA_LABELS[task.developmentArea]} · Son gün: {dayMonthAndName(task.dueDate)}
                </div>
              </div>
              {task.status === 'not_done' && (
                <button
                  type="button"
                  disabled={savingId !== null}
                  onClick={() => markDone(task.id)}
                  style={doneButtonStyle}
                >
                  Yapıldı olarak işaretle
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </PageLayout>
  );
}
