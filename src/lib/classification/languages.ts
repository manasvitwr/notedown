import type { PreparedContent } from "./content";
import type { ClassificationSignal, CodeLanguage } from "./types";

/**
 * Layer 2b — deterministic language recognizers.
 *
 * For formats where structural validation beats a generic detector, a real
 * parser or a strict shape check is far more reliable than a relevance score:
 * if `JSON.parse` succeeds it *is* JSON. These recognizers therefore produce the
 * `syntax` evidence family and can also short-circuit the pipeline as proof.
 *
 * Every recognizer demands *combinations* of signals. A single keyword never
 * identifies a language, which is what keeps prose out.
 */

export interface LanguageScore {
  language: CodeLanguage;
  /** 0..1 certainty that the content, given it is code, is this language. */
  score: number;
  /** True when a parser proved it (currently only JSON). */
  deterministic: boolean;
  signals: ClassificationSignal[];
  detail: string;
}

const signal = (
  kind: string,
  detail: string,
  score: number
): ClassificationSignal => ({ layer: 2, kind, group: "syntax", score, detail });

const count = (re: RegExp, text: string): number => (text.match(re) ?? []).length;

const cap = (value: number, max: number): number =>
  Math.max(0, Math.min(max, value));

// ─── JSON ──────────────────────────────────────────────────────

/** `JSON.parse` is the only real proof available; a failure means "not JSON". */
function detectJson(prepared: PreparedContent): LanguageScore | null {
  const text = prepared.text;
  if (!/^[[{]/.test(text) || !/[\]}]$/.test(text)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  // A bare number/string is a value, not a JSON document.
  if (typeof parsed !== "object" || parsed === null) return null;
  return {
    language: "json",
    score: 0.99,
    deterministic: true,
    signals: [signal("json.parse-ok", "JSON.parse succeeded", 0.99)],
    detail: "valid JSON",
  };
}

// ─── YAML ──────────────────────────────────────────────────────

const YAML_KEY_RE = /^[ \t]*(?:-[ \t]+)?(?:"[^"]*"|'[^']*'|[\w.\-$/]+)[ \t]*:(?=[ \t]|$)/;
const YAML_LIST_RE = /^[ \t]*-[ \t]+(?:\S)/;
const CODE_WORD_RE =
  /\b(?:function|class|def|const|let|var|import|export|return|async|await|new)\b/;

/**
 * Shape-only YAML check — no parser dependency, and deliberately strict.
 * Requires a majority of lines to be `key: value` (or nested list items), at
 * least one real key, a low natural-language ratio, and no code keywords, so
 * "Important: this is a note" is never YAML.
 */
function detectYaml(prepared: PreparedContent): LanguageScore | null {
  const lines = prepared.lines.filter(
    (line) => !/^[ \t]*#/.test(line) && !/^\s*---\s*$/.test(line)
  );
  if (lines.length < 2) return null;
  if (CODE_WORD_RE.test(prepared.text)) return null;
  if (count(/[{};]/g, prepared.text) > 0) return null;

  const keyLines = lines.filter((line) => YAML_KEY_RE.test(line)).length;
  const listLines = lines.filter((line) => YAML_LIST_RE.test(line)).length;
  if (keyLines < 1) return null;
  const matched = keyLines + listLines;
  const ratio = matched / lines.length;
  if (ratio < 0.6) return null;

  const proseRatio = prepared.proseHits / Math.max(6, prepared.wordCount);
  if (proseRatio > 0.2) return null;

  let score = 0.55 + 0.4 * ratio;
  if (/^[ \t]+[\w.\-$]+[ \t]*:/m.test(prepared.text)) score += 0.05; // nesting
  if (/^[ \t]*-\s/m.test(prepared.text)) score += 0.05; // sequences
  return {
    language: "yaml",
    score: cap(score, 0.92),
    deterministic: false,
    signals: [
      signal(
        "yaml.shape",
        `${matched}/${lines.length} lines are key/value`,
        cap(score, 0.92)
      ),
    ],
    detail: "key/value document",
  };
}

// ─── HTML / XML ────────────────────────────────────────────────

/** JSX lives inside JavaScript, so markup there belongs to the JS recognizer. */
function hasEmbeddedJsx(prepared: PreparedContent): boolean {
  return prepared.lines.some(
    (line) =>
      /<[A-Za-z]/.test(line) &&
      /^[ \t]*(?:return|const|let|var|function|export|import|=>|class|await)/.test(
        line
      )
  );
}

/** A document skeleton, as opposed to a fragment of markup. */
const HTML_DOCUMENT_RE = /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]/i;

