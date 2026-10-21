import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  p: ({ children }) => <p className="text-[16px]/[26px] text-[var(--ink)]">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-[var(--ink)]">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--accent-strong)] underline decoration-[var(--line)] underline-offset-[3px] transition-colors duration-200 ease-enter hover:decoration-[var(--accent)]"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => <h3 className="font-display text-[22px] font-semibold text-[var(--ink)]">{children}</h3>,
  h2: ({ children }) => <h3 className="font-display text-[19px] font-semibold text-[var(--ink)]">{children}</h3>,
  h3: ({ children }) => <h4 className="font-display text-[17px] font-semibold text-[var(--ink)]">{children}</h4>,
  h4: ({ children }) => <h4 className="font-display text-[15px] font-semibold text-[var(--ink)]">{children}</h4>,
  ul: ({ children }) => <ul className="flex list-disc flex-col gap-[4px] pl-[22px] text-[16px]/[26px] text-[var(--ink)] marker:text-[var(--muted)]">{children}</ul>,
  ol: ({ children }) => <ol className="flex list-decimal flex-col gap-[4px] pl-[22px] text-[16px]/[26px] text-[var(--ink)] marker:text-[var(--muted)]">{children}</ol>,
  li: ({ children }) => <li className="pl-[2px]">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="flex flex-col gap-[4px] border-l-[2px] border-[var(--line)] pl-[14px] text-[15px]/[24px] text-[var(--muted)] italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="h-[1px] w-full border-0 bg-[var(--hairline)]" />,
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className || "");
    if (isBlock) return <code className={className}>{children}</code>;
    return (
      <code className="font-code rounded-[4px] bg-[var(--soft)] p-[2px_6px] text-[0.9em] text-[var(--accent-strong)]">{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="theme-dark font-code max-w-full overflow-x-auto rounded-[10px] bg-[var(--surface)] p-[12px_14px] text-[13px]/[20px] text-[var(--ink)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="w-full max-w-full overflow-x-auto rounded-[10px] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
      <table className="w-full min-w-[420px] border-collapse text-[13px]/[20px] text-[var(--ink)]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[var(--soft)]">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-[var(--hairline)] p-[8px_12px] text-left text-[12px] font-semibold whitespace-nowrap text-[var(--ink)]">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b border-[var(--hairline)] p-[8px_12px] align-top">{children}</td>,
  tr: ({ children }) => <tr className="transition-colors duration-150 ease-enter even:bg-[var(--canvas)]">{children}</tr>,
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="flex w-full max-w-[720px] shrink-0 flex-col items-start gap-[12px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
