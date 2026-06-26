import type {
  ManagedCheckbox,
  ProgressBar,
  RetroAchievement,
  RetroAchievementsGameInfo,
} from '../types/index.js';
import type { CheckboxItem } from './checkboxes.js';
import {
  buildCheckboxIndex,
  isCheckboxComplete,
} from './checkboxes.js';

/** Stable id of the progress bar that aggregates achievement completion. */
export const RA_PROGRESS_BAR_ID = 'achievements';
export const RA_PROGRESS_BAR_NAME = 'Achievements';
const RA_CHECKBOX_PREFIX = 'ra-';
const BADGE_BASE = 'https://media.retroachievements.org/Badge';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function achievementCheckboxId(achievementId: number): string {
  return `${RA_CHECKBOX_PREFIX}${achievementId}`;
}

export function isAchievementCheckboxId(id: string): boolean {
  return id.startsWith(RA_CHECKBOX_PREFIX);
}

export function achievementBadgeUrl(badgeName: string, locked = false): string {
  if (!badgeName) return '';
  return `${BADGE_BASE}/${badgeName}${locked ? '_lock' : ''}.png`;
}

/** Single checkbox label: title and description together for journal embeds. */
export function formatAchievementLabel(achievement: RetroAchievement): string {
  const title = achievement.title.trim() || `Achievement ${achievement.id}`;
  const description = achievement.description.trim();
  if (!description || description === title) return title;
  return `${title} — ${description}`;
}

/**
 * Achievements are modeled as top-level managed checkboxes tagged with the
 * shared "Achievements" progress bar. They are excluded from overall completion
 * so they only count toward their own progress bar, but can still be embedded
 * in the journal via `[[cb:ra-<id>]]` markers.
 */
export function buildAchievementCheckbox(achievement: RetroAchievement): ManagedCheckbox {
  return {
    id: achievementCheckboxId(achievement.id),
    label: formatAchievementLabel(achievement),
    parentId: null,
    tagIds: [RA_PROGRESS_BAR_ID],
    excludeFromCompletion: true,
  };
}

export function buildAchievementCheckboxes(info: RetroAchievementsGameInfo): ManagedCheckbox[] {
  return info.achievements.map(buildAchievementCheckbox);
}

export function buildAchievementsProgressBar(): ProgressBar {
  return { id: RA_PROGRESS_BAR_ID, name: RA_PROGRESS_BAR_NAME, showInSummary: true };
}

/**
 * Ensures the in-memory checkbox + progress bar collections include the
 * achievement-derived entries. Used by the viewer so the Achievements section
 * and its progress bar work even if the editor has not persisted them yet.
 */
export function mergeRetroAchievements(
  managed: ManagedCheckbox[],
  bars: ProgressBar[],
  info: RetroAchievementsGameInfo,
): { managed: ManagedCheckbox[]; bars: ProgressBar[] } {
  const existingIds = new Set(managed.map((checkbox) => checkbox.id));
  const mergedManaged = [...managed];

  for (const achievement of info.achievements) {
    const id = achievementCheckboxId(achievement.id);
    const next = buildAchievementCheckbox(achievement);
    const existing = mergedManaged.find((checkbox) => checkbox.id === id);
    if (existing) {
      existing.label = next.label;
      continue;
    }
    mergedManaged.push(next);
    existingIds.add(id);
  }

  const mergedBars = bars.some((bar) => bar.id === RA_PROGRESS_BAR_ID)
    ? bars
    : [...bars, buildAchievementsProgressBar()];

  return { managed: mergedManaged, bars: mergedBars };
}

function renderAchievementRow(
  achievement: RetroAchievement,
  checkedItems: Record<string, boolean>,
): string {
  const id = achievementCheckboxId(achievement.id);
  const checked = checkedItems[id] ?? false;
  const stateClass = checked ? 'is-checked' : 'is-unchecked';
  const badge = achievementBadgeUrl(achievement.badgeName);
  const pointsLabel = achievement.points > 0 ? `${achievement.points} pts` : '';
  const label = formatAchievementLabel(achievement);

  return `
    <li class="achievement-row managed-checkbox ${stateClass}" data-cb-id="${escapeHtml(id)}" data-cb-depth="0">
      <label class="achievement-row-label">
        <input type="checkbox" data-cb-id="${escapeHtml(id)}" ${checked ? 'checked' : ''} disabled />
        ${
          badge
            ? `<img class="achievement-badge" src="${escapeHtml(badge)}" alt="" width="48" height="48" loading="lazy" onerror="this.style.visibility='hidden'" />`
            : '<span class="achievement-badge achievement-badge-placeholder" aria-hidden="true"></span>'
        }
        <span class="achievement-text">
          <span class="managed-checkbox-text achievement-label">${escapeHtml(label)}</span>
          ${pointsLabel ? `<span class="achievement-points">${escapeHtml(pointsLabel)}</span>` : ''}
        </span>
      </label>
    </li>
  `;
}

/** Renders just the achievement rows (rebuilt on each page render). */
export function renderAchievementRows(
  info: RetroAchievementsGameInfo,
  checkedItems: Record<string, boolean>,
): string {
  if (info.achievements.length === 0) {
    return '<li class="achievement-empty text-faint text-sm">No achievements found for this game.</li>';
  }
  return info.achievements
    .map((achievement) => renderAchievementRow(achievement, checkedItems))
    .join('');
}

export function countEarnedAchievements(
  info: RetroAchievementsGameInfo,
  checkboxes: CheckboxItem[],
  checkedItems: Record<string, boolean>,
): { completed: number; total: number } {
  const index = buildCheckboxIndex(checkboxes);
  const total = info.achievements.length;
  const completed = info.achievements.filter((achievement) =>
    isCheckboxComplete(achievementCheckboxId(achievement.id), index, checkedItems),
  ).length;
  return { completed, total };
}
