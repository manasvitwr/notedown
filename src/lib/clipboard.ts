import type { Block, Asset, DocumentState } from "../types";
import { classifyText } from "./blockClassifier";
import { compressImage } from "./imageCompression";
import { nextBlockId, nextAssetId } from "./ids";

export interface PasteResult {
  blocks: Block[];
  assets: Asset[];
}

/**
 * Process a clipboard paste event and return new blocks/assets.
 */
export async function processPaste(
  event: ClipboardEvent,
  doc: DocumentState
): Promise<PasteResult> {
  const items = Array.from(event.clipboardData?.items ?? []);
  const now = new Date().toISOString();

  const blocks: Block[] = [];
  const assets: Asset[] = [];

  // Track IDs across this paste batch
  let currentDoc = { ...doc, blocks: [...doc.blocks], assets: { ...doc.assets } };

  // ─── Process images ──────────────────────────────────────
  const imageItems = items.filter((i) => i.type.startsWith("image/"));
  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) continue;

    const assetId = nextAssetId(currentDoc);

    try {
      const { asset } = await compressImage(file, assetId, doc.settings);
      assets.push(asset);
      currentDoc.assets[asset.id] = asset;

      const blockId = nextBlockId(currentDoc);
      const block: Block = {
        id: blockId,
        type: "image",
        content: `![${asset.alt ?? "screenshot"}][${asset.id}]`,
        createdAt: now,
        tags: [],
        assetIds: [asset.id],
        source: "clipboard",
      };
      blocks.push(block);
      currentDoc.blocks.push(block);
    } catch (err) {
      console.error("Image compression failed:", err);
      // Fallback: try to read raw base64
      try {
        const raw = await fileToBase64(file);
        const fallbackAsset: Asset = {
          id: assetId,
          kind: "image",
          mime: file.type as Asset["mime"],
          base64: raw,
          width: 0,
          height: 0,
          sizeBytes: file.size,
          originalSizeBytes: file.size,
          createdAt: now,
          alt: "screenshot",
        };
        assets.push(fallbackAsset);
        currentDoc.assets[fallbackAsset.id] = fallbackAsset;

        const blockId = nextBlockId(currentDoc);
        const block: Block = {
          id: blockId,
          type: "image",
          content: `![screenshot][${fallbackAsset.id}]`,
          createdAt: now,
          tags: [],
          assetIds: [fallbackAsset.id],
          source: "clipboard",
        };
        blocks.push(block);
        currentDoc.blocks.push(block);
      } catch {
        console.error("Fallback image read also failed");
      }
    }
  }

  // ─── Process text ────────────────────────────────────────
  const textItems = items.filter((i) => i.type === "text/plain");
  for (const item of textItems) {
    const text = await new Promise<string>((resolve) =>
      item.getAsString(resolve)
    );
    if (!text.trim()) continue;

    // Skip text if we already got an image from same paste
    // (some browsers include filename as text with image paste)
    if (imageItems.length > 0 && text.length < 200 && !text.includes("\n")) {
      continue;
    }

    const classified = classifyText(text);
    const blockId = nextBlockId(currentDoc);
    const block: Block = {
      id: blockId,
      type: classified.type,
      content: classified.formattedContent,
      createdAt: now,
      tags: [],
      assetIds: [],
      source: "clipboard",
    };
    blocks.push(block);
    currentDoc.blocks.push(block);
  }

  return { blocks, assets };
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
