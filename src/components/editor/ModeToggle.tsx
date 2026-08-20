import type { EditorMode } from "../../types";

interface ModeToggleProps {
  mode: EditorMode;
  onChange: (mode: EditorMode) => void;
}

const modes: { value: EditorMode; label: string }[] = [
  { value: "markdown", label: "markdown" },
  { value: "preview", label: "preview" },
  { value: "data", label: "data" },
];

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="inline-flex bg-bg-base border border-border rounded-[var(--radius-sm)] p-0.5">
      {modes.map((m) => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          className={`px-4 py-1.5 text-xs rounded-[var(--radius-xs)] transition-all duration-150 ${
            mode === m.value
              ? "bg-bg-elevated text-text-bright shadow-sm"
              : "text-text-dim hover:text-text-secondary"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
