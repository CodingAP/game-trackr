import type { ManagedCheckbox, ProgressBar } from '../types/index.js';
import type { CheckboxItem } from './checkboxes.js';
import {
  buildCheckboxIndex,
  getProgressCheckboxes,
  isCheckboxComplete,
} from './checkboxes.js';
import {
  getTagCheckboxIds,
  managedToCheckboxItems,
  slugifyCheckboxId,
} from './managedCheckboxes.js';
import { renderCollapsiblePanel } from '../components/CollapsiblePanel.js';
import { renderPlaytimeSectionHtml } from '../components/PlaytimePanel.js';
import { getPlaytime } from '../storage/playtime.js';

export interface ProgressStats {
  completed: number;
  total: number;
  percent: number;
}

export const TAG_PROGRESS_MARKER = /\[\[(?:pb|tag-progress):([^\]]+)\]\]/g;

export function slugifyProgressBarId(label: string, existing: Set<string>): string {
  return slugifyCheckboxId(label.trim() || 'progress bar', existing);
}

export function replaceProgressMarkerReference(
  content: string,
  oldRef: string,
  newRef: string,
): string {
  if (oldRef === newRef) return content;
  return content.replace(TAG_PROGRESS_MARKER, (match, ref: string) => {
    if (ref.trim() !== oldRef) return match;
    return `[[pb:${newRef}]]`;
  });
}

export function resolveProgressBar(
  bars: ProgressBar[],
  reference: string,
): ProgressBar | undefined {
  const trimmed = reference.trim();
  return (
    bars.find((bar) => bar.id === trimmed) ??
    bars.find((bar) => bar.name.toLowerCase() === trimmed.toLowerCase())
  );
}

export function computeTagProgress(
  tag: ProgressBar,
  checkedItems: Record<string, boolean>,
  checkboxes: CheckboxItem[],
  managed?: ManagedCheckbox[],
): ProgressStats {
  const index = buildCheckboxIndex(checkboxes);
  const checkboxIds = managed
    ? getTagCheckboxIds(tag.id, managed)
    : (tag.checkboxIds ?? []);
  const total = checkboxIds.length;
  const completed = checkboxIds.filter((id) =>
    isCheckboxComplete(id, index, checkedItems),
  ).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}

export function computeOverallProgress(
  checkboxes: CheckboxItem[],
  checkedItems: Record<string, boolean>,
): ProgressStats {
  const index = buildCheckboxIndex(checkboxes);
  const progressItems = getProgressCheckboxes(checkboxes);
  const total = progressItems.length;
  const completed = progressItems.filter((item) =>
    isCheckboxComplete(item.id, index, checkedItems),
  ).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderProgressBarHtml(
  label: string,
  stats: ProgressStats,
  options: { tagId?: string; compact?: boolean } = {},
): string {
  const classes = ['progress-bar-block'];
  if (options.compact) classes.push('is-compact');

  return `
    <div class="${classes.join(' ')}"${options.tagId ? ` data-tag-id="${escapeHtml(options.tagId)}"` : ''}>
      <div class="progress-bar-header">
        <span class="progress-bar-label">${escapeHtml(label)}</span>
        <span class="progress-bar-stats">${stats.completed} / ${stats.total} (${stats.percent}%)</span>
      </div>
      <div
        class="progress-bar-track"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="${stats.percent}"
        aria-label="${escapeHtml(label)}"
      >
        <div class="progress-bar-fill" style="width: ${stats.percent}%"></div>
      </div>
    </div>
  `;
}

export function renderCompletionSummaryHtml(
  gameSlug: string,
  bars: ProgressBar[],
  checkboxes: CheckboxItem[],
  checkedItems: Record<string, boolean>,
  managed?: ManagedCheckbox[],
): string {
  const overall = computeOverallProgress(checkboxes, checkedItems);
  const summaryBars = bars.filter((bar) => bar.showInSummary && bar.name.trim());
  const progressCheckboxes = getProgressCheckboxes(checkboxes);

  const summaryBarHtml = summaryBars
    .map((bar) => {
      const stats = computeTagProgress(bar, checkedItems, checkboxes, managed);
      return renderProgressBarHtml(bar.name, stats, { tagId: bar.id, compact: true });
    })
    .join('');

  const body = `
    ${
      progressCheckboxes.length > 0
        ? `
          <div class="completion-summary-overall" data-progress-scope="overall">
            ${renderProgressBarHtml('Overall completion', overall)}
          </div>
        `
        : ''
    }
    ${
      summaryBars.length > 0
        ? `<div class="completion-summary-tags">${summaryBarHtml}</div>`
        : ''
    }
    ${renderPlaytimeSectionHtml(getPlaytime(gameSlug).entries)}
  `;

  return renderCollapsiblePanel({
    id: 'completion-summary',
    title: 'Progress',
    className: 'completion-summary',
    content: body,
  });
}

export function preprocessTagProgressMarkdown(content: string): string {
  return content.replace(TAG_PROGRESS_MARKER, (_match, reference: string) => {
    const encoded = encodeURIComponent(reference.trim());
    return `<div class="tag-progress" data-tag-ref="${encoded}"></div>`;
  });
}

export function mountTagProgressBlocks(
  container: HTMLElement,
  bars: ProgressBar[],
  checkboxes: CheckboxItem[],
  checkedItems: Record<string, boolean>,
  managed?: ManagedCheckbox[],
): void {
  container.querySelectorAll('.tag-progress[data-tag-ref]').forEach((element) => {
    const ref = decodeURIComponent(element.getAttribute('data-tag-ref') ?? '');
    const bar = resolveProgressBar(bars, ref);
    if (!bar) {
      element.outerHTML = `<p class="tag-progress-unknown text-muted text-sm">Unknown progress bar: ${escapeHtml(ref)}</p>`;
      return;
    }

    const stats = computeTagProgress(bar, checkedItems, checkboxes, managed);
    element.outerHTML = renderProgressBarHtml(bar.name, stats, { tagId: bar.id });
  });
}

export function updateProgressBarElement(
  element: HTMLElement,
  label: string,
  stats: ProgressStats,
): void {
  const labelEl = element.querySelector('.progress-bar-label');
  const statsEl = element.querySelector('.progress-bar-stats');
  const fillEl = element.querySelector('.progress-bar-fill') as HTMLElement | null;
  const trackEl = element.querySelector('.progress-bar-track') as HTMLElement | null;

  if (labelEl) labelEl.textContent = label;
  if (statsEl) statsEl.textContent = `${stats.completed} / ${stats.total} (${stats.percent}%)`;
  if (fillEl) fillEl.style.width = `${stats.percent}%`;
  if (trackEl) trackEl.setAttribute('aria-valuenow', String(stats.percent));
}

export function refreshProgressUi(
  root: HTMLElement,
  bars: ProgressBar[],
  checkboxes: CheckboxItem[],
  checkedItems: Record<string, boolean>,
  managed?: ManagedCheckbox[],
): void {
  const overall = computeOverallProgress(checkboxes, checkedItems);
  const overallBlock = root.querySelector('[data-progress-scope="overall"] .progress-bar-block');
  if (overallBlock) {
    updateProgressBarElement(overallBlock as HTMLElement, 'Overall completion', overall);
  }

  bars.forEach((bar) => {
    const stats = computeTagProgress(bar, checkedItems, checkboxes, managed);
    root.querySelectorAll(`[data-tag-id="${bar.id}"]`).forEach((element) => {
      updateProgressBarElement(element as HTMLElement, bar.name, stats);
    });
  });
}

export function buildProgressBarMarker(bar: ProgressBar): string {
  return `[[pb:${bar.id}]]`;
}
