// Calendar dates travel as 'YYYY-MM-DD' text. The Date objects here stand for midnight UTC,
// where every day has 24 hours, so the date arithmetic never trips over a clock change.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

// Null unless the text is a real date: Date.UTC turns 2026-02-30 into 2026-03-02, which reads back differently.
function parseDate(text) {
  if (typeof text !== 'string' || !ISO_DATE.test(text)) {
    return null;
  }
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return formatDate(date) === text ? date : null;
}

module.exports = { parseDate };
