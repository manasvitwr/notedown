import { beforeEach, describe, expect, it, vi } from "vitest";

// The store pulls in Dexie-backed persistence at import time; nothing in these
// tests touches storage, so the module is stubbed out entirely.
vi.mock("./lib/storage", () => ({
  saveDocument: vi.fn(async () => {}),
  loadActiveDocument: vi.fn(async () => null),
  getRecentDocuments: vi.fn(async () => []),
}));

import { useDocumentStore } from "./useDocumentStore";
import type { Block } from "../types";

const now = "2026-01-02T03:04:05.000Z";

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: "b_001",
    type: "text",
    content: "Just a plain note.",
    createdAt: now,
    tags: [],
    assetIds: [],
    source: "clipboard",
    ...overrides,
  };
}

function setup(blocks: Block[]) {
  useDocumentStore.getState().newDocument("Notes");
  useDocumentStore.setState({
    doc: {
      ...useDocumentStore.getState().doc!,
      blocks,
    },
  });
}

function blockById(id: string): Block {
  return useDocumentStore.getState().doc!.blocks.find((b) => b.id === id)!;
}

describe("classification overrides", () => {
  beforeEach(() => {
    setup([makeBlock()]);
  });

  it("records a user type override and unwraps the fence when leaving code", () => {
    const store = useDocumentStore.getState();
    store.setBlockType("b_001", "code");
    expect(blockById("b_001").classification).toEqual({
      source: "user",
      confidence: 1,
    });
    expect(blockById("b_001").content.startsWith("```")).toBe(true);

    store.setBlockType("b_001", "text");
    expect(blockById("b_001").content).toBe("Just a plain note.");
    expect(blockById("b_001").classification?.source).toBe("user");
  });

  it("leaves code for any other type, fence and all", () => {
    // A fence is code syntax, so a block that is no longer code must not keep
    // one — whatever it is now instead. Each of these is a plain-text type.
    setup([
      makeBlock({ type: "code", content: "```python\nprint('hi')\n```" }),
    ]);
    const store_ = useDocumentStore.getState();

    store_.setBlockType("b_001", "link");
    expect(blockById("b_001").type).toBe("link");
    expect(blockById("b_001").content).toBe("print('hi')");
    expect(blockById("b_001").content.startsWith("```")).toBe(false);
    expect(blockById("b_001").classification).toEqual({
      source: "user",
      confidence: 1,
    });

    store_.setBlockType("b_001", "code");
    store_.setBlockType("b_001", "image");
    expect(blockById("b_001").type).toBe("image");
    expect(blockById("b_001").content.startsWith("```")).toBe(false);
    expect(blockById("b_001").classification?.source).toBe("user");
  });

  it("does not flip a block to image just because it mentions an asset", () => {
    // `Block.assetIds` is filled in by scanning the text for `[img_…]`
    // references, so a block documenting this app's own image syntax has a full
    // set of them. Only a block that *is* an image may classify as one.
    setup([
      makeBlock({
        type: "code",
        content: "![shot][img_001]",
        assetIds: ["img_001"],
      }),
    ]);

    useDocumentStore.getState().classifyBlock("b_001");

    expect(blockById("b_001").type).not.toBe("image");
  });

  it("keeps the code fence in step with a language override", () => {
    const store = useDocumentStore.getState();
    store.setBlockLanguage("b_001", "python");

    const block = blockById("b_001");
    expect(block.type).toBe("code");
    expect(block.content.startsWith("```python")).toBe(true);
    expect(block.classification).toEqual({
      source: "user",
      confidence: 1,
      language: "python",
    });
  });

  it("never overwrites a user override during automatic classification", () => {
    const store = useDocumentStore.getState();
    store.setBlockLanguage("b_001", "python");
    store.classifyBlock("b_001");

    expect(blockById("b_001").classification).toEqual({
      source: "user",
      confidence: 1,
      language: "python",
    });
    expect(blockById("b_001").content.startsWith("```python")).toBe(true);
  });

  it("re-classifies an overridden block only when forced", () => {
    const store = useDocumentStore.getState();
    store.setBlockLanguage("b_001", "python");
    store.classifyBlock("b_001", { force: true });

    const block = blockById("b_001");
    // Back to what the content actually is, and no longer owned by the user.
    expect(block.classification?.source).toBe("automatic");
    expect(block.classification?.language).toBeUndefined();
  });

  it("classifies only unclassified blocks in a bulk pass", () => {
    setup([
      makeBlock({ id: "b_001" }),
      makeBlock({
        id: "b_002",
        type: "code",
        content: "```python\nprint('hi')\n```",
        classification: { source: "user", confidence: 1, language: "python" },
      }),
      makeBlock({
        id: "b_003",
        type: "code",
        content: "```\nconst a = 1;\n```",
        classification: { source: "automatic", confidence: 0.9, language: "javascript" },
      }),
    ]);

    useDocumentStore.getState().reclassifyUnclassified();

    expect(blockById("b_002").classification).toEqual({
      source: "user",
      confidence: 1,
      language: "python",
    });
    expect(blockById("b_003").classification?.language).toBe("javascript");
    expect(blockById("b_001").classification).toBeDefined();
    expect(blockById("b_001").classification?.source).toBe("automatic");
  });

  it("classifies through the fence, keeping the stored markdown consistent", () => {
    setup([
      makeBlock({
        type: "code",
        content:
          "```\nimport json\n\ndef load(text):\n    return json.loads(text)\n```",
      }),
    ]);

    useDocumentStore.getState().classifyBlock("b_001");

    const block = blockById("b_001");
    expect(block.type).toBe("code");
    expect(block.classification?.language).toBe("python");
    // Re-fenced with the language it was just classified as, body untouched.
    expect(block.content.startsWith("```python")).toBe(true);
    expect(block.content).toContain("json.loads(text)");
    expect(block.content.trim().endsWith("```")).toBe(true);
  });

  it("leaves a short ambiguous snippet as text rather than guessing", () => {
    setup([makeBlock({ type: "code", content: "```\na = 1\nb = 2\n```" })]);

    useDocumentStore.getState().classifyBlock("b_001");

    const block = blockById("b_001");
    // Conservative by design: the fence is removed, because the block is no
    // longer code, and no language is invented.
    expect(block.type).toBe("text");
    expect(block.content).toBe("a = 1\nb = 2");
    expect(block.classification?.language).toBeUndefined();
  });

  it("serializes an override into the markdown the app exports", () => {
    useDocumentStore.getState().setBlockLanguage("b_001", "python");
    const md = useDocumentStore.getState().serializedMarkdown;
    expect(md).toContain("lang=python");
    expect(md).toContain("src=user");
  });
});
