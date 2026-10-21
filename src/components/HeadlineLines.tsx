/** Headline whose lines each rise out of their own mask, one after another. */
export function HeadlineLines({ lines, base = 80, step = 110 }: { lines: string[]; base?: number; step?: number }) {
  return (
    <>
      {lines.map((line, i) => (
        <span key={line} className="-mt-[0.14em] -mb-[0.2em] block overflow-hidden pt-[0.14em] pb-[0.2em]">
          <span className="block motion-safe:animate-line-up" style={{ animationDelay: `${base + i * step}ms` }}>
            {line}
          </span>
        </span>
      ))}
    </>
  );
}
