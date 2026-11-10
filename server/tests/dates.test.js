const { addDays, parseDate } = require('../src/dates');

describe('parseDate', () => {
  test.each(['2026-10-26', '2026-12-31', '2028-02-29', '2027-01-01'])('reads the real date %s', (text) => {
    const date = parseDate(text);

    expect(date.toISOString()).toBe(`${text}T00:00:00.000Z`);
  });

  test.each([
    '2026-02-30',
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-10-00',
    '0099-01-01',
    '26.10.2026',
    '2026-10-7',
    '2026-10-26T00:00',
    ' 2026-10-26',
    '',
    undefined,
    null,
    20261026,
    ['2026-10-26'],
  ])('gives null for %j', (text) => {
    expect(parseDate(text)).toBeNull();
  });
});

describe('addDays', () => {
  test.each([
    ['2026-10-26', 6, '2026-11-01'],
    ['2026-12-28', 6, '2027-01-03'],
    ['2028-02-26', 3, '2028-02-29'],
    ['2026-03-23', 7, '2026-03-30'],
    ['2026-11-02', -7, '2026-10-26'],
    ['2026-10-26', 0, '2026-10-26'],
  ])('%s plus %i days is %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});
