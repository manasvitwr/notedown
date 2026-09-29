/**
 * Public surface of the classification pipeline. Everything the app needs is
 * re-exported here so UI and store code never reaches into individual layers.
 */
export { classifyCapture, explainClassification } from "./classifier";
export { prepareContent, type PreparedContent } from "./content";
export { clearClassificationCache, classificationKey } from "./hash";
export { confidenceBand } from "./score";
export {
  captureTypeOf,
  describeBlockClassification,
  fenceContent,
  formatCaptureContent,
  isFenced,
  languageLabel,
  parseFence,
  toBlockClassification,
  userClassification,
  type FencedContent,
} from "./format";
export {
  AMBIGUITY_MARGIN,
  CLASSIFIER_WEIGHTS,
  CODE_CANDIDATE_THRESHOLD,
  CODE_TYPE_THRESHOLD,
  DETERMINISTIC_CONFIDENCE,
  LANGUAGE_LABELS,
  LANGUAGE_PICKER_ORDER,
  LANGUAGE_THRESHOLD,
  MIN_CONFIDENCE,
} from "./config";
export type {
  BlockClassification,
  CaptureContext,
  CaptureType,
  ClassificationResult,
  ClassificationSignal,
  CodeLanguage,
  SignalGroup,
  SignalLayer,
} from "./types";
export { CAPTURE_TYPES, CODE_LANGUAGES } from "./types";
