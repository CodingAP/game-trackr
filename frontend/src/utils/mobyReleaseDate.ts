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
