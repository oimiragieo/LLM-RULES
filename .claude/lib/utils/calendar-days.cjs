'use strict';

const MS_PER_DAY = 86400000;
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function dateFromValue(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const match = DATE_KEY_RE.exec(value);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return new Date(NaN);
      }
      return date;
    }
  }
  return new Date(value);
}

function localDayOrdinal(value) {
  const date = dateFromValue(value);
  if (!Number.isFinite(date.getTime())) return NaN;
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY);
}

function calendarDaysBetween(start, end = new Date(Date.now())) {
  const startDay = localDayOrdinal(start);
  const endDay = localDayOrdinal(end);
  if (!Number.isFinite(startDay) || !Number.isFinite(endDay)) return NaN;
  return endDay - startDay;
}

function formatLocalDateKey(value = new Date(Date.now())) {
  const date = dateFromValue(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

module.exports = {
  calendarDaysBetween,
  formatLocalDateKey,
};
