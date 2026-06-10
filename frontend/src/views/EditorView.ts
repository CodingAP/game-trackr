import { openImageInsertDialogOrWarn } from '../components/ImageInsertDialog.js';
import { openProgressInsertDialog } from '../components/ProgressInsertDialog.js';
import { openCheckboxInsertDialog } from '../components/CheckboxInsertDialog.js';
import { mountCheckboxConnectionsEditor } from '../components/CheckboxConnectionsEditor.js';
import { wireCollapsiblePanels } from '../components/CollapsiblePanel.js';
import { mountCompletionTagsEditor } from '../components/CompletionTagsEditor.js';
import { mountEditorAdmin } from '../components/EditorAdmin.js';
import { mountMobyGamesAdmin } from '../components/MobyGamesAdmin.js';
import { mountEditorTabs } from '../components/EditorTabs.js';
import { mountImageEditor } from '../components/ImageEditor.js';
import { mountMapsEditor } from '../components/MapsEditor.js';
import { mountMarkdownEditor } from '../components/MarkdownEditor.js';
import { mountPagesEditor } from '../components/PagesEditor.js';
import type { MarkdownEditorHandle } from '../types/markdownEditor.js';
import type { EditorTabId } from '../types/index.js';
import {
  createGame,
  fetchCheckboxConnections,
  fetchCompletionTags,
  fetchGame,
  fetchGameJournal,
  fetchMaps,
  saveCheckboxConnections,
  saveCompletionTags,
  saveGameJournal,
  saveMaps,
  AuthRequiredError,
} from '../api/client.js';
import { requireAuth } from '../components/AuthPrompt.js';
import { consumeImportDraft } from '../utils/journalBundle.js';
import { navigate } from '../router.js';
import { renderEditorTabHelp, wireEditorTabHelp } from '../components/editorTabHelp.js';
import { icon, iconLabel } from '../components/icons.js';

const DEFAULT_CONTENT = '# New Game\n\n- [[cb:goal-1]] Add your first goal\n';

