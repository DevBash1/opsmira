import { Icon } from "../../Icons";
import {
  Action,
  Bars,
  KeyValue,
  ListPanel,
  Notice,
  Panel,
  Ring,
  SceneFooter,
  SceneIntro,
  StatRow,
  Status,
  Table,
  Tag,
} from "../SceneKit";
import type { SceneProps } from "./DiagnosticScenes";

/* 09 · Storage cleanup ----------------------------------------------- */
export function CleanupScene(_: SceneProps) {
  const locations = [
    { title: "Dangling Docker images", meta: "/var/lib/docker/overlay2", value: "4.8 GB" },
    { title: "Archived journal logs", meta: "/var/log/journal", value: "2.3 GB" },
    { title: "apt package cache", meta: "/var/cache/apt/archives", value: "1.4 GB" },
    { title: "Rotated app logs", meta: "/srv/app/logs/*.gz", value: "0.8 GB" },
    { title: "Stale build artifacts", meta: "/tmp/build-*", value: "0.3 GB" },
  ];
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro
        eyebrow="Scanned production · /dev/vda1 · 1.2M files"
        title="You can safely free 9.6 GB."
        summary="Most of it is unused Docker images and old journal logs. Nothing below is read by a running service."
        icon="eye"
      />
      <Panel className="flex w-full flex-col gap-[8px] p-[20px_22px]">
        <div className="flex flex-row flex-wrap items-end gap-[10px]">
          <span className="font-display text-[40px] leading-none font-semibold tracking-[-1.4px] text-[var(--ink)]">9.6 GB</span>
          <span className="pb-[5px] text-[12.5px] text-[var(--muted)]">reclaimable</span>
          <span className="ml-auto flex flex-row items-center gap-[8px]">
            <Tag tone="warn">71.5% used</Tag>
            <Status tone="success">Safe to remove</Status>
          </span>
        </div>
        <span className="text-[11.5px] text-[var(--muted)]">5 locations · verified by Opsmira</span>
      </Panel>
      <ListPanel items={locations} footer="Nothing has been deleted yet." />
      <Notice title="Review before approving" tone="neutral" icon="info" footer="/dev/vda1 · 80 GB · 57.2 GB used (71.5%) → 47.6 GB after cleanup (59.5%)">
        Review the cleanup plan, then approve to free 9.6 GB. Docker images can be re-pulled at any time.
      </Notice>
      <div className="flex w-full flex-row flex-wrap items-center gap-[10px]">
        <Action>Review plan</Action>
        <Action variant="primary">
          Approve cleanup
          <Icon name="arrow-right" className="h-[13px] w-[13px]" />
        </Action>
      </div>
      <SceneFooter>/dev/vda1 · no changes made</SceneFooter>
    </div>
  );
}

/* 10 · TLS certificate health ---------------------------------------- */
export function TlsScene(_: SceneProps) {
  const certs = [
    { name: "opsmira.dev", issuer: "Let's Encrypt · R11", expires: "Jan 1, 2027", days: "74", label: "Valid", tone: "success" as const },
    { name: "api.opsmira.dev", issuer: "Let's Encrypt · R11", expires: "Oct 27, 2026", days: "9", label: "Renews soon", tone: "warn" as const },
    { name: "*.app.opsmira.dev", issuer: "Let's Encrypt · E6", expires: "Dec 18, 2026", days: "61", label: "Valid", tone: "success" as const },
    { name: "status.opsmira.dev", issuer: "ZeroSSL · ECC", expires: "May 18, 2027", days: "212", label: "Valid", tone: "success" as const },
  ];
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro
        eyebrow="Checked production · 4 certificates · port 443"
        title="Every certificate is valid."
        summary="api.opsmira.dev expires in 9 days, but auto-renewal is scheduled and its last dry run passed."
        icon="key-round"
      />
      <div className="flex flex-col justify-between gap-[16px] lg:flex-row lg:items-end">
        <Ring percent={82} label="74 days" sub="until the next expiry" />
        <div className="flex flex-row flex-wrap items-center gap-[10px]">
          <Status tone="success">Valid</Status>
          <span className="font-code text-[11px] text-[var(--muted)]">checked from 3 regions</span>
        </div>
      </div>
      <ListPanel
        title="Certificates"
        detail="Issuers and expiry dates"
        items={certs.map((c) => ({
          icon: "key-round" as const,
          title: c.name,
          meta: `${c.issuer} · expires ${c.expires}`,
          value: `${c.days} days · ${c.label}`,
          tone: c.tone === "warn" ? ("warn" as const) : ("success" as const),
        }))}
      />
      <Panel className="flex w-full flex-col gap-[2px] p-[15px_18px]">
        <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[10px]">
          <span className="text-[13px] font-medium text-[var(--ink)]">api.opsmira.dev renewal</span>
          <Status tone="success">Handled automatically</Status>
        </div>
        <div className="mt-[6px] grid w-full grid-cols-1 gap-x-[28px] sm:grid-cols-2">
          <KeyValue label="AUTO-RENEW" value="certbot.timer · daily" />
          <KeyValue label="NEXT ATTEMPT" value="Oct 20 · 03:12 UTC" />
          <KeyValue label="CHAIN" value="R11 → ISRG Root X1" />
          <KeyValue label="PROTOCOL" value="TLS 1.3 · OCSP stapled" />
        </div>
        <div className="mt-[10px] flex w-full flex-row flex-wrap items-center justify-between gap-[10px]">
          <span className="text-[11px] text-[var(--muted)]">Last checked just now · all chains trusted · HSTS enabled</span>
          <Action variant="ghost">Run dry renewal →</Action>
        </div>
      </Panel>
      <SceneFooter>No changes made</SceneFooter>
    </div>
  );
}

