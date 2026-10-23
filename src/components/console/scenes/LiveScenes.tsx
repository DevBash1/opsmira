import { Action, KeyValue, LiveMeta, Notice, Panel, SceneFooter, SceneIntro, StatRow, Status, Table, Tag } from "../SceneKit";
import { bytes, clock, dateTime, duration, fromServer, relative } from "./format";
import type { SceneProps } from "./DiagnosticScenes";

/* Surfaces for services, schedules, certificates, exposure and cleanup. Like the diagnostic ones, every
 * value is a reading the server took; a field that is missing is simply not shown. */

const mono = "font-code text-[11.5px]";

function AskAction({ onAsk, prompt, children }: { onAsk?: (prompt: string) => void; prompt: string; children: string }) {
  if (!onAsk) return null;
  return (
    <Action variant="ghost" onClick={() => onAsk(prompt)}>
      {children}
    </Action>
  );
}

/* Unavailable: a source this server can't read. Honest, with the fix when there is one. */
export function UnavailableScene({ data, onAsk }: SceneProps) {
  const d = data ?? {};
  return (
    <div className="flex w-full flex-col gap-[18px]">
      <SceneIntro eyebrow={`Unavailable${d.for ? ` · ${d.for}` : ""}${d.ssh ? ` · ${d.ssh}` : ""}`} title="This can't be read here." summary={d.reason ?? "The server couldn't read this."} icon="triangle-alert" />
      {d.hint && (
        <Notice tone="neutral" title="What would fix it" icon="info">
          {d.hint}
        </Notice>
      )}
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[12px]">
        <SceneFooter>Nothing is shown instead, because there is nothing real to show</SceneFooter>
        {d.for && <AskAction onAsk={onAsk} prompt={`Why can't you read ${d.for} on this server, and what are my options?`}>Ask why</AskAction>}
      </div>
    </div>
  );
}

/* Services and uptime ------------------------------------------------ */
export function UptimeScene({ data, onAsk }: SceneProps) {
  const d = data ?? {};
  const failed: any[] = d.failed ?? [];
  const services: any[] = d.services ?? [];
  const probes: any[] = d.probes ?? [];
  const down = probes.filter((p) => !p.up).length;
  const title = failed.length ? `${failed.length} service${failed.length === 1 ? "" : "s"} failed.` : "Every service is running.";
  return (
    <div className="flex w-full flex-col gap-[22px]">
      <SceneIntro
        eyebrow={`${d.host ?? "this server"} · services`}
        title={title}
        summary={`Up for ${duration(d.uptimeSeconds ?? 0)} since ${dateTime(d.bootAt)}. ${d.running} services running${failed.length ? `, ${failed.map((f) => f.name).join(", ")} failed` : ""}.`}
        icon={failed.length ? "triangle-alert" : "circle-check"}
      />
      <StatRow
        items={[
          { label: "UPTIME", value: duration(d.uptimeSeconds ?? 0), note: `since ${dateTime(d.bootAt)}` },
          { label: "RUNNING", value: String(d.running ?? 0), note: "systemd services" },
          { label: "FAILED", value: String(failed.length), badge: <Status tone={failed.length ? "warn" : "success"}>{failed.length ? "Check" : "None"}</Status> },
          { label: "LOAD", value: String(d.load?.[0]), note: `${d.cores} cores · 5 min ${d.load?.[1]}` },
        ]}
      />
      {failed.length > 0 && (
        <Table
          title="Failed services"
          onAsk={onAsk}
          rowAsk={(n) => ({ hint: `Why did ${failed[n].name} fail?`, prompt: `Why did ${failed[n].name} fail? Check its status and recent logs.` })}
          columns={[{ label: "SERVICE" }, { label: "DESCRIPTION" }]}
          minWidth="min-w-[420px]"
          rows={failed.map((f) => [
            <span className={`${mono} text-[var(--ink)]`}>{f.name}</span>,
            <span className="text-[12px] text-[var(--muted)]">{f.description || "No description"}</span>,
          ])}
        />
      )}
      {probes.length > 0 && (
        <Table
          title="Listening ports"
          detail={`${probes.length - down} of ${probes.length} answered a connection from this server`}
          onAsk={onAsk}
          rowAsk={(n) => ({ hint: `Ask about port ${probes[n].port}`, prompt: `What is listening on port ${probes[n].port} (${probes[n].process ?? "unknown process"}), and should it be?` })}
          columns={[{ label: "PORT" }, { label: "PROCESS" }, { label: "REACH" }, { label: "RESPONSE" }]}
          minWidth="min-w-[460px]"
          rows={probes.map((p) => [
            <span className={`${mono} text-[var(--ink)]`}>{p.port}</span>,
            <span className="font-code text-[11px] text-[var(--muted)]">{p.process ?? "unknown"}</span>,
            <span className="font-code text-[11px] text-[var(--muted)]">{p.scope === "all" ? "every interface" : "this machine only"}</span>,
            p.up ? <Status tone="success">{p.ms ? `${p.ms} ms` : "Answered"}</Status> : <Status tone="warn">No answer</Status>,
          ])}
        />
      )}
      {services.length > 0 && (
        <Table
          title="Running services"
          onAsk={onAsk}
          rowAsk={(n) => ({ hint: `Ask about ${services[n].name}`, prompt: `Tell me about the ${services[n].name} service: its status, and anything in its recent logs that looks wrong.` })}
          detail={`${services.length} of ${d.running} shown`}
          columns={[{ label: "SERVICE" }, { label: "DESCRIPTION" }]}
          minWidth="min-w-[420px]"
          rows={services.map((s) => [
            <span className={`${mono} text-[var(--ink)]`}>{s.name}</span>,
            <span className="text-[12px] text-[var(--muted)]">{s.description}</span>,
          ])}
        />
      )}
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[12px]">
        <LiveMeta>
          Read at {clock(d.at, true)}
          {fromServer(d.ssh)}
        </LiveMeta>
        {failed[0] && <AskAction onAsk={onAsk} prompt={`Why did ${failed[0].name} fail? Check its recent logs.`}>{`Why did ${failed[0].name} fail`}</AskAction>}
      </div>
    </div>
  );
}

