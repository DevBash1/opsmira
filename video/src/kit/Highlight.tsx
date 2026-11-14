import type { ReactNode } from "react";

/* A compact shell highlighter using the product's --tok-* colours (same categories as src/lib/highlight.tsx). */

const KEYWORDS = new Set(["if", "then", "else", "fi", "for", "while", "do", "done", "in", "export", "set"]);
const WRAPPERS = new Set(["sudo", "time", "nohup", "xargs", "exec", "watch", "env", "nice"]);
const COLOR: Record<string, string> = {
  comment: "var(--tok-comment)",
  string: "var(--tok-string)",
  keyword: "var(--tok-keyword)",
  command: "var(--tok-command)",
  flag: "var(--tok-flag)",
  variable: "var(--tok-variable)",
  number: "var(--tok-number)",
  operator: "var(--tok-operator)",
  path: "var(--tok-path)",
};

type Tok = { text: string; kind?: string };

export function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let commandNext = true;
  let plain = "";
  const flush = () => {
    if (plain) out.push({ text: plain });
    plain = "";
  };
  const push = (text: string, kind?: string) => {
    flush();
    out.push({ text, kind });
  };
  while (i < line.length) {
    const ch = line[i];
    const prev = i === 0 ? " " : line[i - 1];
    const rest = line.slice(i);
    let m: RegExpMatchArray | null;
    if (ch === "#" && /\s/.test(prev)) {
      push(rest, "comment");
      break;
    }
    if (ch === '"' || ch === "'") {
      m = rest.match(ch === '"' ? /^"(?:\\.|[^"\\])*"?/ : /^'[^']*'?/);
      const t = m ? m[0] : ch;
      push(t, "string");
      i += t.length;
      commandNext = false;
      continue;
    }
    if (ch === "$" && (m = rest.match(/^\$(\{[^}]*\}?|\(|[A-Za-z_][A-Za-z0-9_]*|[0-9?@#!$*])/))) {
      push(m[0], "variable");
      i += m[0].length;
      continue;
    }
    if ((m = rest.match(/^(\|\||&&|>>|2>&1|2>|\||>|<|;|&|\\)/))) {
      push(m[0], "operator");
      i += m[0].length;
      if (/^(\|\||&&|\||;)$/.test(m[0])) commandNext = true;
      continue;
    }
    if (ch === "-" && /\s/.test(prev) && (m = rest.match(/^--?[A-Za-z][\w-]*/))) {
      push(m[0], "flag");
      i += m[0].length;
      continue;
    }
    if (/[0-9]/.test(ch) && !/[\w.]/.test(prev) && (m = rest.match(/^\d+(\.\d+)*[A-Za-z%]*/))) {
      push(m[0], "number");
      i += m[0].length;
      commandNext = false;
      continue;
    }
    if ((m = rest.match(/^[A-Za-z0-9_./~:@%+=,*-]+/))) {
      const w = m[0];
      let kind: string | undefined;
      if (KEYWORDS.has(w)) kind = "keyword";
      else if (commandNext) {
        kind = "command";
        commandNext = WRAPPERS.has(w);
      } else if (/^(~|\.{0,2}\/)/.test(w)) kind = "path";
      else if (/^[a-z]+:\/\//.test(w)) kind = "path";
      push(w, kind);
      i += w.length;
      continue;
    }
    plain += ch;
    i++;
  }
  flush();
  return out;
}

export function Highlighted({ text, plain = false }: { text: string; plain?: boolean }): ReactNode {
  if (plain) return text;
  return tokenize(text).map((t, i) => (
    <span key={i} style={t.kind ? { color: COLOR[t.kind], fontWeight: t.kind === "command" ? 500 : undefined, fontStyle: t.kind === "comment" ? "italic" : undefined } : undefined}>
      {t.text}
    </span>
  ));
}

/**
 * A command being typed. The characters still to come are laid out invisibly, so the line breaks are decided by
 * the whole command from the first frame and the text never reflows while it types. The caret takes no width.
 */
export function TypedCode({ full, count, caretOn = true, caretColor = "var(--ink)", caretW = 13, caretH = "1.08em" }: { full: string; count: number; caretOn?: boolean; caretColor?: string; caretW?: number; caretH?: string }): ReactNode {
  return (
    <>
      <Highlighted text={full.slice(0, count)} />
      <span style={{ display: "inline-block", width: caretW, height: caretH, marginLeft: 2, marginRight: -caretW, verticalAlign: "text-bottom", background: caretOn ? caretColor : "transparent" }} />
      <span style={{ opacity: 0 }}>
        <Highlighted text={full.slice(count)} />
      </span>
    </>
  );
}
