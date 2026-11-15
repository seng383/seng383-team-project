// Calendar dates as 'YYYY-MM-DD', like the API. They are built from local date parts and never through
// toISOString, which is UTC: in Turkey (UTC+3) the first hours of a Monday are still Sunday in UTC.
export const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function pad(number) {
  return String(number).padStart(2, '0');
}

function toDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The Monday of the local week that `date` falls in; a week runs Monday to Sunday.
export function mondayOf(date) {
  return toIsoDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7)));
}

// Counts calendar days, so a clock change in between cannot move the result.
export function addDays(isoDate, days) {
  const date = toDate(isoDate);
  return toIsoDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

// "26 Ekim – 1 Kasım 2026"; the year comes twice only when the week runs into a new year.
export function weekLabel(monday) {
  const start = toDate(monday);
  const end = toDate(addDays(monday, 6));
  const startYear = start.getFullYear() === end.getFullYear() ? '' : ` ${start.getFullYear()}`;
  const from = `${start.getDate()} ${MONTH_NAMES[start.getMonth()]}${startYear}`;
  return `${from} – ${end.getDate()} ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`;
}

// "09.11", as under the day names of the mockup.
export function dayAndMonth(isoDate) {
  const [, month, day] = isoDate.split('-');
  return `${day}.${month}`;
}

// "09.11.2026".
export function fullDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}
