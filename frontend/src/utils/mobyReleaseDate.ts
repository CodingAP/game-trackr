import type { MobyGamesGameInfo } from '../types/index.js';

export function parseReleaseDateSortKey(date: string | null): number {
  if (!date) return Number.MAX_SAFE_INTEGER;

  const parts = date.trim().split('-');
  const year = Number(parts[0]);
  if (!Number.isFinite(year)) return Number.MAX_SAFE_INTEGER;

  const month = parts.length > 1 ? Number(parts[1]) : 1;
  const safeMonth = Number.isFinite(month) ? month : 1;

  return year * 100 + safeMonth;
}

export function getEarliestReleaseSortKey(info: MobyGamesGameInfo | null | undefined): number {
  if (!info || info.platforms.length === 0) return Number.MAX_SAFE_INTEGER;

  return info.platforms.reduce(
    (earliest, platform) => Math.min(earliest, parseReleaseDateSortKey(platform.releaseDate)),
    Number.MAX_SAFE_INTEGER,
  );
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function formatReleaseDateLabel(date: string | null | undefined): string | null {
  if (!date?.trim()) return null;

  const parts = date.trim().split('-');
  const year = parts[0]?.trim();
  if (!year) return null;

  const month = parts.length > 1 ? Number(parts[1]) : NaN;
  if (Number.isFinite(month) && month >= 1 && month <= 12) {
    return `${MONTH_LABELS[month - 1]} ${year}`;
  }

  return year;
}

export function getEarliestReleaseLabel(info: MobyGamesGameInfo | null | undefined): string | null {
  if (!info || info.platforms.length === 0) return null;

  let earliestDate: string | null = null;
  let earliestKey = Number.MAX_SAFE_INTEGER;

  for (const platform of info.platforms) {
    const key = parseReleaseDateSortKey(platform.releaseDate);
    if (key < earliestKey) {
      earliestKey = key;
      earliestDate = platform.releaseDate;
    }
  }

  return formatReleaseDateLabel(earliestDate);
}