/* 11 · Service uptime ------------------------------------------------ */
export function UptimeScene(_: SceneProps) {
  const days = Array.from({ length: 90 }, (_, i) => (i === 79 ? 16 : i % 23 === 0 ? 72 : 96));
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro
        eyebrow="Checked production · 4 services · 1-minute probes"
        title="A quiet quarter for your services."
        summary="One 6-minute blip on Oct 9 during an nginx reload. Every service is healthy right now."
        icon="activity"
      />
      <div className="flex flex-col justify-between gap-[16px] lg:flex-row lg:items-end">
        <div className="flex flex-row items-end gap-[12px]">
          <span className="font-display text-[48px] leading-none font-semibold tracking-[-1.8px] text-[var(--ink)]">99.98%</span>
          <Status tone="success">Within SLO</Status>
        </div>
        <span className="font-code text-[11px] text-[var(--muted)]">90-day uptime · target 99.9%</span>
      </div>
      <Panel className="flex flex-col gap-[12px] p-[18px_20px]">
        <Bars values={days} latest={days.length - 1} height={62} labels={["Jul 21", "Oct 9 · 6m nginx reload", "Today"]} tone="accent" />
      </Panel>
      <StatRow
        items={[
          { label: "INCIDENTS", value: "1" },
          { label: "DOWNTIME", value: "6m 12s" },
          { label: "PROBES", value: "129,600" },
        ]}
      />
      <Table
        title="Services"
        detail="Probed every 60 seconds"
        columns={[{ label: "SERVICE" }, { label: "PROBE" }, { label: "UPTIME" }, { label: "P95" }, { label: "STATUS" }]}
        rows={[
          ["web · nginx", "GET https://opsmira.dev", "100%", "42 ms", <Status tone="success">Operational</Status>],
          ["api-worker", "GET /healthz", "99.98%", "118 ms", <Status tone="success">Operational</Status>],
          ["postgres", "tcp :5432", "100%", "3 ms", <Status tone="success">Operational</Status>],
          ["redis", "PING :6379", "100%", "1 ms", <Status tone="success">Operational</Status>],
        ].map((row) => row.map((cell, i) => <span className={i < 2 ? "text-[12.5px] text-[var(--ink)]" : "font-code text-[11.5px]"}>{cell}</span>))}
        footer="Probes run from Frankfurt, Virginia and Singapore · no changes made."
      />
      <SceneFooter>No changes made</SceneFooter>
    </div>
  );
}

