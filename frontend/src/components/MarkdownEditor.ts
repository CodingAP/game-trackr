import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  markdownEditorTheme,
  markdownSyntaxHighlighting,
} from './markdownEditorTheme.js';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from '@codemirror/view';
import type { MarkdownEditorHandle } from '../types/markdownEditor.js';

export interface MarkdownEditorOptions {
  onSwitchToImages?: () => void;
}

const toolbarButtons = [
  { action: 'h1', label: 'H1', title: 'Heading 1' },
  { action: 'h2', label: 'H2', title: 'Heading 2' },
  { action: 'h3', label: 'H3', title: 'Heading 3' },
  { action: 'bold', label: 'B', title: 'Bold' },
  { action: 'italic', label: 'I', title: 'Italic' },
  { action: 'link', label: 'Link', title: 'Link' },
  { action: 'checkbox', label: 'Check', title: 'Checkbox' },
  { action: 'image', label: 'Image', title: 'Image markdown' },
  { action: 'hr', label: '---', title: 'Horizontal rule' },
  { action: 'code', label: 'Code', title: 'Inline code' },
] as const;

export function mountMarkdownEditor(
  container: HTMLElement,
  initialValue: string,
  options: MarkdownEditorOptions = {},
): MarkdownEditorHandle {
  const listeners = new Set<() => void>();
  let view: EditorView;

  container.innerHTML = `
    <div class="markdown-editor">
      <div class="markdown-editor-toolbar" role="toolbar" aria-label="Markdown formatting">
        ${toolbarButtons
          .map(
            (button) => `
              <button type="button" class="markdown-toolbar-btn" data-action="${button.action}" title="${button.title}">
                ${button.label}
              </button>
            `,
          )
          .join('')}
        ${
          options.onSwitchToImages
            ? '<button type="button" class="markdown-toolbar-btn markdown-toolbar-btn-accent" data-action="upload-tab" title="Open image upload">Upload image</button>'
            : ''
        }
      </div>
      <div class="markdown-editor-host"></div>
    </div>
  `;

  const host = container.querySelector('.markdown-editor-host') as HTMLElement;

  view = new EditorView({
    state: EditorState.create({
      doc: initialValue,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        markdown({ base: markdownLanguage }),
        markdownSyntaxHighlighting,
        markdownEditorTheme,
        EditorView.lineWrapping,
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            listeners.forEach((callback) => callback());
          }
        }),
      ],
    }),
    parent: host,
  });

  const notify = () => listeners.forEach((callback) => callback());

  const handle: MarkdownEditorHandle = {
    getValue: () => view.state.doc.toString(),
    setValue: (value: string) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    },
    onChange: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    insertText: (text: string) => {
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      });
      view.focus();
      notify();
    },
    wrapSelection: (before: string, after: string, placeholder = 'text') => {
      const { from, to } = view.state.selection.main;
      const selected = view.state.sliceDoc(from, to) || placeholder;
      const insert = `${before}${selected}${after}`;
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + before.length, head: from + before.length + selected.length },
      });
      view.focus();
      notify();
    },
    insertLine: (text: string) => {
      const { from } = view.state.selection.main;
      const line = view.state.doc.lineAt(from);
      const lineText = line.text.trim();
      const prefix = lineText.length === 0 ? '' : '\n';
      const insert = `${prefix}${text}`;
      const insertAt = line.to;
      view.dispatch({
        changes: { from: insertAt, to: insertAt, insert },
        selection: { anchor: insertAt + insert.length },
      });
      view.focus();
      notify();
    },
    focus: () => view.focus(),
    destroy: () => {
      listeners.clear();
      view.destroy();
    },
  };

  container.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const action = (button as HTMLElement).dataset.action;

      switch (action) {
        case 'h1':
          handle.insertLine('# Heading');
          break;
        case 'h2':
          handle.insertLine('## Heading');
          break;
        case 'h3':
          handle.insertLine('### Heading');
          break;
        case 'bold':
          handle.wrapSelection('**', '**', 'bold text');
          break;
        case 'italic':
          handle.wrapSelection('*', '*', 'italic text');
          break;
        case 'link':
          handle.wrapSelection('[', '](https://)', 'link text');
          break;
        case 'checkbox':
          handle.insertLine('- [ ] Task item');
          break;
        case 'image':
          handle.insertLine('![alt text](url)');
          break;
        case 'hr':
          handle.insertLine('---');
          break;
        case 'code':
          handle.wrapSelection('`', '`', 'code');
          break;
        case 'upload-tab':
          options.onSwitchToImages?.();
          break;
        default:
          break;
      }
    });
  });

  return handle;
}
