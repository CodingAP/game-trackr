import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  insertNewline,
} from '@codemirror/commands';
import { codeFolding, foldGutter, foldKeymap } from '@codemirror/language';
import {
  insertNewlineContinueMarkupCommand,
  markdown,
  markdownLanguage,
} from '@codemirror/lang-markdown';
import {
  markdownEditorTheme,
  markdownSyntaxHighlighting,
} from './markdownEditorTheme.js';
import { EditorSelection, EditorState, Prec, type StateCommand } from '@codemirror/state';
import {
  EditorView,
  keymap,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  type KeyBinding,
} from '@codemirror/view';
import {
  buildInitialEmbedFoldEffects,
  configureMarkdownEmbeds,
  emptyMarkdownEmbedConfig,
  markdownEditorLineNumbers,
  markdownEmbedCompartment,
  type MarkdownEmbedConfig,
  type MarkdownEmbedContext,
} from './markdownEmbedExtension.js';
import { parseCheckboxLine } from '../markdown/managedCheckboxes.js';
import type { MarkdownEditorHandle } from '../types/markdownEditor.js';
import { MARKDOWN_TOOLBAR_ICONS, icon } from './icons.js';

const continueMarkdownMarkup = insertNewlineContinueMarkupCommand({ nonTightLists: false });

const insertNewlineOnManagedCheckbox: StateCommand = ({ state, dispatch }) => {
  const { from, empty } = state.selection.main;
  if (!empty) return false;

  const line = state.doc.lineAt(from);
  if (!parseCheckboxLine(line.text)) return false;

  const contentEnd = line.from + line.text.trimEnd().length;
  if (from >= contentEnd) {
    dispatch(
      state.update({
        changes: { from: contentEnd, to: line.to, insert: state.lineBreak },
        selection: EditorSelection.cursor(contentEnd + 1),
        scrollIntoView: true,
        userEvent: 'input',
      }),
    );
    return true;
  }

  return insertNewline({ state, dispatch });
};

export interface MarkdownEditorOptions {
  onOpenImagePicker?: () => void;
  onOpenProgressPicker?: () => void;
  onOpenCheckboxPicker?: () => void;
  onEditEmbed?: MarkdownEmbedConfig['onEditEmbed'];
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
  { action: 'image', label: 'Media', title: 'Insert media', shortcut: 'Mod-Shift-i' },
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

type EditorSelection = { from: number; to: number };

function clampSelection(
  selection: EditorSelection,
  docLength: number,
): EditorSelection {
  return {
    from: Math.min(Math.max(selection.from, 0), docLength),
    to: Math.min(Math.max(selection.to, 0), docLength),
  };
}

function resolveInsertSelection(
  view: EditorView,
  lastSelection: EditorSelection,
): EditorSelection {
  const docLength = view.state.doc.length;
  const current = clampSelection(view.state.selection.main, docLength);
  const remembered = clampSelection(lastSelection, docLength);

  if (
    current.from === 0 &&
    current.to === 0 &&
    remembered.from > 0 &&
    remembered.from <= docLength
  ) {
    return remembered;
  }

  return current;
}

function withLeadingIndent(lineText: string, content: string): string {
  const leadingWhitespace = lineText.match(/^\s*/)?.[0] ?? '';
  if (!leadingWhitespace || content.startsWith(leadingWhitespace)) {
    return content;
  }

  return `${leadingWhitespace}${content}`;
}

function insertLineInView(
  view: EditorView,
  text: string,
  selection: EditorSelection,
): { from: number; to: number } {
  const line = view.state.doc.lineAt(selection.from);
  const lineIsBlank = line.text.trim().length === 0;
  const content = withLeadingIndent(line.text, text);

  if (lineIsBlank) {
    const from = line.from;
    const to = from + content.length;
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: content },
      selection: { anchor: to },
      scrollIntoView: true,
    });
    return { from, to };
  }

  const contentEnd = line.from + line.text.trimEnd().length;
  const hasLineBreakAfter =
    line.to < view.state.doc.length &&
    view.state.doc.sliceString(line.to, line.to + 1) === view.state.lineBreak;

  if (hasLineBreakAfter && selection.from >= contentEnd) {
    const nextLine = view.state.doc.lineAt(line.to + 1);
    if (nextLine.text.trim().length === 0) {
      const nextContent = withLeadingIndent(nextLine.text, text);
      const from = nextLine.from;
      const to = from + nextContent.length;
      view.dispatch({
        changes: { from: nextLine.from, to: nextLine.to, insert: nextContent },
        selection: { anchor: to },
        scrollIntoView: true,
      });
      return { from, to };
    }
  }

  const insert = `\n${content}`;
  const insertAt = line.to;
  const from = insertAt + 1;
  const to = from + content.length;
  view.dispatch({
    changes: { from: insertAt, to: insertAt, insert },
    selection: { anchor: insertAt + insert.length },
    scrollIntoView: true,
  });
  return { from, to };
}