/* Scheduled jobs ----------------------------------------------------- */
export function JobsScene({ data, onAsk }: SceneProps) {
  const d = data ?? {};
  const timers: any[] = d.timers ?? [];
  const cron: any[] = d.cron ?? [];
  const next = timers.find((t) => t.nextAt);
  return (
    <div className="flex w-full flex-col gap-[22px]">
      <SceneIntro
        eyebrow={`${d.host ?? "this server"} · schedules`}
        title={`${d.timerCount ?? 0} timers and ${d.cronCount ?? 0} cron jobs.`}
        summary={next ? `The next one to run is ${next.unit}, ${relative(next.nextAt)}.` : "Nothing is scheduled to run next."}
        icon="refresh-cw"
      />
      {timers.length > 0 && (
        <Table
          title="Systemd timers"
          detail={`Soonest first${d.timerCount > timers.length ? ` · ${timers.length} of ${d.timerCount}` : ""}`}
          columns={[{ label: "TIMER" }, { label: "RUNS" }, { label: "NEXT" }, { label: "LAST" }]}
          minWidth="min-w-[560px]"
          rows={timers.map((t) => [
            <span className={`${mono} block max-w-[200px] truncate text-[var(--ink)]`} title={t.unit}>{t.unit}</span>,
            <span className="font-code block max-w-[200px] truncate text-[11px] text-[var(--muted)]" title={t.activates}>{t.activates}</span>,
            <span className="font-code text-[11px] text-[var(--ink)]">{t.nextAt ? relative(t.nextAt) : "not scheduled"}</span>,
            <span className="font-code text-[11px] text-[var(--muted)]">{t.lastAt ? relative(t.lastAt) : "never"}</span>,
          ])}
        />
      )}
      {cron.length > 0 && (
        <Table
          title="Cron jobs"
          detail={`${cron.length}${d.cronCount > cron.length ? ` of ${d.cronCount}` : ""} entries`}
          columns={[{ label: "SCHEDULE" }, { label: "COMMAND" }, { label: "USER" }, { label: "FROM" }]}
          minWidth="min-w-[620px]"
          rows={cron.map((c) => [
            <span className="font-code text-[11px] text-[var(--ink)]">{c.schedule}</span>,
            <span className="font-code block max-w-[260px] truncate text-[11px] text-[var(--muted)]" title={c.command}>{c.command}</span>,
            <span className="font-code text-[11px] text-[var(--muted)]">{c.user ?? "you"}</span>,
            <span className="font-code block max-w-[150px] truncate text-[10.5px] text-[var(--muted)]" title={c.source}>{c.source}</span>,
          ])}
        />
      )}
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[12px]">
        <SceneFooter>Read from systemctl list-timers and cron files · no changes made</SceneFooter>
        {next && <AskAction onAsk={onAsk} prompt={`What does ${next.unit} do and is it safe to leave scheduled?`}>{`What does ${next.unit} do`}</AskAction>}
      </div>
    </div>
  );
}

