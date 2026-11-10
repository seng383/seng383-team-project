import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { addDays, dayAndMonth, mondayOf, weekLabel } from './dates.js';

// Runs in Turkish time whatever the machine uses (CI runs in UTC), so a slip to UTC would show here.
const machineTimeZone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'Europe/Istanbul';
});

afterAll(() => {
  if (machineTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = machineTimeZone;
  }
});

describe('mondayOf', () => {
  // The table holds date parts, not dates: it is read before beforeAll runs, so a date made there
  // would be that local time in the machine's own zone.
  test.each([
    ['Monday 00:00', [2026, 9, 26, 0, 0], '2026-10-26'],
    ['Wednesday noon', [2026, 9, 28, 12, 0], '2026-10-26'],
    ['Sunday 23:59', [2026, 10, 1, 23, 59], '2026-10-26'],
    ['the next Monday 00:30, still Sunday in UTC', [2026, 10, 2, 0, 30], '2026-11-02'],
    ['New Year in a week that starts in December', [2027, 0, 1, 9, 0], '2026-12-28'],
  ])('gives the Monday of the local week for %s', (_, parts, monday) => {
    expect(mondayOf(new Date(...parts))).toBe(monday);
  });

  test('runs in a zone ahead of UTC, where the UTC date of Monday 00:30 is still Sunday', () => {
    expect(new Date(2026, 10, 2, 0, 30).toISOString().slice(0, 10)).toBe('2026-11-01');
  });
});

describe('addDays', () => {
  test.each([
    ['2026-10-26', 6, '2026-11-01'],
    ['2026-12-28', 6, '2027-01-03'],
    ['2028-02-26', 3, '2028-02-29'],
    ['2026-11-02', -7, '2026-10-26'],
  ])('%s plus %i days is %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });

  test('is not moved by a clock change, here the end of summer time in Germany on 25 October 2026', () => {
    process.env.TZ = 'Europe/Berlin';
    try {
      expect(addDays('2026-10-19', 7)).toBe('2026-10-26');
      expect(addDays('2026-10-26', -7)).toBe('2026-10-19');
    } finally {
      process.env.TZ = 'Europe/Istanbul';
    }
  });
});

describe('weekLabel', () => {
  test.each([
    ['2026-10-26', '26 Ekim – 1 Kasım 2026'],
    ['2026-11-09', '9 Kasım – 15 Kasım 2026'],
    ['2026-12-28', '28 Aralık 2026 – 3 Ocak 2027'],
  ])('names the week of %s as %s', (monday, label) => {
    expect(weekLabel(monday)).toBe(label);
  });
});

test('dayAndMonth writes a date as under the day names', () => {
  expect(dayAndMonth('2026-11-01')).toBe('01.11');
});