const PICKER_TOOLBAR_ACTIONS = new Set<ToolbarAction>(['checkbox', 'progress', 'image']);

function opensPicker(action: ToolbarAction): boolean {
  return PICKER_TOOLBAR_ACTIONS.has(action);
}

export function mountMarkdownEditor(
  container: HTMLElement,
  initialValue: string,
  options: MarkdownEditorOptions = {},
): MarkdownEditorHandle {
  const listeners = new Set<() => void>();
  let view: EditorView;
  let lastSelection: EditorSelection = { from: 0, to: 0 };
  let pendingInsertSelection: EditorSelection | null = null;
  let embedConfig: MarkdownEmbedConfig = {
    ...emptyMarkdownEmbedConfig,
  };
  const onEditEmbedRef = {
    current: options.onEditEmbed as MarkdownEmbedConfig['onEditEmbed'],
  };

  const getEmbedConfig = (): MarkdownEmbedConfig => ({
    context: embedConfig.context,
    onEditEmbed: (target, apply, anchor) => {
      onEditEmbedRef.current?.(target, apply, anchor);
    },
  });

  const notify = () => listeners.forEach((callback) => callback());

  const captureInsertSelection = () => {
    const main = view.state.selection.main;
    pendingInsertSelection = { from: main.from, to: main.to };
    lastSelection = pendingInsertSelection;
  };

  const getInsertSelection = (): EditorSelection => {
    if (pendingInsertSelection) {
      return clampSelection(pendingInsertSelection, view.state.doc.length);
    }
    return resolveInsertSelection(view, lastSelection);
  };

  const clearPendingInsertSelection = () => {
    pendingInsertSelection = null;
  };

  const runMarkdownAction = (action: ToolbarAction): boolean => {
    switch (action) {
      case 'h1':
        insertLineInView(view, '# Heading', getInsertSelection());
        return true;
      case 'h2':
        insertLineInView(view, '## Heading', getInsertSelection());
        return true;
      case 'h3':
        insertLineInView(view, '### Heading', getInsertSelection());
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
          insertLineInView(view, '- [[cb:checkbox-id]] Task item', getInsertSelection());
        }
        return true;
      case 'progress':
        if (options.onOpenProgressPicker) {
          options.onOpenProgressPicker();
        } else {
          insertLineInView(view, '[[pb:progress-bar-id]]', getInsertSelection());
        }
        return true;
      case 'image':
        if (options.onOpenImagePicker) {
          options.onOpenImagePicker();
        } else {
          insertLineInView(view, '![alt text](url)', getInsertSelection());
        }
        return true;
      default:
        return false;
    }
  };

  const buildMarkdownKeymap = (): KeyBinding[] => {
    const bind = (key: string, action: ToolbarAction): KeyBinding => ({
      key,
      run(editorView) {
        if (opensPicker(action)) {
          captureInsertSelection();
        }
        const handled = runMarkdownAction(action);
        if (handled && !opensPicker(action)) {
          editorView.focus();
          notify();
        } else if (handled) {
          notify();
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
  };

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
        markdownEditorLineNumbers(),
        foldGutter(),
        codeFolding({
          placeholderDOM: () => {
            const hidden = document.createElement('span');
            hidden.className = 'cm-foldPlaceholder-hidden';
            hidden.setAttribute('aria-hidden', 'true');
            return hidden;
          },
        }),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        markdown({ base: markdownLanguage, addKeymap: false }),
        markdownSyntaxHighlighting,
        markdownEditorTheme,
        EditorView.lineWrapping,
        Prec.highest(
          keymap.of([{ key: 'Enter', run: insertNewlineOnManagedCheckbox }]),
        ),
        Prec.high(keymap.of([{ key: 'Enter', run: continueMarkdownMarkup }])),
        keymap.of([
          ...buildMarkdownKeymap(),
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            lastSelection = {
              from: update.changes.mapPos(lastSelection.from, -1),
              to: update.changes.mapPos(lastSelection.to, -1),
            };
            notify();
          }
          if (update.selectionSet) {
            const main = update.state.selection.main;
            const ignoreFocusReset =
              pendingInsertSelection &&
              main.from === 0 &&
              main.to === 0 &&
              pendingInsertSelection.from > 0;
            if (!ignoreFocusReset) {
              lastSelection = { from: main.from, to: main.to };
            }
          }
        }),
        markdownEmbedCompartment.of(configureMarkdownEmbeds(getEmbedConfig())),
      ],
    }),
    parent: host,
  });

  view.dispatch({
    effects: buildInitialEmbedFoldEffects(view.state),
    selection: view.state.selection,
  });

  const rememberSelection = () => {
    const main = view.state.selection.main;
    lastSelection = { from: main.from, to: main.to };
  };

  view.dom.addEventListener('blur', rememberSelection);
  view.dom.addEventListener('mousedown', clearPendingInsertSelection);

  const handle: MarkdownEditorHandle = {
    getValue: () => view.state.doc.toString(),
    setValue: (value: string, resetSelection = false) => {
      const current = view.state.doc.toString();
      if (current === value) return;

      const docLength = value.length;
      const { anchor, head } = view.state.selection.main;
      const nextAnchor = resetSelection ? 0 : Math.min(anchor, docLength);
      const nextHead = resetSelection ? 0 : Math.min(head, docLength);

      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        selection: { anchor: nextAnchor, head: nextHead },
      });
      lastSelection = { from: nextAnchor, to: nextHead };
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
      view.focus();
      const { from, to } = resolveInsertSelection(view, lastSelection);
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      });
      lastSelection = { from: from + text.length, to: from + text.length };
      view.focus();
      notify();
    },
    wrapSelection: (before: string, after: string, placeholder = 'text') => {
      wrapSelectionInView(view, before, after, placeholder);
      view.focus();
      notify();
    },
    insertLine: (text: string) => {
      const selection = getInsertSelection();
      clearPendingInsertSelection();
      const current = view.state.selection.main;
      if (selection.from !== current.from || selection.to !== current.to) {
        view.dispatch({
          selection: { anchor: selection.from, head: selection.to },
        });
      }
      const range = insertLineInView(view, text, selection);
      lastSelection = { from: range.to, to: range.to };
      view.focus();
      notify();
      return range;
    },
    setEmbedConfig: (config: MarkdownEmbedConfig) => {
      embedConfig = {
        ...embedConfig,
        ...config,
        context: config.context ?? embedConfig.context,
      };
      if (config.onEditEmbed) {
        onEditEmbedRef.current = config.onEditEmbed;
      }
      view.dispatch({
        effects: markdownEmbedCompartment.reconfigure(configureMarkdownEmbeds(getEmbedConfig())),
        selection: view.state.selection,
      });
    },
    setEmbedContext: (context: MarkdownEmbedContext) => {
      embedConfig = { ...embedConfig, context };
      view.dispatch({
        effects: markdownEmbedCompartment.reconfigure(configureMarkdownEmbeds(getEmbedConfig())),
        selection: view.state.selection,
      });
    },
    focus: () => view.focus(),
    destroy: () => {
      view.dom.removeEventListener('blur', rememberSelection);
      view.dom.removeEventListener('mousedown', clearPendingInsertSelection);
      listeners.clear();
      view.destroy();
    },
  };

  const toolbar = container.querySelector('.markdown-editor-toolbar') as HTMLElement;
  toolbar.addEventListener(
    'mousedown',
    () => {
      captureInsertSelection();
    },
    true,
  );

  container.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const action = (button as HTMLElement).dataset.action as ToolbarAction | undefined;
      if (!action) return;

      const handled = runMarkdownAction(action);
      if (!handled) return;

      if (!opensPicker(action)) {
        clearPendingInsertSelection();
        view.focus();
      }
      notify();
    });
  });

  return handle;
}
