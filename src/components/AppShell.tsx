import { LeftRail } from "./left-rail/LeftRail";
import { EditorPane } from "./editor/EditorPane";
import { CaptureStack } from "./capture-stack/CaptureStack";
import { useDocumentStore } from "../store/useDocumentStore";

interface AppShellProps {
  onNew: () => void;
  onOpen: () => void;
  onExport: () => void;
}

export function AppShell({ onNew, onOpen, onExport }: AppShellProps) {
  const doc = useDocumentStore((s) => s.doc);
  const filename = doc?.filename ?? "untitled.nd.md";

  return (
    <div className="h-screen w-screen bg-bg-base p-3 grid gap-3 grid-cols-[240px_1fr_280px]">
      {/* Left Rail */}
      <LeftRail
        filename={filename}
        onNew={onNew}
        onOpen={onOpen}
        onExport={onExport}
      />

      {/* Center Editor */}
      <EditorPane />

      {/* Right Capture Stack */}
      <CaptureStack />
    </div>
  );
}
