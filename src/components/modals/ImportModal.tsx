import { useState, useCallback } from "react";
import { X, Upload, FileText, Image, AlertTriangle } from "lucide-react";
import { importFile, openFilePicker } from "../../lib/fileImport";
import type { ImportResult } from "../../lib/fileImport";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (result: ImportResult) => void;
}

export function ImportModal({ isOpen, onClose, onImport }: ImportModalProps) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectFile = useCallback(async () => {
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const file = await openFilePicker();
      if (!file) {
        setLoading(false);
        return;
      }
      const importResult = await importFile(file);
      setResult(importResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleConfirm = () => {
    if (result) {
      onImport(result);
      setResult(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-panel border border-border rounded-[var(--radius-panel)] p-6 w-full max-w-md shadow-2xl animate-fade-in-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-text-bright text-sm font-semibold">import file</h2>
          <button
            onClick={() => { onClose(); setResult(null); setError(null); }}
            className="text-text-dim hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {!result ? (
          <div className="space-y-4">
            <button
              onClick={handleSelectFile}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-border rounded-[var(--radius-sm)] text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
            >
              <Upload size={18} />
              <span className="text-sm">
                {loading ? "reading file..." : "select .md or .nd.md file"}
              </span>
            </button>

            {error && (
              <div className="flex items-center gap-2 text-error text-xs">
                <AlertTriangle size={13} />
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-bg-base border border-border rounded-[var(--radius-xs)] p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-text-primary">
                <FileText size={13} />
                <span className="font-medium">{result.doc.title}</span>
                {result.isNotedownFormat && (
                  <span className="text-accent text-[10px]">.nd</span>
                )}
              </div>
              <div className="flex gap-4 text-text-secondary">
                <span className="flex items-center gap-1">
                  <FileText size={11} />
                  {result.blockCount} block{result.blockCount !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1">
                  <Image size={11} />
                  {result.assetCount} asset{result.assetCount !== 1 ? "s" : ""}
                </span>
              </div>
              {result.warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-1.5 text-warning text-[11px]"
                >
                  <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                  {w}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setResult(null)}
                className="px-4 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-1.5 text-xs bg-bg-elevated text-text-bright border border-border rounded-[var(--radius-xs)] hover:bg-bg-hover transition-colors"
              >
                import
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
