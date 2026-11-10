import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from './api.js';
import { useAuth } from './AuthContext.jsx';
import ChildNav from './ChildNav.jsx';
import { addDays, dayAndMonth, DAY_NAMES, fullDate, mondayOf, weekLabel } from './dates.js';
import PageLayout from './PageLayout.jsx';

const NO_ACCESS = 'Bu çocuğa erişim izniniz yok.';
// The longest title the API takes.
const TITLE_MAX_LENGTH = 200;
const EMPTY_EVENT = { title: '', eventDate: '', startTime: '', endTime: '' };

const errorStyle = { color: '#b3261e' };
const primaryButtonStyle = { padding: 8, color: '#ffffff', background: '#3b6ea5', border: 'none', borderRadius: 4, fontWeight: 'bold' };
const weekButtonStyle = { width: 36, height: 36, background: '#ffffff', border: '1px solid #999999', borderRadius: 4, fontSize: 18 };
// Seven columns on a wide screen; on a phone the days wrap into rows.
const weekStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
  gap: 4,
  padding: 0,
  listStyle: 'none',
};
const dayStyle = { minHeight: 120, background: '#ffffff', border: '1px solid #999999' };
const dayHeaderStyle = { padding: 8, background: '#f2f2f2', borderBottom: '1px solid #999999' };
const eventStyle = {
  padding: 6,
  margin: 4,
  background: '#f2f2f2',
  border: '1px solid #999999',
  borderRadius: 4,
  fontSize: 13,
  overflowWrap: 'anywhere',
};
const formStyle = { padding: 16, marginTop: 16, background: '#f2f2f2', border: '1px solid #999999', borderRadius: 6 };
const fieldStyle = { display: 'block', width: '100%', boxSizing: 'border-box', padding: 8, marginTop: 4 };

// The order of the API: by start, then by end, then in the order the events were added.
function byTime(a, b) {
  return a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime) || a.id - b.id;
}

// The rules of the API (FR-M3-02), checked here first so that a wrong event is not sent at all.
function findError({ title, eventDate, startTime, endTime }) {
  if (title.trim() === '') {
    return 'Başlık boş olamaz.';
  }
  if (eventDate === '') {
    return 'Tarih boş olamaz.';
  }
  if (startTime === '' || endTime === '') {
    return 'Başlangıç ve bitiş saati boş olamaz.';
  }
  // Both are "HH:MM", so the texts compare like the times. Equal times are allowed, as by the API.
  if (endTime < startTime) {
    return 'Bitiş saati başlangıç saatinden önce olamaz.';
  }
  return null;
}

function saveError(status) {
  if (status === 400) {
    return 'Etkinlik kaydedilemedi. Lütfen bilgileri kontrol edin.';
  }
  if (status === 403) {
    return NO_ACCESS;
  }
  return 'Etkinlik kaydedilemedi. Lütfen tekrar deneyin.';
}

function EventForm({ childId, onSaved, onCancel }) {
  const [values, setValues] = useState(EMPTY_EVENT);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function field(name) {
    return { value: values[name], onChange: (event) => setValues({ ...values, [name]: event.target.value }), style: fieldStyle };
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
      onSaved(await api(`/api/children/${childId}/events`, { method: 'POST', body: values }));
    } catch (err) {
      setError(saveError(err.status));
      setSaving(false);
    }
  }

  // noValidate: the browser's own messages would not be in Turkish, so the checks above give them.
  return (
    <form noValidate onSubmit={handleSubmit} style={formStyle}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Yeni etkinlik</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12 }}>
        <label style={{ flex: '2 1 200px' }}>
          Başlık
          <input type="text" maxLength={TITLE_MAX_LENGTH} {...field('title')} />
        </label>
        <label style={{ flex: '1 1 130px' }}>
          Tarih
          <input type="date" {...field('eventDate')} />
        </label>
        <label style={{ flex: '1 1 90px' }}>
          Başlangıç
          <input type="time" {...field('startTime')} />
        </label>
        <label style={{ flex: '1 1 90px' }}>
          Bitiş
          <input type="time" {...field('endTime')} />
        </label>
      </div>
      {error && (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button type="button" onClick={onCancel}>
          Vazgeç
        </button>
        <button type="submit" disabled={saving} style={primaryButtonStyle}>
          Kaydet
        </button>
      </div>
    </form>
  );
}

