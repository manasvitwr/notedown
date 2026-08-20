import type { Block } from "../../types";
import { formatBlockTime } from "../../lib/dates";
import { useDocumentStore } from "../../store/useDocumentStore";
import { FileText, Link, Code, Mic, Image, Layers } from "lucide-react";
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
}

export function CaptureCard({ block }: CaptureCardProps) {
  const doc = useDocumentStore((s) => s.doc);
  const config = typeConfig[block.type];
  const timezone = doc?.settings.timezone;

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
      onClick={() => {
        const el = document.getElementById(`block-${block.id}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
      className="w-full text-left animate-fade-in-up"
    >
      <div className="bg-bg-panel border border-border rounded-[var(--radius-sm)] p-3 hover:border-border-hover hover:bg-bg-hover transition-all duration-150 space-y-2">
        {/* Image thumbnail */}
        {imageAsset && (
          <div className="rounded-[var(--radius-xs)] overflow-hidden border border-border">
            <img
              src={`data:${imageAsset.mime};base64,${imageAsset.base64}`}
              alt={imageAsset.alt ?? "screenshot"}
              className="w-full h-20 object-cover"
            />
          </div>
        )}

        {/* Preview text */}
        {preview && (
          <div className="text-xs text-text-secondary leading-relaxed line-clamp-3">
            {preview}
          </div>
        )}

        {/* Footer: badge + time */}
        <div className="flex items-center justify-between">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${config.color}`}
          >
            {config.icon}
            {config.label}
          </span>
          <span className="text-[10px] text-text-dim">
            {formatBlockTime(block.createdAt, timezone)}
          </span>
        </div>
      </div>
    </button>
  );
}
