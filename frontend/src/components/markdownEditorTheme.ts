import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { EditorView } from '@codemirror/view';

export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: 'rgb(var(--editor-heading))', fontWeight: '600' },
  { tag: tags.heading1, color: 'rgb(var(--editor-heading))', fontWeight: '700' },
  { tag: tags.heading2, color: 'rgb(var(--editor-heading))', fontWeight: '600' },
  { tag: tags.heading3, color: 'rgb(var(--editor-heading))', fontWeight: '600' },
  { tag: tags.strong, color: 'rgb(var(--editor-strong))', fontWeight: '600' },
  { tag: tags.emphasis, color: 'rgb(var(--editor-emphasis))', fontStyle: 'italic' },
  { tag: tags.link, color: 'rgb(var(--editor-link))', textDecoration: 'underline' },
  { tag: tags.url, color: 'rgb(var(--editor-link))' },
  {
    tag: tags.monospace,
    color: 'rgb(var(--editor-code-fg))',
    backgroundColor: 'rgb(var(--editor-code-bg))',
  },
  { tag: tags.quote, color: 'rgb(var(--editor-quote))', fontStyle: 'italic' },
  { tag: tags.meta, color: 'rgb(var(--editor-meta))' },
  { tag: tags.contentSeparator, color: 'rgb(var(--editor-meta))' },
  { tag: tags.processingInstruction, color: 'rgb(var(--editor-meta))' },
  { tag: tags.list, color: 'rgb(var(--editor-meta))' },
]);

export const markdownSyntaxHighlighting = syntaxHighlighting(markdownHighlightStyle, {
  fallback: true,
});

export const markdownEditorTheme = EditorView.theme({
  '&': {
    fontSize: '0.875rem',
    minHeight: '20rem',
    backgroundColor: 'rgb(var(--editor-bg))',
    color: 'rgb(var(--text))',
  },
  '.cm-content': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    caretColor: 'rgb(var(--editor-cursor))',
    padding: '0.75rem 0',
  },
  '.cm-gutters': {
    backgroundColor: 'rgb(var(--editor-gutter-bg))',
    color: 'rgb(var(--editor-gutter-text))',
    borderRight: '1px solid rgb(var(--border))',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgb(var(--editor-line-active))',
    color: 'rgb(var(--text-muted))',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgb(var(--editor-line-active) / 0.55)',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgb(var(--editor-selection) / 0.28) !important',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'rgb(var(--editor-cursor))',
  },
  '&.cm-focused': {
    outline: '2px solid rgb(var(--accent) / 0.35)',
    outlineOffset: '-1px',
  },
  '.cm-content span[class*="tok-monospace"]': {
    borderRadius: '0.25rem',
    padding: '0.0625rem 0.25rem',
  },
  '.cm-searchMatch': {
    backgroundColor: 'rgb(var(--accent) / 0.18)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'rgb(var(--accent) / 0.32)',
  },
});
