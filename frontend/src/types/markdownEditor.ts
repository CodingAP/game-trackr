export interface MarkdownEditorHandle {
  getValue(): string;
  setValue(value: string): void;
  onChange(callback: () => void): () => void;
  insertText(text: string): void;
  wrapSelection(before: string, after: string, placeholder?: string): void;
  insertLine(text: string): void;
  focus(): void;
  destroy(): void;
}
