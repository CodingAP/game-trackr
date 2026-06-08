import type { CompletionTag, ManagedCheckbox } from '../types/index.js';
import type { CheckboxItem } from './checkboxes.js';
import {
  buildCheckboxIndex,
  getProgressCheckboxes,
  isCheckboxComplete,
} from './checkboxes.js';
import { getTagCheckboxIds, managedToCheckboxItems } from './managedCheckboxes.js';
import { renderCollapsiblePanel } from '../components/CollapsiblePanel.js';
import { renderPlaytimeSectionHtml } from '../components/PlaytimePanel.js';
import { getPlaytime } from '../storage/playtime.js';

export interface ProgressStats {
  completed: number;
  total: number;
  percent: number;
}

export const TAG_PROGRESS_MARKER = /\[\[(?:pb|tag-progress):([^\]]+)\]\]/g;

export function resolveTag(tags: CompletionTag[], reference: string): CompletionTag | undefined {
  const trimmed = reference.trim();
  return (
    tags.find((tag) => tag.id === trimmed) ??
    tags.find((tag) => tag.name.toLowerCase() === trimmed.toLowerCase())
  );
}

export function computeTagProgress(
  tag: CompletionTag,
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
  tags: CompletionTag[],
  checkboxes: CheckboxItem[],
  checkedItems: Record<string, boolean>,
  managed?: ManagedCheckbox[],
): string {
  const overall = computeOverallProgress(checkboxes, checkedItems);
  const summaryTags = tags.filter((tag) => tag.showInSummary && tag.name.trim());
  const progressCheckboxes = getProgressCheckboxes(checkboxes);

  const tagBars = summaryTags
    .map((tag) => {
      const stats = computeTagProgress(tag, checkedItems, checkboxes, managed);
      return renderProgressBarHtml(tag.name, stats, { tagId: tag.id, compact: true });
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
      summaryTags.length > 0
        ? `<div class="completion-summary-tags">${tagBars}</div>`
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
  tags: CompletionTag[],
  checkboxes: CheckboxItem[],
  checkedItems: Record<string, boolean>,
  managed?: ManagedCheckbox[],
): void {
  container.querySelectorAll('.tag-progress[data-tag-ref]').forEach((element) => {
    const ref = decodeURIComponent(element.getAttribute('data-tag-ref') ?? '');
    const tag = resolveTag(tags, ref);
    if (!tag) {
      element.outerHTML = `<p class="tag-progress-unknown text-muted text-sm">Unknown completion tag: ${escapeHtml(ref)}</p>`;
      return;
    }

    const stats = computeTagProgress(tag, checkedItems, checkboxes, managed);
    element.outerHTML = renderProgressBarHtml(tag.name, stats, { tagId: tag.id });
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
  tags: CompletionTag[],
  checkboxes: CheckboxItem[],
  checkedItems: Record<string, boolean>,
  managed?: ManagedCheckbox[],
): void {
  const overall = computeOverallProgress(checkboxes, checkedItems);
  const overallBlock = root.querySelector('[data-progress-scope="overall"] .progress-bar-block');
  if (overallBlock) {
    updateProgressBarElement(overallBlock as HTMLElement, 'Overall completion', overall);
  }

  tags.forEach((tag) => {
    const stats = computeTagProgress(tag, checkedItems, checkboxes, managed);
    root.querySelectorAll(`[data-tag-id="${tag.id}"]`).forEach((element) => {
      updateProgressBarElement(element as HTMLElement, tag.name, stats);
    });
  });
}

export function buildCheckboxItemsFromManaged(managed: ManagedCheckbox[]): CheckboxItem[] {
  return managedToCheckboxItems(managed);
}

export function buildTagProgressMarker(tag: CompletionTag): string {
  const name = tag.name.trim() || 'Tag name';
  return `[[pb:${name}]]`;
}
