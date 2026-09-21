import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDocumentStore } from "../../store/useDocumentStore";
import { CaptureCard } from "./CaptureCard";
import { Panel } from "../shared/Panel";
import { importFile, openFilePicker } from "../../lib/fileImport";
import { Clipboard, Upload } from "lucide-react";
import type { Block, Asset } from "../../types";

// Hold duration before a card becomes draggable.
const DRAG_HOLD_MS = 300;
// Pointer travel (in px) before a held pointer counts as a drag rather than a tap.
const DRAG_START_THRESHOLD = 6;
// Pointer travel (in px) before the hold is cancelled as a scroll intent.
const DRAG_CANCEL_THRESHOLD = 10;

interface HoldState {
  pointerId: number;
  startClientY: number;
  cardEl: HTMLElement;
  fromIndex: number;
  overIndex: number;
  armed: boolean;
  didMove: boolean;
  timer: number;
}

interface DragState {
  fromIndex: number;
  overIndex: number;
}

export function CaptureStack() {
  const doc = useDocumentStore((s) => s.doc);
  const appendBlocks = useDocumentStore((s) => s.appendBlocks);
  const reorderBlocks = useDocumentStore((s) => s.reorderBlocks);
  const allocateBlockIds = useDocumentStore((s) => s.allocateBlockIds);
  const allocateAssetIds = useDocumentStore((s) => s.allocateAssetIds);

  // Reverse: newest first
  const reversed = useMemo(() => (doc?.blocks ?? []).slice().reverse(), [doc]);

  // ─── Hold-to-drag reorder ────────────────────────────────
  const listRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const holdRef = useRef<HoldState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const clearHold = useCallback(() => {
    if (holdRef.current) {
      window.clearTimeout(holdRef.current.timer);
      holdRef.current = null;
    }
  }, []);

  const computeTargetIndex = useCallback((clientY: number): number => {
    const list = listRef.current;
    if (!list) return 0;
    const cards = Array.from(
      list.querySelectorAll("[data-card-index]")
    ) as HTMLElement[];
    const count = cards.length;
    if (count === 0) return 0;
    for (let i = 0; i < count - 1; i++) {
      const cur = cards[i].getBoundingClientRect();
      const next = cards[i + 1].getBoundingClientRect();
      const boundary = (cur.bottom + next.top) / 2;
      if (clientY <= boundary) return i;
    }
    // Past the midpoint of the last card the drop target is the trailing gap (n).
    const last = cards[count - 1].getBoundingClientRect();
    const lastMid = last.top + last.height / 2;
    return clientY < lastMid ? count - 1 : count;
  }, []);

  const positionIndicator = useCallback(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator || !holdRef.current) return;
    const cards = Array.from(
      list.querySelectorAll("[data-card-index]")
    ) as HTMLElement[];
    if (cards.length === 0) return;
    const over = holdRef.current.overIndex;
    let top: number;
    if (over <= 0) {
      top = cards[0].getBoundingClientRect().top;
    } else if (over >= cards.length) {
      top = cards[cards.length - 1].getBoundingClientRect().bottom;
    } else {
      const prev = cards[over - 1].getBoundingClientRect();
      const next = cards[over].getBoundingClientRect();
      top = (prev.bottom + next.top) / 2;
    }
    const listRect = list.getBoundingClientRect();
    indicator.style.top = `${top - listRect.top + list.scrollTop}px`;
    indicator.style.opacity = "1";
  }, []);

  const restoreDragVisuals = useCallback(() => {
    const rec = holdRef.current;
    if (!rec) return;
    rec.cardEl.style.transform = "";
    rec.cardEl.style.touchAction = "";
    document.body.classList.remove("reordering");
    if (indicatorRef.current) indicatorRef.current.style.opacity = "0";
  }, []);

  // While a drag is armed, reorder tracking runs on window-level listeners so
  // it keeps working even when the pointer leaves the list.
  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const rec = holdRef.current;
      if (!rec || e.pointerId !== rec.pointerId) return;
      if (!rec.didMove) {
        if (Math.abs(e.clientY - rec.startClientY) < DRAG_START_THRESHOLD) return;
        rec.didMove = true;
        rec.cardEl.style.touchAction = "none";
        document.body.classList.add("reordering");
      }
      rec.cardEl.style.transform = `translateY(${e.clientY - rec.startClientY}px)`;
      const over = computeTargetIndex(e.clientY);
      if (over !== rec.overIndex) {
        rec.overIndex = over;
        setDrag({ fromIndex: rec.fromIndex, overIndex: over });
        positionIndicator();
      }
    };

    const onUp = () => {
      const rec = holdRef.current;
      if (!rec) return;
      window.clearTimeout(rec.timer);
      const from = rec.fromIndex;
      const over = rec.overIndex;
      const didReorder = rec.didMove && over !== from;
      restoreDragVisuals();
      holdRef.current = null;
      setDrag(null);
      if (didReorder) {
        // A click fires after the drag ends; brand the card so its own click
        // handler skips the scroll that would otherwise follow the reorder.
        rec.cardEl.dataset.justDragged = "1";
        const final = reversed.slice();
        const [moved] = final.splice(from, 1);
        // `over` is the insertion slot in the pre-removal list; once the
        // dragged card is removed the later slots shift left by one.
        final.splice(over > from ? over - 1 : over, 0, moved);
        // The store keeps blocks oldest-first; the stack renders the reverse
        // (newest-first), so the display order has to be reversed back before
        // committing, otherwise the list snaps to the wrong order.
        reorderBlocks(final.slice().reverse().map((b) => b.id));
      }
    };

    const onCancel = () => {
      const rec = holdRef.current;
      if (!rec) return;
      window.clearTimeout(rec.timer);
      restoreDragVisuals();
      holdRef.current = null;
      setDrag(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [drag, reversed, computeTargetIndex, positionIndicator, restoreDragVisuals, reorderBlocks]);

  const handleListPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (holdRef.current) return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      const cardEl = target.closest("[data-card-index]") as HTMLElement | null;
      if (!cardEl) return;
      // Ignore holds that start on the card's inner control buttons.
      const directButton = target.closest("button");
      if (directButton && directButton !== cardEl) return;
      const fromIndex = Number(cardEl.getAttribute("data-card-index"));

      const timer = window.setTimeout(() => {
        const rec = holdRef.current;
        if (!rec) return;
        rec.armed = true;
        try {
          rec.cardEl.setPointerCapture(rec.pointerId);
        } catch {
          /* ignore */
        }
        setDrag({ fromIndex: rec.fromIndex, overIndex: rec.fromIndex });
        positionIndicator();
      }, DRAG_HOLD_MS);

      holdRef.current = {
        pointerId: e.pointerId,
        startClientY: e.clientY,
        cardEl,
        fromIndex,
        overIndex: fromIndex,
        armed: false,
        didMove: false,
        timer,
      };
    },
    [positionIndicator]
  );

  const handleListPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rec = holdRef.current;
      if (!rec || rec.armed) return;
      // Before the hold arms, a large movement is a scroll, not a drag.
      if (Math.abs(e.clientY - rec.startClientY) > DRAG_CANCEL_THRESHOLD) {
        clearHold();
      }
    },
    [clearHold]
  );

  const handleListPointerUp = useCallback(() => {
    // If the drag armed, the window-level listener commits on release.
    const rec = holdRef.current;
    if (!rec || rec.armed) return;
    clearHold();
  }, [clearHold]);

  // ─── Import into the capture stack ───────────────────────
  const handleImport = useCallback(async () => {
    try {
      const file = await openFilePicker();
      if (!file) return;
      const result = await importFile(file);
      if (result.doc.blocks.length === 0) return;

      // Re-map ids so imported blocks/assets never collide with existing ones.
      const assetIds = allocateAssetIds(Object.keys(result.doc.assets).length);
      const blockIds = allocateBlockIds(result.doc.blocks.length);
      const idMap = new Map<string, string>();
      Object.keys(result.doc.assets).forEach((oldId, i) => {
        idMap.set(oldId, assetIds[i]);
      });

      const newAssets: Asset[] = [];
      for (const [oldId, asset] of Object.entries(result.doc.assets)) {
        const newId = idMap.get(oldId)!;
        newAssets.push({
          ...asset,
          id: newId,
          alt: asset.alt === oldId ? newId : asset.alt,
        });
      }

      const newBlocks: Block[] = result.doc.blocks.map((block, i) => ({
        ...block,
        id: blockIds[i],
        assetIds: block.assetIds.map((old) => idMap.get(old) ?? old),
        content: block.content.replace(/\[img_\d+\]/g, (ref) => {
          const old = ref.slice(1, -1);
          return `[${idMap.get(old) ?? old}]`;
        }),
      }));

      appendBlocks(newBlocks, newAssets);
      useDocumentStore.getState().reserialize();
    } catch (err) {
      console.error("Import failed:", err);
    }
  }, [appendBlocks, allocateAssetIds, allocateBlockIds]);

  return (
    <Panel className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="text-text-dim text-[11px] uppercase tracking-wider">
            capture stack
          </div>
          <button
            type="button"
            onClick={handleImport}
            title="import markdown files"
            className="p-1 rounded-[var(--radius-xs)] text-text-dim hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <Upload size={12} />
          </button>
        </div>
        <div className="mt-1 text-[10px] text-text-dim/60">
          tap to open a block · hold a card to drag and reorder
        </div>
      </div>

      <div
        ref={listRef}
        onPointerDown={handleListPointerDown}
        onPointerMove={handleListPointerMove}
        onPointerUp={handleListPointerUp}
        onPointerCancel={handleListPointerUp}
        className="relative flex-1 overflow-y-auto p-2 space-y-2 select-none"
      >
        {/* Drop indicator */}
        <div
          ref={indicatorRef}
          className={`pointer-events-none absolute left-2 right-2 h-0.5 rounded bg-accent ${
            drag ? "" : "hidden"
          }`}
        />

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
          reversed.map((block, index) => (
            <CaptureCard
              key={block.id}
              block={block}
              displayIndex={index}
              isDragging={drag?.fromIndex === index}
              isDimmed={drag !== null && drag.fromIndex !== index}
            />
          ))
        )}
      </div>
    </Panel>
  );
}