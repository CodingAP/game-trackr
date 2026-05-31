export const PLAYTIME_INTERVAL_MINUTES = 15;
export const MAX_PLAYTIME_MINUTES = 12 * 60;

export function formatPlaytimeDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function formatPlaytimeTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function defaultDatetimeLocalValue(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function buildPlaytimeDurationOptions(): Array<{ value: number; label: string }> {
  const options: Array<{ value: number; label: string }> = [];
  for (
    let minutes = PLAYTIME_INTERVAL_MINUTES;
    minutes <= MAX_PLAYTIME_MINUTES;
    minutes += PLAYTIME_INTERVAL_MINUTES
  ) {
    options.push({
      value: minutes,
      label: formatPlaytimeDuration(minutes),
    });
  }
  return options;
}
