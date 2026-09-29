import { CODE_CANDIDATE_THRESHOLD } from "./config";
import type { PreparedContent } from "./content";
import type { ClassificationSignal } from "./types";

/**
 * Layer 2a — the code-candidate gate.
 *
 * Generic structural evidence that content "looks like code", used to decide
 * whether it is worth running language detection at all. Every rule is a
 * *pattern over shape*, never a single keyword, and prose is actively
 * penalized — that is what keeps "importantly, this approach works" a text
 * block instead of Python.
 *
 * The score doubles as the `structural` evidence family in the confidence
 * combination, so a strong score is also what pushes `type` to `code`.
 */

/** Longest prefix scanned for the counting rules — keeps typing cheap. */
const SAMPLE_LENGTH = 6000;

interface Rule {
  kind: string;
  weight: number;
  detail: string;
  /** Matches → rule fires. */
  test: (sample: string, prepared: PreparedContent) => boolean;
}

const count = (re: RegExp, text: string): number => (text.match(re) ?? []).length;

const RULES: Rule[] = [
  {
    kind: "structure.braces",
    weight: 0.35,
    detail: "brace pair",
    test: (s) => s.includes("{") && s.includes("}"),
  },
  {
    kind: "structure.closing-brace",
    weight: 0.2,
    detail: "closing brace on its own line",
    test: (s) => /^[ \t]*\}[;,)]?[ \t]*$/m.test(s),
  },
  {
    kind: "structure.bracket-access",
    weight: 0.2,
    detail: "indexed access",
    test: (s) => /\w\[["'\d]/.test(s),
  },
  {
    kind: "structure.semicolon",
    weight: 0.2,
    detail: "statement terminators",
    test: (s) => /;[ \t]*(?:\n|$)|;[ \t]+\S/.test(s),
  },
  {
    kind: "structure.assignment",
    weight: 0.3,
    detail: "assignment at line start",
    test: (s) => /^[ \t]*[A-Za-z_$][\w$.[\]"'`]*\s*=(?![=>])/m.test(s),
  },
  {
    kind: "structure.function",
    weight: 0.4,
    detail: "function declaration",
    test: (s) => /\b(?:function|def|fn|func|sub|proc)\s+[A-Za-z_$][\w$]*\s*[([]/.test(s),
  },
  {
    kind: "structure.arrow",
    weight: 0.3,
    detail: "arrow function",
    test: (s) => s.includes("=>"),
  },
  {
    kind: "structure.class",
    weight: 0.4,
    detail: "class/interface declaration",
    test: (s) =>
      /\b(?:class|interface|struct|enum|impl|trait|namespace)\s+[A-Za-z_$][\w$]*\s*(?:[\w<>[\]]+\s*)?[{(:=]/.test(
        s
      ),
  },
  {
    kind: "structure.imports",
    weight: 0.35,
    detail: "import/export statement",
    test: (s) => /^[ \t]*(?:import|export)\s+["'[\w{(]/.test(s) || /^[ \t]*from\s+[\w.]+\s+import\b/m.test(s),
  },
  {
    kind: "structure.python-suite",
    weight: 0.4,
    detail: "python def/class suite",
    test: (s) => /^[ \t]*(?:def|class)\s+\w+[^\n]*:[ \t]*(?:#.*)?$/m.test(s),
  },
  {
    kind: "structure.comments",
    weight: 0.15,
    detail: "programmatic comment lines",
    test: (s) => count(/^[ \t]*(?:\/\/|#{1,2}?[^!]|\/\*|\*|--)[^\n]*$/gm, s) >= 2,
  },
  {
    kind: "structure.indented-block",
    weight: 0.25,
    detail: "colon followed by an indented block",
    test: (s) => /:[ \t]*(?:\n|$)[ \t]{2,}\S/.test(s),
  },
  {
    kind: "structure.key-value",
    weight: 0.25,
    detail: "repeated key/value lines",
    test: (s) => count(/^[ \t]*["']?[\w.\-$]+["']?[ \t]*:[ \t]*\S/gm, s) >= 2,
  },
  {
    kind: "structure.json-envelope",
    weight: 0.45,
    detail: "balanced JSON-style envelope",
    test: (s) => isJsonEnvelope(s),
  },
  {
    kind: "structure.markup",
    weight: 0.3,
    detail: "markup tags",
    test: (s) => count(/<\/?[A-Za-z][\w:.-]*(?:\s[^<>]*)?\/?>/g, s) >= 2,
  },
  {
    kind: "structure.css-declarations",
    weight: 0.45,
    detail: "CSS property declarations",
    test: (s) => count(/^[ \t]*[\w-]+[ \t]*:[ \t]*[^;{}]+;/m, s) >= 2,
  },
  {
    kind: "structure.sql-grammar",
    weight: 0.4,
    detail: "SQL clause combination",
    test: (s) =>
      /\bSELECT\b[\s\S]{0,400}?\bFROM\b/i.test(s) ||
      /\bINSERT\s+INTO\b/i.test(s) ||
      /\bUPDATE\s+[\w."`]+\s+SET\b/i.test(s) ||
      /\bDELETE\s+FROM\b/i.test(s) ||
      /\bCREATE\s+(?:TABLE|INDEX|VIEW|DATABASE)\b/i.test(s) ||
      /\b(?:LEFT|RIGHT|INNER|OUTER)?\s*JOIN\b[\s\S]{0,200}?\bON\b/i.test(s),
  },
  {
    kind: "structure.shell-shebang",
    weight: 0.4,
    detail: "interpreter shebang",
    test: (s) => /^#!.*\b(?:ba|z|k|d)?sh\b/m.test(s),
  },
  {
    kind: "structure.shell-commands",
    weight: 0.2,
    detail: "shell command lines",
    test: (s) =>
      count(
        /^[ \t]*(?:sudo|npm|pnpm|yarn|bun|git|curl|wget|cd|echo|export|set|source|mkdir|chmod|make|docker|kubectl|pip3?|python3?|node|bash|sh|apt|brew)\b/gm,
        s
      ) >= 2,
  },
  {
    kind: "structure.shell-prompt",
    weight: 0.3,
    detail: "interactive shell prompt",
    test: (s) => /^[ \t]*[$>]\s+\S/m.test(s),
  },
  {
    kind: "structure.pipeline",
    weight: 0.25,
    detail: "pipe or redirection",
    // The redirection target must look like a file or command name, and must
    // not be a closing tag or a comment, so neither a SQL comparison such as
    // `age > 21` nor `</p>` is mistaken for a redirect.
    test: (s) => /\|\s*[a-z$_-]+|&&\s|\|\|\s|\d?>>?\s*(?![/*])["'`a-z_./$-]/i.test(s),
  },
  {
    kind: "structure.decorators",
    weight: 0.35,
    detail: "decorator or annotation",
    test: (s) => /^[ \t]*@\w+[^\n]*$/m.test(s),
  },
  {
    kind: "structure.control-flow",
    weight: 0.3,
    detail: "control-flow statement",
    test: (s) =>
      /^[ \t]*(?:if|for|while|switch|do|try|catch|with|elif|except|foreach)\b[^\n]*[({:]/m.test(
        s
      ),
  },
  {
    kind: "structure.return",
    weight: 0.25,
    detail: "return statement",
    test: (s) => /^[ \t]*return\b[^\n]*;?/m.test(s),
  },
  {
    kind: "structure.repeated-shape",
    weight: 0.2,
    detail: "repeated statement shape",
    test: (_sample, p) => {
      if (p.lineCount < 3) return false;
      const terminators = p.lines.filter((line) => /[;,]\s*$/.test(line)).length;
      return terminators >= 3 || new Set(p.lines.map(lineShape)).size === 1;
    },
  },
  {
    kind: "structure.call-chain",
    weight: 0.25,
    detail: "method calls",
    test: (s) => count(/\b[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*\(/g, s) >= 2,
  },
  {
    kind: "structure.template-literal",
    weight: 0.2,
    detail: "template literal or interpolation",
    test: (s) => /`[^`\n]{1,200}`|\$\{[^}]+\}/.test(s),
  },
  {
    kind: "structure.docstring",
    weight: 0.3,
    detail: "triple-quoted block",
    test: (s) => /("""|''')[\s\S]{1,2000}?\1/.test(s),
  },
  {
    kind: "structure.print",
    weight: 0.3,
    detail: "print/log call",
    test: (s) => /\b(?:console\.(?:log|error|warn|info)|print|fmt\.Print|System\.out\.print)\s*\(/.test(s),
  },
  {
    kind: "structure.lambda",
    weight: 0.3,
    detail: "python lambda",
    test: (s) => /^[ \t]*lambda\s+\w+\s*[:,]?/m.test(s),
  },
  {
    kind: "structure.self-reference",
    weight: 0.3,
    detail: "python self reference",
    test: (s) => /\bself\.[\w$]+\s*(?:=|\+|\.)/.test(s),
  },
  {
    kind: "structure.generics",
    weight: 0.3,
    detail: "generic type parameters",
    test: (s) => /<[A-Z]\w*(?:\s*,\s*[A-Z]\w*)*>(?=\s*[({\w])|\b[A-Za-z_$][\w$]*<[A-Z]\w*[\s,>]/.test(s),
  },
  {
    kind: "structure.type-annotation",
    weight: 0.3,
    detail: "typed parameter or return",
    test: (s) => /[(,]\s*\w+\s*:\s*[A-Za-z_$][\w$<>[\]|. ]*[),=]|\)\s*:\s*[A-Za-z_$][\w$<>[\]|. ]*[{;]/.test(s),
  },
  {
    kind: "structure.require",
    weight: 0.3,
    detail: "module require",
    test: (s) => /\brequire\s*\(|^[ \t]*(?:const|let|var)\s+[\w${}\s,:]+=\s*require\(/m.test(s),
  },
  {
    kind: "structure.env-assign",
    weight: 0.3,
    detail: "environment variable assignment",
    test: (s) => /^[ \t]*(?:export|set|local)\s+[A-Za-z_]\w*=/m.test(s),
  },
  {
    kind: "structure.dict-literal",
    weight: 0.25,
    detail: "dict/record literal",
    test: (s) => /[{[(]\s*["']?[\w.]+["']?\s*:\s*[^:,}\])]+[,}]/.test(s),
  },
];

export interface StructureAnalysis {
  /** 0..1 structural code-likeness after prose penalties. */
  score: number;
  /** True when it is worth running language detection. */
  isCandidate: boolean;
  signals: ClassificationSignal[];
}

/** High-precision rules: their presence makes content code, not prose. */
const STRONG_RULES = new Set([
  "structure.braces",
  "structure.json-envelope",
  "structure.function",
  "structure.class",
  "structure.python-suite",
  "structure.sql-grammar",
  "structure.css-declarations",
  "structure.markup",
  "structure.imports",
  "structure.shell-shebang",
  "structure.shell-commands",
]);

function isJsonEnvelope(text: string): boolean {
  const trimmed = text.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (!first || !last) return false;
  const pairs: Record<string, string> = { "{": "}", "[": "]" };
  if (!pairs[first]) return false;
  let depth = 0;
  let inString = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === first) depth += 1;
    else if (ch === pairs[first]) {
      depth -= 1;
      if (depth === 0) return i === trimmed.length - 1;
    }
  }
  return false;
}

/** Reduce a line to a coarse shape so repeated structures can be spotted. */
function lineShape(line: string): string {
  return line
    .trim()
    .replace(/[A-Za-z_$][\w$]*/g, "w")
    .replace(/\d+/g, "n")
    .replace(/["'][^"']*["']/g, "s");
}

/**
 * Natural-language penalty.
 *
 * Prose is penalized, not merely left alone — an English-looking capture with a
 * stray brace must not pass the gate. The penalty is damped when a
 * high-precision rule fired, because in code the English-looking words are
 * identifiers and keywords (`FROM`, `name`, `by`) rather than a sentence.
 */
function prosePenalty(prepared: PreparedContent, strong: boolean): number {
  const ratio = prepared.proseHits / Math.max(6, prepared.wordCount);
  let penalty = ratio > 0.3 ? 0.4 : ratio > 0.18 ? 0.25 : ratio > 0.1 ? 0.12 : 0;
  const sentences = count(/[.!?]["')\]]?\s+[A-Z"'(]/g, prepared.textNoUrls);
  if (!strong) {
    if (sentences >= 2) penalty += 0.25;
    else if (sentences >= 1) penalty += 0.1;
  }
  if (sentences >= 4) penalty += 0.15;
  if (strong) penalty *= 0.35;
  return penalty;
}

/**
 * Score structural code-likeness. Multi-line prose is penalized rather than
 * ignored, and the penalty is what makes short keyword-bearing sentences fall
 * back to `text`.
 */
export function analyzeStructure(prepared: PreparedContent): StructureAnalysis {
  const sample = prepared.textNoUrls.slice(0, SAMPLE_LENGTH);
  const signals: ClassificationSignal[] = [];
  let total = 0;

  for (const rule of RULES) {
    if (!rule.test(sample, prepared)) continue;
    total += rule.weight;
    signals.push({
      layer: 2,
      kind: rule.kind,
      group: "structural",
      score: rule.weight,
      detail: rule.detail,
    });
  }

  const strong = signals.some((signal) => STRONG_RULES.has(signal.kind));
  const penalty = prosePenalty(prepared, strong);
  if (penalty > 0) {
    signals.push({
      layer: 2,
      kind: "prose.penalty",
      group: "structural",
      score: -penalty,
      detail: "natural-language content",
    });
  }

  const score = Math.max(0, Math.min(1, total - penalty));
  return {
    score,
    isCandidate: score >= CODE_CANDIDATE_THRESHOLD,
    signals,
  };
}
