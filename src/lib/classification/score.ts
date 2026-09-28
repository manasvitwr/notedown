import {
  AMBIGUITY_MARGIN,
  CLASSIFIER_WEIGHTS,
  CODE_TYPE_THRESHOLD,
  LANGUAGE_THRESHOLD,
  RECOGNIZER_CODE_FLOOR,
  RECOGNIZER_CODE_WEIGHT,
} from "./config";
import type { CodeLanguage, SignalGroup } from "./types";

/**
 * Layer 4 — confidence scoring.
 *
 * Three independent evidence families (structural, `highlight.js`, syntax
 * validation) are combined with documented, configurable weights:
 *
 *   final = structural*0.45 + languageDetection*0.35 + syntaxValidation*0.20
 *
 * A family with no evidence is **omitted** and its weight redistributed across
 * the families that do exist, instead of being counted as a zero — an
 * uninformative signal must not drag confidence down and must never be
 * invented.
 */

export type Evidence = Partial<Record<SignalGroup, number>>;

/** Weighted mean over the evidence that is actually present. */
export function combineEvidence(evidence: Evidence): number {
  let weighted = 0;
  let total = 0;
  for (const group of Object.keys(CLASSIFIER_WEIGHTS) as SignalGroup[]) {
    const value = evidence[group];
    if (value === undefined) continue;
    weighted += CLASSIFIER_WEIGHTS[group] * value;
    total += CLASSIFIER_WEIGHTS[group];
  }
  if (total === 0) return 0;
  return Math.max(0, Math.min(1, weighted / total));
}

export interface CodeEvidence extends Evidence {
  /** Strongest deterministic recognizer score, if any recognizer fired. */
  recognizerBest?: number;
}

/**
 * Confidence that the content is code.
 *
 * The weighted combination is the baseline, with one addition: a deterministic
 * recognizer firing confidently (SQL clause grammar, CSS declarations, a valid
 * YAML document shape) is itself proof that the content is code, and can lift
 * the score where generic structural evidence is thin — SQL and YAML simply do
 * not have the braces the structural layer looks for.
 */
export function scoreCode(evidence: CodeEvidence): number {
  const combined = combineEvidence(evidence);
  const recognizerBest = evidence.recognizerBest ?? 0;
  if (recognizerBest < RECOGNIZER_CODE_FLOOR) return combined;
  return Math.max(combined, recognizerBest * RECOGNIZER_CODE_WEIGHT);
}

export interface LanguageCandidate {
  language: CodeLanguage;
  score: number;
  from: "recognizer" | "highlight";
}

/** Hard ceiling on a language score, so layer agreement can never report 1.0. */
const MAX_LANGUAGE_SCORE = 0.98;

/**
 * Merge recognizer and highlight.js candidates per language. When both
 * independent layers agree on the same language, confidence is bumped — the
 * agreement is the point of using two signals at all.
 */
export function mergeLanguageCandidates(
  candidates: LanguageCandidate[],
): LanguageCandidate[] {
  const merged = new Map<CodeLanguage, LanguageCandidate>();
  for (const candidate of candidates) {
    const existing = merged.get(candidate.language);
    if (!existing) {
      merged.set(candidate.language, { ...candidate });
      continue;
    }
    const agreed = existing.from !== candidate.from;
    merged.set(candidate.language, {
      language: candidate.language,
      score: Math.min(
        MAX_LANGUAGE_SCORE,
        Math.max(existing.score, candidate.score) + (agreed ? 0.1 : 0)
      ),
      from: agreed ? "recognizer" : existing.from,
    });
  }
  return [...merged.values()].sort((a, b) => b.score - a.score);
}

export interface CodeDecision {
  isCode: boolean;
  language?: CodeLanguage;
  /** Confidence in the returned type (+ language, when one is named). */
  confidence: number;
  candidates: CodeLanguage[];
  /** True when a language was dropped for being too close to the runner-up. */
  ambiguous: boolean;
}

/**
 * Decide type and language from the combined code score.
 *
 * Two separate thresholds, because "this is code" and "this is specifically
 * Python" are different questions: a snippet can be clearly code while the
 * specific language is a coin flip, and the UI is expected to show "Code"
 * instead of a confident wrong label.
 */
export function decideCode(
  codeScore: number,
  candidates: LanguageCandidate[]
): CodeDecision {
  const ranked = mergeLanguageCandidates(candidates);
  const best = ranked[0];
  const second = ranked[1];
  const candidateNames = ranked.slice(0, 3).map((entry) => entry.language);

  if (codeScore < CODE_TYPE_THRESHOLD) {
    // Not code with enough confidence. The reported confidence is confidence
    // that this is *not* code, so it rises as the code evidence falls.
    return {
      isCode: false,
      confidence: 0.5 + 0.5 * (1 - codeScore),
      candidates: candidateNames,
      ambiguous: false,
    };
  }

  const margin = best ? best.score - (second?.score ?? 0) : 0;
  // The two thresholds stay independent, which is the whole point: the type
  // gate above already settled "this is code", and the language gate here
  // settles "specifically *which*". Tying them together would refuse to name
  // languages whose evidence is strong but whose generic structure is thin —
  // exactly SQL, YAML and shell scripts, which have no braces to count.
  const confident = best !== undefined && best.score >= LANGUAGE_THRESHOLD;
  if (confident && margin >= AMBIGUITY_MARGIN) {
    return {
      isCode: true,
      language: best.language,
      // The reported confidence is the confidence in the full classification that
      // is actually shown — "code / sql". Type and language confidence are scored
      // separately, and once both clear their gates the language score is the
      // one a reader cares about.
      confidence: best.score,
      candidates: candidateNames,
      ambiguous: false,
    };
  }

  return {
    isCode: true,
    // The type is settled but the language is not: cap the reported confidence
    // so nothing downstream can read this as a confident language choice.
    confidence: Math.min(codeScore, CODE_TYPE_THRESHOLD + 0.1),
    candidates: candidateNames,
    ambiguous: best !== undefined,
  };
}

/** Band name for a confidence value — debug surface and documentation. */
export function confidenceBand(confidence: number): "certain" | "strong" | "probable" | "insufficient" {
  if (confidence >= 0.9) return "certain";
  if (confidence >= 0.75) return "strong";
  if (confidence >= 0.55) return "probable";
  return "insufficient";
}
