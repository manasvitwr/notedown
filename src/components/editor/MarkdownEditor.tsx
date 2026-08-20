interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-full bg-bg-input text-text-primary font-[var(--font-mono)] text-[13px] leading-relaxed p-4 resize-none outline-none placeholder:text-text-dim"
      placeholder="start typing markdown or paste anything..."
      spellCheck={false}
      autoComplete="off"
    />
  );
}
