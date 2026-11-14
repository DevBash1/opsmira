import { FONT_CODE } from "./fonts";
import { Tag } from "./chips";
import { E, ramp } from "./motion";
import { Action, LiveMeta, mono, Ring, SceneFooter, SceneIntro, Status, Table } from "./surface";
import { useT } from "./time";

export type DiskData = {
  host: string;
  percent: number;
  used: string;
  total: string;
  rootAvail: string;
  rootSize: string;
  rootFs: string;
  mounts: { mount: string; size: string; used: string; avail: string; percent: number }[];
  readAt: string;
};

/** The Disk surface as the console composes it (DiagnosticScenes.tsx DiskScene), driven by frames. */
export function DiskSurface({
  data,
  start,
  percentShown,
  actionHover = 0,
  actionPress = 0,
  liveTick = 0,
  readAt,
}: {
  data: DiskData;
  start: number;
  /** The percent the ring shows right now (it can tick while the surface is live). */
  percentShown?: number;
  actionHover?: number;
  actionPress?: number;
  liveTick?: number;
  readAt?: string;
}) {
  const f = useT();
  const d = data;
  const percent = percentShown ?? d.percent;
  const ring = ramp(f, start + 18, 34, E.enter);
  // the root filesystem's row is the same reading as the ring, so when the ring ticks the row ticks with it
  const mounts = d.mounts.map((m) => (m.mount === "/" ? { ...m, percent } : m));
  const ordered = [...mounts].sort((a, b) => b.percent - a.percent);
  const title = percent >= 90 ? "Disk is nearly full." : percent >= 80 ? "Disk is filling up." : `Disk is ${percent}% full.`;
  return (
    <div style={{ display: "flex", width: "100%", flexDirection: "column", gap: 22 }}>
      <SceneIntro eyebrow={`${d.host} · disk capacity`} title={title} summary={`/ has ${d.rootAvail} free of ${d.rootSize}. Cleanup is worth doing soon.`} icon="box" start={start} />
      <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 18, opacity: ramp(f, start + 14, 16, E.enter) }}>
        <Ring percent={percent} progress={ring} label={d.used} sub={`used of ${d.total}`} />
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Tag tone={percent >= 85 ? "warn" : "success"}>{100 - percent}% free</Tag>
          <span style={{ fontFamily: FONT_CODE, fontSize: 11, color: "var(--muted)" }}>
            {d.rootFs} · /
          </span>
          <LiveMeta>Read at {readAt ?? d.readAt}</LiveMeta>
        </div>
      </div>
      <Table
        title="Filesystems"
        detail="Every mounted disk, fullest first"
        columns={["MOUNT", "SIZE", "USED", "AVAILABLE", "USE"]}
        colWidths={["24%", "18%", "18%", "20%", "20%"]}
        start={start + 34}
        stagger={5}
        rows={ordered.map((m) => [
          <span style={mono}>{m.mount}</span>,
          <span style={mono}>{m.size}</span>,
          <span style={mono}>{m.used}</span>,
          <span style={mono}>{m.avail}</span>,
          <Status tone={m.percent >= 85 ? "warn" : "success"}>{m.percent}%</Status>,
        ])}
        highlightRow={0}
        highlightAmt={liveTick}
      />
      <div style={{ display: "flex", width: "100%", flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, opacity: ramp(f, start + 52, 16, E.enter) }}>
        <SceneFooter>Read from df · no changes made</SceneFooter>
        <Action hover={actionHover} press={actionPress}>
          Find reclaimable space
        </Action>
      </div>
    </div>
  );
}
