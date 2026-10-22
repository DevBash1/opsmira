import type { ReactNode } from "react";

// A small, dependency-free highlighter for the code the console shows: shell commands first, and enough
// of JSON, YAML, config files and JavaScript to read them. It works one line at a time and never throws.

export type Language = "shell" | "json" | "yaml" | "js" | "text";

const SHELL_KEYWORDS = new Set(["if", "then", "else", "elif", "fi", "for", "while", "until", "do", "done", "case", "esac", "in", "function", "select", "export", "local", "return", "exit", "set", "unset", "source"]);
const JS_KEYWORDS = new Set(["const", "let", "var", "function", "return", "if", "else", "for", "while", "import", "from", "export", "default", "new", "class", "async", "await", "try", "catch", "throw", "typeof", "of", "in"]);
const LITERALS = new Set(["true", "false", "null", "undefined", "yes", "no", "on", "off"]);
// Words after which the next word is a command too: `sudo systemctl ...`, `time cmd`, `xargs cmd`.
const WRAPPERS = new Set(["sudo", "time", "nohup", "xargs", "exec", "watch", "env", "nice", "doas"]);

const CLASS: Record<string, string> = {
  comment: "text-[var(--tok-comment)] italic",
  string: "text-[var(--tok-string)]",
  keyword: "text-[var(--tok-keyword)]",
  command: "text-[var(--tok-command)] font-medium",
  flag: "text-[var(--tok-flag)]",
  variable: "text-[var(--tok-variable)]",
  number: "text-[var(--tok-number)]",
  key: "text-[var(--tok-key)]",
  operator: "text-[var(--tok-operator)]",
  path: "text-[var(--tok-path)]",
  literal: "text-[var(--tok-number)]",
};

/** Names a language from a fence label or a file name; undefined when it says nothing. */
export function languageFrom(label?: string): Language | undefined {
  const l = (label ?? "").toLowerCase().trim();
  if (!l) return undefined;
  if (/(^|[\s.])(sh|bash|zsh|shell|console|terminal|sudo)$|^\$/.test(l) || /\.(sh|bash)$/.test(l)) return "shell";
  if (/json/.test(l)) return "json";
  if (/(^|[\s.])(ya?ml)$|yaml|\.conf$|\.ini$|\.toml$|\.env$|nginx|caddy|systemd|\.service$/.test(l)) return "yaml";
  if (/(^|[\s.])(js|ts|jsx|tsx|javascript|typescript|mjs|node)$/.test(l)) return "js";
  if (/^(text|txt|plain|log|output)$/.test(l)) return "text";
  return undefined;
}

