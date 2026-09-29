import { describe, expect, it } from "vitest";
import { highlightCode } from "./highlight";

describe("highlightCode", () => {
  it("highlights with a grammar Notedown knows", () => {
    const python = highlightCode("def add(a, b):\n    return a + b", "python");
    expect(python).toBeTruthy();
    expect(python).toContain("hljs-");
    // `html` is an alias of the registered `xml` grammar, so the fence language
    // we actually write still resolves.
    expect(highlightCode("<div class='a'>x</div>", "html")).toBeTruthy();
  });

  it("returns null instead of guessing a language", () => {
    // No fence language, or one we do not register: null, not auto-detection.
    // The renderer must not invent a verdict the document never recorded.
    expect(highlightCode("def add(a, b):\n    return a + b")).toBeNull();
    expect(highlightCode("print('hi')", "")).toBeNull();
    expect(highlightCode("print('hi')", "brainfuck")).toBeNull();
  });
});
