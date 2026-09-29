import { describe, expect, it } from "vitest";
import { formatCaptureContent } from "./format";
import { classifyCapture } from "./classifier";

/** Format a capture exactly as the app stores it: classify, then rewrite. */
function store(content: string): string {
  return formatCaptureContent(classifyCapture(content), content);
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

  it("preserves an explicit fence the user brought, whichever way it classifies", () => {
    // The policy: a fence that came *with* the capture is the user's, and the
    // formatter never rewrites it — neither the tag nor the language. A fence
    // the app wrote from its own classification is a different matter, and is
    // re-written from the verdict by the store (see useDocumentStore, which
    // classifies the unwrapped body and fences it again).
    const proseFence = "```py\nJust a note.\n```";
    expect(classifyCapture(proseFence).type).toBe("text");
    expect(store(proseFence)).toBe(proseFence);

    // A `python` fence around a JSON body: even told the verdict is json, the
    // formatter leaves the user's fence exactly as typed. A stale language tag
    // the user wrote themselves is not silently corrected — being wrong about
    // something someone typed by hand is worse than correcting it for them.
    const mislabelled = '```python\n{"a": 1}\n```';
    expect(
      formatCaptureContent({ type: "code", language: "json" }, mislabelled)
    ).toBe(mislabelled);
  });

  it("stores prose and already-fenced code untouched", () => {
    expect(store("Just a note.")).toBe("Just a note.");
    const fenced = "```py\nx = 1\n```";
    expect(store(fenced)).toBe(fenced);
  });
});
