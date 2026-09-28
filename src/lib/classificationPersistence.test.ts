import { describe, expect, it } from "vitest";
import { parseNotedownFile, createPlainImport } from "./markdownParser";
import { serializeDocument } from "./markdownSerializer";
import { NOTEDOWN_VERSION } from "../constants/defaults";
import type { Block, DocumentState } from "../types";

function block(overrides: Partial<Block> = {}): Block {
  return {
    id: "b_001",
    type: "code",
    content: "```python\nprint('hi')\n```",
    createdAt: "2026-01-02T03:04:05.000Z",
    tags: [],
    assetIds: [],
    source: "clipboard",
    ...overrides,
  };
}

function doc(blocks: Block[]): DocumentState {
  const now = "2026-01-02T03:04:05.000Z";
  return {
    id: "d_1",
    title: "Notes",
    filename: "notes.nd.md",
    createdAt: now,
    updatedAt: now,
    blocks,
    assets: {},
    settings: {
      storageMode: "inline",
      imageMaxWidth: 1200,
      imageQuality: 0.72,
      preferredImageMime: "image/webp",
      timezone: "UTC",
    },
  };
}

describe("classification persistence", () => {
  it("writes classification metadata into the block marker", () => {
    const md = serializeDocument(
      doc([
        block({
          classification: { source: "user", confidence: 1, language: "python" },
        }),
      ])
    );

    expect(md).toContain("nd:block b_001 code 2026-01-02T03:04:05.000Z");
    expect(md).toContain("lang=python");
    expect(md).toContain("src=user");
    expect(md).toContain("conf=1.00");
  });

  it("survives a serialize -> parse round trip", () => {
    const original = doc([
      block({
        classification: {
          source: "user",
          confidence: 1,
          language: "python",
        },
      }),
      block({
        id: "b_002",
        type: "text",
        content: "just a note",
        classification: { source: "automatic", confidence: 0.95 },
      }),
      block({
        id: "b_003",
        type: "code",
        content: "```\nsome code\n```",
        classification: {
          source: "automatic",
          confidence: 0.8,
          candidates: ["javascript", "typescript"],
        },
      }),
    ]);

    const parsed = parseNotedownFile(serializeDocument(original), "notes.nd.md");

    expect(parsed.blocks).toHaveLength(3);
    expect(parsed.blocks[0].classification).toEqual({
      source: "user",
      confidence: 1,
      language: "python",
    });
    // A user override must not decay into an automatic one on the way back in.
    expect(parsed.blocks[0].classification?.source).toBe("user");
    expect(parsed.blocks[1].classification).toEqual({
      source: "automatic",
      confidence: 0.95,
    });
    expect(parsed.blocks[2].classification?.language).toBeUndefined();
    expect(parsed.blocks[2].classification?.candidates).toEqual([
      "javascript",
      "typescript",
    ]);
    expect(parsed.blocks.map((b) => b.content)).toEqual(
      original.blocks.map((b) => b.content)
    );
  });

  it("parses a version 1 document with no classification metadata", () => {
    const legacy = [
      "---",
      "notedown: 1",
      'title: "Legacy"',
      'created: "2025-01-01T00:00:00.000Z"',
      'updated: "2025-01-01T00:00:00.000Z"',
      'storage: "inline"',
      "image_max_width: 1200",
      "image_quality: 0.72",
      "---",
      "",
      "# Legacy",
      "",
      "<!-- nd:block b_001 code 2025-01-01T00:00:00.000Z -->",
      "## 00:00 · code",
      "",
      "```js",
      "const a = 1;",
      "```",
      "",
      "<!-- nd:endblock b_001 -->",
      "",
      "<!-- nd:block b_002 text 2025-01-01T00:00:00.000Z collapsed -->",
      "## 00:00 · text",
      "",
      "note",
      "",
      "<!-- nd:endblock b_002 -->",
      "",
    ].join("\n");

    const parsed = parseNotedownFile(legacy, "legacy.nd.md");

    expect(parsed.blocks).toHaveLength(2);
    // No metadata means "never classified", not "classify it retroactively".
    expect(parsed.blocks[0].classification).toBeUndefined();
    expect(parsed.blocks[0].type).toBe("code");
    expect(parsed.blocks[0].content).toBe("```js\nconst a = 1;\n```");
    expect(parsed.blocks[1].collapsed).toBe(true);
  });

  it("drops invalid classification values instead of storing them", () => {
    const broken = [
      "---",
      "notedown: 2",
      'title: "Broken"',
      'created: "2026-01-01T00:00:00.000Z"',
      'updated: "2026-01-01T00:00:00.000Z"',
      'storage: "inline"',
      "image_max_width: 1200",
      "image_quality: 0.72",
      "---",
      "",
      "# Broken",
      "",
      "<!-- nd:block b_001 code 2026-01-01T00:00:00.000Z lang=cobol conf=abc src=hacker -->",
      "body",
      "<!-- nd:endblock b_001 -->",
      "",
    ].join("\n");

    const parsed = parseNotedownFile(broken, "broken.nd.md");
    const classification = parsed.blocks[0].classification;

    expect(classification?.language).toBeUndefined();
    // An unreadable confidence is not a confidence of 0 — it is simply absent.
    expect(classification?.confidence).toBe(0);
    expect(classification?.source).toBe("automatic");
  });

  it("bumps the format version for the added attributes", () => {
    expect(NOTEDOWN_VERSION).toBe(2);
  });
});

describe("plain file import", () => {
  it("classifies an imported .json file as code/json", () => {
    const imported = createPlainImport('{"name": "notedown", "version": 2}', "package.json");
    expect(imported.blocks[0].type).toBe("code");
    expect(imported.blocks[0].classification?.language).toBe("json");
    expect(imported.blocks[0].content.startsWith("```json")).toBe(true);
  });

  it("classifies an imported .py file as code/python", () => {
    const imported = createPlainImport(
      "def main():\n    print('hello')\n",
      "main.py"
    );
    expect(imported.blocks[0].type).toBe("code");
    expect(imported.blocks[0].classification?.language).toBe("python");
  });

  it("classifies an imported .md file from its content, not its name", () => {
    const imported = createPlainImport("Just a plain note.", "notes.md");
    expect(imported.blocks[0].type).toBe("text");
    expect(imported.blocks[0].content).toBe("Just a plain note.");
  });
});
