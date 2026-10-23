import { useState } from "react";
import { Icon } from "../../Icons";
import { Action, Bars, LiveMeta, LogPanel, Notice, Panel, Ring, SceneFooter, SceneIntro, StackedBar, StatRow, Status, Table, Tag } from "../SceneKit";
import { bitRate, bytes, clock, dateTime, duration, fromServer, historyLabels, historyNote } from "./format";

/* Every surface renders readings the server took from the machine. Nothing here has a fallback value:
 * a field that is missing is simply not shown. */

export type SceneProps = { data?: Record<string, any>; preview?: boolean; onAsk?: (prompt: string) => void };

const mono = "font-code text-[11.5px]";

function Snapshot({ data }: { data?: Record<string, any> }) {
  return (
    <LiveMeta>
      Read at {clock(data?.at, true)}
      {fromServer(data?.ssh)}
    </LiveMeta>
  );
}

function AskAction({ onAsk, prompt, children }: { onAsk?: (prompt: string) => void; prompt: string; children: string }) {
  if (!onAsk) return null;
  return (
    <Action variant="ghost" onClick={() => onAsk(prompt)}>
      {children}
    </Action>
  );
}

/** A series that hasn't collected enough readings yet. */
function HistoryPending({ what, remote }: { what: string; remote?: boolean }) {
  return (
    <Panel className="flex w-full flex-row items-center gap-[10px] p-[16px_20px] text-[12px] text-[var(--muted)]">
      <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[var(--accent)] motion-safe:animate-[dot-pulse_1.6s_ease-in-out_infinite]" />
      {historyNote(null, what, remote)}
    </Panel>
  );
}

/* Memory ------------------------------------------------------------- */
export function MemoryScene({ data }: SceneProps) {
  const d = data ?? {};
  const percent: number = d.percent ?? 0;
  const history = d.history;
  const tight = percent >= 90 ? "Memory is nearly full." : percent >= 75 ? "Memory is getting tight." : "Memory looks healthy.";
  return (
    <div className="flex w-full flex-col gap-[22px]">
      <SceneIntro
        eyebrow={`${d.host ?? "this server"} · memory`}
        title={tight}
        summary={`${bytes(d.used)} of ${bytes(d.total)} is in use and ${bytes(d.available)} is still available.${d.swapUsed > 0 ? ` ${bytes(d.swapUsed)} of swap is being used.` : ""}`}
      />
      <div className="flex flex-col justify-between gap-[18px] lg:flex-row lg:items-end">
        <Ring percent={percent} label={bytes(d.used)} sub={`of ${bytes(d.total)} used`} />
        <Snapshot data={d} />
      </div>
      {history ? (
        <Panel className="flex flex-col gap-[14px] p-[22px_24px_18px_24px]">
          <span className="text-[12px] text-[var(--muted)]">{historyNote(history, "Memory use")}</span>
          <Bars values={history.values} latest={history.values.length - 1} height={130} labels={historyLabels(history)} />
        </Panel>
      ) : (
        <HistoryPending what="Memory" remote={!!d.ssh} />
      )}
      <StatRow
        items={[
          {
            label: "AVAILABLE",
            value: bytes(d.available),
            badge: <Status tone={percent >= 85 ? "warn" : "success"}>{percent >= 85 ? "Low" : "Healthy"}</Status>,
            note: `${Math.round((d.available / d.total) * 100)}% of total`,
          },
          { label: "CACHED", value: bytes(d.cached), note: "Reclaimable by the system" },
          {
            label: "SWAP",
            value: d.swapTotal ? bytes(d.swapUsed) : "None",
            badge: d.swapTotal ? <Status tone={d.swapUsed > 0 ? "warn" : "neutral"}>{d.swapUsed > 0 ? "In use" : "Idle"}</Status> : undefined,
            note: d.swapTotal ? `of ${bytes(d.swapTotal)}` : "No swap configured",
          },
        ]}
      />
      <SceneFooter>Read from /proc/meminfo · no changes made</SceneFooter>
    </div>
  );
}

