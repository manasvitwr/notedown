import { useState, useEffect, useCallback } from "react";
import { AppShell } from "./components/AppShell";
import { NewDocModal } from "./components/modals/NewDocModal";
import { ImportModal } from "./components/modals/ImportModal";
import { ExportModal } from "./components/modals/ExportModal";
import { useDocumentStore } from "./store/useDocumentStore";
import { usePasteHandler } from "./hooks/usePasteHandler";
import { useAutosave } from "./hooks/useAutosave";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import type { ImportResult } from "./lib/fileImport";

export default function App() {
  const doc = useDocumentStore((s) => s.doc);
  const newDocument = useDocumentStore((s) => s.newDocument);
  const setDocument = useDocumentStore((s) => s.setDocument);
  const loadFromStorage = useDocumentStore((s) => s.loadFromStorage);
  const saveStatus = useDocumentStore((s) => s.saveStatus);

  const [showNewModal, setShowNewModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // ─── Initialize ─────────────────────────────────────────
  useEffect(() => {
    loadFromStorage().then(() => {
      // If no active document, create a default one
      const currentDoc = useDocumentStore.getState().doc;
      if (!currentDoc) {
        newDocument("untitled");
      }
    });
  }, [loadFromStorage, newDocument]);

  // ─── Update page title ──────────────────────────────────
  useEffect(() => {
    document.title = doc
      ? `Notedown — ${doc.title}`
      : "Notedown";
  }, [doc?.title]);

  // ─── Hooks ──────────────────────────────────────────────
  usePasteHandler();
  useAutosave();

  const handleNew = useCallback(() => {
    // Always let the user discard the current note (it is replaced from
    // scratch), regardless of whether it was already saved to storage.
    if (doc && (doc.blocks.length > 0 || Object.keys(doc.assets).length > 0)) {
      if (
        !confirm(
          "This will discard the current note and start from scratch. Continue?"
        )
      ) {
        return;
      }
    }
    setShowNewModal(true);
  }, [doc]);

  const handleImport = useCallback(() => {
    setShowImportModal(true);
  }, []);

  useKeyboardShortcuts({
    onNew: handleNew,
    onImport: handleImport,
  });

  // ─── Unsaved changes warning ────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveStatus === "unsaved") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveStatus]);

  const handleCreateNew = useCallback(
    (title: string) => {
      newDocument(title);
    },
    [newDocument]
  );

  const handleImportResult = useCallback(
    (result: ImportResult) => {
      setDocument(result.doc);
    },
    [setDocument]
  );

  return (
    <>
      <AppShell
        onNew={handleNew}
        onOpen={() => setShowImportModal(true)}
        onExport={() => setShowExportModal(true)}
      />

      <NewDocModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreate={handleCreateNew}
      />

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImportResult}
      />

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />
    </>
  );
}
