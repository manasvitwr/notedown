import Dexie, { type EntityTable } from "dexie";
import type { DocumentState, RecentDoc } from "../types";

// ─── Database Schema ────────────────────────────────────────

interface StoredDocument {
  id: string;
  state: DocumentState;
  updatedAt: string;
}

interface MetaEntry {
  key: string;
  value: string;
}

const db = new Dexie("NotedownDB") as Dexie & {
  documents: EntityTable<StoredDocument, "id">;
  meta: EntityTable<MetaEntry, "key">;
};

db.version(1).stores({
  documents: "id, updatedAt",
  meta: "key",
});

// ─── Document Operations ────────────────────────────────────

export async function saveDocument(doc: DocumentState): Promise<void> {
  await db.documents.put({
    id: doc.id,
    state: doc,
    updatedAt: doc.updatedAt,
  });
  await db.meta.put({ key: "activeDocId", value: doc.id });
}

export async function loadDocument(
  id: string
): Promise<DocumentState | null> {
  const stored = await db.documents.get(id);
  return stored?.state ?? null;
}

export async function deleteDocument(id: string): Promise<void> {
  await db.documents.delete(id);
}

// ─── Active Document ────────────────────────────────────────

export async function getActiveDocId(): Promise<string | null> {
  const meta = await db.meta.get("activeDocId");
  return meta?.value ?? null;
}

export async function loadActiveDocument(): Promise<DocumentState | null> {
  const id = await getActiveDocId();
  if (!id) return null;
  return loadDocument(id);
}

// ─── Recent Documents ───────────────────────────────────────

export async function getRecentDocuments(): Promise<RecentDoc[]> {
  const docs = await db.documents
    .orderBy("updatedAt")
    .reverse()
    .limit(20)
    .toArray();

  return docs.map((d) => ({
    id: d.id,
    title: d.state.title,
    updatedAt: d.updatedAt,
    blockCount: d.state.blocks.length,
  }));
}
