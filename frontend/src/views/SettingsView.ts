import { downloadAllGamesExport, resetAccountData } from '../api/client.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from '../components/CollapsiblePanel.js';
import {
  clearAllLocalData,
  describeBackupContents,
  downloadLocalDataBackup,
  exportLocalData,
  importLocalData,
} from '../storage/backup.js';
import { isLocallyAuthenticated } from '../storage/auth.js';
import {
  getHideImages,
  getThemeSettings,
  saveCustomThemeColors,
  saveHideImages,
  saveThemePreset,
} from '../storage/settings.js';
import { THEME_PRESET_OPTIONS } from '../theme/presets.js';
import type { ThemeColors, ThemePresetId } from '../theme/types.js';
import { iconLabel } from '../components/icons.js';

function renderThemeEditor(settings = getThemeSettings()): string {
  return `
    <p class="text-muted text-sm">Choose a preset or customize the three main theme colors.</p>
    <div class="theme-grid" role="radiogroup" aria-label="Theme presets">
      ${THEME_PRESET_OPTIONS.map(
        (preset) => `
          <button
            type="button"
            class="theme-option ${settings.presetId === preset.id ? 'is-selected' : ''}"
            data-theme-preset="${preset.id}"
            role="radio"
            aria-checked="${settings.presetId === preset.id}"
          >
            <span class="theme-preview">
              ${[preset.colors.background, preset.colors.surface, preset.colors.accent]
                .map((color) => `<span style="background-color: ${color}"></span>`)
                .join('')}
            </span>
            <span class="theme-option-body">
              <span class="theme-option-name">${preset.name}</span>
              <span class="theme-option-desc">${preset.description}</span>
            </span>
          </button>
        `,
      ).join('')}
    </div>

    <div class="theme-editor mt-5 space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-sm font-medium">Custom colors</h3>
        <span id="theme-mode-label" class="text-muted text-xs">${settings.presetId === 'custom' ? 'Custom theme' : 'Based on preset'}</span>
      </div>
      <div class="theme-color-grid">
        ${renderColorField('background', 'Background', settings.colors.background)}
        ${renderColorField('surface', 'Surface', settings.colors.surface)}
        ${renderColorField('accent', 'Accent', settings.colors.accent)}
      </div>
      <div class="theme-live-preview" aria-hidden="true">
        <span style="background-color: ${settings.colors.background}"></span>
        <span style="background-color: ${settings.colors.surface}"></span>
        <span style="background-color: ${settings.colors.accent}"></span>
      </div>
    </div>
    <p id="theme-status" class="text-muted text-sm mt-3"></p>
  `;
}

function renderColorField(id: keyof ThemeColors, label: string, value: string): string {
  return `
    <label class="theme-color-field">
      <span class="label">${label}</span>
      <input type="color" id="theme-color-${id}" value="${value}" aria-label="${label} color" />
      <input type="text" id="theme-color-${id}-hex" class="input theme-color-hex" value="${value}" maxlength="7" spellcheck="false" />
    </label>
  `;
}

function readCustomColors(container: HTMLElement): ThemeColors {
  const read = (id: keyof ThemeColors): string => {
    const hexInput = container.querySelector(`#theme-color-${id}-hex`) as HTMLInputElement;
    return hexInput.value.trim();
  };

  return {
    background: read('background'),
    surface: read('surface'),
    accent: read('accent'),
  };
}

function updateThemeSelectionUi(container: HTMLElement, presetId: ThemePresetId | 'custom'): void {
  container.querySelectorAll('[data-theme-preset]').forEach((button) => {
    const selected = (button as HTMLElement).dataset.themePreset === presetId;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-checked', String(selected));
  });

  const modeLabel = container.querySelector('#theme-mode-label') as HTMLElement | null;
  if (modeLabel) {
    modeLabel.textContent = presetId === 'custom' ? 'Custom theme' : 'Based on preset';
  }
}

function updateThemePreviewUi(container: HTMLElement, colors: ThemeColors): void {
  const preview = container.querySelector('.theme-live-preview');
  if (!preview) return;

  const swatches = preview.querySelectorAll('span');
  const values = [colors.background, colors.surface, colors.accent];
  swatches.forEach((swatch, index) => {
    (swatch as HTMLElement).style.backgroundColor = values[index] ?? '#000000';
  });
}

