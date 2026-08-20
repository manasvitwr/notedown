import { FilePlus, FolderOpen, Download } from "lucide-react";

interface FileControlsProps {
  onNew: () => void;
  onOpen: () => void;
  onExport: () => void;
  filename: string;
}

export function FileControls({ onNew, onOpen, onExport, filename }: FileControlsProps) {
  return (
    <div className="px-4 py-2 space-y-2">
      <div className="text-text-secondary text-xs truncate" title={filename}>
        {filename || "untitled.nd.md"}
      </div>
      <div className="flex gap-1">
        <button
          onClick={onNew}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-[var(--radius-xs)] transition-colors"
          title="New note (Ctrl+N)"
        >
          <FilePlus size={13} />
          <span>new</span>
        </button>
        <button
          onClick={onOpen}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-[var(--radius-xs)] transition-colors"
          title="Open file (Ctrl+O)"
        >
          <FolderOpen size={13} />
          <span>open</span>
        </button>
        <button
          onClick={onExport}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-[var(--radius-xs)] transition-colors"
          title="Export (Ctrl+S)"
        >
          <Download size={13} />
          <span>export</span>
        </button>
      </div>
    </div>
  );
}