/** Guesses when nothing was said: JSON by its brackets, YAML by `key: value` lines, otherwise shell. */
export function guessLanguage(lines: string[], label?: string): Language {
  const named = languageFrom(label);
  if (named) return named;
  const text = lines.join("\n").trim();
  if (/^[[{]/.test(text) && /[\]}]$/.test(text)) return "json";
  const nonEmpty = lines.filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (nonEmpty.length > 1 && nonEmpty.every((l) => /^\s*(-\s+)?[\w."'/-]+\s*:(\s|$)/.test(l) || /^\s+-\s/.test(l))) return "yaml";
  return "shell";
}

type Token = { text: string; kind?: keyof typeof CLASS };

function tokenize(line: string, lang: Language): Token[] {
  if (lang === "text") return [{ text: line }];
  const out: Token[] = [];
  const hashComments = lang !== "js" && lang !== "json";
  let i = 0;
  let commandNext = lang === "shell";
  let plain = "";
  const flush = () => {
    if (plain) out.push({ text: plain });
    plain = "";
  };
  const push = (text: string, kind?: keyof typeof CLASS) => {
    flush();
    out.push({ text, kind });
  };
  const rest = () => line.slice(i);
  while (i < line.length) {
    const ch = line[i];
    const prev = i === 0 ? " " : line[i - 1];
    let m: RegExpMatchArray | null;
    // Comments
    if (hashComments && ch === "#" && /\s/.test(prev)) {
      push(rest(), "comment");
      break;
    }
    if (!hashComments && rest().startsWith("//") && (i === 0 || /[\s,;{[]/.test(prev))) {
      push(rest(), "comment");
      break;
    }
    // Strings (an unclosed one runs to the end of the line)
    if (ch === '"' || ch === "'" || (lang === "js" && ch === "`")) {
      const re = ch === '"' ? /^"(?:\\.|[^"\\])*"?/ : ch === "'" ? /^'[^']*'?/ : /^`(?:\\.|[^`\\])*`?/;
      m = rest().match(re);
      const text = m ? m[0] : ch;
      const after = line.slice(i + text.length);
      const isKey = (lang === "json" || lang === "yaml") && /^\s*:(\s|$)/.test(after);
      push(text, isKey ? "key" : "string");
      i += text.length;
      commandNext = false;
      continue;
    }
    // Variables
    if (ch === "$" && (m = rest().match(/^\$(\{[^}]*\}?|\(|[A-Za-z_][A-Za-z0-9_]*|[0-9?@#!$*])/))) {
      push(m[0], "variable");
      i += m[0].length;
      continue;
    }
    // Operators; the word after a pipe, `&&` or `;` is a command again
    if ((m = rest().match(/^(\|\||&&|>>|2>&1|2>|\||>|<|;|&)/))) {
      push(m[0], "operator");
      i += m[0].length;
      if (lang === "shell" && /^(\|\||&&|\||;)$/.test(m[0])) commandNext = true;
      continue;
    }
    // Flags: --long, -s, --opt=value
    if (lang === "shell" && ch === "-" && /\s/.test(prev) && (m = rest().match(/^--?[A-Za-z][\w-]*/))) {
      push(m[0], "flag");
      i += m[0].length;
      continue;
    }
    // Numbers (not the middle of a word)
    if (/[0-9]/.test(ch) && !/[\w.]/.test(prev) && (m = rest().match(/^\d+(\.\d+)*[A-Za-z%]*/))) {
      push(m[0], "number");
      i += m[0].length;
      commandNext = false;
      continue;
    }
    // YAML / config keys at the start of a line: `name:` or `- name:`
    if (lang === "yaml" && out.every((t) => !t.kind && !t.text.trim().replace(/-/g, "")) && !plain.trim().replace(/-/g, "") && (m = rest().match(/^[\w.\-/@]+(?=\s*[:=](\s|$))/))) {
      push(m[0], "key");
      i += m[0].length;
      continue;
    }
    // Words
    if ((m = rest().match(/^[A-Za-z_~./][\w@%+:=,./~-]*/))) {
      const word = m[0];
      let kind: keyof typeof CLASS | undefined;
      if (lang === "shell" && SHELL_KEYWORDS.has(word)) kind = "keyword";
      else if (lang === "js" && JS_KEYWORDS.has(word)) kind = "keyword";
      else if (LITERALS.has(word.toLowerCase()) && lang !== "shell") kind = "literal";
      else if (lang === "shell" && commandNext) kind = "command";
      else if (/^(\/|\.{1,2}\/|~\/?)/.test(word) && /[\w]/.test(word)) kind = "path";
      push(word, kind);
      i += word.length;
      if (lang === "shell") commandNext = kind === "keyword" || (kind === "command" && WRAPPERS.has(word));
      continue;
    }
    plain += ch;
    i++;
  }
  flush();
  return out;
}

/** One line of code as highlighted spans. */
export function highlightLine(text: string, lang: Language): ReactNode {
  const tokens = tokenize(text, lang);
  if (!tokens.length) return text;
  return tokens.map((t, i) => (t.kind ? <span key={i} className={CLASS[t.kind]}>{t.text}</span> : t.text));
}
