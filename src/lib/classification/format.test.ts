import { describe, expect, it } from "vitest";
import {
  classifyAndFormatCapture,
  formatCaptureContent,
  parseFence,
} from "./format";

/** Format a capture exactly as the app stores it: classify, then rewrite. */
function store(content: string): string {
  return classifyAndFormatCapture(content).content;
}

describe("formatCaptureContent", () => {
  it("strips trailing punctuation from both the label and the href", () => {
    // People copy URLs out of prose, full stop included. The full stop is not
    // part of the address, and must not end up inside the href.
    expect(store("https://example.com.")).toBe(
      "[https://example.com](https://example.com)"
    );
    expect(store("https://example.com/a?b=1, ")).toBe(
      "[https://example.com/a?b=1](https://example.com/a?b=1)"
    );
  });

  it("gives a bare www capture an https href, punctuation stripped", () => {
    expect(store("www.example.com!")).toBe(
      "[www.example.com](https://www.example.com)"
    );
  });

  it("leaves an already-markdown link exactly as captured", () => {
    const content = "[www.example.com](http://www.example.com)";
    expect(store(content)).toBe(content);
  });

  it("fences code with the language it was classified as", () => {
    const content = "def add(a, b):\n    return a + b\n";
    expect(store(content)).toBe("```python\ndef add(a, b):\n    return a + b\n```");
  });

  it("classifies through an incoming fence and re-fences from the verdict", () => {
    // The policy: a fence that arrives with a capture is a wrapper, not content.
    // It comes off before classification — so `JSON.parse` sees the body and a
    // pasted snippet is code rather than text that mentions a fence — and code
    // output is always re-fenced from the verdict, never from the tag that
    // happened to come along. This is the same rule the store applies when a
    // block is re-classified later, applied at the door instead.
    const pastedJson = '```python\n{"a": 1}\n```';
    expect(classifyAndFormatCapture(pastedJson).result.language).toBe("json");
    expect(store(pastedJson)).toBe('```json\n{"a": 1}\n```');

    const pastedPython = "```py\ndef add(a, b):\n    return a + b\n```";
    expect(classifyAndFormatCapture(pastedPython).result.language).toBe("python");
    expect(store(pastedPython)).toBe(
      "```python\ndef add(a, b):\n    return a + b\n```"
    );

    // Not code: the fence goes away, because a block that is no longer code must
    // not keep a ``` around it.
    expect(store("```\nJust a note.\n```")).toBe("Just a note.");

    // Even handed a stale fence directly, the formatter refuses to keep it.
    expect(
      formatCaptureContent({ type: "code", language: "json" }, pastedJson)
    ).toBe('```json\n{"a": 1}\n```');
  });

  it("treats an unclosed fence as unfenced content", () => {
    // Nothing to unwrap, so it is judged as written — and if the verdict is
    // code, the output is a *closed* fence rather than the broken one.
    const unclosed = "```python\nprint('hi')";
    expect(parseFence(unclosed)).toBeNull();
    const stored = formatCaptureContent({ type: "code", language: "python" }, unclosed);
    expect(parseFence(stored)?.body).toBe("```python\nprint('hi')");
  });

  it("stores prose untouched", () => {
    expect(store("Just a note.")).toBe("Just a note.");
  });
});