/* Storage cleanup ---------------------------------------------------- */
export function CleanupScene({ data, onAsk }: SceneProps) {
  const d = data ?? {};
  const items: any[] = d.items ?? [];
  const disk = d.disk;
  const top = items[0];
  return (
    <div className="flex w-full flex-col gap-[22px]">
      <SceneIntro
        eyebrow={`${d.host ?? "this server"} · storage cleanup`}
        title={top ? `${top.label} is the biggest candidate.` : "Nothing to clean up."}
        summary={`${top ? `${bytes(top.bytes)} in ${top.label.toLowerCase()}. ` : ""}${disk ? `The main disk is ${disk.percent}% full with ${bytes(disk.free)} free. ` : ""}Nothing has been deleted.`}
        icon="box"
      />
      {disk && (
        <StatRow
          items={[
            { label: "DISK USED", value: `${disk.percent}%`, note: `${bytes(disk.used)} of ${bytes(disk.total)}` },
            { label: "FREE", value: bytes(disk.free) },
            { label: "CANDIDATES", value: bytes(items.reduce((n, i) => n + i.bytes, 0)), note: `across ${items.length} places` },
          ]}
        />
      )}
      <Table
        title="Where the space is"
        onAsk={onAsk}
        rowAsk={(n) => ({ hint: `Look into ${items[n].label}`, prompt: `Look into "${items[n].label}": what is taking space there, and what is safe to remove?` })}
        detail="Measured now, largest first. Sizes are what the folder holds, not all of it is safe to remove."
        columns={[{ label: "WHAT" }, { label: "SIZE" }, { label: "NOTE" }, { label: "" }]}
        minWidth="min-w-[640px]"
        rows={items.map((i) => [
          <span className="flex flex-col">
            <span className="text-[12.5px] text-[var(--ink)]">{i.label}</span>
            <span className="font-code text-[10px] text-[var(--muted)]">{i.path}</span>
          </span>,
          <span className={`${mono} text-[var(--ink)]`}>{bytes(i.bytes)}</span>,
          <span className="block max-w-[260px] text-[11.5px] leading-[1.45] text-[var(--muted)]">{i.note}</span>,
          onAsk ? (
            <Action variant="ghost" onClick={() => onAsk(i.ask)}>
              Ask
            </Action>
          ) : null,
        ])}
      />
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[12px]">
        <SceneFooter>Read with du and df · nothing is removed until you approve a command</SceneFooter>
      </div>
    </div>
  );
}

/* TLS certificates --------------------------------------------------- */
export function TlsScene({ data, onAsk }: SceneProps) {
  const d = data ?? {};
  const certs: any[] = d.certs ?? [];
  const first = certs[0];
  const soon = certs.filter((c) => c.daysLeft < 21);
  const tone = (days: number) => (days < 0 ? "danger" : days < 21 ? "warn" : "success");
  return (
    <div className="flex w-full flex-col gap-[22px]">
      <SceneIntro
        eyebrow={`${d.host ?? "this server"} · TLS certificates`}
        title={first && first.daysLeft < 0 ? `${first.name} has expired.` : soon.length ? `${soon.length} certificate${soon.length === 1 ? "" : "s"} expiring soon.` : "Certificates are healthy."}
        summary={first ? `The soonest to expire is ${first.name}, ${first.daysLeft < 0 ? `${-first.daysLeft} days ago` : `in ${first.daysLeft} days`} (${dateTime(first.expiresAt)}).` : ""}
        icon={soon.length ? "triangle-alert" : "circle-check"}
      />
      <Table
        title="Certificates"
        onAsk={onAsk}
        rowAsk={(n) => ({ hint: `Ask about ${certs[n].name}`, prompt: `Tell me about the certificate ${certs[n].name}: when it expires and whether it renews on its own.` })}
        detail="Soonest expiry first"
        columns={[{ label: "NAME" }, { label: "ISSUER" }, { label: "EXPIRES" }, { label: "LEFT" }]}
        minWidth="min-w-[560px]"
        rows={certs.map((c) => [
          <span className="flex flex-col">
            <span className={`${mono} text-[var(--ink)]`}>{c.name}</span>
            <span className="font-code max-w-[240px] truncate text-[10px] text-[var(--muted)]" title={c.source}>{c.source}</span>
          </span>,
          <span className="text-[12px] text-[var(--muted)]">{c.issuer}</span>,
          <span className="font-code text-[11px] text-[var(--muted)]">{dateTime(c.expiresAt)}</span>,
          <Status tone={tone(c.daysLeft)}>{c.daysLeft < 0 ? "Expired" : `${c.daysLeft} days`}</Status>,
        ])}
      />
      {first?.sans?.length > 0 && (
        <Panel className="p-[16px_20px]">
          <span className="font-code text-[10px] tracking-[1.1px] text-[var(--muted)]">NAMES ON {first.name.toUpperCase()}</span>
          <div className="mt-[10px] flex flex-row flex-wrap gap-[8px]">
            {first.sans.map((n: string) => (
              <Tag key={n}>{n}</Tag>
            ))}
          </div>
        </Panel>
      )}
      {d.notes?.length > 0 && <Notice tone="neutral" title="Not readable" icon="info">{d.notes.join(" ")}</Notice>}
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[12px]">
        <SceneFooter>Read with openssl · no changes made</SceneFooter>
        {soon[0] && <AskAction onAsk={onAsk} prompt={`How do I renew the certificate for ${soon[0].name}?`}>{`Renew ${soon[0].name}`}</AskAction>}
      </div>
    </div>
  );
}

