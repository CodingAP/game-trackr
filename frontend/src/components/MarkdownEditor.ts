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
  type KeyBinding,
} from '@codemirror/view';
import type { MarkdownEditorHandle } from '../types/markdownEditor.js';
import { MARKDOWN_TOOLBAR_ICONS, icon } from './icons.js';

export interface MarkdownEditorOptions {
  onOpenImagePicker?: () => void;
  onOpenProgressPicker?: () => void;
  onOpenCheckboxPicker?: () => void;
}

type ToolbarAction =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'link'
  | 'checkbox'
  | 'progress'
  | 'image';

const toolbarButtons: Array<{
  action: ToolbarAction;
  label: string;
  title: string;
  shortcut?: string;
  textLabel?: true;
}> = [
  { action: 'h1', label: 'H1', title: 'Heading 1', shortcut: 'Mod-Alt-1', textLabel: true },
  { action: 'h2', label: 'H2', title: 'Heading 2', shortcut: 'Mod-Alt-2', textLabel: true },
  { action: 'h3', label: 'H3', title: 'Heading 3', shortcut: 'Mod-Alt-3', textLabel: true },
  { action: 'bold', label: 'Bold', title: 'Bold', shortcut: 'Mod-b' },
  { action: 'italic', label: 'Italic', title: 'Italic', shortcut: 'Mod-i' },
  { action: 'underline', label: 'Underline', title: 'Underline', shortcut: 'Mod-u' },
  { action: 'link', label: 'Link', title: 'Link', shortcut: 'Mod-k' },
  { action: 'checkbox', label: 'Checkbox', title: 'Checkbox', shortcut: 'Mod-Shift-c' },
  { action: 'progress', label: 'Progress', title: 'Insert progress bar', shortcut: 'Mod-Shift-b' },
  { action: 'image', label: 'Image', title: 'Insert image', shortcut: 'Mod-Shift-i' },
];

function formatShortcut(key: string): string {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);
  if (isMac) {
    return key
      .replace(/Mod-/g, '⌘')
      .replace(/Alt-/g, '⌥')
      .replace(/Shift-/g, '⇧')
      .replace(/-/g, '');
  }

  return key
    .replace(/Mod-/g, 'Ctrl+')
    .replace(/Alt-/g, 'Alt+')
    .replace(/Shift-/g, 'Shift+')
    .replace(/-([0-9a-z])/gi, (_, char: string) => char.toUpperCase());
}

function toolbarTitle(button: (typeof toolbarButtons)[number]): string {
  if (!button.shortcut) return button.title;
  return `${button.title} (${formatShortcut(button.shortcut)})`;
}

function wrapSelectionInView(
  view: EditorView,
  before: string,
  after: string,
  placeholder = 'text',
): void {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to) || placeholder;
  const insert = `${before}${selected}${after}`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + before.length, head: from + before.length + selected.length },
  });
}

function insertLineInView(view: EditorView, text: string): void {
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
}

function runMarkdownAction(
  view: EditorView,
  action: ToolbarAction,
  options: MarkdownEditorOptions,
): boolean {
  switch (action) {
    case 'h1':
      insertLineInView(view, '# Heading');
      return true;
    case 'h2':
      insertLineInView(view, '## Heading');
      return true;
    case 'h3':
      insertLineInView(view, '### Heading');
      return true;
    case 'bold':
      wrapSelectionInView(view, '**', '**', 'bold text');
      return true;
    case 'italic':
      wrapSelectionInView(view, '*', '*', 'italic text');
      return true;
    case 'underline':
      wrapSelectionInView(view, '<u>', '</u>', 'underlined text');
      return true;
    case 'link':
      wrapSelectionInView(view, '[', '](https://)', 'link text');
      return true;
    case 'checkbox':
      if (options.onOpenCheckboxPicker) {
        options.onOpenCheckboxPicker();
      } else {
        insertLineInView(view, '- [[cb:checkbox-id]] Task item');
      }
      return true;
    case 'progress':
      if (options.onOpenProgressPicker) {
        options.onOpenProgressPicker();
      } else {
        insertLineInView(view, '[[pb:Tag Name]]');
      }
      return true;
    case 'image':
      if (options.onOpenImagePicker) {
        options.onOpenImagePicker();
      } else {
        insertLineInView(view, '![alt text](url)');
      }
      return true;
    default:
      return false;
  }
}

function buildMarkdownKeymap(
  getOptions: () => MarkdownEditorOptions,
  onChange: () => void,
): KeyBinding[] {
  const bind = (key: string, action: ToolbarAction): KeyBinding => ({
    key,
    run(view) {
      const handled = runMarkdownAction(view, action, getOptions());
      if (handled) {
        view.focus();
        onChange();
      }
      return handled;
    },
  });

  return [
    bind('Mod-b', 'bold'),
    bind('Mod-i', 'italic'),
    bind('Mod-u', 'underline'),
    bind('Mod-k', 'link'),
    bind('Mod-Alt-1', 'h1'),
    bind('Mod-Alt-2', 'h2'),
    bind('Mod-Alt-3', 'h3'),
    bind('Mod-Shift-c', 'checkbox'),
    bind('Mod-Shift-b', 'progress'),
    bind('Mod-Shift-i', 'image'),
  ];
}

export function mountMarkdownEditor(
  container: HTMLElement,
  initialValue: string,
  options: MarkdownEditorOptions = {},
): MarkdownEditorHandle {
  const listeners = new Set<() => void>();
  let view: EditorView;

  const notify = () => listeners.forEach((callback) => callback());

  container.innerHTML = `
    <div class="markdown-editor">
      <div class="markdown-editor-toolbar" role="toolbar" aria-label="Markdown formatting">
        ${toolbarButtons
          .map((button) => {
            const iconName = MARKDOWN_TOOLBAR_ICONS[button.action];
            const content = button.textLabel
              ? `<span class="markdown-toolbar-text">${button.label}</span>`
              : icon(iconName, 'ui-icon ui-icon-md');
            const title = toolbarTitle(button);
            return `
              <button type="button" class="markdown-toolbar-btn" data-action="${button.action}" title="${title}" aria-label="${title}">
                ${content}
              </button>
            `;
          })
          .join('')}
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
        keymap.of([
          ...buildMarkdownKeymap(() => options, notify),
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            notify();
          }
        }),
      ],
    }),
    parent: host,
  });

  const handle: MarkdownEditorHandle = {
    getValue: () => view.state.doc.toString(),
    setValue: (value: string) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    },
    applyChange: (change) => {
      view.dispatch({ changes: change });
      notify();
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
      wrapSelectionInView(view, before, after, placeholder);
      view.focus();
      notify();
    },
    insertLine: (text: string) => {
      insertLineInView(view, text);
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
      const action = (button as HTMLElement).dataset.action as ToolbarAction | undefined;
      if (!action) return;

      runMarkdownAction(view, action, options);
      view.focus();
      notify();
    });
  });

  return handle;
}
