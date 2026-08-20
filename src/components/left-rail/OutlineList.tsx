import { useMemo } from "react";
import { useDocumentStore } from "../../store/useDocumentStore";
import { formatBlockTime } from "../../lib/dates";
import { FileText, Link, Code, Mic, Image, Layers } from "lucide-react";
import type { BlockType } from "../../types";

const typeIcons: Record<BlockType, React.ReactNode> = {
  text: <FileText size={11} />,
  link: <Link size={11} />,
  code: <Code size={11} />,
  transcript: <Mic size={11} />,
  image: <Image size={11} />,
  mixed: <Layers size={11} />,
};

export function OutlineList() {
  const doc = useDocumentStore((s) => s.doc);

  // Derive outline locally — calling s.getOutline() inside the selector
  // returns a fresh array every time, which sends zustand v5's
  // useSyncExternalStore into an infinite re-render loop (blank screen).
  const outline = useMemo(() => {
    if (!doc) return [];
    return doc.blocks.map((b) => {
      const time = formatBlockTime(b.createdAt, doc.settings.timezone);
      const typeLabel = b.type === "image" ? "screenshot" : b.type;
      return {
        id: b.id,
        label: `${time} · ${typeLabel}`,
        type: b.type,
      };
    });
  }, [doc]);

  if (outline.length === 0) {
    return (
      <div className="px-4 py-3">
        <div className="text-text-dim text-[11px] uppercase tracking-wider mb-2">
          outline
        </div>
        <div className="text-text-dim text-xs italic">no blocks yet</div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <div className="text-text-dim text-[11px] uppercase tracking-wider mb-2">
        outline
      </div>
      <div className="space-y-0.5 max-h-[240px] overflow-y-auto">
        {outline.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              const el = document.getElementById(`block-${item.id}`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-[var(--radius-xs)] transition-colors text-left truncate"
          >
            <span className="shrink-0 text-text-dim">
              {typeIcons[item.type as BlockType]}
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
