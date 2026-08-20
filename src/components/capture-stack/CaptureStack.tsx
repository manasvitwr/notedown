import { useDocumentStore } from "../../store/useDocumentStore";
import { CaptureCard } from "./CaptureCard";
import { Panel } from "../shared/Panel";
import { Clipboard } from "lucide-react";

export function CaptureStack() {
  const doc = useDocumentStore((s) => s.doc);
  const blocks = doc?.blocks ?? [];

  // Reverse: newest first
  const reversed = [...blocks].reverse();

  return (
    <Panel className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="text-text-dim text-[11px] uppercase tracking-wider">
          capture stack
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {reversed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-3">
            <Clipboard size={24} className="text-text-dim" />
            <div className="text-text-dim text-xs leading-relaxed">
              paste anything to start
              <br />
              <span className="text-text-dim/60">
                text · code · links · screenshots
              </span>
            </div>
          </div>
        ) : (
          reversed.map((block) => (
            <CaptureCard key={block.id} block={block} />
          ))
        )}
      </div>
    </Panel>
  );
}
