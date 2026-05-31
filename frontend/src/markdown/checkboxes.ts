const CHECKBOX_LINE = /^(\s*)-\s+\[([ xX])\]\s+(.+)$/;

export interface CheckboxItem {
  id: string;
  label: string;
  checkedInSource: boolean;
  depth: number;
  parentId: string | null;
  childIds: string[];
  countsTowardProgress: boolean;
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

export function buildCheckboxIndex(items: CheckboxItem[]): Map<string, CheckboxItem> {
  return new Map(items.map((item) => [item.id, item]));
}

export function getProgressCheckboxes(items: CheckboxItem[]): CheckboxItem[] {
  return items.filter((item) => item.countsTowardProgress);
}

export function isLeafCheckbox(item: CheckboxItem): boolean {
  return item.childIds.length === 0;
}

export function collectDescendantLeaves(
  id: string,
  index: Map<string, CheckboxItem>,
): string[] {
  const item = index.get(id);
  if (!item) return [];

  if (item.childIds.length === 0) {
    return [item.id];
  }

  return item.childIds.flatMap((childId) => collectDescendantLeaves(childId, index));
}

export function isCheckboxComplete(
  id: string,
  index: Map<string, CheckboxItem>,
  checkedItems: Record<string, boolean>,
): boolean {
  const item = index.get(id);
  if (!item) return false;

  if (item.childIds.length === 0) {
    return checkedItems[id] ?? false;
  }

  return item.childIds.every((childId) => isCheckboxComplete(childId, index, checkedItems));
}

export function extractCheckboxes(markdown: string): CheckboxItem[] {
  const items: CheckboxItem[] = [];
  const index = new Map<string, CheckboxItem>();
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
    const item: CheckboxItem = {
      id: hashCheckboxPath(itemPath),
      label,
      checkedInSource: match[2].toLowerCase() === 'x',
      depth,
      parentId: parent?.id ?? null,
      childIds: [],
      countsTowardProgress: depth === 0,
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

export function formatCheckboxPathLabel(
  item: CheckboxItem,
  checkboxes: CheckboxItem[],
): string {
  const index = buildCheckboxIndex(checkboxes);
  const labels: string[] = [];
  let current: CheckboxItem | undefined = item;

  while (current) {
    labels.unshift(current.label);
    current = current.parentId ? index.get(current.parentId) : undefined;
  }

  return labels.join(' › ');
}

export function collectTaskListItems(root: HTMLElement): HTMLLIElement[] {
  return [...root.querySelectorAll('li')].filter((li) =>
    li.querySelector(':scope > input[type="checkbox"]'),
  ) as HTMLLIElement[];
}
