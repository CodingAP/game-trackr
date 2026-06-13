import { renderCollapsiblePanel, wireCollapsiblePanels } from '../components/CollapsiblePanel.js';
import {
  describeBackupContents,
  downloadLocalDataBackup,
  exportLocalData,
  importLocalData,
} from '../storage/backup.js';
import { getTheme, saveTheme } from '../storage/settings.js';
import { THEME_OPTIONS } from '../types/index.js';
import type { ThemeId } from '../types/index.js';
import { iconLabel } from '../components/icons.js';

export function renderSettings(container: HTMLElement): () => void {
  const currentTheme = getTheme();

  const themeContent = `
    <p class="text-muted text-sm">Choose a color theme for the app interface.</p>
    <div class="theme-grid" role="radiogroup" aria-label="Theme">
      ${THEME_OPTIONS.map(
        (theme) => `
          <button
            type="button"
            class="theme-option ${theme.id === currentTheme ? 'is-selected' : ''}"
            data-theme="${theme.id}"
            role="radio"
            aria-checked="${theme.id === currentTheme}"
          >
            <span class="theme-preview">
              ${theme.preview.map((color) => `<span style="background-color: ${color}"></span>`).join('')}
            </span>
            <span class="theme-option-body">
              <span class="theme-option-name">${theme.name}</span>
              <span class="theme-option-desc">${theme.description}</span>
            </span>
          </button>
        `,
      ).join('')}
    </div>
    <p id="theme-status" class="text-muted text-sm mt-3"></p>
  `;

  const exportedKeys = Object.keys(exportLocalData().data);
  const backupContent = `
    <p class="text-muted text-sm">
      Download your browser-stored GameTrackr data or restore it on another device.
      Backups include checkbox progress, playtime, notes, and theme.
    </p>
    ${
      exportedKeys.length > 0
        ? `<p class="hint mb-4">Current backup would include: ${describeBackupContents(exportedKeys)}.</p>`
        : '<p class="hint mb-4">No local data saved yet.</p>'
    }
    <div class="backup-actions">
      <button type="button" id="export-data" class="btn-primary">${iconLabel('download', 'Download backup')}</button>
    </div>
    <form id="import-data-form" class="backup-import mt-4 space-y-3">
      <label class="block">
        <span class="label">Import backup file</span>
        <input type="file" id="import-data-file" class="input file-input" accept="application/json,.json" />
      </label>
      <div class="flex flex-wrap items-center gap-3">
        <button type="submit" class="btn-secondary">${iconLabel('import', 'Import backup')}</button>
        <span id="backup-status" class="text-muted text-sm"></span>
      </div>
    </form>
  `;

  container.innerHTML = `
    <div class="settings-page">
      <div class="mb-8">
        <h1 class="page-heading">Settings</h1>
        <p class="text-muted mt-1">Global preferences for GameTrackr.</p>
      </div>

      ${renderCollapsiblePanel({ title: 'Theme', className: 'mb-6', content: themeContent })}
      ${renderCollapsiblePanel({ title: 'Import / export', content: backupContent })}
    </div>
  `;

  const themeStatus = container.querySelector('#theme-status') as HTMLElement;
  const importForm = container.querySelector('#import-data-form') as HTMLFormElement;
  const importFileInput = container.querySelector('#import-data-file') as HTMLInputElement;
  const backupStatus = container.querySelector('#backup-status') as HTMLElement;
  const exportButton = container.querySelector('#export-data') as HTMLButtonElement;

  const onThemeSelect = (event: Event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const theme = button.dataset.theme as ThemeId | undefined;
    if (!theme) return;

    saveTheme(theme);
    container.querySelectorAll('.theme-option').forEach((option) => {
      const selected = (option as HTMLElement).dataset.theme === theme;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-checked', String(selected));
    });
    themeStatus.textContent = `${THEME_OPTIONS.find((entry) => entry.id === theme)?.name ?? theme} theme applied.`;
  };

  const onExportData = () => {
    downloadLocalDataBackup();
    backupStatus.textContent = 'Backup downloaded.';
    window.setTimeout(() => {
      backupStatus.textContent = '';
    }, 3000);
  };

  const onImportData = async (event: Event) => {
    event.preventDefault();
    backupStatus.textContent = '';

    const file = importFileInput.files?.[0];
    if (!file) {
      backupStatus.textContent = 'Choose a backup file first.';
      return;
    }

    const confirmed = window.confirm(
      'Importing will replace your current local GameTrackr data for any keys found in the backup. Continue?',
    );
    if (!confirmed) return;

    try {
      const json = await file.text();
      const importedKeys = importLocalData(json);
      backupStatus.textContent = `Imported ${describeBackupContents(importedKeys)}.`;
      importForm.reset();
    } catch (error) {
      backupStatus.textContent =
        error instanceof Error ? error.message : 'Failed to import backup.';
    }
  };

  container.querySelectorAll('[data-theme]').forEach((button) => {
    button.addEventListener('click', onThemeSelect);
  });
  exportButton.addEventListener('click', onExportData);
  importForm.addEventListener('submit', onImportData);

  const cleanupCollapsible = wireCollapsiblePanels(container);

  return () => {
    cleanupCollapsible();
    container.querySelectorAll('[data-theme]').forEach((button) => {
      button.removeEventListener('click', onThemeSelect);
    });
    exportButton.removeEventListener('click', onExportData);
    importForm.removeEventListener('submit', onImportData);
  };
}
