import { useMemo, useState } from "react";
import { Activity, ChevronDown, ChevronRight } from "lucide-react";
import type { Block } from "../../types";
import {
  classifyCapture,
  explainClassification,
  parseFence,
  confidenceBand,
} from "../../lib/classification";
import type { ClassificationSignal } from "../../lib/classification";

/**
 * Development-only explanation of a block's classification: the full evidence
 * trail, the weights it fed, and the alternatives that lost.
 *
 * This is a debugging surface, not product UI. `CaptureCard` renders it behind
 * `import.meta.env.DEV`, so in a production build the branch is false, the
 * element never mounts — no hooks run — and the tree-shaker drops the call along
 * with the classification it re-runs.
 */
export function ClassificationInspector({ block }: { block: Block }) {
  const [open, setOpen] = useState(false);

  const explanation = useMemo(() => {
    if (!open) return null;
    // Classify the body, not the fence: the fence is derived state and would
    // otherwise be the loudest thing in the content.
    const fenced = parseFence(block.content);
    const result = classifyCapture(fenced ? fenced.body : block.content, {
      source: "manual",
      blockType: block.type,
    });
    return { result, text: explainClassification(result) };
  }, [open, block.content, block.type]);

  return (
    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((value) => !value);
        }}
        className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-text-dim hover:text-text-secondary"
      >
        {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
        <Activity size={9} />
        signals
      </button>

      {open && explanation && (
        <div className="mt-1 space-y-1 rounded-[var(--radius-xs)] border border-border bg-bg-elevated p-2 font-mono text-[9px] leading-relaxed text-text-dim">
          <div>
            {block.type} · {explanation.result.confidence.toFixed(2)} (
            {confidenceBand(explanation.result.confidence)})
            {block.classification ? (
              <>
                {" "}
                · stored: {block.classification.source}
                {block.classification.language
                  ? `/${block.classification.language}`
                  : ""}
              </>
            ) : (
              " · stored: none"
            )}
          </div>
          {explanation.result.candidates && (
            <div>candidates: {explanation.result.candidates.join(", ")}</div>
          )}
          <SignalList signals={explanation.result.signals} />
        </div>
      )}
    </div>
  );
}

function SignalList({ signals }: { signals: ClassificationSignal[] }) {
  if (signals.length === 0) return <div>no signals</div>;
  return (
    <ul className="space-y-0.5">
      {signals.map((entry, index) => (
        <li key={`${entry.kind}-${index}`}>
          L{entry.layer} {entry.kind} {entry.score >= 0 ? "+" : ""}
          {entry.score.toFixed(2)}
          {entry.detail ? ` — ${entry.detail}` : ""}
        </li>
      ))}
    </ul>
  );
}
