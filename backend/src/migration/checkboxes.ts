const CHECKBOX_LINE = /^(\s*)-\s+\[([ xX])\]\s+(.+)$/;
const MANAGED_CB_LINE = /^(\s*)- \[\[cb:([^\]]+)\]\]\s*(.*)$/;

export interface LegacyCheckboxItem {
  id: string;
  label: string;
  depth: number;
  parentId: string | null;
  childIds: string[];
}

export function hashCheckboxLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  let hash = 5381;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function hashCheckboxPath(path: string[]): string {
  return hashCheckboxLabel(path.join('\0'));
}

function getIndentDepth(indent: string): number {
  let columns = 0;
  for (const character of indent) {
    if (character === '\t') columns += 2;
    else columns += 1;
  }
  return Math.floor(columns / 2);
}

export function extractLegacyCheckboxes(markdown: string): LegacyCheckboxItem[] {
  const items: LegacyCheckboxItem[] = [];
  const index = new Map<string, LegacyCheckboxItem>();
  const stack: Array<{ depth: number; id: string }> = [];
  const path: string[] = [];

  for (const line of markdown.split('\n')) {
    const match = line.match(CHECKBOX_LINE);
    if (!match) continue;

    const depth = getIndentDepth(match[1]);
    const label = match[3].trim();
    if (!label) continue;

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
      path.pop();
    }

    const parent = stack.length > 0 ? index.get(stack[stack.length - 1].id) ?? null : null;
    const itemPath = [...path, label];
    const item: LegacyCheckboxItem = {
      id: hashCheckboxPath(itemPath),
      label,
      depth,
      parentId: parent?.id ?? null,
      childIds: [],
    };

    if (parent) {
      parent.childIds.push(item.id);
    }

    items.push(item);
    index.set(item.id, item);
    stack.push({ depth, id: item.id });
    path.push(label);
  }

  return items;
}

export function migrateMarkdownToManagedSyntax(
  markdown: string,
  idByLabelPath: Map<string, string>,
): string {
  const stack: Array<{ depth: number; label: string }> = [];
  const path: string[] = [];

  return markdown
    .split('\n')
    .map((line) => {
      const match = line.match(CHECKBOX_LINE);
      if (!match) return line;

      const depth = getIndentDepth(match[1]);
      const label = match[3].trim();
      if (!label) return line;

      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
        path.pop();
      }

      const itemPath = [...path, label];
      const id = idByLabelPath.get(itemPath.join('\0')) ?? hashCheckboxPath(itemPath);
      const indent = match[1];
      stack.push({ depth, label });
      path.push(label);

      return `${indent}- [[cb:${id}]] ${label}`;
    })
    .join('\n');
}

export function hasManagedCheckboxSyntax(markdown: string): boolean {
  return markdown.split('\n').some((line) => MANAGED_CB_LINE.test(line));
}