export function renderSettings(container: HTMLElement): () => void {
  const hideImages = getHideImages();
  const initialTheme = getThemeSettings();
  const signedIn = isLocallyAuthenticated();

  const displayContent = `
    <p class="text-muted text-sm">Control how journals and game pages show media.</p>
    <label class="settings-check mt-3">
      <input type="checkbox" id="hide-images" ${hideImages ? 'checked' : ''} />
      <span>Hide all images</span>
    </label>
    <p class="hint mt-2">Hides images and videos in journal pages, embedded maps, and game info cover art.</p>
    <p id="display-status" class="text-muted text-sm mt-3"></p>
  `;

  const exportedKeys = Object.keys(exportLocalData().data);
  const backupContent = `
    <div class="backup-section">
      <h3 class="settings-section-title">User data backup</h3>
      <p class="text-muted text-sm mt-1">
        Download or restore browser-stored GameTrackr data on another device.
        Includes checkbox progress, playtime, notes, collections, theme, and display preferences.
      </p>
      ${
        exportedKeys.length > 0
          ? `<p class="hint mt-3 mb-4">Current backup would include: ${describeBackupContents(exportedKeys)}.</p>`
          : '<p class="hint mt-3 mb-4">No local data saved yet.</p>'
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
    </div>
    ${
      signedIn
        ? `
      <div class="backup-section backup-games-export">
        <h3 class="settings-section-title">All games export</h3>
        <p class="text-muted text-sm mt-1">
          Download every game journal on the server as individual <code>.gametrackr.json</code> files in a zip archive.
        </p>
        <div class="backup-actions mt-3">
          <button type="button" id="export-all-games" class="btn-secondary">${iconLabel('download', 'Download all games')}</button>
          <span id="games-export-status" class="text-muted text-sm"></span>
        </div>
      </div>
      <div class="backup-section backup-reset">
        <div class="backup-reset-warning panel border-red-500/40">
          <h3 class="settings-section-title">Reset everything</h3>
          <p class="text-muted text-sm mt-2">
            Permanently delete all GameTrackr data tied to your account and this browser.
            <strong class="text-strong">This cannot be undone.</strong>
          </p>
          <ul class="backup-reset-list hint text-sm mt-3">
            <li>Every game journal stored on the server</li>
            <li>Your cloud user-data backup</li>
            <li>Local checkbox progress, playtime, notes, collections, and preferences on this device</li>
          </ul>
          <p class="hint text-sm mt-3">
            Download a user data backup and an all-games export first if you want to keep anything.
          </p>
          <div class="backup-actions mt-4">
            <button type="button" id="reset-account" class="btn-danger">${iconLabel('trash', 'Reset everything')}</button>
            <span id="reset-status" class="text-muted text-sm"></span>
          </div>
        </div>
      </div>
    `
        : `
      <div class="backup-section backup-games-export">
        <h3 class="settings-section-title">All games export</h3>
        <p class="text-muted text-sm mt-1">Sign in to download a zip of every game journal on the server.</p>
      </div>
    `
    }
  `;

  container.innerHTML = `
    <div class="settings-page">
      <div class="mb-8">
        <h1 class="page-heading">Settings</h1>
        <p class="text-muted mt-1">Global preferences for GameTrackr.</p>
      </div>

      ${renderCollapsiblePanel({ title: 'Display', className: 'mb-6', content: displayContent })}
      ${renderCollapsiblePanel({ title: 'Theme', className: 'mb-6', content: renderThemeEditor(initialTheme) })}
      ${renderCollapsiblePanel({ title: 'Import / export', content: backupContent })}
    </div>
  `;

  const themeStatus = container.querySelector('#theme-status') as HTMLElement;
  const displayStatus = container.querySelector('#display-status') as HTMLElement;
  const hideImagesInput = container.querySelector('#hide-images') as HTMLInputElement;
  const importForm = container.querySelector('#import-data-form') as HTMLFormElement;
  const importFileInput = container.querySelector('#import-data-file') as HTMLInputElement;
  const backupStatus = container.querySelector('#backup-status') as HTMLElement;
  const exportButton = container.querySelector('#export-data') as HTMLButtonElement;
  const exportAllGamesButton = container.querySelector('#export-all-games') as HTMLButtonElement | null;
  const gamesExportStatus = container.querySelector('#games-export-status') as HTMLElement | null;
  const resetAccountButton = container.querySelector('#reset-account') as HTMLButtonElement | null;
  const resetStatus = container.querySelector('#reset-status') as HTMLElement | null;

  const onHideImagesChange = () => {
    const hide = hideImagesInput.checked;
    saveHideImages(hide);
    displayStatus.textContent = hide ? 'Images are now hidden.' : 'Images are now shown.';
  };

  const onThemePresetSelect = (event: Event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const presetId = button.dataset.themePreset as ThemePresetId | undefined;
    if (!presetId) return;

    const saved = saveThemePreset(presetId);
    updateThemeSelectionUi(container, saved.presetId);

    for (const key of ['background', 'surface', 'accent'] as const) {
      const colorInput = container.querySelector(`#theme-color-${key}`) as HTMLInputElement;
      const hexInput = container.querySelector(`#theme-color-${key}-hex`) as HTMLInputElement;
      colorInput.value = saved.colors[key];
      hexInput.value = saved.colors[key];
    }

    updateThemePreviewUi(container, saved.colors);
    themeStatus.textContent = `${THEME_PRESET_OPTIONS.find((entry) => entry.id === presetId)?.name ?? presetId} applied.`;
  };

  const onCustomColorChange = () => {
    const saved = saveCustomThemeColors(readCustomColors(container));
    updateThemeSelectionUi(container, saved.presetId);
    updateThemePreviewUi(container, saved.colors);

    for (const key of ['background', 'surface', 'accent'] as const) {
      const colorInput = container.querySelector(`#theme-color-${key}`) as HTMLInputElement;
      const hexInput = container.querySelector(`#theme-color-${key}-hex`) as HTMLInputElement;
      colorInput.value = saved.colors[key];
      hexInput.value = saved.colors[key];
    }

    themeStatus.textContent =
      saved.presetId === 'custom' ? 'Custom theme applied.' : 'Theme updated from custom colors.';
  };

  const wireColorField = (id: keyof ThemeColors): void => {
    const colorInput = container.querySelector(`#theme-color-${id}`) as HTMLInputElement;
    const hexInput = container.querySelector(`#theme-color-${id}-hex`) as HTMLInputElement;

    colorInput.addEventListener('input', () => {
      hexInput.value = colorInput.value;
      onCustomColorChange();
    });

    hexInput.addEventListener('change', () => {
      const value = hexInput.value.trim();
      if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) {
        const normalized = value.startsWith('#') ? value : `#${value}`;
        colorInput.value = normalized;
        hexInput.value = normalized;
        onCustomColorChange();
      }
    });
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

  const onExportAllGames = async () => {
    if (!gamesExportStatus || !exportAllGamesButton) return;
    gamesExportStatus.textContent = '';
    exportAllGamesButton.disabled = true;

    try {
      await downloadAllGamesExport();
      gamesExportStatus.textContent = 'All games downloaded.';
      window.setTimeout(() => {
        gamesExportStatus.textContent = '';
      }, 3000);
    } catch (error) {
      gamesExportStatus.textContent =
        error instanceof Error ? error.message : 'Failed to export games.';
    } finally {
      exportAllGamesButton.disabled = false;
    }
  };

  const onResetAccount = async () => {
    if (!resetAccountButton || !resetStatus) return;

    const confirmed = window.confirm(
      [
        'Reset everything?',
        '',
        'This will permanently delete:',
        '• All game journals on the server',
        '• Your cloud user-data backup',
        '• All browser-stored progress, playtime, notes, collections, and preferences on this device',
        '',
        'This cannot be undone.',
      ].join('\n'),
    );
    if (!confirmed) return;

    const typed = window.prompt('Type RESET to confirm permanent deletion:');
    if (typed !== 'RESET') {
      resetStatus.textContent =
        typed === null ? 'Reset cancelled.' : 'Reset cancelled. Type RESET exactly to confirm.';
      return;
    }

    resetStatus.textContent = '';
    resetAccountButton.disabled = true;

    try {
      const result = await resetAccountData();
      clearAllLocalData();
      resetStatus.textContent =
        result.deletedGames > 0
          ? `Reset complete. Removed ${result.deletedGames} game${result.deletedGames === 1 ? '' : 's'}. Reloading...`
          : 'Reset complete. Reloading...';
      window.setTimeout(() => {
        window.location.assign('/');
      }, 800);
    } catch (error) {
      resetStatus.textContent =
        error instanceof Error ? error.message : 'Failed to reset account data.';
      resetAccountButton.disabled = false;
    }
  };

  container.querySelectorAll('[data-theme-preset]').forEach((button) => {
    button.addEventListener('click', onThemePresetSelect);
  });
  for (const key of ['background', 'surface', 'accent'] as const) {
    wireColorField(key);
  }
  hideImagesInput.addEventListener('change', onHideImagesChange);
  exportButton.addEventListener('click', onExportData);
  importForm.addEventListener('submit', onImportData);
  exportAllGamesButton?.addEventListener('click', onExportAllGames);
  resetAccountButton?.addEventListener('click', onResetAccount);

  const cleanupCollapsible = wireCollapsiblePanels(container);

  return () => {
    cleanupCollapsible();
    container.querySelectorAll('[data-theme-preset]').forEach((button) => {
      button.removeEventListener('click', onThemePresetSelect);
    });
    exportButton.removeEventListener('click', onExportData);
    hideImagesInput.removeEventListener('change', onHideImagesChange);
    importForm.removeEventListener('submit', onImportData);
    exportAllGamesButton?.removeEventListener('click', onExportAllGames);
    resetAccountButton?.removeEventListener('click', onResetAccount);
  };
}
