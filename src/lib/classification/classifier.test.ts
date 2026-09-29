import { beforeEach, describe, expect, it } from "vitest";
import { classifyCapture, explainClassification } from "./classifier";
import { clearClassificationCache } from "./hash";
import { captureTypeOf, toBlockClassification } from "./format";
import { CACHE_LIMIT, MIN_CONFIDENCE } from "./config";
import type { ClassificationResult } from "./types";

const PROSE =
  "The team met on Tuesday to review the roadmap and decided to ship the new editor next week.";

const JSON_SAMPLE = `{
  "name": "notedown",
  "version": 1,
  "nested": { "flags": [true, false] }
}`;

const PYTHON_SAMPLE = `def add(a, b):
    return a + b
`;

const JAVASCRIPT_SAMPLE = `function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("world"));
`;

const TYPESCRIPT_SAMPLE = `interface User {
  id: number;
  name: string;
}
`;

const SQL_SAMPLE = `SELECT id, name
FROM users
WHERE age > 21
ORDER BY name;`;

const HTML_SAMPLE = `<!DOCTYPE html>
<html lang="en">
  <head><title>Hi</title></head>
  <body><p>Hello</p></body>
</html>`;

const CSS_SAMPLE = `.button {
  color: red;
  padding: 8px;
  border: none;
}
`;

const BASH_SAMPLE = `#!/bin/bash
npm install
git commit -m "wip"`;

const YAML_SAMPLE = `name: notedown
version: 1
scripts:
  build: tsc -b
  test: vitest run`;

/** One TS-only marker in otherwise plain JavaScript: deliberately undecided. */
const JS_TS_AMBIGUOUS = `const rows = [];
let total: number = 0;
function add(row) {
  total += row.amount;
  return total;
}`;

/**
 * A speaker turn plus a timestamped line: two independent transcript patterns,
 * which is what the `transcript` app subtype requires.
 */
const TRANSCRIPT_SAMPLE = `[00:12] Welcome back to the show.
Moderator: Thanks for joining us today.`;

/**
 * Code carrying a single transcript-shaped comment. One pattern must not
 * promote the capture, and code outranks the app subtype regardless.
 */
const CODE_WITH_TRANSCRIPT_LINE = `# [00:12] intro cut
def load(text):
    return json.loads(text)
`;

function expectCode(result: ClassificationResult, language?: string): void {
  expect(result.type).toBe("code");
  if (language) expect(result.language).toBe(language);
  // Below-threshold results are always reported with a confidence we can
  // explain, and never with an invented language.
  if (result.confidence < 0.85) expect(result.language).toBeUndefined();
}