/* 12 · Scheduled jobs ------------------------------------------------ */
export function JobsScene(_: SceneProps) {
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro
        eyebrow="Read crontab & systemd timers · production · 6 jobs"
        title="Six jobs on schedule. One running now."
        summary="The nightly backup is 62% through. In the last 24 hours, 41 runs finished — all succeeded."
        icon="refresh-cw"
      />
      <Panel className="flex w-full flex-col gap-[12px] p-[18px_20px]">
        <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[10px]">
          <div className="flex flex-col gap-[2px]">
            <span className="font-display text-[17px] font-semibold text-[var(--ink)]">backup-nightly</span>
            <span className="font-code text-[10.5px] text-[var(--muted)]">pg_dump → s3://opsmira-backups · started 02:00 UTC</span>
          </div>
          <Status tone="success">Running</Status>
        </div>
        <div className="flex h-[9px] w-full overflow-hidden rounded-full bg-[var(--line)]">
          <div className="bar-fill sheen sheen-light h-full rounded-full bg-[var(--accent)]" style={{ width: "62%" }} />
        </div>
        <div className="flex w-full flex-row items-center justify-between gap-[10px]">
          <span className="font-display text-[26px] leading-none font-semibold tracking-[-0.7px] text-[var(--ink)]">62%</span>
          <span className="font-code text-[11px] text-[var(--muted)]">3.1 / 5.0 GB · ~4 min left</span>
        </div>
      </Panel>
      <Table
        title="All jobs"
        columns={[{ label: "JOB" }, { label: "SCHEDULE" }, { label: "NEXT RUN" }, { label: "LAST RUN" }, { label: "STATUS" }]}
        rows={[
          ["backup-nightly", "0 2 * * *", "now", "6m 41s", <Status tone="success">Running</Status>],
          ["cache-warm", "*/15 * * * *", "in 3m", "22s", <Status tone="success">Succeeded</Status>],
          ["certbot-renew", "12 3 * * *", "in 1h 00m", "9s", <Status tone="success">Succeeded</Status>],
          ["db-vacuum", "30 4 * * 0", "in 2h 18m", "2m 13s", <Status tone="success">Succeeded</Status>],
          ["logrotate", "0 0 * * *", "in 21h 48m", "4s", <Status tone="success">Succeeded</Status>],
          ["report-digest", "0 8 * * 1-5", "Mon 08:00", "1m 02s", <Status tone="neutral">Paused</Status>],
        ].map((row) =>
          row.map((cell, i) =>
            i === 4 ? (
              cell
            ) : (
              <span className={i === 0 ? "text-[12.5px] font-medium text-[var(--ink)]" : "font-code text-[11px] text-[var(--muted)]"}>{cell}</span>
            ),
          ),
        )}
        footer="Times in UTC · now 02:12 · crontab (deploy, root) + 2 systemd timers · no changes made."
      />
      <SceneFooter>No changes made</SceneFooter>
    </div>
  );
}

