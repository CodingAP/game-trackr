import { openEmbedEditPopover } from '../components/EmbedEditPopover.js';
import { openImageInsertDialogOrWarn } from '../components/ImageInsertDialog.js';
import { openProgressInsertDialog } from '../components/ProgressInsertDialog.js';
import { openCheckboxInsertDialog } from '../components/CheckboxInsertDialog.js';
import { openMapInsertDialog } from '../components/MapInsertDialog.js';
import { mountCheckboxConnectionsEditor } from '../components/CheckboxConnectionsEditor.js';
import { wireCollapsiblePanels } from '../components/CollapsiblePanel.js';
import { mountProgressBarsEditor } from '../components/ProgressBarsEditor.js';
import { mountEditorAdmin } from '../components/EditorAdmin.js';
import { mountMobyGamesAdmin } from '../components/MobyGamesAdmin.js';
import { mountEditorTabs } from '../components/EditorTabs.js';
import { mountImageEditor } from '../components/ImageEditor.js';
import { mountMapsEditor } from '../components/MapsEditor.js';
import { mountMarkdownEditor } from '../components/MarkdownEditor.js';
import { mountPagesEditor } from '../components/PagesEditor.js';
import type { MarkdownEditorHandle } from '../types/markdownEditor.js';
import type {
  CheckboxConnectionsData,
  ProgressBarsData,
  EditorTabId,
  FullJournalData,
  GameMapsData,
  ImageLibraryData,
  UploadedImage,
} from '../types/index.js';
import {
  countAbandonedEmbeds,
  stripAbandonedEmbeds,
  type MarkdownEmbedConfig,
} from '../components/markdownEmbedExtension.js';
import {
  buildProgressBarMarker,
  replaceProgressMarkerReference,
} from '../markdown/completionProgress.js';
import { replaceMapMarkerReference } from '../markdown/gameMaps.js';
import {
  countPagesWithExtraWhitespace,
  removeExtraWhitespaceFromPages,
} from '../markdown/journalCleanup.js';
import type { ProgressBar } from '../types/index.js';
import {
  createGame,
  fetchCheckboxConnections,
  fetchProgressBars,
  fetchGame,
  fetchGameImages,
  fetchGameJournal,
  fetchImageLibrary,
  fetchMaps,
  saveEditorState,
  AuthRequiredError,
} from '../api/client.js';
import { requireAuth } from '../components/AuthPrompt.js';
import { consumeImportDraft } from '../utils/journalBundle.js';
import { findProgressBarByName } from '../markdown/progressBars.js';
import { replaceCheckboxMarkerId } from '../markdown/managedCheckboxes.js';
import { navigate } from '../router.js';
import { renderEditorTabHelp, wireEditorTabHelp } from '../components/editorTabHelp.js';
import { wireReturnToTop } from '../components/ReturnToTop.js';
import { icon, iconLabel } from '../components/icons.js';

const DEFAULT_CONTENT = '# New Game\n';

const DEFAULT_JOURNAL: FullJournalData = {
  version: 2,
  pages: [{ id: 'main', name: 'Main', order: 0 }],
  contents: { main: DEFAULT_CONTENT },
};

const DEFAULT_CHECKBOXES: CheckboxConnectionsData = { checkboxes: [] };

const EMPTY_PROGRESS_BARS: ProgressBarsData = { tags: [] };
const EMPTY_MAPS: GameMapsData = { maps: [] };
const EMPTY_IMAGE_LIBRARY: ImageLibraryData = { images: [] };