/* CPU ---------------------------------------------------------------- */
export function CpuScene({ data, onAsk }: SceneProps) {
  const d = data ?? {};
  const percent: number = d.percent ?? 0;
  const history = d.history;
  const top: any[] = d.top ?? [];
  const b = d.breakdown ?? {};
  const title = percent >= 85 ? "CPU is running hot." : percent >= 50 ? "CPU is busy." : "CPU is calm.";
  const busiest = top[0];
  const segments = [
    { label: "User", value: `${b.user ?? 0}%`, pct: b.user ?? 0, tone: "accent" as const },
    { label: "System", value: `${b.system ?? 0}%`, pct: b.system ?? 0, tone: "accent2" as const },
    ...(b.iowait ? [{ label: "I/O wait", value: `${b.iowait}%`, pct: b.iowait, tone: "ink" as const }] : []),
    ...(b.steal ? [{ label: "Stolen", value: `${b.steal}%`, pct: b.steal, tone: "muted" as const }] : []),
    { label: "Idle", value: `${Math.max(0, Math.round((100 - percent) * 10) / 10)}%`, pct: Math.max(0, 100 - percent), tone: "line" as const },
  ];
  return (
    <div className="flex w-full flex-col gap-[22px]">
      <SceneIntro
        eyebrow={`${d.host ?? "this server"} · CPU · ${d.cores} cores`}
        title={title}
        summary={`${percent}% of the processor is in use, with a load of ${d.load?.[0]} over the last minute${busiest ? `. ${busiest.command} is the busiest process at ${busiest.cpu}%` : ""}.`}
        icon="activity"
      />
      <div className="flex flex-col justify-between gap-[18px] lg:flex-row lg:items-end">
        <Ring percent={percent} label="CPU busy" sub={`${d.cores} cores${d.model ? ` · ${d.model}` : ""}`} />
        <Snapshot data={d} />
      </div>
      <Panel className="p-[20px_24px]">
        <StackedBar title="Where the last few seconds went" segments={segments} />
      </Panel>
      {history ? (
        <Panel className="flex flex-col gap-[14px] p-[22px_24px_18px_24px]">
          <span className="text-[12px] text-[var(--muted)]">{historyNote(history, "CPU use")}</span>
          <Bars values={history.values} latest={history.values.indexOf(history.peak)} height={130} labels={historyLabels(history)} />
        </Panel>
      ) : (
        <HistoryPending what="CPU" remote={!!d.ssh} />
      )}
      <StatRow
        items={[
          { label: "AVERAGE", value: history ? `${history.average}%` : `${percent}%`, note: history ? "over the window above" : "right now" },
          { label: "PEAK", value: history ? `${history.peak}%` : "n/a", note: history ? `at ${clock(history.peakAt)}` : "history still collecting" },
          { label: "LOAD AVERAGE", value: String(d.load?.[0]), note: `5 min ${d.load?.[1]} · 15 min ${d.load?.[2]} · ${d.cores} cores` },
        ]}
      />
      {top.length > 0 && (
        <Table
          title="Busiest processes"
          onAsk={onAsk}
          rowAsk={(n) => ({ hint: `Look into ${top[n].command}`, prompt: `Look into ${top[n].command} (PID ${top[n].pid}): what is it doing and is its CPU use normal?` })}
          detail="Measured over the last half second"
          columns={[{ label: "PROCESS" }, { label: "PID" }, { label: "USER" }, { label: "CPU" }, { label: "MEMORY" }]}
          minWidth="min-w-[480px]"
          rows={top.map((p) => [
            <span className={`${mono} block max-w-[240px] truncate text-[var(--ink)]`} title={p.command}>{p.command}</span>,
            <span className="font-code text-[11px] text-[var(--muted)]">{p.pid}</span>,
            <span className="font-code text-[11px] text-[var(--muted)]">{p.user}</span>,
            <span className={`${mono} text-[var(--ink)]`}>{p.cpu}%</span>,
            <span className="font-code text-[11px] text-[var(--muted)]">{p.mem}%</span>,
          ])}
        />
      )}
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[12px]">
        <SceneFooter>Read from /proc/stat · no changes made</SceneFooter>
        {busiest && <AskAction onAsk={onAsk} prompt={`Look into ${busiest.command} (PID ${busiest.pid}): what is it doing and is its CPU use normal?`}>{`Look into ${busiest.command}`}</AskAction>}
      </div>
    </div>
  );
}

