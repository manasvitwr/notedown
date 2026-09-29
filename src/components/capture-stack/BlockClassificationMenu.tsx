import { useEffect, useRef, useState } from "react";
import { Check, RefreshCw, Settings2 } from "lucide-react";
import type { Block, BlockType } from "../../types";
import { useDocumentStore } from "../../store/useDocumentStore";
import { LANGUAGE_LABELS, LANGUAGE_PICKER_ORDER } from "../../lib/classification";
import type { CodeLanguage } from "../../lib/classification";

const TYPE_CHOICES: { type: BlockType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "code", label: "Code" },
  { type: "link", label: "Link" },
];

interface BlockClassificationMenuProps {
  block: Block;
}

/**
 * Per-block classification controls: correct a wrong type, name a language the
 * classifier was not confident enough to name, or re-run detection.
 *
 * Every choice made here is recorded with `source: "user"`, which is what makes
 * it stick — later automatic passes skip blocks the user has claimed.
 */
export function BlockClassificationMenu({ block }: BlockClassificationMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const setBlockType = useDocumentStore((s) => s.setBlockType);
  const setBlockLanguage = useDocumentStore((s) => s.setBlockLanguage);
  const classifyBlock = useDocumentStore((s) => s.classifyBlock);

  // Close on any click outside the menu, so a single click elsewhere in the app
  // never leaves it hanging open over the capture stack.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const current = block.classification?.language;

  const choose = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((value) => !value);
        }}
        className="p-0.5 rounded hover:bg-bg-hover text-text-dim"
        title="Change classification"
        aria-label="Change classification"
        aria-expanded={open}
      >
        <Settings2 size={12} />
      </button>

      {open && (
        <div className="absolute right-0 bottom-full z-30 mb-1 w-44 max-h-72 overflow-y-auto rounded-[var(--radius-sm)] border border-border bg-bg-panel shadow-lg p-1 text-left">
          <MenuSection label="Type">
            {TYPE_CHOICES.map((choice) => (
              <MenuItem
                key={choice.type}
                label={choice.label}
                selected={block.type === choice.type}
                onClick={() => choose(() => setBlockType(block.id, choice.type))}
              />
            ))}
          </MenuSection>

          {block.type === "code" && (
            <MenuSection label="Language">
              {LANGUAGE_PICKER_ORDER.map((language: CodeLanguage) => (
                <MenuItem
                  key={language}
                  label={LANGUAGE_LABELS[language]}
                  selected={current === language}
                  onClick={() =>
                    choose(() => setBlockLanguage(block.id, language))
                  }
                />
              ))}
              <MenuItem
                label="No language"
                selected={current === undefined}
                onClick={() => choose(() => setBlockLanguage(block.id, undefined))}
              />
            </MenuSection>
          )}

          <MenuSection label="Detection">
            <MenuItem
              label="Re-classify now"
              icon={<RefreshCw size={10} />}
              onClick={() => choose(() => classifyBlock(block.id, { force: true }))}
            />
          </MenuSection>
        </div>
      )}
    </div>
  );
}

function MenuSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1 last:mb-0">
      <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-text-dim">
        {label}
      </div>
      {children}
    </div>
  );
}

function MenuItem({
  label,
  selected,
  icon,
  onClick,
}: {
  label: string;
  selected?: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
    >
      <span className="w-3 shrink-0">
        {selected ? <Check size={10} /> : icon ?? null}
      </span>
      {label}
    </button>
  );
}