// FR-M3-03, FR-M3-04: one child's events from Monday to Sunday. A parent or a specialist opens the child by its
// address (/children/:childId/schedule); a child has no id there and always sees their own schedule, without the
// add form. The API refuses a child's event anyway.
export default function WeeklySchedulePage() {
  const { user } = useAuth();
  const { childId = user.id } = useParams();
  const canAdd = user.role !== 'child';
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [answer, setAnswer] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const path = `/api/children/${childId}/events?week=${monday}`;

  useEffect(() => {
    // Only the latest request may fill the page, so a slow answer cannot bring back an earlier week.
    let latest = true;
    api(path)
      .then((events) => latest && setAnswer({ path, events }))
      .catch((err) => latest && setAnswer({ path, error: err.status === 403 ? NO_ACCESS : 'Etkinlikler yüklenemedi.' }));
    return () => {
      latest = false;
    };
  }, [path]);

  // The answer for the week shown before stays in state until the next one arrives, but it is not shown.
  const week = answer?.path === path ? answer : null;

  function openForm() {
    setNotice(null);
    setFormOpen(true);
  }

  function handleSaved(event) {
    setFormOpen(false);
    setNotice(`Etkinlik kaydedildi: ${fullDate(event.eventDate)}, ${event.startTime}–${event.endTime}.`);
    // An event of the week on the screen joins it at once; another week gets it from the API when it is opened.
    if (event.eventDate >= monday && event.eventDate <= addDays(monday, 6)) {
      setAnswer((current) =>
        current?.path === path && current.events ? { ...current, events: [...current.events, event] } : current
      );
    }
  }

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            aria-label="Önceki hafta"
            onClick={() => setMonday(addDays(monday, -7))}
            style={weekButtonStyle}
          >
            ‹
          </button>
          <h2 style={{ minWidth: 200, margin: 0, fontSize: 16, textAlign: 'center' }}>{weekLabel(monday)}</h2>
          <button
            type="button"
            aria-label="Sonraki hafta"
            onClick={() => setMonday(addDays(monday, 7))}
            style={weekButtonStyle}
          >
            ›
          </button>
        </div>
        {canAdd && (
          <button type="button" onClick={openForm} style={primaryButtonStyle}>
            Etkinlik ekle
          </button>
        )}
      </div>

      {notice && <p role="status">{notice}</p>}
      {!week && <p>Etkinlikler yükleniyor…</p>}
      {week?.error && (
        <p role="alert" style={errorStyle}>
          {week.error}
        </p>
      )}
      {week?.events && week.events.length === 0 && <p>Bu hafta etkinlik yok.</p>}
      {week?.events && (
        <ol style={weekStyle}>
          {DAY_NAMES.map((name, index) => {
            const date = addDays(monday, index);
            const events = week.events.filter((event) => event.eventDate === date).sort(byTime);
            return (
              <li key={date} data-testid="day" style={dayStyle}>
                <div style={dayHeaderStyle}>
                  <h3 style={{ margin: 0, fontSize: 13 }}>{name}</h3>
                  <span style={{ fontSize: 12 }}>{dayAndMonth(date)}</span>
                </div>
                {events.length > 0 && (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {events.map((event) => (
                      <li key={event.id} data-testid="event" style={eventStyle}>
                        <strong style={{ display: 'block', fontSize: 12 }}>
                          {event.startTime}–{event.endTime}
                        </strong>{' '}
                        {event.title}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {formOpen && <EventForm childId={childId} onSaved={handleSaved} onCancel={() => setFormOpen(false)} />}
    </>
  );
}

// "Takvimim": the child's own week, in the same view without the add form (FR-M3-04).
export function ChildSchedulePage() {
  return (
    <PageLayout title="Takvimim">
      <ChildNav />
      <WeeklySchedulePage />
    </PageLayout>
  );
}
