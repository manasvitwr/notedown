import { Panel } from "../shared/Panel";
import { Logo } from "./Logo";
import { FileControls } from "./FileControls";
import { OutlineList } from "./OutlineList";
import { AssetList } from "./AssetList";

interface LeftRailProps {
  filename: string;
  onNew: () => void;
  onOpen: () => void;
  onExport: () => void;
}

export function LeftRail({ filename, onNew, onOpen, onExport }: LeftRailProps) {
  return (
    <Panel className="flex flex-col h-full overflow-hidden">
      <Logo />
      <div className="border-t border-border" />
      <FileControls
        filename={filename}
        onNew={onNew}
        onOpen={onOpen}
        onExport={onExport}
      />
      <div className="border-t border-border" />
      <div className="flex-1 overflow-y-auto">
        <OutlineList />
        <div className="border-t border-border" />
        <AssetList />
      </div>
    </Panel>
  );
}