/* Exposure: listening ports and firewall ----------------------------- */
export function FirewallScene({ data, onAsk }: SceneProps) {
  const d = data ?? {};
  const ports: any[] = d.ports ?? [];
  const rules: string[] | null = d.rules;
  const open = ports.filter((p) => p.scope === "all");
  const label = (s: string) => (s === "all" ? "Every interface" : s === "local" ? "This machine only" : "One address");
  return (
    <div className="flex w-full flex-col gap-[22px]">
      <SceneIntro
        eyebrow={`${d.host ?? "this server"} · exposure`}
        title={`${d.open} of ${d.total} listening ports are open to the network.`}
        summary={`The ufw firewall is ${d.ufw}. ${d.open ? "Anything listening on every interface can be reached from other machines unless a firewall rule blocks it." : "Everything is listening on this machine only."}`}
        icon="eye"
      />
      <StatRow
        items={[
          { label: "FIREWALL (UFW)", value: d.ufw === "not installed" ? "None" : d.ufw, badge: <Status tone={d.ufw === "active" ? "success" : "warn"}>{d.ufw === "active" ? "On" : "Check"}</Status> },
          { label: "OPEN TO NETWORK", value: String(d.open ?? 0), note: "listening on every interface" },
          { label: "THIS MACHINE ONLY", value: String(Math.max(0, (d.total ?? 0) - (d.open ?? 0))), note: "not reachable from outside" },
        ]}
      />
      {d.rulesNeedRoot && (
        <Notice tone="neutral" title="Firewall rules need root to read" icon="info">
          The firewall is on, but reading its rules needs elevated access, so only the listening ports are shown.
        </Notice>
      )}
      {rules && rules.length > 0 && (
        <Panel className="p-[16px_20px]">
          <span className="font-code text-[10px] tracking-[1.1px] text-[var(--muted)]">UFW RULES</span>
          <div className="mt-[8px]">
            {rules.map((r, i) => (
              <KeyValue key={i} label={r.split(/\s{2,}/)[0]} value={r.split(/\s{2,}/).slice(1).join("  ")} />
            ))}
          </div>
        </Panel>
      )}
      <Table
        title="Listening ports"
        detail={`Open to the network first${d.total > ports.length ? ` · ${ports.length} of ${d.total}` : ""}`}
        columns={[{ label: "PORT" }, { label: "PROTO" }, { label: "ADDRESS" }, { label: "PROCESS" }, { label: "REACH" }]}
        minWidth="min-w-[560px]"
        rows={[...ports].sort((a, b) => (a.scope === "all" ? 0 : 1) - (b.scope === "all" ? 0 : 1) || a.port - b.port).map((p) => [
          <span className={`${mono} text-[var(--ink)]`}>{p.port}</span>,
          <span className="font-code text-[11px] text-[var(--muted)]">{p.proto}</span>,
          <span className="font-code text-[11px] text-[var(--muted)]">{p.address}</span>,
          <span className="font-code text-[11px] text-[var(--muted)]">{p.process ?? "not visible"}</span>,
          <Status tone={p.scope === "all" ? "warn" : "neutral"}>{label(p.scope)}</Status>,
        ])}
      />
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[12px]">
        <SceneFooter>Read with ss and systemctl · no changes made</SceneFooter>
        {open[0] && <AskAction onAsk={onAsk} prompt={`Is it expected for ${open[0].process ?? "the service"} to listen on port ${open[0].port} on every interface?`}>{`Review port ${open[0].port}`}</AskAction>}
      </div>
    </div>
  );
}

