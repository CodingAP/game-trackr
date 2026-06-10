import type { ProgressBar } from '../types/index.js';
import { slugifyProgressBarId } from './completionProgress.js';

export function findProgressBarByName(
  bars: ProgressBar[],
  name: string,
): ProgressBar | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return undefined;
  return bars.find((bar) => bar.name.trim().toLowerCase() === normalized);
}

export function createProgressBarFromName(name: string, bars: ProgressBar[]): ProgressBar {
  return {
    id: slugifyProgressBarId(name, new Set(bars.map((bar) => bar.id))),
    name: name.trim(),
    showInSummary: false,
  };
}

export interface UpsertProgressBarCallbacks {
  onRegister?: (bar: ProgressBar) => void;
  onUpdate?: (id: string, updates: { name: string }) => void;
}

export function upsertProgressBarByName(
  name: string,
  bars: ProgressBar[],
  linkedId: string | null | undefined,
  callbacks: UpsertProgressBarCallbacks = {},
): ProgressBar | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const existing = findProgressBarByName(bars, trimmed);
  if (existing) {
    if (existing.name.trim() !== trimmed) {
      callbacks.onUpdate?.(existing.id, { name: trimmed });
      return { ...existing, name: trimmed };
    }
    return existing;
  }

  if (linkedId) {
    callbacks.onUpdate?.(linkedId, { name: trimmed });
    return { id: linkedId, name: trimmed, showInSummary: false };
  }

  const bar = createProgressBarFromName(trimmed, bars);
  callbacks.onRegister?.(bar);
  return bar;
}