/* Network ------------------------------------------------------------ */
export function NetworkScene({ data, onAsk }: SceneProps) {
  const d = data ?? {};
  const ifaces: any[] = d.interfaces ?? [];
  const conn = d.connections ?? {};
  const moved = d.transferred;
  const clean = !d.errors && !d.dropped;
  return (
    <div className="flex w-full flex-col gap-[22px]">
      <SceneIntro
        eyebrow={`${d.host ?? "this server"} · network${d.primary ? ` · ${d.primary}` : ""}`}
        title={clean ? "The network looks clean." : d.errors ? "The network has interface errors." : "The network is up, with some dropped packets."}
        summary={`${bitRate(d.rxBps)} coming in and ${bitRate(d.txBps)} going out right now. ${
          clean ? "No interface errors or dropped packets." : `${d.errors} interface errors and ${d.dropped} dropped packets since boot.`
        }`}
        icon="activity"
      />
      <div className="grid w-full grid-cols-1 gap-[14px] sm:grid-cols-2">
        {[
          { label: "INBOUND", value: bitRate(d.rxBps), history: d.history?.rx },
          { label: "OUTBOUND", value: bitRate(d.txBps), history: d.history?.tx },
        ].map((s) => (
          <Panel key={s.label} className="flex flex-col gap-[10px] p-[18px_20px]">
            <span className="font-code text-[10px] font-medium tracking-[1.1px] text-[var(--muted)]">{s.label}</span>
            <span className="font-display text-[30px] leading-none font-semibold tracking-[-0.8px] text-[var(--ink)]">{s.value}</span>
            {s.history ? (
              <Bars values={s.history.values} latest={s.history.values.length - 1} height={64} tone="accent" />
            ) : (
              <span className="text-[11px] text-[var(--muted)]">{historyNote(null, "Traffic", !!d.ssh)}</span>
            )}
          </Panel>
        ))}
      </div>
      <div className="flex w-full flex-row items-center justify-between gap-[12px]">
        <span className="text-[12px] text-[var(--muted)]">{d.history?.rx ? `${historyNote(d.history.rx, "Traffic")} Bars scale to the busiest moment.` : ""}</span>
        <Snapshot data={d} />
      </div>
      <StatRow
        items={[
          { label: moved ? `TRANSFERRED · ${Math.max(1, Math.round(moved.seconds / 60))} MIN` : "TRANSFERRED", value: moved ? bytes(moved.rx + moved.tx) : "n/a", note: moved ? `${bytes(moved.rx)} in · ${bytes(moved.tx)} out` : "still collecting" },
          { label: "INTERFACE ERRORS", value: String(d.errors ?? 0), note: "since boot" },
          { label: "DROPPED PACKETS", value: String(d.dropped ?? 0), note: "since boot" },
          { label: "CONNECTIONS", value: conn.established != null ? String(conn.established) : "n/a", note: conn.listening != null ? `${conn.listening} listening · ${conn.timeWait ?? 0} closing` : undefined },
        ]}
      />
      <Table
        title="Interfaces"
        onAsk={onAsk}
        rowAsk={(n) => ({ hint: `Ask about ${ifaces[n].name}`, prompt: `Tell me about the ${ifaces[n].name} network interface: its traffic, errors, and whether anything looks wrong.` })}
        detail="Totals since boot, rates averaged over the last few seconds"
        minWidth="min-w-[560px]"
        columns={[{ label: "NAME" }, { label: "IN" }, { label: "OUT" }, { label: "RECEIVED" }, { label: "SENT" }, { label: "ERRORS" }]}
        rows={ifaces.map((i) => [
          <span className={`${mono} text-[var(--ink)]`}>
            {i.name}
            {i.virtual && <span className="ml-[6px] text-[10px] text-[var(--muted)]">virtual</span>}
          </span>,
          <span className="font-code text-[11px]">{bitRate(i.rxBps)}</span>,
          <span className="font-code text-[11px]">{bitRate(i.txBps)}</span>,
          <span className="font-code text-[11px] text-[var(--muted)]">{bytes(i.rxTotal)}</span>,
          <span className="font-code text-[11px] text-[var(--muted)]">{bytes(i.txTotal)}</span>,
          <span className="font-code text-[11px] text-[var(--muted)]">
            {i.errors} err · {i.dropped} dropped
          </span>,
        ])}
      />
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[12px]">
        <SceneFooter>Read from /proc/net/dev and ss · no changes made</SceneFooter>
        <AskAction onAsk={onAsk} prompt="Show the listening ports and which of them are open to the network.">Check open ports</AskAction>
      </div>
    </div>
  );
}

