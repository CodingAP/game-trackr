import { foldEffect, foldService, foldState, foldedRanges, unfoldEffect } from '@codemirror/language';
import {
  Compartment,
  EditorState,
  StateEffect,
  Transaction,
  type Extension,
  type Text,
} from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  GutterMarker,
  ViewPlugin,
  WidgetType,
  gutterLineClass,
  lineNumbers,
  type ViewUpdate,
} from '@codemirror/view';
import { resolveTag } from '../markdown/completionProgress.js';
import { resolveMap } from '../markdown/gameMaps.js';
import { parseImageEmbedRaw } from '../markdown/imageDocument.js';
import { parseViewportTitle } from '../markdown/images.js';
import {
  formatManagedCheckboxLabel,
  getIndentDepth,
  parseCheckboxLine,
} from '../markdown/managedCheckboxes.js';
import type { CompletionTag, GameMap, ManagedCheckbox } from '../types/index.js';

export interface MarkdownEmbedContext {
  checkboxes: ManagedCheckbox[];
  tags: CompletionTag[];
  maps: GameMap[];
}

export type EmbedKind = 'checkbox' | 'progress' | 'map' | 'image';

export interface EmbedEditTarget {
  kind: EmbedKind;
  from: number;
  to: number;
  reference: string;
  raw: string;
  lineFrom?: number;
  lineTo?: number;
  lineLabel?: string;
  lineIndent?: string;
}

export type EmbedApplyFn = (
  newRaw: string,
  replaceRange?: { from: number; to: number },
) => void;

export interface MarkdownEmbedConfig {
  context: MarkdownEmbedContext;
  onEditEmbed?: (
    target: EmbedEditTarget,
    apply: EmbedApplyFn,
    anchor: HTMLElement,
  ) => void;
}

interface EmbedMatch {
  from: number;
  to: number;
  kind: EmbedKind;
  label: string;
  missing: boolean;
  title: string;
  reference: string;
  lineFrom?: number;
  lineTo?: number;
  lineLabel?: string;
  lineIndent?: string;
  depth?: number;
}

const CHECKBOX_NEST_INDENT_REM = 1.5;