describe("classifyCapture", () => {
  beforeEach(() => {
    clearClassificationCache();
  });

  it("1. ordinary prose stays text", () => {
    const result = classifyCapture(PROSE);
    expect(result.type).toBe("text");
    expect(result.language).toBeUndefined();
    expect(result.confidence).toBeGreaterThan(0.55);
  });

  it("2. prose containing the word import is not Python", () => {
    const result = classifyCapture("importantly, this approach works");
    expect(result.type).toBe("text");
    expect(result.language).toBeUndefined();
  });

  it("3. valid JSON is code/json with very high confidence", () => {
    const result = classifyCapture(JSON_SAMPLE);
    expectCode(result, "json");
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.signals.some((s) => s.kind === "json.parse-ok")).toBe(true);
  });

  it("4. invalid JSON-looking prose is not classified as JSON", () => {
    const result = classifyCapture("{ this is not json }");
    expect(result.language).not.toBe("json");
    expect(result.type).toBe("text");
  });

  it("5. a python function is code/python", () => {
    expectCode(classifyCapture(PYTHON_SAMPLE), "python");
  });

  it("6. a javascript function is code/javascript", () => {
    expectCode(classifyCapture(JAVASCRIPT_SAMPLE), "javascript");
  });

  it("7. a typescript interface is code/typescript", () => {
    expectCode(classifyCapture(TYPESCRIPT_SAMPLE), "typescript");
  });

  it("8. a SELECT query is code/sql", () => {
    expectCode(classifyCapture(SQL_SAMPLE), "sql");
  });

  it("9. an html document is code/html", () => {
    expectCode(classifyCapture(HTML_SAMPLE), "html");
  });

  it("10. a css stylesheet is code/css", () => {
    expectCode(classifyCapture(CSS_SAMPLE), "css");
  });

  it("11. a shell script is code/bash", () => {
    expectCode(classifyCapture(BASH_SAMPLE), "bash");
  });

  it("12. a yaml config is code/yaml", () => {
    expectCode(classifyCapture(YAML_SAMPLE), "yaml");
  });

  it("13. a plain URL is a link", () => {
    const result = classifyCapture("https://example.com");
    expect(result.type).toBe("link");
    expect(result.language).toBeUndefined();
  });

  it("14. a markdown link is a link", () => {
    const result = classifyCapture("[www.example.com](http://www.example.com)");
    expect(result.type).toBe("link");
  });

  it("15. image metadata classifies as image without language detection", () => {
    const result = classifyCapture("screenshot bytes", {
      mimeType: "image/png",
      assetIds: ["img_001"],
    });
    expect(result.type).toBe("image");
    expect(result.language).toBeUndefined();
    expect(result.signals.every((s) => s.kind.startsWith("image."))).toBe(true);
  });

  it("16. an ambiguous snippet falls back to text", () => {
    const result = classifyCapture("a = 1\nb = 2\nc = a + b");
    expect(result.type).toBe("text");
    expect(result.language).toBeUndefined();
  });

  it("17. javascript/typescript ambiguity yields code without a language", () => {
    const result = classifyCapture(JS_TS_AMBIGUOUS);
    expect(result.type).toBe("code");
    expect(result.language).toBeUndefined();
    expect(result.candidates).toEqual(
      expect.arrayContaining(["javascript", "typescript"])
    );
    expect(result.confidence).toBeLessThan(0.85);
  });

  it("never names a language below the language threshold", () => {
    const samples = [
      "a = 1\nb = 2\nc = a + b",
      "x = 5",
      "for (let i = 0; i < 3; i++) {\n  total += i;\n}",
      "<?php echo 1; ?>",
    ];
    for (const sample of samples) {
      const result = classifyCapture(sample);
      if (result.confidence < 0.85) {
        expect(result.language, explainClassification(result)).toBeUndefined();
      }
    }
  });

  it("runs language detection only for code candidates", () => {
    const proseSignals = classifyCapture(PROSE).signals;
    expect(proseSignals.some((s) => s.layer === 3)).toBe(false);
    const codeSignals = classifyCapture(PYTHON_SAMPLE).signals;
    expect(codeSignals.some((s) => s.layer === 3 || s.layer === 2)).toBe(true);
  });

  it("18. two transcript markers give the transcript app subtype of text", () => {
    const result = classifyCapture(TRANSCRIPT_SAMPLE);
    // `transcript` is an app subtype, never a sixth top-level capture type.
    expect(result.type).toBe("text");
    expect(result.blockType).toBe("transcript");
    expect(captureTypeOf(result.blockType)).toBe("text");
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.signals.some((s) => s.kind.startsWith("transcript."))).toBe(
      true
    );
  });

  it("19. one transcript line inside code stays code", () => {
    const result = classifyCapture(CODE_WITH_TRANSCRIPT_LINE);
    expect(result.type).toBe("code");
    expect(result.blockType).toBe("code");
    expect(result.signals.some((s) => s.kind.startsWith("transcript."))).toBe(
      false
    );
  });

  it("18. an empty capture is text at the reporting floor", () => {
    // Nothing to classify is still an answer: the type is text, and the only
    // honest confidence is the floor itself — `MIN_CONFIDENCE`, reported, with
    // no evidence invented and no language detection attempted.
    for (const empty of ["", "   \n "]) {
      const result = classifyCapture(empty);
      expect(result.type).toBe("text");
      expect(result.blockType).toBe("text");
      expect(result.language).toBeUndefined();
      expect(result.confidence).toBe(MIN_CONFIDENCE);
      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].kind).toBe("fallback.empty");
      expect(result.signals.some((s) => s.layer === 3)).toBe(false);
    }
  });

  it("19. the confidence floor is inclusive and matches the parser", () => {
    // One owner for the boundary: the writer drops results below the floor, and
    // the parser drops stored markers below it. So a result exactly *at* the
    // floor is persisted, and a hair below it is not — the same rule, applied
    // in both directions.
    const atFloor = toBlockClassification(
      classifyCapture("")
    );
    expect(atFloor).toEqual({ source: "automatic", confidence: MIN_CONFIDENCE });

    const belowFloor = toBlockClassification({
      ...classifyCapture("Just a note."),
      confidence: MIN_CONFIDENCE - 0.01,
    });
    expect(belowFloor).toBeUndefined();
  });

  it("20. a filename only decides the language for a real import", () => {
    // Same content, different provenance. A user importing main.py handed us a
    // deliberate choice; a filename riding along with pasted text is a guess,
    // and prose must stay prose.
    const pasted = classifyCapture("Just a plain note.", {
      source: "clipboard",
      filename: "notes.py",
    });
    expect(pasted.type).toBe("text");
    expect(pasted.language).toBeUndefined();
    expect(pasted.signals.some((s) => s.kind === "context.extension")).toBe(false);

    const imported = classifyCapture("Just a plain note.", {
      source: "import",
      filename: "main.py",
    });
    expect(imported.type).toBe("code");
    expect(imported.language).toBe("python");
    expect(imported.signals.some((s) => s.kind === "context.extension")).toBe(true);
  });

  it("21. a trusted image extension is an image, and never reaches detection", () => {
    const result = classifyCapture("photo-bytes", {
      source: "import",
      filename: "photo.png",
    });
    expect(result.type).toBe("image");
    expect(result.blockType).toBe("image");
    expect(result.language).toBeUndefined();
    // Layer 1 settled it; nothing downstream ran.
    expect(result.signals.every((s) => s.layer === 1)).toBe(true);
    expect(result.signals.some((s) => s.kind === "image.extension")).toBe(true);
  });

  it("22. an imported svg is markup, not an unbacked image block", () => {
    // `svg` is in the language map (as html) and must not also be an image
    // extension: there are no asset bytes behind an imported svg, so an
    // image-typed block would have nothing to render.
    const result = classifyCapture("<svg viewBox='0 0 1 1'></svg>", {
      source: "import",
      filename: "icon.svg",
    });
    expect(result.type).toBe("code");
    expect(result.signals.some((s) => s.kind.startsWith("image."))).toBe(false);
  });

  it("memoizes per content *and* context identity", () => {
    // Same bytes, different provenance: these are different questions, so they
    // must not share a cache entry. An image is decided by metadata alone, while
    // the same text with no context is content that still has to be classified.
    const content = "photo-bytes";
    const asImage = classifyCapture(content, {
      mimeType: "image/png",
      assetIds: ["img_001"],
    });
    const asText = classifyCapture(content);
    expect(asImage).not.toBe(asText);
    expect(asImage.type).toBe("image");
    expect(asText.type).not.toBe("image");
    // And each keeps its own entry.
    expect(classifyCapture(content, { mimeType: "image/png", assetIds: ["img_001"] })).toBe(
      asImage
    );
    expect(classifyCapture(content)).toBe(asText);
  });

  it("evicts the oldest entry when the bounded cache overflows", () => {
    // CACHE_LIMIT is a bound, not a suggestion: past it the least recently used
    // key is dropped, and a dropped key is recomputed rather than served stale.
    const samples = Array.from(
      { length: CACHE_LIMIT + 2 },
      (_, i) => `def f${i}(a):\n    return a + ${i}\n`
    );
    // More distinct keys than the cache can hold, classified in order.
    const results = samples.map((sample) => classifyCapture(sample));
    const first = results[0];
    const last = results[results.length - 1];

    // The oldest was evicted, so this is a fresh result object, not the old one.
    expect(classifyCapture(samples[0])).not.toBe(first);
    // A recent entry is still memoized, and identical by reference.
    expect(classifyCapture(samples[samples.length - 1])).toBe(last);
  });

  it("explains itself for debugging", () => {    const explanation = explainClassification(classifyCapture(JSON_SAMPLE));
    expect(explanation).toContain("code (json)");
    expect(explanation).toContain("json.parse-ok");
  });

  it("memoizes by content + context", () => {
    const first = classifyCapture(PYTHON_SAMPLE);
    const second = classifyCapture(PYTHON_SAMPLE);
    expect(second).toBe(first);
    // Same content, different context: different answer, so not the same entry.
    const asImport = classifyCapture(PYTHON_SAMPLE, { source: "import" });
    expect(asImport).not.toBe(first);
    expect(asImport.type).toBe("code");
  });
});
