import { formatNumber as formatLocalNumber, t } from '@/i18n';

export function formatNumber(value: number): string {
  return formatLocalNumber(value);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Durée lisible : « 45 s », « 3 min 05 s », « 1 h 20 », « 7 j » (unités selon la langue). */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.ceil(totalSec));
  if (sec < 60) return t('duration.s', { s: String(sec) });
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  if (minutes < 60) {
    return seconds
      ? t('duration.ms', { m: String(minutes), s: pad(seconds) })
      : t('duration.m', { m: String(minutes) });
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours >= 48 && rest === 0 && hours % 24 === 0) return t('duration.d', { d: String(hours / 24) });
  return rest ? t('duration.hm', { h: String(hours), m: pad(rest) }) : t('duration.h', { h: String(hours) });
}

/** Compte à rebours compact : « 1:05 », « 12:30 », « 2:05:10 ». */
export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.ceil(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
