import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from './api.js';
import { addDays, dayAndMonth, DAY_NAMES, mondayOf, weekLabel } from './dates.js';

const NO_ACCESS = 'Bu çocuğa erişim izniniz yok.';

const errorStyle = { color: '#b3261e' };
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

// The order of the API: by start, then by end, then in the order the events were added.
function byTime(a, b) {
  return a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime) || a.id - b.id;
}

// FR-M3-03: one child's events from Monday to Sunday. A parent or a specialist opens the child by its address
// (/children/:childId/schedule).
export default function WeeklySchedulePage() {
  const { childId } = useParams();
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [answer, setAnswer] = useState(null);
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
      </div>

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
    </>
  );
}