/* Disk --------------------------------------------------------------- */
export function DiskScene({ data, onAsk }: SceneProps) {
  const d = data ?? {};
  const mounts: any[] = d.mounts ?? [];
  const root = mounts.find((m) => m.mount === "/") ?? mounts[0];
  const percent: number = d.percent ?? 0;
  const ordered = [...mounts].sort((a, b) => b.percent - a.percent);
  return (
    <div className="flex w-full flex-col gap-[22px]">
      <SceneIntro
        eyebrow={`${d.host ?? "This server"} · disk capacity`}
        title={percent >= 90 ? "Disk is nearly full." : percent >= 80 ? "Disk is filling up." : `Disk is ${percent}% full.`}
        summary={`${root?.mount ?? "The main volume"} has ${root?.avail} free of ${root?.size}. ${
          percent >= 80 ? "Cleanup is worth doing soon." : "There is still room, but it is worth watching what grows."
        }`}
        icon="box"
      />
      <div className="flex flex-col justify-between gap-[18px] lg:flex-row lg:items-end">
        <Ring percent={percent} label={d.used} sub={`used of ${d.total}`} />
        <div className="flex flex-row items-center gap-[10px]">
          <Tag tone={percent >= 85 ? "warn" : "success"}>{100 - percent}% free</Tag>
          {root && <span className="font-code text-[11px] text-[var(--muted)]">{root.filesystem} · {root.mount}</span>}
        </div>
      </div>
      <Table
        title="Filesystems"
        onAsk={onAsk}
        rowAsk={(n) => ({ hint: `What is using ${ordered[n].mount}?`, prompt: `What is using the space on ${ordered[n].mount}?` })}
        detail="Every mounted disk, fullest first"
        columns={[{ label: "MOUNT" }, { label: "SIZE" }, { label: "USED" }, { label: "AVAILABLE" }, { label: "USE" }]}
        rows={ordered.map((m) => [
          <span className={mono}>{m.mount}</span>,
          <span className={mono}>{m.size}</span>,
          <span className={mono}>{m.used}</span>,
          <span className={mono}>{m.avail}</span>,
          <Status tone={m.percent >= 85 ? "warn" : "success"}>{m.percent}%</Status>,
        ])}
        footer="Read from df."
      />
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[12px]">
        <SceneFooter>Read from df · no changes made</SceneFooter>
        <AskAction onAsk={onAsk} prompt="Show where reclaimable storage space is.">Find reclaimable space</AskAction>
      </div>
    </div>
  );
}

