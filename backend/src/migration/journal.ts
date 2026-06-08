import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  CheckboxConnectionsData,
  CompletionTag,
  CompletionTagsData,
  FullJournalData,
  JournalData,
  ManagedCheckbox,
} from '../types.js';
import {
  extractLegacyCheckboxes,
  hasManagedCheckboxSyntax,
  migrateMarkdownToManagedSyntax,
} from './checkboxes.js';

export const JOURNAL_FORMAT_VERSION = 2;

export function journalPath(gameDir: string): string {
  return path.join(gameDir, 'journal.json');
}

export function pagesDir(gameDir: string): string {
  return path.join(gameDir, 'pages');
}

export function pageContentPath(gameDir: string, pageId: string): string {
  return path.join(pagesDir(gameDir), `${pageId}.md`);
}

export function checkboxesPath(gameDir: string): string {
  return path.join(gameDir, 'checkboxes.json');
}

export function contentPath(gameDir: string): string {
  return path.join(gameDir, 'content.md');
}

export function completionTagsPath(gameDir: string): string {
  return path.join(gameDir, 'completion-tags.json');
}

const DEFAULT_MAIN_PAGE_ID = 'main';

function buildManagedCheckboxesFromLegacy(
  legacyItems: ReturnType<typeof extractLegacyCheckboxes>,
  tags: CompletionTag[],
): ManagedCheckbox[] {
  const tagIdsByCheckboxId = new Map<string, string[]>();

  for (const tag of tags) {
    for (const checkboxId of tag.checkboxIds ?? []) {
      const existing = tagIdsByCheckboxId.get(checkboxId) ?? [];
      existing.push(tag.id);
      tagIdsByCheckboxId.set(checkboxId, existing);
    }
  }

  return legacyItems.map((item) => ({
    id: item.id,
    label: item.label,
    parentId: item.parentId,
    tagIds: tagIdsByCheckboxId.get(item.id) ?? [],
  }));
}

function stripCheckboxIdsFromTags(tags: CompletionTag[]): CompletionTag[] {
  return tags.map(({ id, name, showInSummary }) => ({
    id,
    name,
    showInSummary: showInSummary ?? false,
  }));
}

async function readLegacyCompletionTags(gameDir: string): Promise<CompletionTagsData> {
  try {
    const raw = await fs.readFile(completionTagsPath(gameDir), 'utf-8');
    const parsed = JSON.parse(raw) as CompletionTagsData;
    return { tags: parsed.tags ?? [] };
  } catch {
    return { tags: [] };
  }
}

async function writeMigratedJournal(
  gameDir: string,
  journal: JournalData,
  contents: Record<string, string>,
  checkboxes: CheckboxConnectionsData,
  completionTags: CompletionTagsData,
): Promise<void> {
  await fs.mkdir(pagesDir(gameDir), { recursive: true });
  await fs.writeFile(journalPath(gameDir), JSON.stringify(journal, null, 2));

  for (const [pageId, content] of Object.entries(contents)) {
    await fs.writeFile(pageContentPath(gameDir, pageId), content);
  }

  await fs.writeFile(checkboxesPath(gameDir), JSON.stringify(checkboxes, null, 2));
  await fs.writeFile(
    completionTagsPath(gameDir),
    JSON.stringify(completionTags, null, 2),
  );

  const mainContent = contents[DEFAULT_MAIN_PAGE_ID] ?? Object.values(contents)[0] ?? '';
  await fs.writeFile(contentPath(gameDir), mainContent);
}

export async function migrateJournalFromV1(gameDir: string): Promise<FullJournalData> {
  const rawContent = await fs.readFile(contentPath(gameDir), 'utf-8');
  const completionTagsData = await readLegacyCompletionTags(gameDir);
  const legacyTags = completionTagsData.tags;

  let content = rawContent;
  const legacyItems = extractLegacyCheckboxes(content);

  if (!hasManagedCheckboxSyntax(content) && legacyItems.length > 0) {
    content = migrateMarkdownToManagedSyntax(content, new Map());
  }

  const pages = [{ id: DEFAULT_MAIN_PAGE_ID, name: 'Main', order: 0 }];
  const journal: JournalData = {
    version: JOURNAL_FORMAT_VERSION,
    pages,
  };
  const contents = { [DEFAULT_MAIN_PAGE_ID]: content };
  const checkboxes: CheckboxConnectionsData = {
    checkboxes: buildManagedCheckboxesFromLegacy(
      legacyItems,
      legacyTags,
    ),
  };
  const completionTags: CompletionTagsData = {
    tags: stripCheckboxIdsFromTags(legacyTags),
  };

  await writeMigratedJournal(gameDir, journal, contents, checkboxes, completionTags);

  return {
    version: journal.version,
    pages: journal.pages,
    contents,
  };
}

export async function readJournalFromDisk(gameDir: string): Promise<FullJournalData> {
  try {
    const raw = await fs.readFile(journalPath(gameDir), 'utf-8');
    const journal = JSON.parse(raw) as JournalData;

    if (journal.version >= JOURNAL_FORMAT_VERSION && Array.isArray(journal.pages)) {
      const contents: Record<string, string> = {};
      for (const page of journal.pages) {
        contents[page.id] = await fs.readFile(pageContentPath(gameDir, page.id), 'utf-8');
      }

      return {
        version: journal.version,
        pages: journal.pages,
        contents,
      };
    }
  } catch {
    // Fall through to v1 migration.
  }

  try {
    await fs.access(contentPath(gameDir));
    return migrateJournalFromV1(gameDir);
  } catch {
    throw new Error('Journal not found');
  }
}