function detectHtml(prepared: PreparedContent): LanguageScore | null {
  const text = prepared.text;
  const openTags = text.match(/<[A-Za-z][\w:.-]*(?:\s[^<>]*)?>/g) ?? [];
  const closeTags = text.match(/<\/[A-Za-z][\w:.-]*\s*>/g) ?? [];
  const selfClosing = text.match(/<[A-Za-z][\w:.-]*[^<>]*\/>/g) ?? [];
  const all = openTags.length + closeTags.length + selfClosing.length;
  if (all < 2) return null;
  if (hasEmbeddedJsx(prepared)) return null;

  let score = 0.2;
  const reasons: string[] = ["tags"];
  if (/^<!doctype\s+html/i.test(text)) {
    score += 0.35;
    reasons.push("doctype");
  }
  if (closeTags.length > 0) {
    score += 0.25;
    reasons.push("closing tag");
  }
  if (selfClosing.length > 0) {
    score += 0.15;
    reasons.push("self-closing tag");
  }
  if (all >= 3) {
    score += 0.15;
    reasons.push(`${all} tags`);
  }
  if (/^<[A-Za-z]/.test(text)) {
    score += 0.1;
    reasons.push("document root");
  }
  score = cap(score, 0.95);
  if (score < 0.6) return null;
  return {
    language: "html",
    score,
    deterministic: false,
    signals: [signal("html.tags", reasons.join(", "), score)],
    detail: reasons.join(", "),
  };
}

// ─── CSS ───────────────────────────────────────────────────────

