import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from './api.js';
import { useAuth } from './AuthContext.jsx';
import { AREA_LABELS, STATUS_LABELS } from './ChildTasksPage.jsx';
import { fullDate } from './dates.js';

const NO_ACCESS = 'Bu çocuğa erişim izniniz yok.';
// The longest title and description the API takes.
const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 2000;
const EMPTY_TASK = { title: '', description: '', developmentArea: '', dueDate: '' };

const errorStyle = { color: '#b3261e' };
const primaryButtonStyle = { padding: 8, color: '#ffffff', background: '#3b6ea5', border: 'none', borderRadius: 4, fontWeight: 'bold' };
const formStyle = { padding: 16, background: '#f2f2f2', border: '1px solid #999999', borderRadius: 6 };
const fieldStyle = { display: 'block', width: '100%', boxSizing: 'border-box', padding: 8, marginTop: 4 };
const taskStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: 12,
  marginBottom: 8,
  background: '#ffffff',
  border: '1px solid #999999',
  borderRadius: 6,
};

// The order of the API: by due date, then in the order the tasks were added.
function byDueDate(a, b) {
  return a.dueDate.localeCompare(b.dueDate) || a.id - b.id;
}

// The rules of the API (FR-M4-02), checked here first so that a wrong task is not sent at all.
function findError({ title, developmentArea, dueDate }) {
  if (title.trim() === '') {
    return 'Başlık boş olamaz.';
  }
  if (developmentArea === '') {
    return 'Gelişim alanı seçilmelidir.';
  }
  if (dueDate === '') {
    return 'Son tarih boş olamaz.';
  }
  return null;
}

function saveError(status) {
  if (status === 400) {
    return 'Görev kaydedilemedi. Lütfen bilgileri kontrol edin.';
  }
  if (status === 403) {
    return NO_ACCESS;
  }
  return 'Görev kaydedilemedi. Lütfen tekrar deneyin.';
}

// FR-M4-01, FR-M4-02: the form of the mockup; a new task always starts as "not done".
function TaskForm({ childId, onSaved }) {
  const [values, setValues] = useState(EMPTY_TASK);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function field(name) {
    return { value: values[name], onChange: (event) => setValues({ ...values, [name]: event.target.value }), style: fieldStyle };
  }

  function reset() {
    setValues(EMPTY_TASK);
    setError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const problem = findError(values);
    setError(problem);
    if (problem) {
      return;
    }
    setSaving(true);
    try {
      const task = await api('/api/tasks', { method: 'POST', body: { childId, ...values } });
      reset();
      onSaved(task);
    } catch (err) {
      setError(saveError(err.status));
    }
    setSaving(false);
  }

  // noValidate: the browser's own messages would not be in Turkish, so the checks above give them.
  return (
    <form noValidate onSubmit={handleSubmit} style={formStyle}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Yeni görev</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12 }}>
        <label style={{ flex: '1 1 100%' }}>
          Başlık *
          <input type="text" maxLength={TITLE_MAX_LENGTH} {...field('title')} />
        </label>
        <label style={{ flex: '1 1 100%' }}>
          Açıklama
          <textarea rows={2} maxLength={DESCRIPTION_MAX_LENGTH} {...field('description')} />
        </label>
        <label style={{ flex: '1 1 160px' }}>
          Gelişim alanı *
          <select {...field('developmentArea')}>
            <option value="">Seçin</option>
            {Object.entries(AREA_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: '1 1 160px' }}>
          Son tarih *
          <input type="date" {...field('dueDate')} />
        </label>
      </div>
      <p style={{ fontSize: 12 }}>* Zorunlu alan. Eksikse görev kaydedilmez ve hata gösterilir.</p>
      {error && (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={reset}>
          Vazgeç
        </button>
        <button type="submit" disabled={saving} style={primaryButtonStyle}>
          Kaydet
        </button>
      </div>
    </form>
  );
}

// "Görevler" of one child for a parent or a linked specialist: the task form and, as FR-M4-05 asks, the
// current status of every task this user assigned to the child. The API checks the link on every request.
export default function TasksPage() {
  const { user } = useAuth();
  const { childId } = useParams();
  const [answer, setAnswer] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    // Only the latest request may fill the page, so a slow answer cannot bring back another child's tasks.
    let latest = true;
    api(`/api/tasks?childId=${childId}`)
      .then((tasks) => latest && setAnswer({ childId, tasks }))
      .catch((err) => latest && setAnswer({ childId, error: err.status === 403 ? NO_ACCESS : 'Görevler yüklenemedi.' }));
    return () => {
      latest = false;
    };
  }, [childId]);

  const loaded = answer?.childId === childId ? answer : null;
  const assigned = loaded?.tasks?.filter((task) => task.assignedBy === user.id);

  function handleSaved(task) {
    setNotice(`Görev kaydedildi: ${task.title}`);
    setAnswer((current) =>
      current?.childId === childId && current.tasks ? { ...current, tasks: [...current.tasks, task].sort(byDueDate) } : current
    );
  }

  return (
    <>
      <TaskForm childId={childId} onSaved={handleSaved} />
      {notice && <p role="status">{notice}</p>}

      <h2 style={{ fontSize: 16 }}>Atadığım görevler</h2>
      <p style={{ fontSize: 12 }}>Durum, çocuk görevi işaretleyince güncellenir.</p>
      {!loaded && <p>Görevler yükleniyor…</p>}
      {loaded?.error && (
        <p role="alert" style={errorStyle}>
          {loaded.error}
        </p>
      )}
      {assigned && assigned.length === 0 && <p>Bu çocuğa henüz görev atamadınız.</p>}
      {assigned && assigned.length > 0 && (
        <ul style={{ padding: 0, listStyle: 'none' }}>
          {assigned.map((task) => (
            <li key={task.id} data-testid="task" style={taskStyle}>
              <div>
                <strong>{task.title}</strong>
                <div style={{ fontSize: 13 }}>
                  {AREA_LABELS[task.developmentArea]} · {fullDate(task.dueDate)}
                </div>
              </div>
              <span data-testid="task-status">{STATUS_LABELS[task.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
