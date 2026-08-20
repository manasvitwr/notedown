import type { BlockType } from "../types";

interface ClassificationResult {
  type: BlockType;
  formattedContent: string;
}

/**
 * Classify pasted text into a block type and format accordingly.
 */
export function classifyText(text: string): ClassificationResult {
  const trimmed = text.trim();

  // 1. URL detection — single line, valid URL
  if (isUrl(trimmed)) {
    return {
      type: "link",
      formattedContent: `[${trimmed}](${trimmed})`,
    };
  }

  // 2. Code detection
  const codePatterns = [
    /\b(function|const|let|var|import|export|class|def|return)\b/,
    /[{};]$/m,
    /^\s*(\/\/|#|\/\*|\*)/m,
    /<\/?[a-z][\w-]*[\s/>]/i,
    /console\.(log|error|warn)/,
    /=>/,
    /\b(pip install|npm|yarn|cargo|go run)\b/,
    /^\s*(if|else|for|while|switch)\s*[({]/m,
  ];
  const codeScore = codePatterns.reduce(
    (s, p) => s + (p.test(trimmed) ? 1 : 0),
    0
  );
  if (codeScore >= 2) {
    const lang = guessLanguage(trimmed);
    return {
      type: "code",
      formattedContent: "```" + lang + "\n" + trimmed + "\n```",
    };
  }

  // 3. Transcript detection
  const transcriptPatterns = [
    /\b\d{1,2}:\d{2}(:\d{2})?\b/,
    /\[\d{1,2}:\d{2}\]/,
    /^[A-Z][a-z]+\s*:/m,
    /^(Speaker \d+|Host|Guest|Interviewer|Moderator):/im,
  ];
  const transcriptScore = transcriptPatterns.reduce(
    (s, p) => s + (p.test(trimmed) ? 1 : 0),
    0
  );
  if (transcriptScore >= 2) {
    return {
      type: "transcript",
      formattedContent: trimmed,
    };
  }

  // 4. Default: plain text
  return {
    type: "text",
    formattedContent: trimmed,
  };
}

function isUrl(text: string): boolean {
  if (text.includes("\n") || text.includes(" ")) return false;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function guessLanguage(text: string): string {
  if (/\bdef\b.*:\s*$/m.test(text) || /^import\s+\w/m.test(text) && /:\s*$/m.test(text)) return "python";
  if (/<\/?[a-z][\w-]*[\s/>]/i.test(text) && /<\//.test(text)) return "html";
  if (/\b(console\.(log|error)|=>\s*[{(]|require\()/m.test(text)) return "javascript";
  if (/\b(fn|let\s+mut|impl|pub\s+fn)\b/.test(text)) return "rust";
  if (/\b(func|package)\b/.test(text) && /\b(fmt|err)\b/.test(text)) return "go";
  if (/\b(public\s+class|System\.out|void\s+main)\b/.test(text)) return "java";
  if (/\b(SELECT|INSERT|FROM|WHERE|JOIN)\b/i.test(text)) return "sql";
  return "";
}