/* 17 · Backups -------------------------------------------------------- */
export function BackupsScene(_: SceneProps) {
  const days = ["05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18"];
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro
        eyebrow="Read backup catalog · postgres + volumes · last 14 days"
        title="13 of 14 nightly backups completed."
        summary="Last night's snapshot finished in 4m 12s and passed its restore test. The Oct 9 run was skipped during host patching — the next run covered it, so there's no data gap."
        icon="cloud"
      />
      <div className="flex flex-row flex-wrap items-end justify-between gap-[10px]">
        <div className="flex flex-row items-end gap-[9px]">
          <span className="font-display text-[40px] leading-none font-semibold tracking-[-1.4px] text-[var(--ink)]">18.4</span>
          <span className="pb-[5px] text-[12.5px] text-[var(--muted)]">GB · nightly size, +2.1 GB in 14 days</span>
        </div>
        <Tag>Retention 30 days</Tag>
      </div>
      <Panel className="flex w-full flex-col gap-[12px] p-[18px_20px]">
        <div className="flex w-full flex-row items-end justify-between gap-[6px]">
          {days.map((day, i) => (
            <div key={day} className="flex min-w-0 flex-1 flex-col items-center gap-[6px]">
              <div
                className={`w-full rounded-[5px] [transform-origin:bottom] motion-safe:animate-[bar-grow_0.6s_cubic-bezier(0.22,1,0.36,1)_backwards] ${
                  day === "09" ? "bg-[var(--surface)] [outline:1px_solid_var(--line)] [outline-offset:-1px]" : "bg-[var(--accent)]"
                }`}
                style={{ height: day === "09" ? 24 : 28 + (Number(day) % 4) * 4, animationDelay: `${i * 30}ms` }}
              />
              <span className="font-code text-[9.5px] text-[var(--muted)]">{day}</span>
            </div>
          ))}
        </div>
        <span className="text-[11px] text-[var(--muted)]">Nightly snapshots · Oct 9 skipped · every other run verified</span>
      </Panel>
      <Panel className="flex w-full flex-col gap-[10px] p-[16px_18px]">
        <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[10px]">
          <div className="flex flex-row items-center gap-[8px]">
            <span className="font-code text-[10px] font-medium tracking-[1.1px] text-[var(--muted)]">LATEST SNAPSHOT</span>
            <Status tone="success">Restore-tested</Status>
          </div>
          <span className="font-code text-[11px] text-[var(--muted)]">Today · 02:00</span>
        </div>
        <div className="grid w-full grid-cols-2 gap-x-[24px] sm:grid-cols-4">
          <KeyValue label="ID" value="snap-1018-0200" />
          <KeyValue label="SIZE" value="18.4 GB" />
          <KeyValue label="DURATION" value="4m 12s" />
          <KeyValue label="TARGET" value="s3://opsmira-bk/eu-1" />
        </div>
      </Panel>
      <Table
        title="Snapshots"
        columns={[{ label: "DATE" }, { label: "TYPE" }, { label: "SIZE" }, { label: "DURATION" }, { label: "STATUS" }, { label: "VIA AGENT" }]}
        rows={[
          ["Oct 18 · 02:00", "Nightly · postgres + volumes", "18.4 GB", "4m 12s", <Status tone="success">Verified</Status>, <span className="text-[11px] text-[var(--muted)]">Restore via agent</span>],
          ["Oct 17 · 02:00", "Nightly · postgres + volumes", "18.2 GB", "4m 05s", <Status tone="success">Completed</Status>, <span className="text-[11px] text-[var(--muted)]">Restore via agent</span>],
          ["Oct 16 · 14:31", "Manual · before v2.14 migration", "18.1 GB", "3m 58s", <Status tone="success">Completed</Status>, <span className="text-[11px] text-[var(--muted)]">Restore via agent</span>],
          ["Oct 09 · 02:00", "Nightly · host patching window", "—", "—", <Status tone="neutral">Skipped</Status>, <span className="text-[11px] text-[var(--muted)]">—</span>],
        ].map((row) =>
          row.map((cell, i) =>
            i >= 2 && i <= 3 ? <span className="font-code text-[11px] text-[var(--muted)]">{cell}</span> : cell,
          ),
        )}
        footer="Ask the agent to restore a snapshot — it proposes the action first, against a staging copy."
      />
      <SceneFooter>Read-only catalog · no changes made</SceneFooter>
    </div>
  );
}

