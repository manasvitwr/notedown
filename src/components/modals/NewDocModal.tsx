import { useState } from "react";
import { X } from "lucide-react";

interface NewDocModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string) => void;
}

export function NewDocModal({ isOpen, onClose, onCreate }: NewDocModalProps) {
  const [title, setTitle] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim() || "untitled";
    onCreate(t);
    setTitle("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-panel border border-border rounded-[var(--radius-panel)] p-6 w-full max-w-md shadow-2xl animate-fade-in-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-text-bright text-sm font-semibold">new note</h2>
          <button
            onClick={onClose}
            className="text-text-dim hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="note title..."
            autoFocus
            className="w-full bg-bg-input border border-border rounded-[var(--radius-xs)] px-3 py-2 text-sm text-text-primary placeholder:text-text-dim outline-none focus:border-border-hover transition-colors"
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs bg-bg-elevated text-text-bright border border-border rounded-[var(--radius-xs)] hover:bg-bg-hover transition-colors"
            >
              create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
