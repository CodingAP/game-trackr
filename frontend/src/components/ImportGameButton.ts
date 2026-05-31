import {
  AuthRequiredError,
  fetchGames,
  importGameJournal,
} from '../api/client.js';
import { requireAuth } from './AuthPrompt.js';
import {
  parseImportFile,
  setImportDraft,
  slugifyJournalName,
} from '../utils/journalBundle.js';
import { navigate } from '../router.js';

async function resolveImportTarget(
  slug: string,
  name: string,
): Promise<{ slug: string; name: string } | null> {
  const games = await fetchGames();
  if (!games.some((game) => game.slug === slug)) {
    return { slug, name };
  }

  const nextSlug = window.prompt(
    `A journal with slug "${slug}" already exists. Enter a new slug:`,
    `${slug}-import`,
  );
  if (!nextSlug?.trim()) return null;

  const nextName = window.prompt('Game name:', name);
  if (!nextName?.trim()) return null;

  return {
    slug: slugifyJournalName(nextSlug),
    name: nextName.trim(),
  };
}

export function wireImportGameButton(container: HTMLElement): () => void {
  const importButton = container.querySelector('[data-action="import-game"]') as HTMLButtonElement | null;
  const fileInput = container.querySelector('[data-action="import-game-file"]') as HTMLInputElement | null;
  if (!importButton || !fileInput) {
    return () => {};
  }

  const onImportClick = async () => {
    if (!(await requireAuth())) return;
    fileInput.click();
  };

  const onImportFile = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    try {
      const parsed = await parseImportFile(file);

      if (parsed.kind === 'markdown') {
        setImportDraft(parsed);
        navigate('/editor');
        return;
      }

      const target = await resolveImportTarget(
        slugifyJournalName(parsed.bundle.slug),
        parsed.bundle.name.trim(),
      );
      if (!target) return;

      const game = await importGameJournal({
        slug: target.slug,
        name: target.name,
        sourceSlug: parsed.bundle.slug,
        content: parsed.bundle.content,
        completionTags: parsed.bundle.completionTags,
        images: parsed.bundle.images,
      });
      navigate(`/viewer/${game.slug}`);
    } catch (error) {
      if (error instanceof AuthRequiredError && (await requireAuth())) {
        window.alert('Sign in succeeded. Please choose the import file again.');
        return;
      }
      window.alert(error instanceof Error ? error.message : 'Failed to import journal.');
    }
  };

  importButton.addEventListener('click', onImportClick);
  fileInput.addEventListener('change', onImportFile);

  return () => {
    importButton.removeEventListener('click', onImportClick);
    fileInput.removeEventListener('change', onImportFile);
  };
}

export function renderImportGameControls(): string {
  return `
    <button type="button" class="btn-secondary" data-action="import-game">Import</button>
    <input
      type="file"
      data-action="import-game-file"
      class="hidden"
      accept=".json,.gametrackr.json,.md,text/markdown,text/plain,application/json"
      aria-hidden="true"
      tabindex="-1"
    />
  `;
}