/* 18 · Database restore ---------------------------------------------- */
export function RestoreScene(_: SceneProps) {
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro
        eyebrow="Simulated restore · snap-1016-1431 → staging copy of postgres"
        title="Restoring Oct 16 would change 3 tables."
        summary="This was a dry run on a staging copy — nothing in production has changed. The restore would roll back 47 hours of writes, mostly recent orders."
        icon="cloud"
      />
      <Notice tone="success" icon="check" title="Dry run · safe" footer="18.1 GB · ~6 min read-only window">
        Production stays untouched until you approve.
      </Notice>
      <Table
        title="Table impact"
        columns={[{ label: "TABLE" }, { label: "NOW" }, { label: "AFTER RESTORE" }, { label: "CHANGE" }]}
        rows={[
          ["orders", "48,210", "46,932", "−1,278 rows"],
          ["order_items", "131,904", "128,377", "−3,527 rows"],
          ["customers", "9,431", "9,402", "−29 rows"],
          ["products", "812", "812", "No change"],
          ["audit_log", "2.10M", "2.10M", "No change"],
        ].map(([table, now, after, change]) => [
          <span className="text-[12.5px] font-medium text-[var(--ink)]">{table}</span>,
          <span className="font-code text-[11.5px] text-[var(--muted)]">{now}</span>,
          <span className="font-code text-[11.5px] text-[var(--ink)]">{after}</span>,
          <span className={`font-code text-[11px] ${String(change).startsWith("−") ? "text-[var(--accent-strong)]" : "text-[var(--muted)]"}`}>{change}</span>,
        ])}
        footer="Row counts from the staging dry run · read-only."
      />
      <Panel className="flex w-full flex-col gap-[10px] p-[16px_18px]">
        <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[10px]">
          <span className="font-code text-[10px] font-medium tracking-[1.1px] text-[var(--muted)]">ROLLBACK WINDOW</span>
          <span className="font-display text-[18px] font-semibold text-[var(--ink)]">47h 49m of writes · of the last 7 days</span>
        </div>
        <div className="grid w-full grid-cols-1 gap-[10px] sm:grid-cols-3">
          {[
            ["Now", "Oct 18 · 14:20", "current production"],
            ["Restore to", "Oct 16 · 14:31", "snapshot point"],
            ["Safety copy", "auto, before restore", "kept for 7 days"],
          ].map(([label, value, note]) => (
            <div key={label} className="flex flex-col gap-[2px] rounded-[10px] bg-[var(--canvas)] p-[10px_12px] [outline:1px_solid_var(--hairline)]">
              <span className="font-code text-[9.5px] tracking-[0.8px] text-[var(--muted)]">{label.toUpperCase()}</span>
              <span className="text-[12px] font-medium text-[var(--ink)]">{value}</span>
              <span className="text-[10.5px] text-[var(--muted)]">{note}</span>
            </div>
          ))}
        </div>
      </Panel>
      <div className="flex w-full flex-row flex-wrap items-center gap-[10px]">
        <Action variant="primary">Approve restore</Action>
        <Action>Export 1,278 orders first</Action>
      </div>
      <SceneFooter>Production stays untouched until you approve · dry run only</SceneFooter>
    </div>
  );
}

/* 19 · Slow queries --------------------------------------------------- */
export function QueriesScene(_: SceneProps) {
  const history = [34, 36, 33, 38, 40, 37, 35, 39, 44, 48, 46, 52, 58, 62, 60, 66, 72, 80, 84, 82, 88, 94, 100, 96];
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro
        eyebrow="Analyzed pg_stat_statements · opsmira-db"
        title="Three queries are slowing you down."
        summary="They account for 71% of database time this hour. Each one has a safe, reviewable fix."
        icon="activity"
      />
      <div className="flex flex-col justify-between gap-[16px] lg:flex-row lg:items-end">
        <div className="flex flex-col gap-[2px]">
          <span className="font-code text-[10px] font-medium tracking-[1.1px] text-[var(--muted)]">P95 QUERY LATENCY</span>
          <div className="flex flex-row items-end gap-[8px]">
            <span className="font-display text-[46px] leading-none font-semibold tracking-[-1.6px] text-[var(--ink)]">842</span>
            <span className="pb-[5px] font-code text-[11px] text-[var(--muted)]">ms</span>
            <Tag tone="warn">3.4× baseline</Tag>
          </div>
        </div>
        <span className="font-code text-[11px] text-[var(--muted)]">baseline 248 ms · 1h window</span>
      </div>
      <Panel className="flex flex-col gap-[12px] p-[18px_20px]">
        <Bars values={history} latest={history.length - 1} height={84} labels={["13:00", "13:15", "13:30", "13:45", "now"]} />
      </Panel>
      <Table
        title="Top offenders"
        columns={[{ label: "#" }, { label: "QUERY" }, { label: "CALLS/H" }, { label: "MEAN" }, { label: "SUGGESTED FIX" }]}
        rows={[
          ["01", "SELECT * FROM orders WHERE customer_id = $1", "4,812", "842 ms", <Tag tone="accent">Add index</Tag>],
          ["02", "UPDATE sessions SET last_seen = now() WHERE …", "12,406", "318 ms", <Tag tone="accent">Batch writes</Tag>],
          ["03", "SELECT count(*) FROM events WHERE created_at > …", "920", "276 ms", <Tag tone="accent">Use rollup</Tag>],
        ].map(([n, query, calls, mean, fix]) => [
          <span className="font-code text-[10.5px] text-[var(--muted)]">{n}</span>,
          <span className="font-code text-[11px] text-[var(--ink)]">{query}</span>,
          <span className="font-code text-[11px] text-[var(--muted)]">{calls}</span>,
          <span className="font-code text-[11px] text-[var(--ink)]">{mean}</span>,
          fix,
        ])}
        footer="Fixes run as a staged migration — I'll show the plan and wait for your approval."
      />
      <SceneFooter>Read-only statistics · no changes made</SceneFooter>
    </div>
  );
}