export async function renderEditor(
  container: HTMLElement,
  params: Record<string, string>,
): Promise<() => void> {
  const slug = params.slug;
  const isNew = !slug;

  container.innerHTML = `
    <div class="app-shell ${isNew ? 'max-w-4xl' : 'max-w-6xl'}">
      <h1 class="page-heading mb-2">${isNew ? 'Create Game' : 'Edit Game'}</h1>
      ${!isNew ? '<p class="text-muted mb-6">Editing <strong class="text-strong" id="game-title"></strong></p>' : '<div class="mb-6"></div>'}
      <form id="editor-form" class="space-y-4">
        ${
          !isNew
            ? `
          <div class="editor-header-bar mb-6">
            <div id="editor-tabs-nav" class="editor-header-tabs"></div>
            <div class="editor-header-actions form-actions">
              <button type="submit" class="btn-primary">${iconLabel('save', 'Save')}</button>
              <button type="button" id="cancel-edit" class="btn-secondary">${iconLabel('close', 'Cancel')}</button>
            </div>
          </div>
        `
            : ''
        }
        ${isNew ? `
          <label class="block">
            <span class="label">Game Name</span>
            <input type="text" id="game-name" class="input" placeholder="Super Mario Bros." required />
          </label>
          <label class="block">
            <span class="label">Slug</span>
            <input type="text" id="game-slug" class="input" placeholder="super-mario-bros" pattern="[a-z0-9]+(-[a-z0-9]+)*" required />
            <span class="hint">Lowercase letters, numbers, and hyphens only.</span>
          </label>
        ` : ''}

        <div id="tab-content" class="editor-tab-panel">
          ${
            !isNew
              ? `
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
          `
              : `
            <span class="label">Page Content</span>
            <div id="markdown-editor-root" class="mt-1"></div>
          `
          }
        </div>

        ${!isNew ? `
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
              <div id="completion-tags-editor"></div>
            </div>
          </div>

          <div id="tab-admin" class="editor-tab-panel" hidden>
            ${renderEditorTabHelp('admin')}
            <div class="editor-tab-panel-body space-y-4">
              <div id="mobygames-admin" class="mb-4"></div>
              <div id="editor-admin"></div>
            </div>
          </div>
        ` : ''}

        ${
          isNew
            ? `
        <div class="form-actions pt-2">
          <button type="submit" class="btn-primary">${iconLabel('save', 'Save')}</button>
          <button type="button" id="cancel-edit" class="btn-secondary">${iconLabel('close', 'Cancel')}</button>
        </div>
        `
            : ''
        }
        <p id="editor-error" class="text-sm text-red-400 hidden"></p>
      </form>
    </div>
  `;

  const form = container.querySelector('#editor-form') as HTMLFormElement;
  const errorEl = container.querySelector('#editor-error') as HTMLElement;
  const cancelBtn = container.querySelector('#cancel-edit') as HTMLButtonElement;
  const editorRoot = container.querySelector('#markdown-editor-root') as HTMLElement;

  let activeSlug = slug;
  let cleanupImageEditor: (() => void) | null = null;
  let refreshUploadedImages: (() => Promise<void>) | null = null;
  let cleanupTagsEditor: (() => void) | null = null;
  let cleanupCheckboxesEditor: (() => void) | null = null;
  let cleanupMapsEditor: (() => void) | null = null;
  let cleanupPagesEditor: (() => void) | null = null;
  let cleanupAdmin: (() => void) | null = null;
  let cleanupMobyGamesAdmin: (() => void) | null = null;
  let cleanupTabs: (() => void) | null = null;
  let getTagsData: (() => import('../types/index.js').CompletionTagsData) | null = null;
  let getJournalData: (() => import('../types/index.js').FullJournalData) | null = null;
  let getCheckboxesData: (() => import('../types/index.js').CheckboxConnectionsData) | null = null;
  let getMapsData: (() => import('../types/index.js').GameMapsData) | null = null;
  let getActivePageId: (() => string) | null = null;
  let refreshCheckboxesEditor: (() => void) | null = null;
  let registerCheckbox: ((checkbox: import('../types/index.js').ManagedCheckbox) => boolean) | null = null;
  let gameName = '';
  let cleanupTabHelp: (() => void) | null = null;
  let switchTab: ((id: EditorTabId) => void) | null = null;

  const markdownEditor = mountMarkdownEditor(editorRoot, isNew ? DEFAULT_CONTENT : '', {
    onOpenImagePicker: () => {
      openImageInsertDialogOrWarn({
        slug: activeSlug,
        onInsert: (snippet) => {
          markdownEditor.insertText(
            `${markdownEditor.getValue().trimEnd() ? '\n' : ''}${snippet.trimStart()}`,
          );
        },
        onImagesChanged: () => {
          void refreshUploadedImages?.();
        },
      });
    },
    onOpenProgressPicker: () => {
      openProgressInsertDialog({
        tags: getTagsData?.().tags ?? [],
        onInsert: (marker) => markdownEditor.insertLine(marker),
      });
    },
    onOpenCheckboxPicker: () => {
      openCheckboxInsertDialog({
        checkboxes: getCheckboxesData?.().checkboxes ?? [],
        onInsert: (marker) => markdownEditor.insertLine(marker),
        onRegisterCheckbox: registerCheckbox ?? undefined,
      });
    },
  });

  if (isNew) {
    const draft = consumeImportDraft();
    if (draft) {
      const nameInput = container.querySelector('#game-name') as HTMLInputElement | null;
      const slugInput = container.querySelector('#game-slug') as HTMLInputElement | null;
      if (nameInput) nameInput.value = draft.name;
      if (slugInput) slugInput.value = draft.slug;
      const mainContent =
        draft.journal?.contents.main ??
        draft.journal?.contents[Object.keys(draft.journal?.contents ?? {})[0] ?? ''] ??
        draft.content ??
        '';
      markdownEditor.setValue(mainContent);
    }
  }

  if (!isNew && activeSlug) {
    try {
      const [game, journal, checkboxes, tags, maps] = await Promise.all([
        fetchGame(activeSlug),
        fetchGameJournal(activeSlug),
        fetchCheckboxConnections(activeSlug),
        fetchCompletionTags(activeSlug),
        fetchMaps(activeSlug),
      ]);
      gameName = game.name;
      const titleEl = container.querySelector('#game-title');
      if (titleEl) titleEl.textContent = game.name;

      const pagesEditor = mountPagesEditor(
        container.querySelector('#pages-editor') as HTMLElement,
        markdownEditor,
        journal,
      );
      getJournalData = pagesEditor.getData;
      getActivePageId = pagesEditor.getActivePageId;
      cleanupPagesEditor = pagesEditor.cleanup;

      const contentPanel = container.querySelector('#tab-content') as HTMLElement;
      const imagesPanel = container.querySelector('#tab-images') as HTMLElement;
      const mapsPanel = container.querySelector('#tab-maps') as HTMLElement;
      const checkboxesPanel = container.querySelector('#tab-checkboxes') as HTMLElement;
      const tagsPanel = container.querySelector('#tab-tags') as HTMLElement;
      const adminPanel = container.querySelector('#tab-admin') as HTMLElement;

      const tabs = mountEditorTabs(container.querySelector('#editor-tabs-nav') as HTMLElement, [
        { id: 'content', label: 'Pages', panel: contentPanel },
        { id: 'images', label: 'Images', panel: imagesPanel },
        { id: 'maps', label: 'Maps', panel: mapsPanel },
        { id: 'checkboxes', label: 'Checkboxes', panel: checkboxesPanel },
        { id: 'tags', label: 'Completion Tags', panel: tagsPanel },
        { id: 'admin', label: 'Admin', panel: adminPanel },
      ]);
      switchTab = tabs.setTab;
      cleanupTabs = tabs.cleanup;
      cleanupTabHelp = wireEditorTabHelp(container);

      const imageEditor = mountImageEditor(
        container.querySelector('#image-editor') as HTMLElement,
        markdownEditor,
        activeSlug,
      );
      cleanupImageEditor = imageEditor.cleanup;
      refreshUploadedImages = imageEditor.refreshUploaded;

      const mapsEditor = mountMapsEditor(
        container.querySelector('#maps-editor') as HTMLElement,
        markdownEditor,
        activeSlug,
        maps,
        () => getCheckboxesData?.() ?? checkboxes,
      );
      getMapsData = mapsEditor.getData;
      cleanupMapsEditor = mapsEditor.cleanup;

      const tagsEditor = mountCompletionTagsEditor(
        container.querySelector('#completion-tags-editor') as HTMLElement,
        markdownEditor,
        tags,
      );
      getTagsData = tagsEditor.getData;
      cleanupTagsEditor = tagsEditor.cleanup;

      const checkboxesEditor = mountCheckboxConnectionsEditor(
        container.querySelector('#checkbox-connections-editor') as HTMLElement,
        markdownEditor,
        checkboxes,
        () => getTagsData?.() ?? { tags: [] },
      );
      getCheckboxesData = checkboxesEditor.getData;
      registerCheckbox = checkboxesEditor.addCheckbox;
      refreshCheckboxesEditor = checkboxesEditor.refresh;
      cleanupCheckboxesEditor = checkboxesEditor.cleanup;

      cleanupMobyGamesAdmin = mountMobyGamesAdmin(
        container.querySelector('#mobygames-admin') as HTMLElement,
        activeSlug,
      );

      cleanupAdmin = mountEditorAdmin(
        container.querySelector('#editor-admin') as HTMLElement,
        activeSlug,
        gameName,
        () => getJournalData?.() ?? journal,
        () => getCheckboxesData?.() ?? checkboxes,
        () => getTagsData?.() ?? { tags: [] },
        () => getMapsData?.() ?? maps,
      );
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : 'Failed to load game';
      errorEl.classList.remove('hidden');
    }
  }

  const onCancel = () => navigate('/');
  cancelBtn.addEventListener('click', onCancel);

  const onSubmit = async (event: Event) => {
    event.preventDefault();
    errorEl.classList.add('hidden');

    const content = markdownEditor.getValue().trim();
    if (!content) {
      errorEl.textContent = 'Page content is required.';
      errorEl.classList.remove('hidden');
      markdownEditor.focus();
      return;
    }

    try {
      if (isNew) {
        const nameInput = container.querySelector('#game-name') as HTMLInputElement;
        const slugInput = container.querySelector('#game-slug') as HTMLInputElement;
        const game = await createGame(slugInput.value.trim(), nameInput.value.trim(), content);
        activeSlug = game.slug;
        navigate(`/editor/${game.slug}`);
        return;
      }

      if (activeSlug && getJournalData && getCheckboxesData && getTagsData && getMapsData) {
        const journal = getJournalData();
        const hasContent = Object.values(journal.contents).some((page) => page.trim());
        if (!hasContent) {
          errorEl.textContent = 'At least one page needs content.';
          errorEl.classList.remove('hidden');
          return;
        }

        await Promise.all([
          saveGameJournal(activeSlug, journal),
          saveCheckboxConnections(activeSlug, getCheckboxesData()),
          saveCompletionTags(activeSlug, getTagsData()),
          saveMaps(activeSlug, getMapsData()),
        ]);
        navigate(`/viewer/${activeSlug}`);
      }
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        form.requestSubmit();
        return;
      }
      errorEl.textContent = error instanceof Error ? error.message : 'Save failed';
      errorEl.classList.remove('hidden');
    }
  };

  form.addEventListener('submit', onSubmit);

  const cleanupCollapsible = !isNew ? wireCollapsiblePanels(container) : null;

  return () => {
    cleanupCollapsible?.();
    cleanupTabHelp?.();
    cleanupTabs?.();
    cleanupPagesEditor?.();
    cleanupImageEditor?.();
    cleanupMapsEditor?.();
    cleanupCheckboxesEditor?.();
    cleanupTagsEditor?.();
    cleanupMobyGamesAdmin?.();
    cleanupAdmin?.();
    markdownEditor.destroy();
    cancelBtn.removeEventListener('click', onCancel);
    form.removeEventListener('submit', onSubmit);
    void refreshCheckboxesEditor;
  };
}
