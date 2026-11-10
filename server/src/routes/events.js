const express = require('express');
const { requireRole } = require('../middleware/auth');
const { parseDate } = require('../dates');

const TITLE_MAX_LENGTH = 200;
// Two digits each, so that comparing two times as text compares them as times.
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const SELECT_EVENT =
  'SELECT e.id, e.child_id AS childId, e.title, e.event_date AS eventDate, e.start_time AS startTime, ' +
  'e.end_time AS endTime, e.created_by AS createdBy, u.name AS createdByName FROM events e JOIN users u ON u.id = e.created_by';

function isTime(value) {
  return typeof value === 'string' && TIME.test(value);
}

// The first rule the event breaks, or null (FR-M3-02).
function findError({ title, eventDate, startTime, endTime }) {
  if (typeof title !== 'string' || title.trim() === '') {
    return 'title is required';
  }
  if (title.trim().length > TITLE_MAX_LENGTH) {
    return `title must be at most ${TITLE_MAX_LENGTH} characters`;
  }
  if (!parseDate(eventDate)) {
    return 'eventDate must be a real date as YYYY-MM-DD';
  }
  if (!isTime(startTime) || !isTime(endTime)) {
    return 'startTime and endTime must be times from 00:00 to 23:59 as HH:MM';
  }
  // The SRS only rules out an end before the start, so equal times are allowed.
  if (endTime < startTime) {
    return 'endTime cannot be before startTime';
  }
  return null;
}

function eventsRoutes(db, requireAuth, requireChildAccess) {
  const router = express.Router({ mergeParams: true });
  const findEvent = db.prepare(`${SELECT_EVENT} WHERE e.id = ?`);
  const insertEvent = db.prepare(
    'INSERT INTO events (child_id, created_by, title, event_date, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)'
  );

  router.use(requireAuth, requireChildAccess);

  // The child comes from the address and the creator from the token, never from the body.
  router.post('/', requireRole('parent', 'specialist'), express.json(), (req, res) => {
    const event = req.body ?? {};
    const error = findError(event);
    if (error) {
      return res.status(400).json({ error });
    }

    const { lastInsertRowid } = insertEvent.run(
      Number(req.params.childId),
      req.user.id,
      event.title.trim(),
      event.eventDate,
      event.startTime,
      event.endTime
    );
    res.status(201).json(findEvent.get(lastInsertRowid));
  });

  return router;
}

module.exports = { eventsRoutes };
