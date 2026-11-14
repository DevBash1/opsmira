import type { CSSProperties } from "react";
import { ICON_DATA, type IconName } from "./icons.generated";

export type { IconName };

/** The product's icon set (lucide geometry), same 14x14 box and rendering as src/components/Icons.tsx. */
export function Icon({ name, size = 14, style, className }: { name: IconName; size?: number; style?: CSSProperties; className?: string }) {
  const data = ICON_DATA[name];
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      style={{ flexShrink: 0, display: "block", ...style }}
      className={className}
      aria-hidden="true"
    >
      {data.stroke ? (
        <g transform="scale(0.5833)" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {data.d.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      ) : (
        data.d.map((d, i) => <path key={i} d={d} fill="currentColor" />)
      )}
    </svg>
  );
}
