import { useDocumentStore } from "../../store/useDocumentStore";
import { formatBytes } from "../../lib/size";

export function AssetList() {
  const doc = useDocumentStore((s) => s.doc);
  const assets = doc?.assets ?? {};
  const entries = Object.values(assets);

  return (
    <div className="px-4 py-3">
      <div className="text-text-dim text-[11px] uppercase tracking-wider mb-2">
        images{" "}
        {entries.length > 0 && (
          <span className="text-text-dim">({entries.length})</span>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="text-text-dim text-xs italic">no assets</div>
      ) : (
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {entries.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center gap-2 px-2 py-1 rounded-[var(--radius-xs)] hover:bg-bg-hover transition-colors"
            >
              <img
                src={`data:${asset.mime};base64,${asset.base64}`}
                alt={asset.alt ?? asset.id}
                className="w-6 h-6 rounded object-cover border border-border shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-text-secondary truncate">
                  {asset.id}
                </div>
                <div className="text-[10px] text-text-dim">
                  {formatBytes(asset.sizeBytes)}
                  {asset.width > 0 && ` · ${asset.width}×${asset.height}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
