import type { Ref } from "react";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  editorRef?: Ref<HTMLTextAreaElement>;
}

export function MarkdownEditor({ value, onChange, editorRef }: MarkdownEditorProps) {
  return (
    <textarea
      ref={editorRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-full bg-bg-input text-text-primary font-[var(--font-mono)] text-[13px] leading-relaxed p-4 resize-none outline-none placeholder:text-text-dim"
      placeholder="start typing markdown or paste anything..."
      spellCheck={false}
      autoComplete="off"
    />
  );
}