/* 20 · DNS records ---------------------------------------------------- */
export function DnsScene(_: SceneProps) {
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro
        eyebrow="Resolved zone · opsmira.dev"
        title="DNS is healthy and fully propagated."
        summary="8 records resolve consistently across 24 global resolvers. Nothing needs your attention."
        icon="cloud"
      />
      <StatRow
        items={[
          { label: "PROPAGATION", value: "24/24", badge: <Status tone="success">Resolvers</Status> },
          { label: "RECORDS", value: "8", note: "A · CNAME · MX · TXT" },
          { label: "AVG TTL", value: "300", note: "seconds" },
          { label: "DNSSEC", value: "On", note: "signed · ECDSAP256" },
        ]}
      />
      <Table
        title="Zone records"
        columns={[{ label: "TYPE" }, { label: "NAME" }, { label: "VALUE" }, { label: "TTL" }, { label: "STATUS" }]}
        rows={[
          ["A", "opsmira.dev", "76.76.21.21", "300", <Status tone="success">Propagated</Status>],
          ["AAAA", "opsmira.dev", "2606:4700:3033::6815", "300", <Status tone="success">Propagated</Status>],
          ["CNAME", "api", "opsmira-api.fly.dev", "300", <Status tone="success">Propagated</Status>],
          ["MX", "opsmira.dev", "10 mx1.fastmail.com", "3600", <Status tone="success">Propagated</Status>],
          ["TXT", "_dmarc", "v=DMARC1; p=quarantine; rua=…", "3600", <Status tone="success">Propagated</Status>],
        ].map(([type, name, value, ttl, status]) => [
          <span className="font-code text-[11px] font-medium text-[var(--ink)]">{type}</span>,
          <span className="font-code text-[11px] text-[var(--ink)]">{name}</span>,
          <span className="font-code text-[11px] text-[var(--muted)]">{value}</span>,
          <span className="font-code text-[11px] text-[var(--muted)]">{ttl}</span>,
          status,
        ])}
        footer="Showing 5 of 8 records. Ask me to add, edit or verify a record — changes wait for your approval."
      />
      <SceneFooter>Read-only lookup · no changes made</SceneFooter>
    </div>
  );
}

/* 21 · Firewall ------------------------------------------------------- */
export function FirewallScene(_: SceneProps) {
  const rules = [
    ["ALLOW", "443", "0.0.0.0/0", "HTTPS traffic", <Status tone="success">Open</Status>],
    ["ALLOW", "80", "0.0.0.0/0", "HTTP → HTTPS redirect", <Status tone="success">Open</Status>],
    ["ALLOW", "22", "203.0.113.8/32", "SSH from office", <Status tone="success">Restricted</Status>],
    ["REVIEW", "5432", "0.0.0.0/0", "Temporary DB access", <Status tone="warn">Review</Status>],
    ["DENY", "*", "0.0.0.0/0", "Default inbound policy", <Status tone="neutral">Blocked</Status>],
  ];
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro
        eyebrow="Audited ufw + cloud firewall · web-01"
        title="Locked down, with one rule to review."
        summary="Only web traffic and your office can reach this server. One temporary rule still exposes Postgres."
        icon="server"
      />
      <Table
        title="Inbound rules"
        columns={[{ label: "ACTION" }, { label: "PORT" }, { label: "SOURCE" }, { label: "PURPOSE" }, { label: "STATE" }]}
        rows={rules.map(([action, port, source, purpose, state]) => [
          <span className={`font-code text-[10.5px] font-medium ${action === "REVIEW" ? "text-[var(--accent-2)]" : "text-[var(--ink)]"}`}>{action}</span>,
          <span className="font-code text-[11px] text-[var(--ink)]">{port}</span>,
          <span className="font-code text-[11px] text-[var(--muted)]">{source}</span>,
          <span className="text-[12px] text-[var(--ink)]">{purpose}</span>,
          state,
        ])}
        footer="ufw default deny inbound · IPv6 covered · last audited just now"
      />
      <StatRow
        items={[
          { label: "INBOUND COVERAGE", value: "94%", badge: <Status tone="success">Protected</Status> },
          { label: "OPEN PORTS", value: "4" },
          { label: "TRUSTED SOURCES", value: "1" },
          { label: "BLOCKED TODAY", value: "1,284" },
        ]}
      />
      <Notice title="Restrict port 5432 to your office IP." tone="warn" icon="triangle-alert" action={<Action>Review change</Action>} footer="No connections from outside 203.0.113.8 in 14 days — closing it won't affect your app.">
        This is the only rule I'd change. Nothing has been modified.
      </Notice>
      <SceneFooter>Read-only audit · no changes made</SceneFooter>
    </div>
  );
}

