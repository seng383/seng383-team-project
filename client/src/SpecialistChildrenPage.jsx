import { useEffect, useState } from 'react';
import { api } from './api.js';
import Avatar from './Avatar.jsx';
import { STATUS_LABELS } from './ChildTasksPage.jsx';
import PageLayout from './PageLayout.jsx';

const rowStyle = { padding: 16, marginBottom: 12, background: '#f2f2f2', border: '1px solid #999999', borderRadius: 6 };
const viewButtonStyle = { padding: 8, color: '#ffffff', background: '#3b6ea5', border: 'none', borderRadius: 4, fontWeight: 'bold' };
const errorStyle = { color: '#b3261e' };

// SQLite keeps the time in UTC as "YYYY-MM-DD HH:MM:SS".
function formatDate(sqliteDate) {
  return new Date(`${sqliteDate.replace(' ', 'T')}Z`).toLocaleDateString('tr-TR');
}

function ChildRow({ child, onDenied }) {
  const [tasks, setTasks] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);

  async function handleView() {
    setLoadFailed(false);
    try {
      setTasks(await api(`/api/tasks?childId=${child.id}`));
    } catch (err) {
      if (err.status === 403) {
        onDenied(child.id);
      } else {
        setLoadFailed(true);
      }
    }
  }

  return (
    <li data-testid="child" style={rowStyle}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <Avatar name={child.name} />
        <div style={{ flex: 1 }}>
          <strong>{child.name}</strong>
          <div style={{ fontSize: 13 }}>
            Ebeveyn: {child.parentName} · Bağlantı tarihi: {formatDate(child.linkedAt)}
          </div>
        </div>
        <button type="button" onClick={handleView} style={viewButtonStyle}>
          Görüntüle
        </button>
      </div>
      {loadFailed && (
        <p role="alert" style={errorStyle}>
          Görevler yüklenemedi.
        </p>
      )}
      {tasks && tasks.length === 0 && <p>Bu çocuğun henüz görevi yok.</p>}
      {tasks && tasks.length > 0 && (
        <ul>
          {tasks.map((task) => (
            <li key={task.id} data-testid="task">
              {task.title} · {STATUS_LABELS[task.status]}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// Start screen of the specialist. The list is as old as the page, so a 403 means the link has ended since.
export default function SpecialistChildrenPage() {
  const [children, setChildren] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    api('/api/children')
      .then(setChildren)
      .catch(() => setLoadFailed(true));
  }, []);

  function handleDenied(childId) {
    setDenied(true);
    setChildren((list) => list.filter((child) => child.id !== childId));
  }

  return (
    <PageLayout title="Çocuklarım">
      <p>Yalnızca şu anda bağlı olduğunuz çocuklar listelenir.</p>
      {denied && (
        <p role="alert" style={errorStyle}>
          Bu çocuğa erişim izniniz yok.
        </p>
      )}
      {!children && !loadFailed && <p>Çocuklar yükleniyor…</p>}
      {loadFailed && (
        <p role="alert" style={errorStyle}>
          Çocuklar yüklenemedi.
        </p>
      )}
      {children && children.length === 0 && <p>Şu anda bağlı olduğunuz bir çocuk yok.</p>}
      {children && children.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {children.map((child) => (
            <ChildRow key={child.id} child={child} onDenied={handleDenied} />
          ))}
        </ul>
      )}
    </PageLayout>
  );
}