/* Processes ---------------------------------------------------------- */
export function ProcessesScene({ data, onAsk }: SceneProps) {
  const d = data ?? {};
  const rows: any[] = d.rows ?? [];
  const top = rows[0];
  const stateName = (state: string) => (state.startsWith("R") ? "Running" : state.startsWith("S") ? "Sleeping" : state.startsWith("Z") ? "Zombie" : state.startsWith("T") ? "Stopped" : state);
  return (
    <div className="flex w-full flex-col gap-[22px]">
      <SceneIntro
        eyebrow={`${d.host ?? "This server"} · ${d.total} processes`}
        title={top ? `${top.name} leads CPU use.` : "Running processes."}
        summary={`${d.total} processes listed, ${d.sleeping} sleeping${d.zombies ? `, ${d.zombies} zombies` : ""}. Sorted by CPU use.`}
        icon="cpu"
      />
      <StatRow
        items={[
          { label: "PROCESSES", value: String(d.total) },
          { label: "RUNNING", value: String(d.running ?? 0) },
          { label: "ZOMBIES", value: String(d.zombies ?? 0), badge: <Status tone={d.zombies ? "warn" : "success"}>{d.zombies ? "Check" : "Clean"}</Status> },
        ]}
      />
      <Table
        title="Top processes"
        onAsk={onAsk}
        rowAsk={(n) => ({ hint: `Inspect ${rows[n].name}`, prompt: `Inspect ${rows[n].name} (PID ${rows[n].pid}) in more detail: command line, open files and recent errors.` })}
        detail="CPU as ps reports it: time used divided by time running"
        columns={[{ label: "PROCESS" }, { label: "PID" }, { label: "USER" }, { label: "CPU" }, { label: "MEMORY" }, { label: "STATE" }]}
        rows={rows.map((p) => {
          const state = stateName(String(p.state ?? ""));
          return [
            <span className={`${mono} block max-w-[260px] truncate text-[var(--ink)]`} title={p.name}>{p.name}</span>,
            <span className="font-code text-[11px] text-[var(--muted)]">{p.pid}</span>,
            <span className="font-code text-[11px] text-[var(--muted)]">{p.user}</span>,
            <span className={`${mono} text-[var(--ink)]`}>{p.cpu}</span>,
            <span className="font-code text-[11.5px] text-[var(--muted)]">{p.mem}</span>,
            <Status tone={state === "Running" ? "success" : state === "Sleeping" ? "neutral" : "warn"}>{state}</Status>,
          ];
        })}
      />
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[12px]">
        <SceneFooter>Read from ps · no changes made</SceneFooter>
        {top && <AskAction onAsk={onAsk} prompt={`Inspect ${top.name} (PID ${top.pid}) in more detail: command line, open files and recent errors.`}>Inspect top process</AskAction>}
      </div>
    </div>
  );
}

/* Logs --------------------------------------------------------------- */
export function LogsScene({ data, onAsk }: SceneProps) {
  const d = data ?? {};
  const [tab, setTab] = useState("All");
  const source: any[] = d.lines ?? [];
  const errors = source.filter((l) => l.level === "ERROR").length;
  const warns = source.filter((l) => l.level === "WARN").length;
  const visible = tab === "All" ? source : source.filter((l) => l.level === tab.toUpperCase());
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro
        eyebrow={`${d.host ?? "This server"} · logs${d.source && d.source !== "system" ? ` · ${d.source}` : ""}`}
        title={errors ? `${errors} error${errors === 1 ? "" : "s"} in the recent logs.` : warns ? "A few warnings, no errors." : "The recent logs are quiet."}
        summary={`${source.length} lines read: ${errors} error${errors === 1 ? "" : "s"}, ${warns} warning${warns === 1 ? "" : "s"}.`}
        icon="scroll-text"
      />
      <LogPanel
        title={d.command ?? "journalctl"}
        meta={<Tag>{d.collected ? "Live" : "Snapshot"}</Tag>}
        tabs={[
          { label: "All", count: String(source.length), active: tab === "All", onClick: () => setTab("All") },
          { label: "Info", count: String(source.filter((l) => l.level === "INFO").length), active: tab === "Info", onClick: () => setTab("Info") },
          { label: "Warn", count: String(warns), active: tab === "Warn", onClick: () => setTab("Warn") },
          { label: "Error", count: String(errors), active: tab === "Error", onClick: () => setTab("Error") },
        ]}
        lines={visible}
        maxHeight={380}
        footer={`Showing ${visible.length} of ${source.length} lines, newest at the bottom. Scroll for older ones.`}
      />
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[12px]">
        <SceneFooter>Read-only snapshot · no changes made</SceneFooter>
        <AskAction onAsk={onAsk} prompt="Look at the recent logs and tell me whether any warning or error needs attention.">Ask about these logs</AskAction>
      </div>
    </div>
  );
}