const PROGRESS_MARKER = /\[\[(?:pb|tag-progress):([^\]]+)\]\]/g;
const MAP_MARKER = /\[\[map:([^\]]+)\]\]/g;
const IMAGE_MARKER = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g;
const FIGURE_BLOCK =
  /<figure class="[^"]*(?:image-figure|media-figure)[^"]*">[\s\S]*?<\/figure>/g;

const EMBED_KIND_LABEL: Record<EmbedKind, string> = {
  checkbox: 'Checkbox',
  progress: 'Progress',
  map: 'Map',
  image: 'Media',
};

interface MultilineImageRange {
  from: number;
  to: number;
}

function findMultilineImageEmbedRanges(doc: string): MultilineImageRange[] {
  const ranges: MultilineImageRange[] = [];
  const occupied: Array<{ start: number; end: number }> = [];

  for (const match of doc.matchAll(FIGURE_BLOCK)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    if (!match[0].includes('\n')) continue;
    ranges.push({ from, to });
    occupied.push({ start: from, end: to });
  }

  for (const match of doc.matchAll(IMAGE_MARKER)) {
    const from = match.index ?? 0;
    if (overlapsRange(from, occupied)) continue;
    const to = from + match[0].length;
    if (!match[0].includes('\n')) continue;
    ranges.push({ from, to });
  }

  return ranges.sort((a, b) => a.from - b.from);
}

function foldRangeForEmbed(doc: Text, from: number, to: number): { from: number; to: number } | null {
  const firstLine = doc.lineAt(from);
  const foldFrom = Math.min(firstLine.to, to);
  if (foldFrom >= to) return null;
  return { from: foldFrom, to };
}

function isMultilineImageCollapsed(state: EditorState, from: number, to: number): boolean {
  const foldRange = foldRangeForEmbed(state.doc, from, to);
  if (!foldRange) return false;

  let collapsed = false;
  foldedRanges(state).between(foldRange.from, foldRange.to + 1, (rangeFrom, rangeTo) => {
    if (rangeFrom <= foldRange.from && rangeTo >= foldRange.to) {
      collapsed = true;
    }
  });
  return collapsed;
}

function buildEmbedFoldEffects(
  state: EditorState,
  docText = state.doc.toString(),
): StateEffect<unknown>[] {
  const effects: StateEffect<unknown>[] = [];

  for (const range of findMultilineImageEmbedRanges(docText)) {
    if (isMultilineImageCollapsed(state, range.from, range.to)) continue;
    const foldRange = foldRangeForEmbed(state.doc, range.from, range.to);
    if (foldRange) effects.push(foldEffect.of(foldRange));
  }

  return effects;
}

function getHiddenContinuationLineNumbers(doc: Text, state: EditorState): Set<number> {
  const hidden = new Set<number>();

  for (const range of findMultilineImageEmbedRanges(doc.toString())) {
    if (!isMultilineImageCollapsed(state, range.from, range.to)) continue;

    let pos = range.from;
    let first = true;
    while (pos < range.to) {
      const line = doc.lineAt(pos);
      if (!first) hidden.add(line.number);
      first = false;
      if (line.to >= range.to) break;
      pos = line.to + 1;
    }
  }

  return hidden;
}

class FoldedEmbedGutterMarker extends GutterMarker {
  toDOM() {
    const marker = document.createElement('span');
    marker.className = 'md-embed-folded-gutter';
    marker.textContent = ' ';
    return marker;
  }
}

const foldedEmbedGutterMarker = new FoldedEmbedGutterMarker();

function buildFoldedGutterMarkers(state: EditorState) {
  const hidden = getHiddenContinuationLineNumbers(state.doc, state);
  const markers = [...hidden].map((lineNo) => {
    const line = state.doc.line(lineNo);
    return foldedEmbedGutterMarker.range(line.from);
  });

  return Decoration.set(markers, true);
}

export function markdownEditorLineNumbers() {
  return [
    lineNumbers({
      formatNumber: (lineNo, state) => {
        const hidden = getHiddenContinuationLineNumbers(state.doc, state);
        return hidden.has(lineNo) ? '' : String(lineNo);
      },
    }),
    gutterLineClass.compute([foldState], (state) => buildFoldedGutterMarkers(state)),
  ];
}

function embedFoldMaintainer() {
  return ViewPlugin.fromClass(
    class {
      private scheduleId: ReturnType<typeof setTimeout> | null = null;

      update(update: ViewUpdate) {
        if (!update.docChanged) return;
        if (buildEmbedFoldEffects(update.state).length === 0) return;

        if (this.scheduleId !== null) return;

        const view = update.view;
        this.scheduleId = setTimeout(() => {
          this.scheduleId = null;
          if (view.isDestroyed) return;

          const effects = buildEmbedFoldEffects(view.state);
          if (effects.length === 0) return;

          view.dispatch({
            effects,
            selection: view.state.selection,
            annotations: [Transaction.addToHistory.of(false)],
          });
        }, 0);
      }

      destroy() {
        if (this.scheduleId !== null) {
          clearTimeout(this.scheduleId);
          this.scheduleId = null;
        }
      }
    },
  );
}

class HiddenEmbedLineWidget extends WidgetType {
  eq(other: HiddenEmbedLineWidget): boolean {
    return other instanceof HiddenEmbedLineWidget;
  }

  toDOM(): HTMLElement {
    const hidden = document.createElement('span');
    hidden.className = 'md-embed-hidden-line';
    hidden.setAttribute('aria-hidden', 'true');
    return hidden;
  }
}

function dispatchEmbedEdit(
  view: EditorView,
  target: EmbedEditTarget,
  embedFrom: number,
  embedTo: number,
  onEditEmbed: MarkdownEmbedConfig['onEditEmbed'],
  anchor: HTMLElement,
): void {
  if (!onEditEmbed) return;

  onEditEmbed(
    target,
    (newRaw, replaceRange) => {
      const doc = view.state.doc.toString();
      let from = replaceRange?.from ?? embedFrom;
      let to = replaceRange?.to ?? embedTo;

      if (!newRaw) {
        ({ from, to } = getEmbedRemovalRange(doc, {
          kind: target.kind,
          from: embedFrom,
          to: embedTo,
          lineFrom: target.lineFrom,
          lineTo: target.lineTo,
        }));
      }

      view.dispatch({
        changes: { from, to, insert: newRaw },
      });
      view.focus();
    },
    anchor,
  );
}

class EmbedChipWidget extends WidgetType {
  constructor(
    readonly kind: EmbedKind,
    readonly label: string,
    readonly missing: boolean,
    readonly title: string,
    readonly lineFrom: number,
    readonly lineTo: number,
    readonly embedFrom: number,
    readonly embedTo: number,
    readonly reference: string,
    readonly onEditEmbed: MarkdownEmbedConfig['onEditEmbed'],
    readonly depth = 0,
  ) {
    super();
  }

  eq(other: EmbedChipWidget): boolean {
    return (
      this.kind === other.kind &&
      this.label === other.label &&
      this.missing === other.missing &&
      this.title === other.title &&
      this.lineFrom === other.lineFrom &&
      this.lineTo === other.lineTo &&
      this.embedFrom === other.embedFrom &&
      this.embedTo === other.embedTo &&
      this.reference === other.reference &&
      this.depth === other.depth
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const chip = document.createElement('span');
    chip.className = `md-embed-chip md-embed-${this.kind}${this.missing ? ' is-missing' : ''}`;
    if (this.kind === 'checkbox') {
      chip.classList.add('md-embed-checkbox-line');
      chip.dataset.depth = String(this.depth);
      if (this.depth > 0) {
        chip.style.marginInlineStart = `${this.depth * CHECKBOX_NEST_INDENT_REM}rem`;
      }
    }
    chip.title = `${this.title} — Click to edit`;
    chip.setAttribute('aria-label', `${this.title}. Click to edit.`);
    chip.setAttribute('role', 'button');
    chip.tabIndex = 0;

    const kind = document.createElement('span');
    kind.className = 'md-embed-chip-kind';
    kind.textContent = EMBED_KIND_LABEL[this.kind];

    const text = document.createElement('span');
    text.className = 'md-embed-chip-label';
    text.textContent = this.label;

    if (this.kind === 'checkbox') {
      const bullet = document.createElement('span');
      bullet.className = 'md-embed-chip-bullet';
      bullet.textContent = '•';
      bullet.setAttribute('aria-hidden', 'true');
      chip.append(kind, bullet, text);
    } else {
      chip.append(kind, text);
    }

    const openEditor = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!this.onEditEmbed) return;

      const raw = view.state.doc.sliceString(this.embedFrom, this.embedTo);
      const parsedLine = this.kind === 'checkbox' ? parseCheckboxLine(raw) : null;
      const target: EmbedEditTarget = {
        kind: this.kind,
        from: this.embedFrom,
        to: this.embedTo,
        reference: this.reference,
        raw,
      };
      if (parsedLine) {
        target.lineFrom = this.embedFrom;
        target.lineTo = this.embedTo;
        target.lineLabel = parsedLine.label;
        target.lineIndent = parsedLine.indent;
      }
      dispatchEmbedEdit(view, target, this.embedFrom, this.embedTo, this.onEditEmbed, chip);
    };

    chip.addEventListener('mousedown', openEditor);
    chip.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      openEditor(event);
    });

    return chip;
  }

  ignoreEvent(event: Event): boolean {
    return (
      event.type === 'mousedown' ||
      event.type === 'click' ||
      event.type === 'pointerdown' ||
      event.type === 'pointerup'
    );
  }
}

