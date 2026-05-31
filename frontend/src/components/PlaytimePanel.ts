import {
  addPlaytimeEntry,
  getPlaytime,
  getTotalPlaytimeMinutes,
  removePlaytimeEntry,
} from '../storage/playtime.js';
import type { PlaytimeEntry } from '../types/index.js';
import {
  buildPlaytimeDurationOptions,
  defaultDatetimeLocalValue,
  formatPlaytimeDuration,
  formatPlaytimeTimestamp,
} from '../utils/playtimeFormat.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function sortEntries(entries: PlaytimeEntry[]): PlaytimeEntry[] {
  return [...entries].sort(
    (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime(),
  );
}

export function renderPlaytimeSectionHtml(entries: PlaytimeEntry[]): string {
  const totalMinutes = getTotalPlaytimeMinutes(entries);
  const sorted = sortEntries(entries);
  const durationOptions = buildPlaytimeDurationOptions();

  return `
    <div class="playtime-section" id="playtime-section">
      <div class="playtime-header">
        <h3 class="playtime-heading">Playtime</h3>
        <p class="playtime-total">Total: ${escapeHtml(formatPlaytimeDuration(totalMinutes))}</p>
      </div>

      <form id="playtime-form" class="playtime-form">
        <label class="playtime-field">
          <span class="label">When</span>
          <input
            type="datetime-local"
            name="playedAt"
            class="input"
            value="${defaultDatetimeLocalValue()}"
            required
          />
        </label>
        <label class="playtime-field">
          <span class="label">Duration</span>
          <select name="durationMinutes" class="input" required>
            ${durationOptions
              .map(
                (option) =>
                  `<option value="${option.value}">${escapeHtml(option.label)}</option>`,
              )
              .join('')}
          </select>
        </label>
        <button type="submit" class="btn-secondary playtime-submit">Log session</button>
      </form>

      ${
        sorted.length === 0
          ? '<p class="playtime-empty text-faint text-sm">No sessions logged yet.</p>'
          : `
            <ul class="playtime-log">
              ${sorted
                .map(
                  (entry) => `
                    <li class="playtime-entry">
                      <span class="playtime-entry-label">
                        ${escapeHtml(formatPlaytimeTimestamp(entry.playedAt))}
                        ·
                        ${escapeHtml(formatPlaytimeDuration(entry.durationMinutes))}
                      </span>
                      <button
                        type="button"
                        class="playtime-entry-remove"
                        data-action="delete-playtime"
                        data-entry-id="${escapeHtml(entry.id)}"
                        aria-label="Remove session"
                      >
                        Remove
                      </button>
                    </li>
                  `,
                )
                .join('')}
            </ul>
          `
      }
    </div>
  `;
}

export function refreshPlaytimeSection(root: HTMLElement, gameSlug: string): void {
  const section = root.querySelector('#playtime-section');
  if (!section) return;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderPlaytimeSectionHtml(getPlaytime(gameSlug).entries);
  const next = wrapper.firstElementChild;
  if (next) section.replaceWith(next);
}

export function wirePlaytimePanel(root: HTMLElement, gameSlug: string): () => void {
  const onSubmit = (event: Event) => {
    const form = (event.target as Element).closest('#playtime-form') as HTMLFormElement | null;
    if (!form) return;

    event.preventDefault();
    event.stopPropagation();

    const playedAtRaw = (form.elements.namedItem('playedAt') as HTMLInputElement).value;
    const durationMinutes = Number(
      (form.elements.namedItem('durationMinutes') as HTMLSelectElement).value,
    );
    const playedAt = new Date(playedAtRaw);

    if (Number.isNaN(playedAt.getTime()) || !Number.isFinite(durationMinutes)) return;

    addPlaytimeEntry(gameSlug, {
      playedAt: playedAt.toISOString(),
      durationMinutes,
    });
    refreshPlaytimeSection(root, gameSlug);
  };

  const onClick = (event: Event) => {
    const button = (event.target as Element).closest(
      '[data-action="delete-playtime"]',
    ) as HTMLElement | null;
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    const entryId = button.dataset.entryId;
    if (!entryId) return;

    removePlaytimeEntry(gameSlug, entryId);
    refreshPlaytimeSection(root, gameSlug);
  };

  root.addEventListener('submit', onSubmit);
  root.addEventListener('click', onClick);

  return () => {
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('click', onClick);
  };
}