/* Container inventory ------------------------------------------------ */
export function InventoryScene({ data, onAsk }: SceneProps) {
  const d = data ?? {};
  const rows: any[] = d.rows ?? [];
  const total: number = d.total ?? rows.length;
  const running: number = d.running ?? 0;
  const attention = rows.filter((c) => c.state === "restarting" || c.health === "unhealthy").length;
  const worst = rows.find((c) => c.state === "restarting" || c.health === "unhealthy") ?? rows.find((c) => !c.up);
  if (!total) {
    return (
      <div className="flex w-full flex-col gap-[20px]">
        <SceneIntro eyebrow={`${d.host ?? "this server"} · Docker`} title="No containers yet." summary="Docker is running, but there are no containers on this server." icon="box" />
        <SceneFooter>Read from docker ps · no changes made</SceneFooter>
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro
        eyebrow={`${d.host ?? "this server"} · Docker · ${total} containers`}
        title={attention ? `${attention} container${attention === 1 ? " needs" : "s need"} attention.` : `${running} of ${total} containers are up.`}
        summary={total - running === 0 ? "Every container is up." : `${total - running} ${total - running === 1 ? "container is" : "containers are"} not running.`}
        icon="box"
      />
      <div className="grid w-full grid-cols-3 gap-[12px]">
        {[
          ["TOTAL", String(total), "neutral"],
          ["UP", String(running), "success"],
          ["NOT UP", String(total - running), total - running ? "warn" : "success"],
        ].map(([label, value, tone]) => (
          <Panel key={label} className="flex flex-col gap-[6px] p-[14px_16px]">
            <span className="font-code text-[9.5px] font-medium tracking-[1px] text-[var(--muted)]">{label}</span>
            <span className="font-display text-[22px] leading-none font-semibold tracking-[-0.5px] text-[var(--ink)]">{value}</span>
            <Status tone={tone as any}>{tone === "warn" ? "Attention" : tone === "success" ? "Good" : "Listed"}</Status>
          </Panel>
        ))}
      </div>
      <Table
        title="Containers"
        onAsk={onAsk}
        rowAsk={(n) => ({ hint: `Diagnose ${rows[n].name}`, prompt: `Diagnose the container ${rows[n].name}.` })}
        detail="Ones that need attention first"
        columns={[{ label: "CONTAINER" }, { label: "IMAGE" }, { label: "STATUS" }, { label: "PORTS" }]}
        rows={rows.map((c) => [
          <span className={`${mono} text-[var(--ink)]`}>{c.name}</span>,
          <span className="font-code block max-w-[220px] truncate text-[11px] text-[var(--muted)]" title={c.image}>{c.image}</span>,
          <Status tone={c.up && c.health !== "unhealthy" ? "success" : "warn"}>{c.health === "unhealthy" ? "Unhealthy" : c.status}</Status>,
          <span className="font-code block max-w-[200px] truncate text-[10.5px] text-[var(--muted)]" title={c.ports}>{c.ports || "none"}</span>,
        ])}
        footer={`Showing ${rows.length} of ${total}.`}
      />
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[12px]">
        <SceneFooter>Read from docker ps · no changes made</SceneFooter>
        {worst && <AskAction onAsk={onAsk} prompt={`Diagnose the container ${worst.name}.`}>{`Diagnose ${worst.name}`}</AskAction>}
      </div>
    </div>
  );
}

/* Container diagnosis ------------------------------------------------ */
export function ContainersScene({ data, onAsk }: SceneProps) {
  const d = data ?? {};
  const logs: any[] = d.logs ?? [];
  const errors = logs.filter((l) => l.level === "ERROR").length;
  const state = String(d.state ?? "");
  const title = d.restarting ? `${d.name} keeps restarting.` : d.problem ? `${d.name} is not healthy.` : `${d.name} looks fine.`;
  const facts = [
    d.restartCount ? `Restarted ${d.restartCount} time${d.restartCount === 1 ? "" : "s"}.` : "",
    d.exitCode ? `Last exit code ${d.exitCode}.` : "",
    d.oomKilled ? "It was killed for running out of memory." : "",
    d.error ? `Docker reports: ${d.error}.` : "",
    errors ? `${errors} error line${errors === 1 ? "" : "s"} in its recent output.` : "No errors in its recent output.",
  ].filter(Boolean);
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro eyebrow={`${d.host ?? "this server"} · container · ${d.name}`} title={title} summary={facts.join(" ")} icon={d.problem ? "refresh-cw" : "circle-check"} />
      <Panel className="flex w-full flex-col gap-[14px] p-[18px_20px]">
        <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[12px]">
          <div className="flex flex-row items-center gap-[10px]">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-[var(--soft)]">
              <Icon name="box" className="h-[15px] w-[15px] text-[var(--accent-strong)]" />
            </span>
            <div className="flex flex-col">
              <span className="font-display text-[16px] font-semibold text-[var(--ink)]">{d.name}</span>
              <span className="font-code text-[10.5px] text-[var(--muted)]">{d.image}</span>
            </div>
          </div>
          <div className="flex flex-row items-center gap-[10px]">
            <Status tone={d.problem ? "warn" : "success"}>{d.status}</Status>
            {d.health && <span className="font-code text-[10.5px] text-[var(--muted)]">health: {d.health}</span>}
          </div>
        </div>
        <div className="flex w-full flex-row flex-wrap gap-x-[22px] gap-y-[6px] text-[11.5px] text-[var(--muted)]">
          {d.startedAt && <span>Started <span className="font-code text-[var(--ink)]">{dateTime(d.startedAt)}</span></span>}
          {d.finishedAt && state !== "running" && <span>Stopped <span className="font-code text-[var(--ink)]">{dateTime(d.finishedAt)}</span></span>}
          <span>Restarts <span className="font-code text-[var(--ink)]">{d.restartCount ?? 0}</span></span>
        </div>
      </Panel>
      {logs.length > 0 ? (
        <LogPanel title={`${d.name} · last ${logs.length} lines`} meta={<Tag>Snapshot</Tag>} lines={logs} maxHeight={340} footer="Read with docker logs · read-only." />
      ) : (
        <Notice title="No log output" icon="info">This container hasn't written anything to its logs.</Notice>
      )}
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[12px]">
        <SceneFooter>Read with docker inspect and docker logs · no changes made</SceneFooter>
        {d.problem && <AskAction onAsk={onAsk} prompt={`Work out why ${d.name} is failing and propose a fix.`}>Work out why</AskAction>}
      </div>
    </div>
  );
}

