import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import {
  HIGHLIGHT_LANGUAGES,
  MIN_HIGHLIGHT_RELEVANCE,
} from "./config";
import type { PreparedContent } from "./content";
import type { ClassificationSignal, CodeLanguage } from "./types";

/**
 * Layer 3 — `highlight.js` auto-detection.
 *
 * Deliberately *not* the authority. Only grammars Notedown actually encounters
 * are registered on the core build (the ~190-grammar common build is never
 * pulled in), and this layer is only ever consulted for content that already
 * passed the structural gate — running it on ordinary prose would be both slow
 * and a false-positive generator.
 */

// Register only the selected grammars; `highlight.js/lib/core` ships no
// languages of its own, so the bundle only contains what is registered here.
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("json", json);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("bash", bash);

const HIGHLIGHT_SUBSET = [...HIGHLIGHT_LANGUAGES];

/** `highlight.js` grammar name → the language name Notedown stores. */
const HLJS_TO_LANGUAGE: Record<string, CodeLanguage> = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  json: "json",
  yaml: "yaml",
  sql: "sql",
  xml: "html",
  css: "css",
  bash: "bash",
};

/**
 * Highlight `code` as `language`, or return null when we have no grammar for it.
 *
 * The preview highlights through here, so the whole app shares one `highlight.js`
 * instance and one grammar set — the languages Notedown can actually name, not
 * the ~190 grammars of the common build. An unnamed or unrecognised fence
 * returns null rather than falling back to auto-detection: no language in the
 * fence means the app had no verdict to record, and guessing one in the renderer
 * would put a language on screen that the document never claims.
 */
export function highlightCode(code: string, language?: string): string | null {
  if (!language || !hljs.getLanguage(language)) return null;
  try {
    return hljs.highlight(code, { language }).value;
  } catch {
    return null;
  }
}

export interface HighlightCandidate {
  language: CodeLanguage;
  /** 0..1, strength weighted by how decisive the detection was. */
  score: number;
  rawRelevance: number;
}

export interface HighlightEvidence {
  best?: HighlightCandidate;
  second?: HighlightCandidate;
  /** True when the detection clearly favours one language over the rest. */
  decisive: boolean;
  signals: ClassificationSignal[];
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function candidate(
  language: string | undefined,
  relevance: number
): HighlightCandidate | undefined {
  if (!language) return undefined;
  const mapped = HLJS_TO_LANGUAGE[language];
  if (!mapped) return undefined;
  return { language: mapped, score: 0, rawRelevance: relevance };
}

/**
 * Run auto-detection and turn its raw relevance into a usable score.
 *
 * Two independent aspects matter and are multiplied together:
 * - *strength* — is the absolute relevance meaningful for a capture this size?
 * - *decisiveness* — does the winner clearly beat the runner-up? (JavaScript vs
 *   TypeScript routinely ties, which is exactly the ambiguity we must surface
 *   rather than resolve by guessing.)
 *
 * `secondBest` is captured so the ambiguity rule has a competing language to
 * measure the margin against.
 */
export function detectWithHighlight(
  prepared: PreparedContent
): HighlightEvidence {
  let best: HighlightCandidate | undefined;
  let second: HighlightCandidate | undefined;
  let bestRelevance = 0;
  let secondRelevance = 0;

  try {
    const result = hljs.highlightAuto(prepared.text, HIGHLIGHT_SUBSET);
    // `plaintext` is always a candidate in highlight.js and has no language
    // name, so a plaintext win resolves to "no language" here.
    best = candidate(result.language, result.relevance);
    bestRelevance = result.relevance;
    if (result.secondBest) {
      second = candidate(result.secondBest.language, result.secondBest.relevance);
      secondRelevance = result.secondBest.relevance;
    }
  } catch {
    // A grammar that cannot compile the input is not a reason to fail
    // classification — just report no highlight evidence.
    return { decisive: false, signals: [] };
  }

  if (!best || bestRelevance < MIN_HIGHLIGHT_RELEVANCE) {
    return { decisive: false, signals: [] };
  }

  // Relevance scales with content size, so compare it against an expectation
  // derived from the line count rather than a fixed constant.
  const expected = Math.max(8, 1.2 * Math.max(1, prepared.lineCount));
  const strength = clamp01(bestRelevance / expected);
  const decisiveness = clamp01(
    (bestRelevance - secondRelevance) / Math.max(4, bestRelevance)
  );
  const score = clamp01(strength * decisiveness);
  const decisive = strength >= 0.5 && decisiveness >= 0.5;

  best.score = score;
  // The runner-up is scored on the same scale, so the two scores stay
  // comparable: a runner-up that scored higher than the winner would make the
  // ambiguity margin meaningless.
  if (second) {
    second.score = clamp01(strength * clamp01(secondRelevance / expected) * decisiveness);
  }

  const signals: ClassificationSignal[] = [
    {
      layer: 3,
      kind: "highlight.auto",
      group: "highlight",
      score,
      detail: `best ${best.language} (${bestRelevance}) vs ${
        second ? `${second.language} (${secondRelevance})` : "none"
      }${decisive ? "" : " — not decisive"}`,
    },
  ];

  return { best, second, decisive, signals };
}
