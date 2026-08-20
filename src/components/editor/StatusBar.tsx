import { useDocumentStore } from "../../store/useDocumentStore";
import { formatBytes } from "../../lib/size";
import { formatRelativeTime } from "../../lib/dates";
import { Save, AlertCircle } from "lucide-react";

export function StatusBar() {
  const doc = useDocumentStore((s) => s.doc);
  const saveStatus = useDocumentStore((s) => s.saveStatus);
  const lastSavedAt = useDocumentStore((s) => s.lastSavedAt);
  const fileSize = useDocumentStore((s) => s.getFileSize());
  const portableScore = useDocumentStore((s) => s.getPortableScore());

  const blockCount = doc?.blocks.length ?? 0;
  const assetCount = doc ? Object.keys(doc.assets).length : 0;

  const saveDisplay = (() => {
    switch (saveStatus) {
      case "saved":
        return {
          text: lastSavedAt ? `saved ${formatRelativeTime(lastSavedAt)}` : "saved",
          color: "text-text-dim",
          icon: <Save size={11} />,
        };
      case "saving":
        return {
          text: "saving...",
          color: "text-text-secondary animate-pulse-subtle",
          icon: <Save size={11} />,
        };
      case "error":
        return {
          text: "save error",
          color: "text-error",
          icon: <AlertCircle size={11} />,
        };
      case "unsaved":
        return {
          text: "unsaved",
          color: "text-warning",
          icon: <Save size={11} />,
        };
    }
  })();

  return (
    <div className="flex items-center gap-4 px-4 py-1.5 text-[11px] text-text-dim border-t border-border">
      <span className={`flex items-center gap-1 ${saveDisplay.color}`}>
        {saveDisplay.icon}
        {saveDisplay.text}
      </span>
      <span>{formatBytes(fileSize)}</span>
      <span>{blockCount} block{blockCount !== 1 ? "s" : ""}</span>
      <span>{assetCount} asset{assetCount !== 1 ? "s" : ""}</span>
      <span
        className={`ml-auto ${
          portableScore > 70 ? "text-success" : portableScore > 30 ? "text-warning" : "text-error"
        }`}
        title="Portable score: 100 = tiny, 0 = very large"
      >
        portable: {portableScore}
      </span>
    </div>
  );
}
