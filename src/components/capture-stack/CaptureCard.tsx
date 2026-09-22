import type { Block } from "../../types";
import { formatBlockTime } from "../../lib/dates";
import { useDocumentStore } from "../../store/useDocumentStore";
import { scrollToBlock } from "../../lib/scrollToBlock";
import { dataUri } from "../../lib/imageMime";
import { FileText, Link, Code, Mic, Image, Layers, ChevronUp, ChevronDown, ChevronRight, ChevronLeft } from "lucide-react";
import type { BlockType } from "../../types";

const typeConfig: Record<
  BlockType,
  { icon: React.ReactNode; label: string; color: string }
> = {
  text: {
    icon: <FileText size={11} />,
    label: "PASTED",
    color: "bg-bg-elevated text-text-secondary",
  },
  link: {
    icon: <Link size={11} />,
    label: "LINK",
    color: "bg-badge-link/15 text-badge-link",
  },
  code: {
    icon: <Code size={11} />,
    label: "CODE",
    color: "bg-badge-code/15 text-badge-code",
  },
  transcript: {
    icon: <Mic size={11} />,
    label: "TRANSCRIPT",
    color: "bg-badge-transcript/15 text-badge-transcript",
  },
  image: {
    icon: <Image size={11} />,
    label: "PASTED",
    color: "bg-badge-image/15 text-badge-image",
  },
  mixed: {
    icon: <Layers size={11} />,
    label: "MIXED",
    color: "bg-badge-mixed/15 text-badge-mixed",
  },
};

interface CaptureCardProps {
  block: Block;
  displayIndex: number;
  isDragging: boolean;
  isDimmed: boolean;
}

export function CaptureCard({ block, displayIndex, isDragging, isDimmed }: CaptureCardProps) {
  const doc = useDocumentStore((s) => s.doc);
  const moveBlock = useDocumentStore((s) => s.moveBlock);
  const toggleBlockCollapse = useDocumentStore((s) => s.toggleBlockCollapse);
  const config = typeConfig[block.type];
  const timezone = doc?.settings.timezone;
  const blockIndex = doc?.blocks.findIndex((b) => b.id === block.id) ?? -1;
  const isFirst = blockIndex === 0;
  const isLast = blockIndex === (doc?.blocks.length ?? 0) - 1;

  // Imported blocks are branded as IMPORTED (vs PASTED/clipboard captures)
  const badgeLabel = block.source === "import" ? "IMPORTED" : config.label;

  // Get preview text (first 120 chars, strip markdown)
  const preview = block.content
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/!\[.*?\]\[.*?\]/g, "[image]")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`~]/g, "")
    .trim()
    .slice(0, 120);

  // Check if this block has an image asset
  const imageAsset =
    block.type === "image" && block.assetIds.length > 0
      ? doc?.assets[block.assetIds[0]]
      : null;

  return (
    <button
      data-card-index={displayIndex}
      data-block-id={block.id}
      onClick={(e) => {
        // Suppress the click that follows a completed drag reorder
        if (e.currentTarget.dataset.justDragged) {
          delete e.currentTarget.dataset.justDragged;
          return;
        }
        scrollToBlock(block.id, block.type);
      }}
      draggable={false}
      className={`w-full text-left animate-fade-in-up transition-opacity duration-150 ${
        isDragging ? "relative z-20 cursor-grabbing" : ""
      } ${isDimmed && !isDragging ? "opacity-40" : ""}`}
    >
      <div
        className={`bg-bg-panel border border-border rounded-[var(--radius-sm)] p-3 hover:border-border-hover hover:bg-bg-hover transition-all duration-150 space-y-2 ${
          isDragging ? "reorder-drag-active" : ""
        }`}
      >
        {/* Image thumbnail */}
        {imageAsset && (
          <div className="rounded-[var(--radius-xs)] overflow-hidden border border-border">
            <img
              src={dataUri(imageAsset) ?? undefined}
              alt={imageAsset.alt ?? "screenshot"}
              className="w-full h-20 object-cover"
              draggable={false}
            />
          </div>
        )}

        {/* Preview text */}
        {preview && (
          <div className="text-xs text-text-secondary leading-relaxed line-clamp-3">
            {preview}
          </div>
        )}

        {/* Footer: badge + time + controls */}
        <div className="flex items-center justify-between">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${config.color}`}
          >
            {config.icon}
            {badgeLabel}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); moveBlock(block.id, "up"); }}
              disabled={isFirst}
              className="p-0.5 rounded hover:bg-bg-hover text-text-dim disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move up"
            >
              <ChevronUp size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); moveBlock(block.id, "down"); }}
              disabled={isLast}
              className="p-0.5 rounded hover:bg-bg-hover text-text-dim disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move down"
            >
              <ChevronDown size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); toggleBlockCollapse(block.id); }}
              className="p-0.5 rounded hover:bg-bg-hover text-text-dim"
              title={block.collapsed ? "Expand" : "Collapse"}
            >
              {block.collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
            </button>
            <span className="text-[10px] text-text-dim">
              {formatBlockTime(block.createdAt, timezone)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