export async function renderEditor(
  container: HTMLElement,
  params: Record<string, string>,
): Promise<() => void> {
  const slug = params.slug;
  const isNew = !slug;

  container.innerHTML = `
    <div class="app-shell max-w-6xl">
      <h1 id="editor-top" class="page-heading mb-2">${isNew ? 'Create Game' : 'Edit Game'}</h1>
      ${
        isNew
          ? `
        <div class="mb-6 grid gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="label">Game Name</span>
            <input type="text" id="game-name" class="input" placeholder="Super Mario Bros." required />
          </label>
          <label class="block">
            <span class="label">Slug</span>
            <input type="text" id="game-slug" class="input" placeholder="super-mario-bros" pattern="[a-z0-9]+(-[a-z0-9]+)*" required />
            <span class="hint">Lowercase letters, numbers, and hyphens only.</span>
          </label>
        </div>
      `
          : '<p class="text-muted mb-6">Editing <strong class="text-strong" id="game-title"></strong></p>'
      }
      <form id="editor-form" class="space-y-4">
        <div class="editor-header-bar mb-6">
          <div id="editor-tabs-nav" class="editor-header-tabs"></div>
          <div class="editor-header-actions">
            <div class="editor-header-viewer-wrap">
              <span id="editor-save-status" class="editor-save-status text-sm text-muted" aria-live="polite"></span>
              <button type="button" id="open-viewer" class="btn-primary">${iconLabel('eye', 'Viewer')}</button>
            </div>
          </div>
        </div>

        <div id="tab-content" class="editor-tab-panel">
          ${renderEditorTabHelp('content')}
          <div class="editor-tab-panel-body">
            <div class="pages-editor-layout">
              <aside id="pages-editor" class="pages-sidebar" aria-label="Journal pages"></aside>
              <div class="pages-editor-main">
                <span class="label">Page Content</span>
                <div id="markdown-editor-root" class="mt-1"></div>
              </div>
            </div>
          </div>
        </div>

        <div id="tab-images" class="editor-tab-panel" hidden>
          ${renderEditorTabHelp('images')}
          <div class="editor-tab-panel-body space-y-4">
            <div id="image-editor"></div>
          </div>
        </div>

        <div id="tab-maps" class="editor-tab-panel" hidden>
          ${renderEditorTabHelp('maps')}
          <div class="editor-tab-panel-body">
            <div id="maps-editor"></div>
          </div>
        </div>

        <div id="tab-checkboxes" class="editor-tab-panel" hidden>
          ${renderEditorTabHelp('checkboxes')}
          <div class="editor-tab-panel-body">
            <div id="checkbox-connections-editor"></div>
          </div>
        </div>

        <div id="tab-tags" class="editor-tab-panel" hidden>
          ${renderEditorTabHelp('tags')}
          <div class="editor-tab-panel-body">
            <div id="progress-bars-editor"></div>
          </div>
        </div>

        <div id="tab-admin" class="editor-tab-panel" hidden>
          <div class="editor-tab-panel-body admin-tab-panel-body space-y-4">
            <div class="admin-tab-header">
              ${renderEditorTabHelp('admin')}
            </div>
            <div id="mobygames-admin" class="mb-4"></div>
            <div id="editor-admin"></div>
          </div>
        </div>

        <p id="editor-error" class="text-sm text-red-400 hidden"></p>
      </form>
      <button type="button" id="return-top" class="return-top" aria-label="Return to top">
        ${icon('arrow-up', 'ui-icon ui-icon-lg')}
      </button>
    </div>
  `;

  const form = container.querySelector('#editor-form') as HTMLFormElement;
  const errorEl = container.querySelector('#editor-error') as HTMLElement;
  const viewerBtn = container.querySelector('#open-viewer') as HTMLButtonElement;
  const editorRoot = container.querySelector('#markdown-editor-root') as HTMLElement;
  const returnTopButton = container.querySelector('#return-top') as HTMLElement;
  const editorTop = container.querySelector('#editor-top') as HTMLElement;
  const cleanupReturnTop = wireReturnToTop(returnTopButton, editorTop);

  let activeSlug = slug;
  let cleanupImageEditor: (() => void) | null = null;
  let refreshUploadedImages: (() => Promise<void>) | null = null;
  let cleanupProgressBarsEditor: (() => void) | null = null;
  let cleanupCheckboxesEditor: (() => void) | null = null;
  let cleanupMapsEditor: (() => void) | null = null;
  let cleanupPagesEditor: (() => void) | null = null;
  let cleanupAdmin: (() => void) | null = null;
  let cleanupMobyGamesAdmin: (() => void) | null = null;
  let cleanupTabs: (() => void) | null = null;
  let getProgressBarsData: (() => import('../types/index.js').ProgressBarsData) | null = null;
  let getJournalData: (() => import('../types/index.js').FullJournalData) | null = null;
  let getCheckboxesData: (() => import('../types/index.js').CheckboxConnectionsData) | null = null;
  let getMapsData: (() => import('../types/index.js').GameMapsData) | null = null;
  let getImageLibraryData: (() => import('../types/index.js').ImageLibraryData) | null = null;
  let getActivePageId: (() => string) | null = null;
  let refreshCheckboxesEditor: (() => void) | null = null;
  let registerCheckbox: ((checkbox: import('../types/index.js').ManagedCheckbox) => boolean) | null = null;
  let updateCheckbox: ((
    id: string,
    updates: { id?: string; label?: string },
  ) => string | false) | null = null;
  let setPageContent: ((pageId: string, content: string) => void) | null = null;
  let registerProgressBar: ((bar: import('../types/index.js').ProgressBar) => void) | null = null;
  let updateProgressBar: ((id: string, updates: { name?: string; id?: string }) => string | false) | null = null;
  let gameName = '';
  let cleanupTabHelp: (() => void) | null = null;
  let switchTab: ((id: EditorTabId) => void) | null = null;
  let uploadedImages: UploadedImage[] = [];
  let closeEmbedPopover: (() => void) | null = null;
  let getMergedJournalContents: () => Record<string, string> = () => ({});

  const AUTOSAVE_DELAY_MS = 1500;
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  let saveInFlight = false;
  let saveQueued = false;
  let pendingNavigate = false;
  let scheduleAutosave: () => void = () => {};
  let cleanupAutosave: (() => void) | null = null;
  let cleanupMarkdownChange: (() => void) | null = null;
  let editorDisposed = false;

  const updateSaveStatus = (
    state: 'idle' | 'saving' | 'saved' | 'error',
    message?: string,
  ) => {
    const statusEl = container.querySelector('#editor-save-status') as HTMLElement | null;
    if (!statusEl) return;

    switch (state) {
      case 'idle':
        statusEl.textContent = '';
        break;
      case 'saving':
        statusEl.textContent = 'Saving…';
        break;
      case 'saved':
        statusEl.textContent = 'Saved';
        break;
      case 'error':
        statusEl.textContent = message ?? 'Save failed';
        break;
    }
  };

  const clearAutosaveTimer = () => {
    if (!autosaveTimer) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  };

  const waitForSave = async () => {
    while (saveInFlight) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };

  const persistEditorData = async (navigateAfter = false): Promise<boolean> => {
    if (editorDisposed || isNew || !activeSlug) return false;
    if (!getJournalData || !getCheckboxesData || !getProgressBarsData || !getMapsData) return false;

    if (saveInFlight) {
      if (navigateAfter) pendingNavigate = true;
      saveQueued = true;
      await waitForSave();
      if (navigateAfter && pendingNavigate) {
        return true;
      }
      if (saveQueued) {
        return persistEditorData(navigateAfter);
      }
      return true;
    }

    const journal = getJournalData();
    const hasContent = Object.values(journal.contents).some((page) => page.trim());
    if (!hasContent) {
      if (navigateAfter) {
        errorEl.textContent = 'At least one page needs content.';
        errorEl.classList.remove('hidden');
      }
      return false;
    }

    saveInFlight = true;
    updateSaveStatus('saving');
    errorEl.classList.add('hidden');

    let authRetry = false;

    try {
      await saveEditorState(activeSlug, {
        journal,
        checkboxes: getCheckboxesData(),
        completionTags: getProgressBarsData(),
        maps: getMapsData(),
        imageLibrary: getImageLibraryData?.() ?? { images: [] },
      });
      updateSaveStatus('saved');

      if (navigateAfter || pendingNavigate) {
        pendingNavigate = false;
        navigate(`/viewer/${activeSlug}`);
      }

      return true;
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        authRetry = true;
        saveInFlight = false;
        return persistEditorData(navigateAfter);
      }

      const message = error instanceof Error ? error.message : 'Save failed';
      updateSaveStatus('error', message);
      if (navigateAfter) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
      }
      return false;
    } finally {
      if (!authRetry) {
        saveInFlight = false;
        if (saveQueued) {
          saveQueued = false;
          void persistEditorData(false);
        }
      }
    }
  };

  scheduleAutosave = () => {
    if (editorDisposed || isNew || !activeSlug) return;
    clearAutosaveTimer();
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      void persistEditorData(false);
    }, AUTOSAVE_DELAY_MS);
  };

  const flushAutosave = async () => {
    clearAutosaveTimer();
    await persistEditorData(false);
  };

  const handleEditEmbed: MarkdownEmbedConfig['onEditEmbed'] = (target, apply, anchor) => {
    closeEmbedPopover?.();
    closeEmbedPopover = openEmbedEditPopover({
      anchor,
      target,
      context: {
        checkboxes: getCheckboxesData?.().checkboxes ?? [],
        progressBars: getProgressBarsData?.().tags ?? [],
        maps: getMapsData?.().maps ?? [],
      },
      imageLibrary: getImageLibraryData?.(),
      onApply: apply,
      onRegisterCheckbox: (checkbox) => {
        registerCheckbox?.(checkbox);
      },
      onUpdateCheckbox: (id, updates) => updateCheckbox?.(id, updates) ?? false,
      onRegisterProgressBar: (bar) => {
        registerProgressBar?.(bar);
      },
      onUpdateProgressBar: (id, updates) => {
        updateProgressBar?.(id, updates);
      },
      onContextChanged: () => {
        void refreshEmbedContext();
      },
    });
  };

  const refreshEmbedContext = async () => {
    if (activeSlug) {
      try {
        uploadedImages = await fetchGameImages(activeSlug);
      } catch {
        uploadedImages = [];
      }
    }

    markdownEditor.setEmbedConfig({
      context: {
        checkboxes: getCheckboxesData?.().checkboxes ?? [],
        progressBars: getProgressBarsData?.().tags ?? [],
        maps: getMapsData?.().maps ?? [],
      },
      onEditEmbed: handleEditEmbed,
    });
  };

  const markdownEditor = mountMarkdownEditor(editorRoot, '', {
    onOpenImagePicker: () => {
      openImageInsertDialogOrWarn({
        slug: activeSlug,
        getImageLibrary: () => getImageLibraryData?.() ?? { images: [] },
        onInsert: (snippet) => {
          markdownEditor.insertLine(snippet.trim());
        },
        onImagesChanged: () => {
          void refreshUploadedImages?.();
        },
      });
    },
    onOpenProgressPicker: () => {
      let markerRange: { from: number; to: number } | null = null;

      const applyMarker = (bar: ProgressBar | null) => {
        if (!bar) {
          if (!markerRange) return;
          markdownEditor.applyChange({ from: markerRange.from, to: markerRange.to, insert: '' });
          markerRange = null;
          return;
        }

        const marker = buildProgressBarMarker(bar);
        if (!markerRange) {
          markerRange = markdownEditor.insertLine(marker);
          return;
        }

        markdownEditor.applyChange({ from: markerRange.from, to: markerRange.to, insert: marker });
        markerRange = { from: markerRange.from, to: markerRange.from + marker.length };
      };

      openProgressInsertDialog({
        progressBars: getProgressBarsData?.().tags ?? [],
        getProgressBars: () => getProgressBarsData?.().tags ?? [],
        onCommitProgressBar: applyMarker,
        onRegisterProgressBar: (bar) => {
          registerProgressBar?.(bar);
          void refreshEmbedContext();
        },
        onUpdateProgressBar: (id, updates) => {
          updateProgressBar?.(id, updates);
          void refreshEmbedContext();
        },
      });
    },
    onOpenCheckboxPicker: () => {
      openCheckboxInsertDialog({
        checkboxes: getCheckboxesData?.().checkboxes ?? [],
        onInsert: (marker) => markdownEditor.insertLine(marker),
        onRegisterCheckbox: (checkbox) => {
          registerCheckbox?.(checkbox);
          void refreshEmbedContext();
        },
      });
    },
    onOpenMapPicker: () => {
      openMapInsertDialog({
        maps: getMapsData?.().maps ?? [],
        getMaps: () => getMapsData?.().maps ?? [],
        onInsert: (marker) => markdownEditor.insertLine(marker),
      });
    },
    onEditEmbed: handleEditEmbed,
  });

  let journal: FullJournalData = structuredClone(DEFAULT_JOURNAL);
  let checkboxes: CheckboxConnectionsData = structuredClone(DEFAULT_CHECKBOXES);
  let progressBars: ProgressBarsData = structuredClone(EMPTY_PROGRESS_BARS);
  let maps: GameMapsData = structuredClone(EMPTY_MAPS);
  let imageLibrary: ImageLibraryData = structuredClone(EMPTY_IMAGE_LIBRARY);

  if (isNew) {
    const draft = consumeImportDraft();
    if (draft) {
      const nameInput = container.querySelector('#game-name') as HTMLInputElement | null;
      const slugInput = container.querySelector('#game-slug') as HTMLInputElement | null;
      if (nameInput) nameInput.value = draft.name;
      if (slugInput) slugInput.value = draft.slug;
      if (draft.journal) {
        journal = draft.journal;
      } else if (draft.content) {
        journal = {
          ...DEFAULT_JOURNAL,
          contents: { main: draft.content },
        };
      }
      if (draft.checkboxes) checkboxes = draft.checkboxes;
      if (draft.completionTags) progressBars = draft.completionTags;
      if (draft.maps) maps = draft.maps;
    }
  }

  try {
    if (!isNew && activeSlug) {
      const [game, fetchedJournal, fetchedCheckboxes, fetchedProgressBars, fetchedMaps, fetchedImageLibrary] =
        await Promise.all([
          fetchGame(activeSlug),
          fetchGameJournal(activeSlug),
          fetchCheckboxConnections(activeSlug),
          fetchProgressBars(activeSlug),
          fetchMaps(activeSlug),
          fetchImageLibrary(activeSlug),
        ]);
      gameName = game.name;
      journal = fetchedJournal;
      checkboxes = fetchedCheckboxes;
      progressBars = fetchedProgressBars;
      maps = fetchedMaps;
      imageLibrary = fetchedImageLibrary;
      const titleEl = container.querySelector('#game-title');
      if (titleEl) titleEl.textContent = game.name;
    }

      const pagesEditor = mountPagesEditor(
        container.querySelector('#pages-editor') as HTMLElement,
        markdownEditor,
        journal,
        { onPagesChanged: scheduleAutosave },
      );
      getJournalData = pagesEditor.getData;
      getActivePageId = pagesEditor.getActivePageId;
      setPageContent = (pageId: string, content: string) => {
        pagesEditor.setPageContent(pageId, content);
        scheduleAutosave();
      };
      cleanupPagesEditor = pagesEditor.cleanup;

      const contentPanel = container.querySelector('#tab-content') as HTMLElement;
      const imagesPanel = container.querySelector('#tab-images') as HTMLElement;
      const mapsPanel = container.querySelector('#tab-maps') as HTMLElement;
      const checkboxesPanel = container.querySelector('#tab-checkboxes') as HTMLElement;
      const tagsPanel = container.querySelector('#tab-tags') as HTMLElement;
      const adminPanel = container.querySelector('#tab-admin') as HTMLElement;

      const tabs = mountEditorTabs(container.querySelector('#editor-tabs-nav') as HTMLElement, [
        { id: 'content', label: 'Pages', panel: contentPanel },
        { id: 'images', label: 'Media', panel: imagesPanel },
        { id: 'maps', label: 'Maps', panel: mapsPanel },
        { id: 'checkboxes', label: 'Checkboxes', panel: checkboxesPanel },
        { id: 'tags', label: 'Progress Bars', panel: tagsPanel },
        { id: 'admin', label: 'Admin', panel: adminPanel },
      ], 'content', (tabId) => {
        if (tabId === 'content') {
          void refreshEmbedContext();
        }
        if (tabId === 'checkboxes') {
          refreshCheckboxesEditor?.();
        }
      });
      switchTab = tabs.setTab;
      cleanupTabs = tabs.cleanup;
      cleanupTabHelp = wireEditorTabHelp(container);

      const imageEditor = mountImageEditor(
        container.querySelector('#image-editor') as HTMLElement,
        markdownEditor,
        activeSlug,
        {
          getAllContents: pagesEditor.getAllContents,
          getActivePageId: pagesEditor.getActivePageId,
          setPageContent: (pageId, content) => {
            pagesEditor.setPageContent(pageId, content);
            scheduleAutosave();
          },
          setAllContents: (contents) => {
            pagesEditor.setAllContents(contents);
            scheduleAutosave();
          },
        },
        imageLibrary,
        { onMediaChanged: scheduleAutosave },
      );
      getImageLibraryData = imageEditor.getData;
      cleanupImageEditor = imageEditor.cleanup;
      refreshUploadedImages = async () => {
        await imageEditor.refreshUploaded();
        if (activeSlug) {
          try {
            uploadedImages = await fetchGameImages(activeSlug);
          } catch {
            uploadedImages = [];
          }
        }
      };

      const replaceCheckboxMarkersInJournal = (oldRef: string, newRef: string) => {
        if (!setPageContent || !getJournalData || oldRef === newRef) return;
        const journal = getJournalData();
        const activePageId = getActivePageId?.() ?? '';
        const contents = {
          ...journal.contents,
          ...(activePageId ? { [activePageId]: markdownEditor.getValue() } : {}),
        };
        for (const [pageId, content] of Object.entries(contents)) {
          const next = replaceCheckboxMarkerId(content, oldRef, newRef);
          if (next !== content) {
            setPageContent(pageId, next);
          }
        }
        scheduleAutosave();
      };

      const replaceProgressMarkersInJournal = (oldRef: string, newRef: string) => {
        if (!setPageContent || !getJournalData || oldRef === newRef) return;
        const journal = getJournalData();
        const activePageId = getActivePageId?.() ?? '';
        const contents = {
          ...journal.contents,
          ...(activePageId ? { [activePageId]: markdownEditor.getValue() } : {}),
        };
        for (const [pageId, content] of Object.entries(contents)) {
          const next = replaceProgressMarkerReference(content, oldRef, newRef);
          if (next !== content) {
            setPageContent(pageId, next);
          }
        }
        scheduleAutosave();
      };

      const replaceMapMarkersInJournal = (oldRef: string, newRef: string) => {
        if (!setPageContent || !getJournalData || oldRef === newRef) return;
        const journal = getJournalData();
        const activePageId = getActivePageId?.() ?? '';
        const contents = {
          ...journal.contents,
          ...(activePageId ? { [activePageId]: markdownEditor.getValue() } : {}),
        };
        for (const [pageId, content] of Object.entries(contents)) {
          const next = replaceMapMarkerReference(content, oldRef, newRef);
          if (next !== content) {
            setPageContent(pageId, next);
          }
        }
        scheduleAutosave();
      };

      const mapsEditor = mountMapsEditor(
        container.querySelector('#maps-editor') as HTMLElement,
        activeSlug,
        maps,
        () => getCheckboxesData?.() ?? checkboxes,
        {
          onMapsChanged: scheduleAutosave,
          onMapIdChanged: replaceMapMarkersInJournal,
        },
      );
      getMapsData = mapsEditor.getData;
      cleanupMapsEditor = mapsEditor.cleanup;

      const progressBarsEditor = mountProgressBarsEditor(
        container.querySelector('#progress-bars-editor') as HTMLElement,
        progressBars,
        {
          onProgressBarsChanged: () => {
            refreshCheckboxesEditor?.();
            scheduleAutosave();
          },
        },
      );
      getProgressBarsData = progressBarsEditor.getData;
      registerProgressBar = progressBarsEditor.registerProgressBar;
      cleanupProgressBarsEditor = progressBarsEditor.cleanup;

      const checkboxesEditor = mountCheckboxConnectionsEditor(
        container.querySelector('#checkbox-connections-editor') as HTMLElement,
        markdownEditor,
        checkboxes,
        () => getProgressBarsData?.() ?? { tags: [] },
        {
          getJournalContents: () => {
            const journal = getJournalData?.() ?? { pages: [], contents: {} };
            const activePageId = getActivePageId?.() ?? '';
            return {
              pages: journal.pages,
              contents: {
                ...journal.contents,
                ...(activePageId ? { [activePageId]: markdownEditor.getValue() } : {}),
              },
            };
          },
          onParentsChanged: () => {
            void refreshEmbedContext();
          },
          onCheckboxesChanged: scheduleAutosave,
          onEnsureProgressBar: (name) => {
            const bars = getProgressBarsData?.().tags ?? [];
            const existing = findProgressBarByName(bars, name);
            if (existing) return existing;
            return progressBarsEditor.addProgressBar(name);
          },
        },
      );
      getCheckboxesData = checkboxesEditor.getData;
      registerCheckbox = checkboxesEditor.addCheckbox;
      updateCheckbox = (id, updates) => {
        const newId = checkboxesEditor.updateCheckbox(id, updates);
        if (newId === false) return false;
        if (newId !== id) {
          replaceCheckboxMarkersInJournal(id, newId);
          mapsEditor.renameCheckboxReference(id, newId);
        }
        return newId;
      };
      refreshCheckboxesEditor = checkboxesEditor.refresh;
      cleanupCheckboxesEditor = checkboxesEditor.cleanup;

      updateProgressBar = (id, updates) => {
        const newId = progressBarsEditor.updateProgressBar(id, updates);
        if (newId === false) return false;
        if (newId !== id) {
          replaceProgressMarkersInJournal(id, newId);
          checkboxesEditor.renameProgressBarReference(id, newId);
        }
        return newId;
      };

      const mobyGamesHost = container.querySelector('#mobygames-admin') as HTMLElement;
      if (isNew) {
        mobyGamesHost.innerHTML =
          '<p class="text-muted text-sm">Link MobyGames after saving the game.</p>';
      } else if (activeSlug) {
        cleanupMobyGamesAdmin = mountMobyGamesAdmin(mobyGamesHost, activeSlug);
      }

      const getEmbedContext = () => ({
        checkboxes: getCheckboxesData?.().checkboxes ?? [],
        progressBars: getProgressBarsData?.().tags ?? [],
        maps: getMapsData?.().maps ?? [],
      });

      getMergedJournalContents = () => {
        const journalData = getJournalData?.() ?? journal;
        const activePageId = getActivePageId?.() ?? '';
        return {
          ...journalData.contents,
          ...(activePageId ? { [activePageId]: markdownEditor.getValue() } : {}),
        };
      };

      cleanupAdmin = mountEditorAdmin(
        container.querySelector('#editor-admin') as HTMLElement,
        activeSlug ?? '',
        gameName,
        () => getJournalData?.() ?? journal,
        () => getCheckboxesData?.() ?? checkboxes,
        () => getProgressBarsData?.() ?? progressBars,
        () => getMapsData?.() ?? maps,
        () => getImageLibraryData?.() ?? imageLibrary,
        {
          createMode: isNew,
          countAbandonedEmbeds: () => {
            const context = getEmbedContext();
            return Object.values(getMergedJournalContents()).reduce(
              (total, content) => total + countAbandonedEmbeds(content, context),
              0,
            );
          },
          clearAbandonedEmbeds: () => {
            const context = getEmbedContext();
            let removed = 0;

            for (const [pageId, content] of Object.entries(getMergedJournalContents())) {
              const result = stripAbandonedEmbeds(content, context);
              if (result.content === content) continue;
              setPageContent?.(pageId, result.content);
              removed += result.removed;
            }

            if (removed > 0) {
              void refreshEmbedContext();
            }

            return removed;
          },
          countPagesWithExtraWhitespace: () =>
            countPagesWithExtraWhitespace(getMergedJournalContents()),
          removeExtraWhitespace: () => {
            const current = getMergedJournalContents();
            const result = removeExtraWhitespaceFromPages(current);
            if (result.changedPages === 0) return 0;

            for (const [pageId, content] of Object.entries(result.contents)) {
              if (current[pageId] === content) continue;
              setPageContent?.(pageId, content);
            }

            return result.changedPages;
          },
        },
      );

      void refreshEmbedContext();

      cleanupMarkdownChange = markdownEditor.onChange(scheduleAutosave);

      const onFormInput = () => {
        scheduleAutosave();
      };
      form.addEventListener('input', onFormInput);
      form.addEventListener('change', onFormInput);

      cleanupAutosave = () => {
        clearAutosaveTimer();
        form.removeEventListener('input', onFormInput);
        form.removeEventListener('change', onFormInput);
      };

      queueMicrotask(() => {
        window.scrollTo(0, 0);
      });
  } catch (error) {
    errorEl.textContent = error instanceof Error ? error.message : 'Failed to load game';
    errorEl.classList.remove('hidden');
  }

  const createNewGame = async (destination: 'editor' | 'viewer') => {
    if (!getJournalData) {
      errorEl.textContent = 'Editor is still loading.';
      errorEl.classList.remove('hidden');
      return;
    }

    const journalData = getJournalData();
    const hasContent = Object.values(journalData.contents).some((page) => page.trim());
    if (!hasContent) {
      errorEl.textContent = 'At least one page needs content.';
      errorEl.classList.remove('hidden');
      markdownEditor.focus();
      return;
    }

    const nameInput = container.querySelector('#game-name') as HTMLInputElement;
    const slugInput = container.querySelector('#game-slug') as HTMLInputElement;
    const mainPageId = journalData.pages[0]?.id ?? 'main';
    const mainContent = journalData.contents[mainPageId]?.trim() ?? '';
    const game = await createGame(
      slugInput.value.trim(),
      nameInput.value.trim(),
      mainContent,
    );
    activeSlug = game.slug;

    if (getCheckboxesData && getProgressBarsData && getMapsData) {
      await saveEditorState(activeSlug, {
        journal: journalData,
        checkboxes: getCheckboxesData(),
        completionTags: getProgressBarsData(),
        maps: getMapsData(),
        imageLibrary: getImageLibraryData?.() ?? { images: [] },
      });
    }

    navigate(destination === 'viewer' ? `/viewer/${game.slug}` : `/editor/${game.slug}`);
  };

  const openViewer = async () => {
    errorEl.classList.add('hidden');

    try {
      if (isNew) {
        await createNewGame('viewer');
        return;
      }

      clearAutosaveTimer();
      await persistEditorData(true);
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        await openViewer();
        return;
      }
      errorEl.textContent = error instanceof Error ? error.message : 'Save failed';
      errorEl.classList.remove('hidden');
    }
  };

  const onOpenViewerClick = () => {
    void openViewer();
  };

  const onSubmit = (event: Event) => {
    event.preventDefault();
    void openViewer();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
    event.preventDefault();

    if (isNew) {
      errorEl.classList.add('hidden');
      void createNewGame('editor').catch((error) => {
        if (error instanceof AuthRequiredError) {
          void requireAuth().then((authed) => {
            if (authed) void createNewGame('editor');
          });
          return;
        }
        errorEl.textContent = error instanceof Error ? error.message : 'Save failed';
        errorEl.classList.remove('hidden');
      });
      return;
    }

    void flushAutosave().catch(() => {});
  };

  viewerBtn.addEventListener('click', onOpenViewerClick);
  form.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', onKeyDown);

  const cleanupCollapsible = wireCollapsiblePanels(container);

  return () => {
    editorDisposed = true;
    clearAutosaveTimer();
    cleanupAutosave?.();
    cleanupMarkdownChange?.();
    closeEmbedPopover?.();
    cleanupCollapsible();
    cleanupReturnTop();
    cleanupTabHelp?.();
    cleanupTabs?.();
    cleanupPagesEditor?.();
    cleanupImageEditor?.();
    cleanupMapsEditor?.();
    cleanupCheckboxesEditor?.();
    cleanupProgressBarsEditor?.();
    cleanupMobyGamesAdmin?.();
    cleanupAdmin?.();
    markdownEditor.destroy();
    document.removeEventListener('keydown', onKeyDown);
    viewerBtn.removeEventListener('click', onOpenViewerClick);
    form.removeEventListener('submit', onSubmit);
  };
}
