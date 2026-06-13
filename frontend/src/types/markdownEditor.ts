import type { MarkdownEmbedConfig, MarkdownEmbedContext } from '../components/markdownEmbedExtension.js';

export interface MarkdownEditorHandle {
  getValue(): string;
  setValue(value: string, resetSelection?: boolean): void;
  applyChange(change: { from: number; to: number; insert: string }): void;
  onChange(callback: () => void): () => void;
  insertText(text: string): void;
  wrapSelection(before: string, after: string, placeholder?: string): void;
  insertLine(text: string): { from: number; to: number };
  setEmbedConfig(config: MarkdownEmbedConfig): void;
  setEmbedContext(context: MarkdownEmbedContext): void;
  focus(): void;
  focusForEditing(): void;
  destroy(): void;
}