/* Files -------------------------------------------------------------- */
export function FilesScene({ data, onAsk }: SceneProps) {
  const d = data ?? {};
  const path: string = d.path ?? "";
  const items: any[] = d.items ?? [];
  const parts = path.split("/").filter(Boolean);
  const rows = items.map((f) => [
    <span className={`flex flex-row items-center gap-[8px] ${mono} text-[var(--ink)]`}>
      <Icon name={f.dir ? "box" : "scroll-text"} className="h-[12px] w-[12px] text-[var(--muted)]" />
      {f.name}
    </span>,
    <span className="font-code text-[11px] text-[var(--muted)]">{f.dir ? "folder" : f.size}</span>,
    <span className="font-code text-[11px] text-[var(--muted)]">{f.modified}</span>,
  ]);
  const firstDir = items.find((f) => f.dir);
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro
        eyebrow={`${d.host ?? "this server"} · ${path}`}
        title={items.length ? `${items.length} item${items.length === 1 ? "" : "s"} in ${parts[parts.length - 1] ?? "/"}.` : "This folder is empty."}
        summary={items.length ? `A read-only listing of ${path}.` : `${path} has nothing in it.`}
        icon="box"
      />
      {rows.length > 0 && (
        <Table
          minWidth="min-w-[520px]"
          title={
            <span className="font-code text-[11.5px] text-[var(--ink)]">
              {parts.slice(0, -1).join(" / ")} / <span className="text-[var(--accent-strong)]">{parts[parts.length - 1] ?? ""}</span>
            </span>
          }
          right={<Tag>Read-only</Tag>}
          columns={[{ label: "NAME" }, { label: "SIZE" }, { label: "MODIFIED" }]}
          onAsk={onAsk}
          rowAsk={(n) => ({
            hint: items[n].dir ? `Open ${items[n].name}` : `Ask about ${items[n].name}`,
            prompt: items[n].dir ? `List ${path.replace(/\/$/, "")}/${items[n].name}` : `Tell me about the file ${path.replace(/\/$/, "")}/${items[n].name}: what it is and what is in it.`,
          })}
          rows={rows}
        />
      )}
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[12px]">
        <SceneFooter>Read-only listing · no changes made</SceneFooter>
        {firstDir && <AskAction onAsk={onAsk} prompt={`List ${path.replace(/\/$/, "")}/${firstDir.name}`}>{`Open ${firstDir.name}`}</AskAction>}
      </div>
    </div>
  );
}

export { duration };
