import { describe, expect, it } from "vitest";
import {
  combineEvidence,
  decideCode,
  mergeLanguageCandidates,
  type LanguageCandidate,
} from "./score";
import {
  AMBIGUITY_MARGIN,
  CODE_TYPE_THRESHOLD,
  LANGUAGE_THRESHOLD,
} from "./config";

/**
 * Scores are exact binary fractions where it matters, so the boundary
 * comparisons below are decided by the rule and not by float noise.
 */
function candidate(
  language: LanguageCandidate["language"],
  score: number,
  from: LanguageCandidate["from"] = "highlight"
): LanguageCandidate {
  return { language, score, from };
}

describe("combineEvidence", () => {
  it("redistributes the weight of a family with no evidence", () => {
    // A missing family is omitted, not counted as a zero: one confident signal
    // must not be dragged down by two families that never fired.
    expect(combineEvidence({ structural: 0.4 })).toBeCloseTo(0.4);
    expect(combineEvidence({ syntax: 0.6 })).toBeCloseTo(0.6);
    // Two families, equal scores, equal weight each after redistribution.
    expect(combineEvidence({ structural: 0.4, highlight: 0.4 })).toBeCloseTo(0.4);
    // Nothing at all is not a verdict either.
    expect(combineEvidence({})).toBe(0);
  });
});

describe("mergeLanguageCandidates", () => {
  it("bumps a language two independent layers agree on", () => {
    const [merged] = mergeLanguageCandidates([
      candidate("json", 0.8, "recognizer"),
      candidate("json", 0.85, "highlight"),
    ]);
    // The agreement is the point of two signals: max score + 0.1.
    expect(merged.score).toBeCloseTo(0.95);
  });

  it("caps the bump so agreement can never report certainty", () => {
    const [merged] = mergeLanguageCandidates([
      candidate("json", 0.95, "recognizer"),
      candidate("json", 0.95, "highlight"),
    ]);
    expect(merged.score).toBe(0.98);
  });

  it("does not bump when the same layer reports it twice", () => {
    const [merged] = mergeLanguageCandidates([
      candidate("json", 0.8, "highlight"),
      candidate("json", 0.85, "highlight"),
    ]);
    expect(merged.score).toBeCloseTo(0.85);
  });
});

describe("decideCode", () => {
  // 0.875 and 0.78125 differ by 0.09375 — just under the margin — and 0.875 and
  // 0.75 by 0.125, comfortably over it. Both clear LANGUAGE_THRESHOLD.
  const ranked = (second: number): LanguageCandidate[] => [
    candidate("javascript", 0.875),
    candidate("typescript", second),
  ];

  it("settles the type and declines to name a language that close", () => {
    const decision = decideCode(0.8, ranked(0.78125));
    expect(decision.isCode).toBe(true);
    expect(decision.language).toBeUndefined();
    expect(decision.ambiguous).toBe(true);
    // The two gates are independent: a settled type is reported as such.
    expect(decision.confidence).toBeLessThan(LANGUAGE_THRESHOLD);
  });

  it("names the winner once the margin clears", () => {
    const decision = decideCode(0.8, ranked(0.75));
    expect(decision.language).toBe("javascript");
    expect(decision.ambiguous).toBe(false);
    expect(decision.candidates).toEqual(["javascript", "typescript"]);
  });

  it("refuses the type below the type threshold whatever the languages say", () => {
    const decision = decideCode(CODE_TYPE_THRESHOLD - 0.01, ranked(0.75));
    expect(decision.isCode).toBe(false);
    expect(decision.language).toBeUndefined();
    // Confidence here is confidence that this is *not* code.
    expect(decision.confidence).toBeGreaterThan(0.5);
  });

  it("is explicit about the margin it enforces", () => {
    expect(AMBIGUITY_MARGIN).toBe(0.1);
  });
});