/* 24 · Cost breakdown ------------------------------------------------- */
export function CostsScene(_: SceneProps) {
  const services = [
    { label: "Compute", meta: "Hetzner CX41 × 2", value: "$96", pct: 52 },
    { label: "Database", meta: "Managed Postgres", value: "$44", pct: 24 },
    { label: "Storage", meta: "S3 + volumes", value: "$26", pct: 14 },
    { label: "Bandwidth", meta: "Cloudflare + egress", value: "$18", pct: 10 },
  ];
  const spend = [62, 66, 71, 69, 74, 78, 72, 76, 84, 88, 86, 92, 96, 118, 102, 108, 114, 120];
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro
        eyebrow="Pulled billing · Hetzner, Cloudflare, AWS"
        title="$184 so far — on track to stay under budget."
        summary="October is projected at $196, 7% below your $210 budget. Compute is the largest share."
        icon="badge-percent"
      />
      <div className="flex flex-row flex-wrap items-end justify-between gap-[10px]">
        <div className="flex flex-row items-end gap-[9px]">
          <span className="font-display text-[46px] leading-none font-semibold tracking-[-1.7px] text-[var(--ink)]">$184.20</span>
          <span className="pb-[5px] text-[12px] text-[var(--muted)]">month to date</span>
        </div>
        <Tag tone="success">Under budget</Tag>
      </div>
      <Panel className="flex w-full flex-col gap-[14px] p-[18px_20px]">
        <span className="font-code text-[10px] font-medium tracking-[1.1px] text-[var(--muted)]">BY SERVICE</span>
        {services.map((s) => (
          <div key={s.label} className="flex w-full flex-col gap-[5px]">
            <div className="flex flex-row items-baseline justify-between gap-[12px]">
              <div className="flex flex-row items-baseline gap-[9px]">
                <span className="text-[12.5px] text-[var(--ink)]">{s.label}</span>
                <span className="font-code text-[10px] text-[var(--muted)]">{s.meta}</span>
              </div>
              <span className="font-code text-[11.5px] text-[var(--ink)]">{s.value}</span>
            </div>
            <div className="h-[7px] w-full overflow-hidden rounded-full bg-[var(--line)]">
              <div className="bar-fill h-full rounded-full bg-[var(--accent)]" style={{ width: `${s.pct}%` }} />
            </div>
          </div>
        ))}
      </Panel>
      <Panel className="flex flex-col gap-[12px] p-[18px_20px]">
        <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[10px]">
          <span className="font-code text-[10px] font-medium tracking-[1.1px] text-[var(--muted)]">DAILY SPEND · OCTOBER</span>
          <span className="font-code text-[10.5px] text-[var(--muted)]">$10.23 avg / day</span>
        </div>
        <Bars values={spend} latest={spend.length - 1} height={92} labels={["Oct 1", "Oct 8", "Oct 15 · spike", "Oct 18 · today", "Oct 31"]} />
        <div className="flex flex-row gap-[14px] text-[10.5px] text-[var(--muted)]">
          <span className="flex flex-row items-center gap-[6px]"><span className="h-[6px] w-[6px] rounded-full bg-[var(--accent)]" />Actual</span>
          <span className="flex flex-row items-center gap-[6px]"><span className="h-[6px] w-[6px] rounded-full bg-[var(--line)]" />Forecast</span>
        </div>
      </Panel>
      <Notice title="Save $18/mo by removing 3 unattached volumes." tone="neutral" icon="info" action={<Action>Review cleanup</Action>} footer="vol-backup-old, vol-tmp-2, vol-test — detached for 40+ days, no recent reads.">
        Nothing has been deleted.
      </Notice>
      <SceneFooter>Sample billing data · no changes made</SceneFooter>
    </div>
  );
}
