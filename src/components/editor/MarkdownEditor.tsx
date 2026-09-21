import type { ClipboardEvent, FocusEvent, Ref } from "react";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onBlur?: (event: FocusEvent<HTMLTextAreaElement>) => void;
  editorRef?: Ref<HTMLTextAreaElement>;
}

export function MarkdownEditor({
  value,
  onChange,
  onPaste,
  onBlur,
  editorRef,
}: MarkdownEditorProps) {
  return (
    <textarea
      ref={editorRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPaste={onPaste}
      onBlur={onBlur}
      className="w-full h-full bg-bg-input text-text-primary font-[var(--font-mono)] text-[13px] leading-relaxed p-4 resize-none outline-none placeholder:text-text-dim"
      placeholder="start typing markdown or paste anything..."
      spellCheck={false}
      autoComplete="off"
    />
  );
}