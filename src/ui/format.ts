const numberFormat = new Intl.NumberFormat('fr-FR');

export function formatNumber(value: number): string {
  return numberFormat.format(Math.floor(value));
}

/** Durée lisible : « 45 s », « 3 min 05 s », « 1 h 20 ». */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.ceil(totalSec));
  if (sec < 60) return `${sec} s`;
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  if (minutes < 60) return seconds ? `${minutes} min ${String(seconds).padStart(2, '0')} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`;
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
