import { prepareContent, type PreparedContent } from "./content";
import {
  DETERMINISTIC_CONFIDENCE,
  HIGHLIGHT_MIN_EVIDENCE,
  MIN_CODE_LENGTH,
  MIN_CONFIDENCE,
} from "./config";
import { languageFromExtension } from "./context";
import { detectImage } from "./image";
import { detectLink } from "./link";
import { scoreLanguages, type LanguageScore } from "./languages";
import { decideCode, scoreCode, type Evidence, type LanguageCandidate } from "./score";
import { analyzeStructure } from "./structure";
import { detectWithHighlight } from "./highlight";
import { isTranscript, transcriptSignalKinds } from "./transcript";
import { classificationKey, readCache, writeCache } from "./hash";
import type {
  CaptureContext,
  ClassificationResult,
  ClassificationSignal,
} from "./types";

/**
 * The classifier.
 *
 *   classifyCapture(content, context) -> ClassificationResult
 *
 * Layered, synchronous, local, and conservative — five layers, each one only
 * consulted when the previous layer did not already settle the answer:
 *
 *   1. deterministic metadata (image mime/assets, URL grammar, file extension)
 *   2. strong structural rules (code-candidate gate + language recognizers)
 *   3. highlight.js auto-detection, only for content layer 2 called code
 *   4. confidence scoring over three independent evidence families
 *   5. conservative fallback — anything uncertain becomes `text`
 *
 * Pure and synchronous by design: no LLM, no network, no store access, and no
 * import of anything from the rendering layer.
 */

function result(
  overrides: Partial<ClassificationResult> & Pick<ClassificationResult, "type" | "confidence">
): ClassificationResult {
  return {
    blockType: overrides.type,
    signals: [],
    ...overrides,
  };
}

/**
 * Classify a capture. `context` is optional and only ever strengthens the
 * answer — metadata can promote a block to a type, but a filename never
 * overrides content that is provably something else.
 */
export function classifyCapture(
  content: string,
  context: CaptureContext = {}
): ClassificationResult {
  const key = classificationKey(content, context);
  const cached = readCache<ClassificationResult>(key);
  if (cached) return cached;

  const classified = runPipeline(content, context);
  writeCache(key, classified);
  return classified;
}