const CSS_DECL_RE = /[-A-Za-z]+[ \t]*:[^;{}]*[;]/g;
const CSS_SELECTOR_RE = /^(?:\s*[@.#:*a-zA-Z][^{};]*)\{/m;
/**
 * A block that opens with a declaration keyword is a code block, not a
 * stylesheet — `interface User {` otherwise looks exactly like a selector
 * followed by two declarations.
 */
const DECLARATION_KEYWORD_RE =
  /^[ \t]*(?:interface|class|enum|struct|record|namespace|trait|impl|type|function|def|export|import|const|let|var|public|private|static)\b/m;

function detectCss(prepared: PreparedContent): LanguageScore | null {
  const text = prepared.text;
  if (!/\{/.test(text) || !/\}/.test(text)) return null;
  const declarations = count(CSS_DECL_RE, text);
  if (declarations < 1) return null;
  if (CODE_WORD_RE.test(text)) return null;
  if (DECLARATION_KEYWORD_RE.test(text)) return null;
  if (/<[A-Za-z]/.test(text)) return null;

  let score = 0.3; // braces
  const reasons: string[] = ["rule block"];
  if (declarations >= 1) {
    score += 0.4;
    reasons.push(`${declarations} declaration(s)`);
  }
  if (declarations >= 3) {
    score += 0.2;
    reasons.push("declaration group");
  }
  if (CSS_SELECTOR_RE.test(text)) {
    score += 0.15;
    reasons.push("selector");
  }
  score = cap(score, 0.95);
  if (score < 0.6) return null;
  return {
    language: "css",
    score,
    deterministic: false,
    signals: [signal("css.declarations", reasons.join(", "), score)],
    detail: reasons.join(", "),
  };
}

// ─── SQL ───────────────────────────────────────────────────────

interface SqlGrammar {
  kind: string;
  re: RegExp;
  weight: number;
  primary: boolean;
}

const SQL_GRAMMARS: SqlGrammar[] = [
  { kind: "sql.select-from", re: /\bSELECT\b[\s\S]{1,4000}?\bFROM\b/i, weight: 0.55, primary: true },
  { kind: "sql.insert-into", re: /\bINSERT\s+INTO\b/i, weight: 0.6, primary: true },
  { kind: "sql.update-set", re: /\bUPDATE\s+[\w."`]+\s+SET\b/i, weight: 0.6, primary: true },
  { kind: "sql.delete-from", re: /\bDELETE\s+FROM\b/i, weight: 0.6, primary: true },
  { kind: "sql.create", re: /\bCREATE\s+(?:TABLE|INDEX|VIEW|DATABASE|SCHEMA)\b/i, weight: 0.6, primary: true },
  { kind: "sql.alter", re: /\bALTER\s+TABLE\b/i, weight: 0.6, primary: true },
  { kind: "sql.join-on", re: /\bJOIN\b[\s\S]{1,800}?\bON\b/i, weight: 0.4, primary: false },
  { kind: "sql.qualified-join", re: /\b(?:LEFT|RIGHT|INNER|OUTER|FULL|CROSS)\s+JOIN\b/i, weight: 0.3, primary: false },
  { kind: "sql.group-by", re: /\bGROUP\s+BY\b/i, weight: 0.3, primary: false },
  { kind: "sql.order-limit", re: /\bORDER\s+BY\b[\s\S]{0,400}?\bLIMIT\b/i, weight: 0.3, primary: false },
  { kind: "sql.where", re: /\bWHERE\b\s+[\w."`]+[\s]*(?:=|>|<|>=|<=|<>|LIKE\b|IN\s*\()/i, weight: 0.3, primary: false },
  { kind: "sql.aggregate", re: /\b(?:COUNT|SUM|AVG|MIN|MAX|GROUP_CONCAT)\s*\(\s*(?:DISTINCT\s+)?[*\w."`]/i, weight: 0.3, primary: false },
];

/** Clause *combinations* only — a single "select" is not SQL. */
function detectSql(prepared: PreparedContent): LanguageScore | null {
  const text = prepared.text;
  const matched = SQL_GRAMMARS.filter((grammar) => grammar.re.test(text));
  if (matched.length === 0) return null;
  const primaries = matched.filter((grammar) => grammar.primary);
  if (primaries.length === 0 && matched.length < 3) return null;

  let score = matched.reduce((sum, grammar) => sum + grammar.weight, 0);
  if (primaries.length > 1) score += 0.1;
  score = cap(score, 0.95);
  return {
    language: "sql",
    score,
    deterministic: false,
    signals: matched.map((grammar) =>
      signal(grammar.kind, grammar.re.source.slice(0, 40), grammar.weight)
    ),
    detail: matched.map((grammar) => grammar.kind).join(", "),
  };
}

// ─── Shell ─────────────────────────────────────────────────────

const SHELL_COMMANDS = [
  "sudo", "npm", "pnpm", "yarn", "bun", "git", "curl", "wget", "cd", "echo",
  "export", "set", "source", "mkdir", "chmod", "make", "docker", "kubectl",
  "pip", "pip3", "python", "python3", "node", "bash", "sh", "apt", "brew",
  "npx", "tsc", "eslint", "pytest", "systemctl", "ssh", "scp", "rsync", "tar",
];

const SHELL_COMMAND_RE = new RegExp(
  `^[ \\t]*(?:${SHELL_COMMANDS.join("|")})\\b`,
  "gm"
);

function detectBash(prepared: PreparedContent): LanguageScore | null {
  const text = prepared.text;
  const signals: ClassificationSignal[] = [];
  let score = 0;
  const reasons: string[] = [];

  if (/^#!.*\b(?:ba|z|k|d)?sh\b/m.test(text)) {
    score += 0.6;
    reasons.push("shebang");
    signals.push(signal("bash.shebang", "shell shebang", 0.6));
  }
  const commands = count(SHELL_COMMAND_RE, text);
  if (commands >= 2) {
    const weight = cap(0.15 * commands, 0.45);
    score += weight;
    reasons.push(`${commands} command lines`);
    signals.push(
      signal("bash.commands", `${commands} shell commands`, weight)
    );
  }
  if (/\|[ \t]*[a-z$_-]+|&&[ \t]*\S|\|\|[ \t]*\S|>>?[ \t]*\S/.test(text)) {
    score += 0.2;
    reasons.push("pipe or redirection");
    signals.push(signal("bash.pipeline", "pipe or redirection", 0.2));
  }
  if (/^[ \t]*(?:export|set|local)\s+[A-Za-z_]\w*=/m.test(text)) {
    score += 0.2;
    reasons.push("variable assignment");
    signals.push(signal("bash.env", "variable assignment", 0.2));
  }
  if (/^[ \t]*(?:if|for|while)\b[^\n]*;[ \t]*then\b/m.test(text)) {
    score += 0.3;
    reasons.push("shell control flow");
    signals.push(signal("bash.control-flow", "shell control flow", 0.3));
  }
  if (score < 0.6) return null;
  score = cap(score, 0.95);
  return {
    language: "bash",
    score,
    deterministic: false,
    signals,
    detail: reasons.join(", "),
  };
}

// ─── JavaScript / TypeScript ───────────────────────────────────

const JS_FAMILY: Array<{ kind: string; re: RegExp; weight: number }> = [
  { kind: "js.declaration", re: /^[ \t]*(?:const|let|var)\s+[\w${}[\]]/m, weight: 0.4 },
  { kind: "js.function", re: /\bfunction\s+[A-Za-z_$][\w$]*\s*[(<]|=>/, weight: 0.4 },
  { kind: "js.class", re: /\bclass\s+[A-Za-z_$][\w$]*\s*(?:extends\s+[\w$]+\s*)?{/, weight: 0.4 },
  { kind: "js.module", re: /^[ \t]*(?:import|export)\s|require\s*\(/m, weight: 0.4 },
  { kind: "js.runtime", re: /\bconsole\.(?:log|error|warn|info)\s*\(|\bnew\s+[A-Z]\w*\s*\(|\b(?:async|await|Promise)\b/, weight: 0.25 },
  { kind: "js.method-chain", re: /\.\w+\([^()]*\)/, weight: 0.2 },
  { kind: "js.comparison", re: /[!=]==?|[<>]=|\+\+|--(?!\d)/, weight: 0.2 },
  { kind: "js.template", re: /`[^`\n]{1,200}`|\$\{[^}]+\}/, weight: 0.2 },
  { kind: "js.jsx", re: /<[A-Z][\w$]*(?:\s[^<>]*)?\/?>|<\/[A-Z][\w$]*\s*>/, weight: 0.4 },
  { kind: "js.promise", re: /\.then\s*\(|\.catch\s*\(|\bawait\s+[\w$[(]/, weight: 0.2 },
];

const TS_ONLY: Array<{ kind: string; re: RegExp; weight: number }> = [
  { kind: "ts.interface", re: /\b(?:interface|enum|namespace)\s+[A-Za-z_$][\w$]*|\btype\s+[A-Za-z_$][\w$]*\s*(?:<[^>]*>)?\s*=/, weight: 0.5 },
  { kind: "ts.typed-signature", re: /[(,]\s*\w+\s*:\s*[A-Za-z_$][\w$<>[\]|. ]*[,)=]|\)\s*:\s*[A-Za-z_$][\w$<>[\]|. ]*[{;]/, weight: 0.5 },
  { kind: "ts.typed-variable", re: /^[ \t]*(?:const|let|var)\s+[\w$]+\s*:\s*[A-Za-z_$][\w$<>[\]|.]*\s*=/m, weight: 0.5 },
  { kind: "ts.generic", re: /\b(?:function|class|interface|type)\s+[A-Za-z_$][\w$]*\s*<[A-Z][\w$]*(?:\s*,\s*[A-Z][\w$]*)*>/, weight: 0.4 },
  { kind: "ts.assertion", re: /\bas\s+(?:const|unknown|never|[A-Z]\w*)\b|\bimplements\s+[\w$]+|\bdeclare\s+(?:module|const|function)\b/, weight: 0.4 },
  { kind: "ts.modifiers", re: /\b(?:public|private|protected|readonly|abstract)\s+(?:readonly\s+)?[A-Za-z_$][\w$]*\s*[;(:=]/, weight: 0.4 },
  { kind: "ts.non-null", re: /[A-Za-z_$)\]]!(?=\s*[.[(;?])/, weight: 0.3 },
];

function strength(
  rules: Array<{ kind: string; re: RegExp; weight: number }>,
  text: string
): number {
  return cap(
    rules.filter((rule) => rule.re.test(text)).reduce((sum, rule) => sum + rule.weight, 0),
    1
  );
}

/** Type-only declarations that exist in no other language. */
const TS_DECLARATION_RE =
  /\b(?:interface|enum)\s+[A-Za-z_$][\w$]*|\btype\s+[A-Za-z_$][\w$]*\s*(?:<[^>]*>)?\s*=|\bdeclare\s+(?:module|namespace|global)\b/;

/**
 * JavaScript and TypeScript are scored together and then split by how much
 * TypeScript-only evidence there is:
 *
 * - no TS-only markers  → confident JavaScript
 * - a TypeScript-only *declaration* (interface, type alias, enum) → certain
 *   TypeScript, whatever the surrounding JavaScript looks like
 * - exactly one weak TS-only marker → the two scores land within the ambiguity
 *   margin, so the classifier reports "code" and refuses to name a language
 */
function detectJsTs(prepared: PreparedContent): LanguageScore[] {
  const text = prepared.text;
  const family = strength(JS_FAMILY, text);
  const tsStrength = strength(TS_ONLY, text);
  if (family === 0 && tsStrength === 0) return [];

  const jsScore = cap(family * (1 - 0.5 * tsStrength), 0.95);
  // Full-strength TS-only markers, and TS-only declarations, are unique to
  // TypeScript — so they are proof even when the JS-family evidence is thin.
  const tsCertain = tsStrength >= 1 || TS_DECLARATION_RE.test(text);
  const tsScore = cap(
    Math.max(tsCertain ? 0.9 : 0, family * 0.4 + tsStrength * 0.55),
    0.95
  );

  const results: LanguageScore[] = [];
  if (jsScore > 0) {
    results.push({
      language: "javascript",
      score: jsScore,
      deterministic: false,
      signals: JS_FAMILY.filter((rule) => rule.re.test(text)).map((rule) =>
        signal(rule.kind, rule.kind, rule.weight)
      ),
      detail: `js/ts family ${family.toFixed(2)}, ts-only ${tsStrength.toFixed(2)}`,
    });
  }
  if (tsScore > 0) {
    results.push({
      language: "typescript",
      score: tsScore,
      deterministic: false,
      signals: TS_ONLY.filter((rule) => rule.re.test(text)).map((rule) =>
        signal(rule.kind, rule.kind, rule.weight)
      ),
      detail: `ts-only ${tsStrength.toFixed(2)}`,
    });
  }
  return results;
}

// ─── Python ────────────────────────────────────────────────────

const PYTHON: Array<{ kind: string; re: RegExp; weight: number }> = [
  { kind: "py.def", re: /^[ \t]*def\s+\w+\s*\([^\n]*\)\s*(?:->[^\n:]+)?:/m, weight: 0.55 },
  { kind: "py.class", re: /^[ \t]*class\s+\w+\s*(?:\([^\n)]*\))?\s*:/m, weight: 0.5 },
  { kind: "py.import", re: /^[ \t]*(?:import\s+[\w.]+|from\s+[\w.]+\s+import\s+)/m, weight: 0.45 },
  { kind: "py.main", re: /if\s+__name__\s*==\s*["']__main__["']\s*:/, weight: 0.4 },
  { kind: "py.suite", re: /:[ \t]*(?:\n|$)[ \t]+\S/m, weight: 0.3 },
  { kind: "py.print", re: /\bprint\s*\(|\bself\.[\w$]+\s*(?:=|\+)/, weight: 0.3 },
  { kind: "py.decorator", re: /^[ \t]*@[\w.]+(?:\([^\n]*\))?[ \t]*$/m, weight: 0.3 },
  { kind: "py.keyword", re: /\b(?:elif|except|None|True|False|lambda|yield|nonlocal|pass|with\s+open)\b/, weight: 0.25 },
  { kind: "py.fstring", re: /\bf["']\{[^}]+\}[^"']*["']/, weight: 0.3 },
  { kind: "py.slice", re: /\w+\[[^\]\n]*:[^\]\n]*\]/, weight: 0.25 },
];

function detectPython(prepared: PreparedContent): LanguageScore[] {
  const text = prepared.text;
  const matched = PYTHON.filter((rule) => rule.re.test(text));
  if (matched.length === 0) return [];
  const strong = matched.some((rule) =>
    ["py.def", "py.class", "py.main", "py.import"].includes(rule.kind)
  );
  if (!strong && matched.length < 2) return [];
  const score = cap(
    matched.reduce((sum, rule) => sum + rule.weight, 0),
    0.95
  );
  if (score < 0.5) return [];
  return [
    {
      language: "python",
      score,
      deterministic: false,
      signals: matched.map((rule) => signal(rule.kind, rule.kind, rule.weight)),
      detail: matched.map((rule) => rule.kind).join(", "),
    },
  ];
}

// ─── Orchestration ─────────────────────────────────────────────

type Recognizer = (prepared: PreparedContent) => LanguageScore[];

const one = (recognizer: (p: PreparedContent) => LanguageScore | null): Recognizer =>
  (prepared) => {
    const result = recognizer(prepared);
    return result ? [result] : [];
  };

const RECOGNIZERS: Recognizer[] = [
  one(detectJson),
  one(detectYaml),
  one(detectHtml),
  one(detectCss),
  one(detectSql),
  one(detectBash),
  detectJsTs,
  detectPython,
];

/**
 * Run every recognizer and return the candidates sorted by score, strongest
 * first. Cross-language suppression (markup inside JavaScript) is applied here
 * so the caller sees a clean, conflict-free ranking.
 */
export function scoreLanguages(prepared: PreparedContent): LanguageScore[] {
  const results = RECOGNIZERS.flatMap((recognizer) => recognizer(prepared));

  // A proven format wins outright; no other recognizer may vote.
  const proven = results.find((result) => result.deterministic);
  if (proven) return [proven];

  const js = results.find((result) => result.language === "javascript");
  const html = results.find((result) => result.language === "html");
  if (html && js && js.score >= 0.5) {
    // Markup inside JavaScript is JSX, not an HTML document.
    if (!HTML_DOCUMENT_RE.test(prepared.text)) {
      return results.filter((result) => result.language !== "html");
    }
  }

  if (html && html.score >= 0.8) {
    // A whole HTML document owns every other language it contains: the
    // JavaScript and CSS inside it are embedded, not the document's language.
    return [html];
  }

  return results
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score);
}
