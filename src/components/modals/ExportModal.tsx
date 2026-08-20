import { useMemo } from "react";
import { X, Download, AlertTriangle } from "lucide-react";
import { useDocumentStore } from "../../store/useDocumentStore";
import { getExportInfo } from "../../lib/fileExport";
import { formatBytes } from "../../lib/size";
import { FILE_SIZE_WARN_BYTES } from "../../constants/defaults";
import { exportDocument } from "../../lib/fileExport";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const doc = useDocumentStore((s) => s.doc);

  const exportInfo = useMemo(() => {
    if (!doc) return null;
    return getExportInfo(doc);
  }, [doc]);

  if (!isOpen || !doc || !exportInfo) return null;

  const isLarge = exportInfo.sizeBytes > FILE_SIZE_WARN_BYTES;
  const blockCount = doc.blocks.length;
  const assetCount = Object.keys(doc.assets).length;

  const handleExport = () => {
    exportDocument(doc);
    onClose();
  };

  const handleCopyRaw = () => {
    navigator.clipboard.writeText(exportInfo.markdown);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-panel border border-border rounded-[var(--radius-panel)] p-6 w-full max-w-md shadow-2xl animate-fade-in-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-text-bright text-sm font-semibold">
            export .nd.md
          </h2>
          <button
            onClick={onClose}
            className="text-text-dim hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="bg-bg-base border border-border rounded-[var(--radius-xs)] p-4 space-y-2 text-xs mb-4">
          <div className="text-text-primary font-medium">
            {exportInfo.filename}
          </div>
          <div className="flex gap-4 text-text-secondary">
            <span>{formatBytes(exportInfo.sizeBytes)}</span>
            <span>
              {blockCount} block{blockCount !== 1 ? "s" : ""}
            </span>
            <span>
              {assetCount} asset{assetCount !== 1 ? "s" : ""}
            </span>
          </div>

          {isLarge && (
            <div className="flex items-start gap-1.5 text-warning text-[11px] mt-2">
              <AlertTriangle size={11} className="shrink-0 mt-0.5" />
              File is large ({formatBytes(exportInfo.sizeBytes)}). Consider
              reducing image quality or count.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={handleCopyRaw}
            className="px-4 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            copy raw md
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-bg-elevated text-text-bright border border-border rounded-[var(--radius-xs)] hover:bg-bg-hover transition-colors"
          >
            <Download size={12} />
            download
          </button>
        </div>
      </div>
    </div>
  );
}