function runPipeline(
  content: string,
  context: CaptureContext
): ClassificationResult {
  // ─── Layer 1: deterministic metadata ───────────────────────

  // Images are decided by asset/mime metadata alone. No language detection ever
  // runs against image content.
  const image = detectImage(context);
  if (image) {
    return result({
      type: "image",
      confidence: DETERMINISTIC_CONFIDENCE,
      signals: image.signals,
    });
  }

  const prepared = prepareContent(content);

  if (!prepared.text) {
    return result({
      type: "text",
      confidence: MIN_CONFIDENCE,
      signals: [{ layer: 5, kind: "fallback.empty", group: "structural", score: 1, detail: "empty capture" }],
    });
  }

  // Links are detected before any code detection so a URL is never dragged
  // through language detection because of its punctuation.
  const link = detectLink(prepared.text);
  if (link) {
    return result({
      type: "link",
      confidence: DETERMINISTIC_CONFIDENCE,
      signals: [
        {
          layer: 1,
          kind: `link.${link.kind}`,
          group: "structural",
          score: 1,
          detail: link.url,
        },
      ],
    });
  }

  // ─── Layer 2: strong structural rules ──────────────────────

  const languages = scoreLanguages(prepared);
  const proven = languages.find((entry) => entry.deterministic);

  if (proven) {
    // A parser proved the format (currently: JSON.parse succeeded).
    return result({
      type: "code",
      language: proven.language,
      confidence: DETERMINISTIC_CONFIDENCE,
      signals: proven.signals,
    });
  }

  const structure = analyzeStructure(prepared);
  const extensionLanguage = languageFromExtension(context);
  const signals: ClassificationSignal[] = [...structure.signals];
  for (const entry of languages) signals.push(...entry.signals);

  // A user-supplied file extension is a deliberate choice and is trusted for
  // imports — but only after the content-based recognizers have had their say.
  if (extensionLanguage) {
    signals.push({
      layer: 1,
      kind: "context.extension",
      group: "structural",
      score: DETERMINISTIC_CONFIDENCE,
      detail: `${context.filename ?? context.fileExtension} → ${extensionLanguage}`,
    });
    return result({
      type: "code",
      language: extensionLanguage,
      confidence: DETERMINISTIC_CONFIDENCE,
      signals,
    });
  }

  const best = languages[0];
  const evidence: Evidence = {
    structural: structure.score,
    ...(best ? { syntax: best.score, recognizerBest: best.score } : {}),
  };
  const candidates: LanguageCandidate[] = languages.map(toCandidate);

  // ─── Layer 3: highlight.js, only for code candidates ───────

  if (structure.isCandidate || best) {
    if (prepared.text.length < MIN_CODE_LENGTH) {
      // Too short for auto-detection to mean anything; the deterministic
      // evidence gathered so far is the whole story.
      signals.push({
        layer: 3,
        kind: "highlight.skipped",
        group: "highlight",
        score: 0,
        detail: "capture too short for auto-detection",
      });
    } else {
      const highlight = detectWithHighlight(prepared);
      signals.push(...highlight.signals);
      // A barely-decisive verdict is uninformative, so it is left out of the
      // combination entirely rather than averaged in as a low score.
      if (highlight.decisive && highlight.best && highlight.best.score >= HIGHLIGHT_MIN_EVIDENCE) {
        evidence.highlight = highlight.best.score;
        candidates.push({
          language: highlight.best.language,
          score: highlight.best.score,
          from: "highlight",
        });
        if (highlight.second) {
          candidates.push({
            language: highlight.second.language,
            score: highlight.second.score,
            from: "highlight",
          });
        }
      }
    }
  }

  // ─── Layer 4: confidence scoring ───────────────────────────

  const codeScore = scoreCode(evidence);
  const decision = decideCode(codeScore, candidates);

  // ─── Layer 5: conservative fallback ────────────────────────

  if (decision.isCode) {
    if (!decision.language) {
      signals.push({
        layer: 4,
        kind: decision.ambiguous
          ? "language.ambiguous"
          : "language.unknown",
        group: "syntax",
        score: 0,
        detail: decision.ambiguous
          ? `candidates: ${decision.candidates.join(", ") || "none"}`
          : "no language evidence",
      });
    }
    return result({
      type: "code",
      language: decision.language,
      confidence: decision.confidence,
      candidates: decision.candidates,
      signals,
    });
  }

  if (isTranscript(prepared)) {
    return result({
      type: "text",
      blockType: "transcript",
      confidence: Math.max(decision.confidence, 0.7),
      signals: [
        ...signals,
        ...transcriptSignals(prepared),
      ],
    });
  }

  signals.push({
    layer: 5,
    kind: "fallback.text",
    group: "structural",
    score: decision.confidence,
    detail: `code score ${codeScore.toFixed(2)} below threshold`,
  });

  return result({
    type: "text",
    confidence: decision.confidence,
    signals,
  });
}

function toCandidate(entry: LanguageScore): LanguageCandidate {
  return { language: entry.language, score: entry.score, from: "recognizer" };
}

function transcriptSignals(prepared: PreparedContent): ClassificationSignal[] {
  return transcriptSignalKinds(prepared).map((kind) => ({
    layer: 2,
    kind,
    group: "structural",
    score: 0.3,
    detail: "transcript markers",
  }));
}

/**
 * Debug view of a classification: the type, the language (if any) and every
 * signal that contributed. Exposed for tests and the dev-only inspector — never
 * rendered in the normal UI.
 */
export function explainClassification(classification: ClassificationResult): string {
  const lines = [
    `${classification.type}${
      classification.language ? ` (${classification.language})` : ""
    } confidence ${classification.confidence.toFixed(2)}`,
  ];
  if (classification.candidates?.length) {
    lines.push(`candidates: ${classification.candidates.join(", ")}`);
  }
  for (const signal of classification.signals) {
    const sign = signal.score < 0 ? "−" : "+";
    lines.push(
      `  L${signal.layer} ${signal.kind} ${sign}${Math.abs(signal.score).toFixed(2)}${
        signal.detail ? ` — ${signal.detail}` : ""
      }`
    );
  }
  return lines.join("\n");
}