function findCheckboxLineEmbeds(doc: string, context: MarkdownEmbedContext): EmbedMatch[] {
  const matches: EmbedMatch[] = [];
  let offset = 0;

  for (const line of doc.split('\n')) {
    const parsed = parseCheckboxLine(line);
    if (parsed) {
      const from = offset;
      const to = offset + line.length;
      const checkbox = context.checkboxes.find((entry) => entry.id === parsed.id);
      const lineLabel = parsed.label.trim();
      const registryLabel = checkbox ? formatManagedCheckboxLabel(checkbox) : '';
      const displayLabel = lineLabel || registryLabel || parsed.id;

      matches.push({
        from,
        to,
        kind: 'checkbox',
        label: displayLabel,
        missing: !checkbox,
        title: checkbox
          ? `Checkbox: ${displayLabel} (${parsed.id})`
          : `Unknown checkbox: ${displayLabel} (${parsed.id})`,
        reference: parsed.id,
        lineFrom: from,
        lineTo: to,
        lineLabel: parsed.label,
        lineIndent: parsed.indent,
        depth: getIndentDepth(parsed.indent),
      });
    }
    offset += line.length + 1;
  }

  return matches;
}

function overlapsRange(
  pos: number,
  ranges: Array<{ start: number; end: number }>,
): boolean {
  return ranges.some((range) => pos >= range.start && pos < range.end);
}

