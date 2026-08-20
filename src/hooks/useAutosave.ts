import { useEffect, useRef } from "react";
import { useDocumentStore } from "../store/useDocumentStore";
import { AUTOSAVE_DEBOUNCE_MS } from "../constants/defaults";

/**
 * Debounced autosave — saves to IndexedDB when doc state changes.
 */
export function useAutosave() {
  const doc = useDocumentStore((s) => s.doc);
  const saveStatus = useDocumentStore((s) => s.saveStatus);
  const saveToStorage = useDocumentStore((s) => s.saveToStorage);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!doc) return;
    if (saveStatus !== "unsaved") return;

    // Clear previous timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Debounce save
    timerRef.current = setTimeout(() => {
      saveToStorage();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [doc, saveStatus, saveToStorage]);
}
