import type { FullJournalData, ManagedCheckbox } from '../types/index.js';
import type { CheckboxItem } from './checkboxes.js';
import { buildCheckboxIndex } from './checkboxes.js';

export const MANAGED_CB_LINE = /^(\s*)- \[\[cb:([^\]]+)\]\]\s*(.*)$/;

export function replaceCheckboxMarkerId(content: string, oldId: string, newId: string): string {
  if (oldId === newId) return content;
  return content.replaceAll(`[[cb:${oldId}]]`, `[[cb:${newId}]]`);
}

export function buildCheckboxMarker(id: string, label: string): string {
  return `- [[cb:${id}]] ${label}`;
}

export function buildCheckboxLine(indent: string, id: string, label: string): string {
  const trimmedLabel = label.trim();
  const line = `${indent}- [[cb:${id}]]${trimmedLabel ? ` ${trimmedLabel}` : ''}`;
  return line.trimEnd();
}

export function parseCheckboxLine(line: string): {
  indent: string;
  id: string;
  label: string;
} | null {
  const match = line.match(MANAGED_CB_LINE);
  if (!match) return null;
  const id = match[2].trim();
  if (!id) return null;
  return {
    indent: match[1],
    id,
    label: match[3].trim(),
  };
}

export function getLineRange(doc: string, pos: number): { from: number; to: number; text: string } {
  const from = doc.lastIndexOf('\n', pos - 1) + 1;
  const nextNewline = doc.indexOf('\n', pos);
  const to = nextNewline === -1 ? doc.length : nextNewline;
  return { from, to, text: doc.slice(from, to) };
}

export function slugifyCheckboxId(label: string, existing: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'checkbox';

  if (!existing.has(base)) return base;

  let counter = 2;
  while (existing.has(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

export function managedToCheckboxItems(checkboxes: ManagedCheckbox[]): CheckboxItem[] {
  const index = new Map(checkboxes.map((cb) => [cb.id, cb]));
  const childIdsByParent = new Map<string, string[]>();

  for (const cb of checkboxes) {
    if (!cb.parentId) continue;
    const siblings = childIdsByParent.get(cb.parentId) ?? [];
    siblings.push(cb.id);
    childIdsByParent.set(cb.parentId, siblings);
  }

  return checkboxes.map((cb) => {
    const depth = getAncestorDepth(cb.id, index);
    return {
      id: cb.id,
      label: cb.label,
      checkedInSource: false,
      depth,
      parentId: cb.parentId,
      childIds: childIdsByParent.get(cb.id) ?? [],
      countsTowardProgress: cb.parentId === null,
    };
  });
}

function getAncestorDepth(id: string, index: Map<string, ManagedCheckbox>): number {
  let depth = 0;
  let current = index.get(id);
  while (current?.parentId) {
    depth += 1;
    current = index.get(current.parentId);
  }
  return depth;
}

export function getTagCheckboxIds(tagId: string, checkboxes: ManagedCheckbox[]): string[] {
  return checkboxes.filter((cb) => cb.tagIds.includes(tagId)).map((cb) => cb.id);
}

const DOCUMENT_CHECKBOX_MARKER = /\[\[cb:([^\]]+)\]\]/g;

export function getDocumentCheckboxIds(contents: Record<string, string>): Set<string> {
  const ids = new Set<string>();

  for (const content of Object.values(contents)) {
    for (const match of content.matchAll(DOCUMENT_CHECKBOX_MARKER)) {
      const id = match[1].trim();
      if (id) ids.add(id);
    }
  }

  return ids;
}

export function formatManagedCheckboxLabel(checkbox: ManagedCheckbox): string {
  return checkbox.label.trim() || checkbox.id || 'Untitled checkbox';
}

export function preprocessManagedCheckboxMarkdown(content: string): string {
  const lines = content.split('\n');
  const output: string[] = [];
  let block: Array<{ depth: number; id: string; label: string }> = [];

  const flushBlock = () => {
    if (block.length === 0) return;
    output.push('<ul class="managed-checkbox-list">');
    for (const item of block) {
      const label = item.label.trim() || item.id;
      output.push(
        `<li class="managed-checkbox" data-cb-id="${escapeAttr(item.id)}" data-cb-depth="${item.depth}">` +
          `<label><input type="checkbox" disabled data-cb-id="${escapeAttr(item.id)}" /> ` +
          `${escapeHtml(label)}</label></li>`,
      );
    }
    output.push('</ul>');
    block = [];
  };

  for (const line of lines) {
    const match = line.match(MANAGED_CB_LINE);
    if (!match) {
      flushBlock();
      output.push(line);
      continue;
    }

    const depth = getIndentDepth(match[1]);
    const id = match[2].trim();
    const label = match[3].trim();
    if (!id) {
      flushBlock();
      output.push(line);
      continue;
    }

    block.push({ depth, id, label });
  }

  flushBlock();
  return output.join('\n');
}

export function collectManagedCheckboxInputs(root: HTMLElement): HTMLInputElement[] {
  return [...root.querySelectorAll('.managed-checkbox input[type="checkbox"][data-cb-id]')];
}

export function buildManagedCheckboxIndex(
  checkboxes: ManagedCheckbox[],
): Map<string, ManagedCheckbox> {
  return new Map(checkboxes.map((cb) => [cb.id, cb]));
}

export function validateManagedCheckboxIds(checkboxes: ManagedCheckbox[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const cb of checkboxes) {
    if (!cb.id.trim()) {
      errors.push('Every checkbox needs an id.');
      continue;
    }
    if (ids.has(cb.id)) {
      errors.push(`Duplicate checkbox id: ${cb.id}`);
    }
    ids.add(cb.id);
    if (cb.parentId && !ids.has(cb.parentId) && !checkboxes.some((entry) => entry.id === cb.parentId)) {
      errors.push(`Checkbox "${cb.id}" references unknown parent "${cb.parentId}".`);
    }
  }

  return errors;
}

export function getIndentDepth(indent: string): number {
  let columns = 0;
  for (const character of indent) {
    if (character === '\t') columns += 2;
    else columns += 1;
  }
  return Math.floor(columns / 2);
}

export function inferCheckboxParentsFromMarkdown(content: string): Map<string, string | null> {
  const parents = new Map<string, string | null>();
  const stack: Array<{ depth: number; id: string }> = [];

  for (const line of content.split('\n')) {
    const parsed = parseCheckboxLine(line);
    if (!parsed) {
      stack.length = 0;
      continue;
    }

    const depth = getIndentDepth(parsed.indent);
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    const parentId = stack.length > 0 ? stack[stack.length - 1].id : null;
    parents.set(parsed.id, parentId);
    stack.push({ depth, id: parsed.id });
  }

  return parents;
}

export function inferCheckboxParentsFromJournal(
  pages: FullJournalData['pages'],
  contents: FullJournalData['contents'],
): Map<string, string | null> {
  const parents = new Map<string, string | null>();
  const orderedPages = [...pages].sort((a, b) => a.order - b.order);

  for (const page of orderedPages) {
    const pageParents = inferCheckboxParentsFromMarkdown(contents[page.id] ?? '');
    for (const [id, parentId] of pageParents) {
      parents.set(id, parentId);
    }
  }

  return parents;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;');
}
