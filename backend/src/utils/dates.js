const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfUtcDay(date = new Date()) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function utcDateKey(date = new Date()) {
  const d = startOfUtcDay(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetweenUtc(a, b) {
  const start = startOfUtcDay(a);
  const end = startOfUtcDay(b);
  return Math.round((end - start) / MS_PER_DAY);
}

/**
 * ISO week key, e.g. 2026-W37
 */
function isoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / MS_PER_DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getPeriodKey(recurrence, date = new Date()) {
  if (recurrence === 'daily') return utcDateKey(date);
  if (recurrence === 'weekly') return isoWeekKey(date);
  return 'once';
}

function endOfUtcDay(date = new Date()) {
  return new Date(startOfUtcDay(date).getTime() + MS_PER_DAY);
}

module.exports = {
  MS_PER_DAY,
  startOfUtcDay,
  utcDateKey,
  daysBetweenUtc,
  isoWeekKey,
  getPeriodKey,
  endOfUtcDay
};
