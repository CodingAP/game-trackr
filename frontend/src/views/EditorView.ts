import { buildImageSnippet } from '../markdown/images.js';
import { renderCollapsiblePanel, wireCollapsiblePanels } from '../components/CollapsiblePanel.js';
import { mountCompletionTagsEditor } from '../components/CompletionTagsEditor.js';
import { mountEditorAdmin } from '../components/EditorAdmin.js';
import { mountMobyGamesAdmin } from '../components/MobyGamesAdmin.js';
import { mountEditorTabs } from '../components/EditorTabs.js';
import { mountImageEditor } from '../components/ImageEditor.js';
import { mountMarkdownEditor } from '../components/MarkdownEditor.js';
import type { MarkdownEditorHandle } from '../types/markdownEditor.js';
import type { EditorTabId } from '../types/index.js';
import {
  createGame,
  fetchCompletionTags,
  fetchGame,
  fetchGameContent,
  saveCompletionTags,
  saveGameContent,
  uploadGameImage,
} from '../api/client.js';
import { navigate } from '../router.js';

const DEFAULT_CONTENT = '# New Game\n\n- [ ] Add your first goal\n';

export async function renderEditor(
  container: HTMLElement,
  params: Record<string, string>,
): Promise<() => void> {
  const slug = params.slug;
  const isNew = !slug;

  container.innerHTML = `
    <div class="app-shell max-w-4xl">
      <h1 class="page-heading mb-2">${isNew ? 'Create Game' : 'Edit Game'}</h1>
      ${!isNew ? '<p class="text-muted mb-6">Editing <strong class="text-strong" id="game-title"></strong></p>' : '<div class="mb-6"></div>'}
      ${!isNew ? '<div id="editor-tabs-nav" class="mb-6"></div>' : ''}
      <form id="editor-form" class="space-y-4">
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
          <span class="label">Markdown Content</span>
          <div id="markdown-editor-root" class="mt-1"></div>
        </div>

        ${!isNew ? `
          <div id="tab-images" class="editor-tab-panel space-y-4" hidden>
            ${renderCollapsiblePanel({
              title: 'Upload Image',
              content: `
              <div class="space-y-3">
                <div class="grid gap-4 sm:grid-cols-2">
                  <label class="block">
                    <span class="label">Viewport width (px)</span>
                    <input type="number" id="image-width" class="input" min="1" step="1" placeholder="800" />
                  </label>
                  <label class="block">
                    <span class="label">Viewport height (px)</span>
                    <input type="number" id="image-height" class="input" min="1" step="1" placeholder="600" />
                  </label>
                </div>
                <p class="hint">Optional. Constrains display size; leave blank for natural size with scroll.</p>
                <div class="grid gap-4 sm:grid-cols-2">
                  <label class="block">
                    <span class="label">Source label</span>
                    <input type="text" id="image-source-label" class="input" placeholder="Nintendo Wiki" />
                  </label>
                  <label class="block">
                    <span class="label">Source URL</span>
                    <input type="url" id="image-source-url" class="input" placeholder="https://..." />
                  </label>
                </div>
                <p class="hint">Optional. Displays as a link below the image, like [label](url).</p>
                <label class="settings-check">
                  <input type="checkbox" id="image-scale" />
                  <span>Scale to fit viewport</span>
                </label>
                <div class="flex items-center gap-3">
                  <input type="file" id="image-upload" accept="image/*" class="text-sm" />
                  <span id="upload-status" class="text-sm text-muted"></span>
                </div>
              </div>
              `,
            })}
            ${renderCollapsiblePanel({
              title: 'Edit Images',
              content: `
              <p class="hint mb-3">Manage uploaded images here. Removing an image from the markdown does not delete it from this list.</p>
              <div id="image-list" class="space-y-4"></div>
              `,
            })}
          </div>

          <div id="tab-tags" class="editor-tab-panel" hidden>
            <div id="completion-tags-editor"></div>
          </div>

          <div id="tab-admin" class="editor-tab-panel" hidden>
            <div id="mobygames-admin" class="mb-4"></div>
            <div id="editor-admin"></div>
          </div>
        ` : ''}

        <div class="form-actions pt-2">
          <button type="submit" class="btn-primary">Save</button>
          <button type="button" id="cancel-edit" class="btn-secondary">Cancel</button>
        </div>
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
  let cleanupAdmin: (() => void) | null = null;
  let cleanupMobyGamesAdmin: (() => void) | null = null;
  let cleanupTabs: (() => void) | null = null;
  let getTagsData: (() => import('../types/index.js').CompletionTagsData) | null = null;
  let gameName = '';
  let switchTab: ((id: EditorTabId) => void) | null = null;

  const markdownEditor = mountMarkdownEditor(editorRoot, isNew ? DEFAULT_CONTENT : '', {
    onSwitchToImages: () => switchTab?.('images'),
  });

  if (!isNew && activeSlug) {
    try {
      const [game, content, tags] = await Promise.all([
        fetchGame(activeSlug),
        fetchGameContent(activeSlug),
        fetchCompletionTags(activeSlug),
      ]);
      gameName = game.name;
      const titleEl = container.querySelector('#game-title');
      if (titleEl) titleEl.textContent = game.name;
      markdownEditor.setValue(content);

      const contentPanel = container.querySelector('#tab-content') as HTMLElement;
      const imagesPanel = container.querySelector('#tab-images') as HTMLElement;
      const tagsPanel = container.querySelector('#tab-tags') as HTMLElement;
      const adminPanel = container.querySelector('#tab-admin') as HTMLElement;

      const tabs = mountEditorTabs(container.querySelector('#editor-tabs-nav') as HTMLElement, [
        { id: 'content', label: 'Content', panel: contentPanel },
        { id: 'images', label: 'Images', panel: imagesPanel },
        { id: 'tags', label: 'Completion Tags', panel: tagsPanel },
        { id: 'admin', label: 'Admin', panel: adminPanel },
      ]);
      switchTab = tabs.setTab;
      cleanupTabs = tabs.cleanup;

      const imageEditor = mountImageEditor(
        container.querySelector('#image-list') as HTMLElement,
        markdownEditor,
        activeSlug,
      );
      cleanupImageEditor = imageEditor.cleanup;
      refreshUploadedImages = imageEditor.refreshUploaded;

      const tagsEditor = mountCompletionTagsEditor(
        container.querySelector('#completion-tags-editor') as HTMLElement,
        markdownEditor,
        tags,
      );
      getTagsData = tagsEditor.getData;
      cleanupTagsEditor = tagsEditor.cleanup;

      cleanupMobyGamesAdmin = mountMobyGamesAdmin(
        container.querySelector('#mobygames-admin') as HTMLElement,
        activeSlug,
      );

      cleanupAdmin = mountEditorAdmin(
        container.querySelector('#editor-admin') as HTMLElement,
        activeSlug,
        gameName,
        () => markdownEditor.getValue(),
      );
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : 'Failed to load game';
      errorEl.classList.remove('hidden');
    }
  }

  const onCancel = () => navigate('/');
  cancelBtn.addEventListener('click', onCancel);

  const onUpload = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !activeSlug) return;

    const status = container.querySelector('#upload-status') as HTMLElement;
    status.textContent = 'Uploading...';

    try {
      const uploaded = await uploadGameImage(activeSlug, file);
      const widthInput = container.querySelector('#image-width') as HTMLInputElement | null;
      const heightInput = container.querySelector('#image-height') as HTMLInputElement | null;
      const scaleInput = container.querySelector('#image-scale') as HTMLInputElement | null;
      const sourceLabelInput = container.querySelector('#image-source-label') as HTMLInputElement | null;
      const sourceUrlInput = container.querySelector('#image-source-url') as HTMLInputElement | null;
      const width = Number(widthInput?.value);
      const height = Number(heightInput?.value);
      const hasViewport = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
      const sourceLabel = sourceLabelInput?.value.trim();
      const sourceUrl = sourceUrlInput?.value.trim();
      const snippet = buildImageSnippet({
        alt: file.name,
        url: uploaded.url,
        viewport: hasViewport
          ? { width, height, scaleToFit: scaleInput?.checked ?? false }
          : undefined,
        source:
          sourceLabel && sourceUrl ? { label: sourceLabel, url: sourceUrl } : undefined,
      });
      markdownEditor.insertText(`${markdownEditor.getValue().trimEnd() ? '\n' : ''}${snippet.trimStart()}`);
      await refreshUploadedImages?.();
      status.textContent = 'Uploaded — markdown inserted.';
      input.value = '';
      if (widthInput) widthInput.value = '';
      if (heightInput) heightInput.value = '';
      if (scaleInput) scaleInput.checked = false;
      if (sourceLabelInput) sourceLabelInput.value = '';
      if (sourceUrlInput) sourceUrlInput.value = '';
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Upload failed';
    }
  };

  const uploadInput = container.querySelector('#image-upload');
  uploadInput?.addEventListener('change', onUpload);

  const onSubmit = async (event: Event) => {
    event.preventDefault();
    errorEl.classList.add('hidden');

    const content = markdownEditor.getValue().trim();
    if (!content) {
      errorEl.textContent = 'Markdown content is required.';
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

      if (activeSlug) {
        await saveGameContent(activeSlug, content);
        if (getTagsData) {
          await saveCompletionTags(activeSlug, getTagsData());
        }
        navigate(`/viewer/${activeSlug}`);
      }
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : 'Save failed';
      errorEl.classList.remove('hidden');
    }
  };

  form.addEventListener('submit', onSubmit);

  const cleanupCollapsible = !isNew ? wireCollapsiblePanels(container) : null;

  return () => {
    cleanupCollapsible?.();
    cleanupTabs?.();
    cleanupImageEditor?.();
    cleanupTagsEditor?.();
    cleanupMobyGamesAdmin?.();
    cleanupAdmin?.();
    markdownEditor.destroy();
    cancelBtn.removeEventListener('click', onCancel);
    form.removeEventListener('submit', onSubmit);
    uploadInput?.removeEventListener('change', onUpload);
  };
}