function findEmbeds(doc: string, context: MarkdownEmbedContext): EmbedMatch[] {
  const matches = findCheckboxLineEmbeds(doc, context);
  const occupied = matches.map((entry) => ({ start: entry.from, end: entry.to }));

  for (const match of doc.matchAll(PROGRESS_MARKER)) {
    const from = match.index ?? 0;
    if (overlapsRange(from, occupied)) continue;
    const ref = match[1].trim();
    const tag = resolveTag(context.tags, ref);
    const tagName = tag?.name.trim() || ref;
    matches.push({
      from: match.index ?? 0,
      to: (match.index ?? 0) + match[0].length,
      kind: 'progress',
      label: tagName,
      missing: !tag,
      title: tag ? `Progress bar: ${tagName}` : `Unknown progress bar: ${ref}`,
      reference: ref,
    });
  }

  for (const match of doc.matchAll(MAP_MARKER)) {
    const from = match.index ?? 0;
    if (overlapsRange(from, occupied)) continue;
    const ref = match[1].trim();
    const map = resolveMap(context.maps, ref);
    const mapName = map?.name.trim() || ref;
    matches.push({
      from: match.index ?? 0,
      to: (match.index ?? 0) + match[0].length,
      kind: 'map',
      label: mapName,
      missing: !map,
      title: map ? `Map: ${mapName}` : `Unknown map: ${ref}`,
      reference: ref,
    });
  }

  for (const match of doc.matchAll(IMAGE_MARKER)) {
    const from = match.index ?? 0;
    if (overlapsRange(from, occupied)) continue;
    const alt = match[1].trim();
    const url = match[2];
    const title = match[3];
    const viewport = title ? parseViewportTitle(title) : null;
    const filename = url.split('/').pop() ?? url;
    const displayLabel = viewport
      ? `${alt || filename} (${viewport.width}×${viewport.height})`
      : alt || filename;
    matches.push({
      from: match.index ?? 0,
      to: (match.index ?? 0) + match[0].length,
      kind: 'image',
      label: displayLabel,
      missing: false,
      title: alt ? `Image: ${alt} (${url})` : url,
      reference: url,
    });
  }

  const allRanges = matches.map((entry) => ({ start: entry.from, end: entry.to }));
  for (const match of doc.matchAll(FIGURE_BLOCK)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlapsRange(start, allRanges)) continue;

    const raw = match[0];
    const parsed = parseImageEmbedRaw(raw);
    if (!parsed) continue;

    const filename = parsed.url.split('/').pop() ?? parsed.url;
    const displayLabel = parsed.viewport
      ? `${parsed.alt || filename} (${parsed.viewport.width}×${parsed.viewport.height})`
      : parsed.alt || filename;
    matches.push({
      from: start,
      to: end,
      kind: 'image',
      label: displayLabel,
      missing: false,
      title: parsed.alt ? `Image: ${parsed.alt} (${parsed.url})` : parsed.url,
      reference: parsed.url,
    });
  }

  return matches.sort((a, b) => a.from - b.from);
}

export function countAbandonedEmbeds(content: string, context: MarkdownEmbedContext): number {
  return findEmbeds(content, context).filter((match) => match.missing).length;
}

function removeSpan(content: string, from: number, to: number): string {
  return content.slice(0, from) + content.slice(to);
}

export function getEmbedRemovalRange(
  doc: string,
  target: Pick<EmbedEditTarget, 'kind' | 'from' | 'to' | 'lineFrom' | 'lineTo'>,
): { from: number; to: number } {
  const from = target.kind === 'checkbox' ? (target.lineFrom ?? target.from) : target.from;
  const to = target.kind === 'checkbox' ? (target.lineTo ?? target.to) : target.to;
  const raw = doc.slice(from, to);

  if (target.kind !== 'checkbox' && !raw.includes('\n')) {
    return { from, to };
  }

  let start = from;
  let end = to;

  if (end < doc.length && doc[end] === '\n') {
    end += 1;
  } else if (start > 0 && doc[start - 1] === '\n') {
    start -= 1;
  }

  return { from: start, to: end };
}

function removeLineRange(content: string, from: number, to: number): string {
  const { from: start, to: end } = getEmbedRemovalRange(content, {
    kind: 'checkbox',
    from,
    to,
    lineFrom: from,
    lineTo: to,
  });
  return content.slice(0, start) + content.slice(end);
}

