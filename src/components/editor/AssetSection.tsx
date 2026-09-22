import { useEffect, useMemo, useRef, useState } from "react";
import { useDocumentStore } from "../../store/useDocumentStore";
import { scrollToBlock } from "../../lib/scrollToBlock";
import { formatBytes } from "../../lib/size";
import { dataUri } from "../../lib/imageMime";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Asset } from "../../types";

const KIND_LABELS: Partial<Record<Asset["kind"], string>> = {
  image: "image",
};

/** Blob URL for a data: image URI, kept short-lived so it is never a navigable
 * raw data: URL held in the DOM. */
function dataUriToBlobUrl(uri: string): string {
  const [meta, base64] = uri.split(",");
  const mime = meta.match(/^data:([^;]+)/)?.[1] ?? "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function kindLabel(kind: Asset["kind"], count: number): string {
  const label = KIND_LABELS[kind] ?? "file";
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

interface AssetCardProps {
  asset: Asset;
  blockId?: string;
}

function AssetCard({ asset, blockId }: AssetCardProps) {
  const [showSource, setShowSource] = useState(false);
  const uri = dataUri(asset);

  const handleOpen = () => {
    if (!uri) return;
    const blobUrl = dataUriToBlobUrl(uri);
    window.open(blobUrl, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  };

  const jumpToBlock = () => {
    if (blockId) scrollToBlock(blockId, "image", asset.id);
  };

  return (
    <div
      id={`asset-${asset.id}`}
      className="bg-bg-elevated border border-border rounded-[var(--radius-xs)] overflow-hidden"
    >
      {uri ? (
        <img
          src={uri}
          alt={asset.alt ?? asset.id}
          loading="lazy"
          className="w-full h-20 object-cover"
        />
      ) : (
        <div className="w-full h-20 flex items-center justify-center bg-bg-input text-text-dim text-[10px]">
          unsupported type
        </div>
      )}
      <div className="p-2 space-y-1">
        <div className="text-[10px] text-text-primary font-medium">
          {asset.id}
        </div>
        <div className="text-[10px] text-text-dim">
          {formatBytes(asset.sizeBytes)}
          {asset.width > 0 ? ` · ${asset.width}×${asset.height}` : ""}
        </div>
        <div className="flex items-center gap-2">
          {uri && (
            <button
              type="button"
              onClick={handleOpen}
              className="text-[10px] text-accent hover:underline"
            >
              Open
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSource((s) => !s)}
            className="text-[10px] text-text-secondary hover:text-text-primary transition-colors"
          >
            Source
          </button>
          {blockId && (
            <button
              type="button"
              onClick={jumpToBlock}
              className="text-[10px] text-text-secondary hover:text-text-primary transition-colors"
            >
              Block
            </button>
          )}
        </div>
        {showSource && (
          <pre className="text-[9px] leading-snug text-text-dim break-all whitespace-pre-wrap bg-bg-input border border-border rounded p-1.5">
            {`${asset.base64.slice(0, 96)}… (${asset.base64.length} chars)`}
          </pre>
        )}
      </div>
    </div>
  );
}

export function AssetSection() {
  const assets = useDocumentStore((s) => s.doc?.assets ?? {});
  const expanded = useDocumentStore((s) => s.assetsExpanded);
  const setExpanded = useDocumentStore((s) => s.setAssetsExpanded);
  const highlightAsset = useDocumentStore((s) => s.highlightAsset);
  const clearAssetHighlight = useDocumentStore((s) => s.clearAssetHighlight);
  const doc = useDocumentStore((s) => s.doc);

  const removeFlashTimerRef = useRef<number | null>(null);

  const entries = useMemo(() => Object.values(assets), [assets]);

  const assetToBlockId = useMemo(() => {
    if (!doc) return {};
    const map: Record<string, string> = {};
    for (const block of doc.blocks) {
      for (const assetId of block.assetIds) {
        if (!map[assetId]) map[assetId] = block.id;
      }
    }
    return map;
  }, [doc]);

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const asset of entries) {
      counts[asset.kind] = (counts[asset.kind] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([kind, n]) => kindLabel(kind as Asset["kind"], n))
      .join(" · ");
  }, [entries]);

  useEffect(() => {
    if (!highlightAsset) return;
    let cancelled = false;
    let attempts = 0;

    const clearFlashTimer = () => {
      if (removeFlashTimerRef.current !== null) {
        window.clearTimeout(removeFlashTimerRef.current);
        removeFlashTimerRef.current = null;
      }
    };

    const tick = () => {
      if (cancelled) return;
      const el = document.getElementById(`asset-${highlightAsset.assetId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Drop any pending removal so a stale timer can't strip a newer flash.
        clearFlashTimer();
        el.classList.add("asset-flash");
        removeFlashTimerRef.current = window.setTimeout(() => {
          el.classList.remove("asset-flash");
          removeFlashTimerRef.current = null;
        }, 1600);
        clearAssetHighlight();
        return;
      }
      attempts += 1;
      if (attempts > 12) {
        // Target never mounted — don't leave the request pending.
        clearAssetHighlight();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelled = true;
      clearFlashTimer();
    };
  }, [highlightAsset, clearAssetHighlight]);

  if (entries.length === 0) return null;

  return (
    <div className="border-t border-border bg-bg-panel shrink-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls="nd-assets-panel"
        className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-bg-hover transition-colors"
      >
        <span className="text-[11px] uppercase tracking-wider text-text-secondary">
          Assets · {summary}
        </span>
        <span className="text-text-dim">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {expanded && (
        <div
          id="nd-assets-panel"
          className="max-h-[30vh] overflow-y-auto p-3 pt-2"
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {entries.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                blockId={assetToBlockId[asset.id]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}