export function stripAbandonedEmbeds(
  content: string,
  context: MarkdownEmbedContext,
): { content: string; removed: number } {
  const abandoned = findEmbeds(content, context).filter((match) => match.missing);
  if (abandoned.length === 0) {
    return { content, removed: 0 };
  }

  let next = content;
  for (const match of abandoned.sort((a, b) => b.from - a.from)) {
    next =
      match.kind === 'checkbox'
        ? removeLineRange(next, match.from, match.to)
        : removeSpan(next, match.from, match.to);
  }

  return { content: next, removed: abandoned.length };
}

function embedLineRanges(
  doc: Text,
  embedFrom: number,
  embedTo: number,
): Array<{ from: number; to: number; hidden: boolean }> {
  if (!doc.sliceString(embedFrom, embedTo).includes('\n')) {
    return [{ from: embedFrom, to: embedTo, hidden: false }];
  }

  const ranges: Array<{ from: number; to: number; hidden: boolean }> = [];
  let pos = embedFrom;
  let first = true;

  while (pos < embedTo) {
    const line = doc.lineAt(pos);
    const from = Math.max(line.from, embedFrom);
    const to = Math.min(line.to, embedTo);
    if (from < to) {
      ranges.push({ from, to, hidden: !first });
      first = false;
    }
    if (line.to >= embedTo) break;
    pos = line.to + 1;
  }

  return ranges;
}

function buildDecorations(view: EditorView, config: MarkdownEmbedConfig): DecorationSet {
  const doc = view.state.doc;
  const docText = doc.toString();
  const matches = findEmbeds(docText, config.context);
  const decorations: Decoration[] = [];

  for (const match of matches) {
    const multiline = docText.slice(match.from, match.to).includes('\n');
    const collapsible = match.kind === 'image' && multiline;
    const isExpanded =
      collapsible && !isMultilineImageCollapsed(view.state, match.from, match.to);

    if (isExpanded) {
      continue;
    }

    for (const range of embedLineRanges(doc, match.from, match.to)) {
      if (range.hidden) {
        if (collapsible) continue;

        decorations.push(
          Decoration.replace({
            widget: new HiddenEmbedLineWidget(),
            inclusive: false,
          }).range(range.from, range.to),
          Decoration.line({ class: 'md-embed-continuation-line' }).range(range.from),
        );
        continue;
      }

      decorations.push(
        Decoration.replace({
          widget: new EmbedChipWidget(
            match.kind,
            match.label,
            match.missing,
            match.title,
            range.from,
            range.to,
            match.from,
            match.to,
            match.reference,
            config.onEditEmbed,
            match.depth ?? 0,
          ),
          inclusive: false,
        }).range(range.from, range.to),
      );
    }
  }

  return Decoration.set(decorations, true);
}

function markdownEmbedExtension(config: MarkdownEmbedConfig) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, config);
      }

      update(update: ViewUpdate) {
        const foldChanged = update.transactions.some((transaction) =>
          transaction.effects.some(
            (effect) => effect.is(foldEffect) || effect.is(unfoldEffect),
          ),
        );
        if (update.docChanged || update.viewportChanged || foldChanged) {
          this.decorations = buildDecorations(update.view, config);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}

export const markdownEmbedCompartment = new Compartment();

export function configureMarkdownEmbeds(config: MarkdownEmbedConfig): Extension {
  return [
    embedFoldMaintainer(),
    foldService.of((state, lineStart) => {
      const doc = state.doc.toString();

      for (const range of findMultilineImageEmbedRanges(doc)) {
        if (isMultilineImageCollapsed(state, range.from, range.to)) continue;

        const firstLine = state.doc.lineAt(range.from);
        if (lineStart !== firstLine.from) continue;

        const foldRange = foldRangeForEmbed(state.doc, range.from, range.to);
        if (foldRange) return foldRange;
      }

      return null;
    }),
    markdownEmbedExtension(config),
  ];
}

export function buildInitialEmbedFoldEffects(state: EditorState): StateEffect<unknown>[] {
  return buildEmbedFoldEffects(state);
}

export const emptyMarkdownEmbedContext: MarkdownEmbedContext = {
  checkboxes: [],
  tags: [],
  maps: [],
};

export const emptyMarkdownEmbedConfig: MarkdownEmbedConfig = {
  context: emptyMarkdownEmbedContext,
};
