import { Icon } from "../../Icons";
import {
  Action,
  CodePanel,
  KeyValue,
  Notice,
  Panel,
  SceneFooter,
  SceneIntro,
  StatRow,
  Status,
  Steps,
  Tag,
  Timeline,
} from "../SceneKit";
import type { SceneProps } from "./DiagnosticScenes";

/* 13 · Deployment progress ------------------------------------------- */
export function DeployScene(_: SceneProps) {
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro
        eyebrow="Deploying web-app → production · started 14:02"
        title="Shipping v2.14.0 to production."
        summary="Three of five replicas are live and healthy. I'll switch traffic once health checks pass — about a minute to go."
        icon="play"
      />
      <div className="flex flex-col gap-[10px]">
        <div className="flex w-full flex-row items-end justify-between gap-[12px]">
          <span className="font-display text-[42px] leading-none font-semibold tracking-[-1.5px] text-[var(--ink)]">68%</span>
          <Tag tone="accent">COMPLETE</Tag>
        </div>
        <div className="h-[9px] w-full overflow-hidden rounded-full bg-[var(--line)]">
          <div className="bar-fill sheen sheen-light h-full rounded-full bg-[var(--accent)]" style={{ width: "68%" }} />
        </div>
      </div>
      <Steps
        title="Rollout pipeline"
        detail="web-app:2.14.0"
        progress={<Status tone="success">Rolling out</Status>}
        items={[
          { label: "Build image", meta: "1m 04s", status: "done" },
          { label: "Push to registry", meta: "12s", status: "done" },
          { label: "Run migrations", meta: "0 pending · 3s", status: "done" },
          { label: "Roll out replicas", meta: "3 / 5 ready", status: "running" },
          { label: "Health checks", meta: "—", status: "pending" },
          { label: "Switch traffic", meta: "—", status: "pending" },
        ]}
      />
      <div className="grid w-full grid-cols-1 gap-[12px] sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["COMMIT", "a3f9c21", "feat: faster checkout"],
          ["ELAPSED", "2m 41s", "since 14:02:08"],
          ["REMAINING", "≈ 1m 10s", "based on last 5 deploys"],
          ["ERROR RATE", "0.00%", "new replicas · 2 min"],
        ].map(([label, value, note]) => (
          <Panel key={label} className="flex flex-col gap-[5px] p-[13px_15px]">
            <span className="font-code text-[9.5px] font-medium tracking-[1px] text-[var(--muted)]">{label}</span>
            <span className="font-code text-[15px] font-medium text-[var(--ink)]">{value}</span>
            <span className="text-[10.5px] text-[var(--muted)]">{note}</span>
          </Panel>
        ))}
      </div>
      <SceneFooter>Triggered by push to main · rolling strategy, max surge 1</SceneFooter>
    </div>
  );
}

/* 14 · Failed build --------------------------------------------------- */
export function BuildScene(_: SceneProps) {
  return (
    <div className="flex w-full flex-col gap-[18px]">
      <SceneIntro
        eyebrow="Read build #482 logs · web-app · main"
        title="Build #482 failed at the test stage."
        summary="STRIPE_API_KEY isn't available in CI, so the checkout tests can't boot. The code compiled cleanly — this is a config fix, not a code fix."
        icon="triangle-alert"
      />
      <CodePanel
        title="Build log · test stage"
        meta="ci/test.log"
        status={{ text: "Failed · #482 · a3f9c21 · 3m 12s", tone: "warn" }}
        lines={[
          { n: 208, text: "$ vitest run --reporter=dot" },
          { n: 209, text: "✓ cart/totals.test.ts (24)" },
          { n: 210, text: "✓ cart/discounts.test.ts (11)" },
          { n: 211, text: "› checkout/payment.test.ts" },
          { n: 212, text: "booting stripe client…" },
          { n: 213, text: "✗ Error: Missing env STRIPE_API_KEY", tone: "error", active: true },
          { n: 214, text: "at createClient (lib/stripe.ts:18:11)", tone: "error" },
          { n: 215, text: "Tests 35 passed · 9 failed", tone: "muted" },
        ]}
        footer="Showing lines 208–215 of 2,104 · read-only build log"
      />
      <Panel className="flex w-full flex-col gap-[10px] p-[16px_18px]">
        <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[10px]">
          <div className="flex flex-row items-center gap-[9px]">
            <span className="font-display text-[28px] leading-none font-semibold tracking-[-0.8px] text-[var(--ink)]">94%</span>
            <div className="flex flex-col">
              <span className="font-code text-[9.5px] tracking-[1px] text-[var(--muted)]">ROOT CAUSE</span>
              <span className="text-[12.5px] font-medium text-[var(--ink)]">Missing CI secret</span>
            </div>
          </div>
          <Status tone="success">High confidence</Status>
        </div>
        <p className="text-[12px] leading-[1.55] text-[var(--muted)]">
          The secret exists in production but was never added to the ci environment. 9 payment tests depend on it.
        </p>
        <div className="font-code flex flex-row items-center gap-[8px] rounded-[8px] bg-[var(--canvas)] px-[11px] py-[7px] text-[11px] text-[var(--ink)] [outline:1px_solid_var(--hairline)]">
          <span className="text-[var(--muted)]">$</span> opsmira secrets copy STRIPE_API_KEY --to ci
        </div>
      </Panel>
      <Steps
        title="Pipeline"
        detail="Build #482"
        progress="3m 12s"
        items={[
          { label: "Install", meta: "42s", status: "done" },
          { label: "Compile", meta: "1m 08s", status: "done" },
          { label: "Test", meta: "1m 22s", status: "failed" },
          { label: "Package", meta: "skipped", status: "pending" },
          { label: "Deploy", meta: "skipped", status: "pending" },
        ]}
      />
      <div className="flex w-full flex-row flex-wrap items-center gap-[10px]">
        <Action variant="primary">Add secret &amp; rebuild</Action>
        <Action>Open full log</Action>
      </div>
      <SceneFooter>Rebuild takes ~3 min · nothing ships until tests pass</SceneFooter>
    </div>
  );
}

/* 15 · Rollback comparison -------------------------------------------- */
export function RollbackScene(_: SceneProps) {
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro
        eyebrow="Compared releases · web-app · production"
        title="Roll back to v2.13.2?"
        summary="v2.14.0 pushed checkout errors to 4.8% after the 14:05 deploy. v2.13.2 ran cleanly for 6 days — the rollback takes about 40 seconds."
        icon="rotate-ccw"
      />
      <div className="grid w-full grid-cols-1 gap-[12px] md:grid-cols-2">
        <Panel className="flex flex-col gap-[10px] p-[16px_18px]">
          <div className="flex flex-row items-center justify-between gap-[8px]">
            <span className="font-code text-[9.5px] font-medium tracking-[1px] text-[var(--muted)]">NOW SERVING</span>
            <Status tone="warn">Degraded</Status>
          </div>
          <div className="flex flex-col gap-[1px]">
            <span className="font-display text-[22px] leading-none font-semibold tracking-[-0.5px] text-[var(--ink)]">v2.14.0</span>
            <span className="font-code text-[10.5px] text-[var(--muted)]">a3f9c21 · deployed 14:05</span>
          </div>
          <div className="flex flex-col">
            <KeyValue label="Error rate" value="4.8%" tone="warn" />
            <KeyValue label="p95 latency" value="812 ms" />
            <KeyValue label="Age" value="18 min" />
          </div>
        </Panel>
        <Panel className="flex flex-col gap-[10px] p-[16px_18px] [outline:1px_solid_var(--accent)]">
          <div className="flex flex-row items-center justify-between gap-[8px]">
            <span className="font-code text-[9.5px] font-medium tracking-[1px] text-[var(--muted)]">ROLL BACK TO</span>
            <Status tone="success">Stable · 6 days</Status>
          </div>
          <div className="flex flex-col gap-[1px]">
            <span className="font-display text-[22px] leading-none font-semibold tracking-[-0.5px] text-[var(--ink)]">v2.13.2</span>
            <span className="font-code text-[10.5px] text-[var(--muted)]">e81b04d · deployed Oct 12</span>
          </div>
          <div className="flex flex-col">
            <KeyValue label="Error rate" value="0.2%" tone="success" />
            <KeyValue label="p95 latency" value="240 ms" tone="success" />
            <KeyValue label="Uptime" value="99.98%" />
          </div>
        </Panel>
      </div>
      <Panel className="flex w-full flex-col gap-[2px] p-[14px_18px]">
        <div className="flex items-center gap-[8px] text-[12px] text-[var(--ink)]">
          <Icon name="refresh-cw" className="h-[12px] w-[12px] text-[var(--accent)]" /> Shift traffic to 5 warm v2.13.2 replicas
        </div>
        <div className="flex items-center gap-[8px] text-[12px] text-[var(--ink)]">
          <Icon name="box" className="h-[12px] w-[12px] text-[var(--accent)]" /> Keep v2.14.0 image retained for debugging
        </div>
        <div className="flex items-center gap-[8px] text-[12px] text-[var(--ink)]">
          <Icon name="check" className="h-[12px] w-[12px] text-[var(--accent)]" /> No data changes — migrations are backward compatible
        </div>
      </Panel>
      <div className="flex w-full flex-row flex-wrap items-center gap-[10px]">
        <Action variant="ink">Roll back to v2.13.2</Action>
        <Action>Keep v2.14.0</Action>
      </div>
      <SceneFooter>Needs your approval · you can redeploy v2.14.0 anytime</SceneFooter>
    </div>
  );
}

/* 25 · Incident timeline ---------------------------------------------- */
export function IncidentScene(_: SceneProps) {
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <div className="flex flex-col gap-[10px]">
        <div className="flex flex-row flex-wrap items-center gap-[9px]">
          <Tag tone="success">INC-2041 · RESOLVED</Tag>
          <span className="font-code text-[10.5px] text-[var(--muted)]">Oct 17 · 14:02 → 14:21 UTC</span>
        </div>
        <SceneIntro
          eyebrow="Correlated 3 alerts · 214 log lines · 2 deploys"
          title="Checkout went dark for 18 minutes. Here's exactly what happened."
          summary="A config push dropped the Redis connection pool to 4. Checkout requests queued, timed out, then recovered after the rollback."
          icon="activity"
        />
      </div>
      <Panel className="flex w-full flex-col gap-[14px] p-[18px_20px]">
        <div className="flex w-full flex-row items-center justify-between gap-[10px]">
          <span className="font-display text-[15px] font-semibold text-[var(--ink)]">Timeline</span>
          <span className="font-code text-[10px] text-[var(--muted)]">UTC</span>
        </div>
        <Timeline
          events={[
            { time: "14:02:11", title: "Config v2.18 deployed", detail: "pool_size 32 → 4 on checkout-api", tone: "muted", icon: "info" },
            { time: "14:04:37", title: "p95 latency crosses 2.4s", detail: "Alert fired · checkout-api", tone: "warn", icon: "triangle-alert" },
            { time: "14:06:02", title: "Error rate spikes to 31%", detail: "Redis 'too many clients' in logs", tone: "danger", icon: "triangle-alert" },
            { time: "14:09:48", title: "Opsmira traced the root cause", detail: "Diffed config against v2.17", tone: "accent", icon: "activity" },
            { time: "14:15:20", title: "Rollback approved by you", detail: "Restored v2.17 · 0 downtime", tone: "success", icon: "check" },
            { time: "14:20:53", title: "All checks green", detail: "Latency back to 180ms", tone: "success", icon: "check" },
          ]}
        />
      </Panel>
      <StatRow
        items={[
          { label: "TOTAL IMPACT", value: "18m 42s" },
          { label: "FAILED ORDERS", value: "1,284" },
          { label: "USERS AFFECTED", value: "4.2%" },
          { label: "MTTR", value: "11m" },
        ]}
      />
      <Notice title="Root cause" tone="neutral" icon="info" action={<Action>Draft postmortem</Action>}>
        Connection pool shrank from 32 to 4 in config v2.18. A guardrail now blocks pool sizes below 16.
      </Notice>
      <SceneFooter>Resolved 14:20:53 UTC · no open actions</SceneFooter>
    </div>
  );
}

/* 28 · Task complete --------------------------------------------------- */
export function CompleteScene(_: SceneProps) {
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro
        eyebrow="Ran 7 steps on web-01, web-02 · 1m 52s"
        title="Done. Node 22 is live on both web servers."
        summary="Every health check passed and traffic shifted back without a single dropped request. A restore point is saved if you change your mind."
        icon="circle-check"
      />
      <Panel className="flex w-full flex-col gap-[12px] p-[18px_20px]">
        <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[10px]">
          <span className="font-code text-[10px] font-medium tracking-[1.1px] text-[var(--muted)]">TOTAL RUNTIME</span>
          <Status tone="success">Completed</Status>
        </div>
        <div className="flex flex-row items-end gap-[10px]">
          <span className="font-display text-[42px] leading-none font-semibold tracking-[-1.5px] text-[var(--ink)]">1:52</span>
          <span className="pb-[5px] text-[11.5px] text-[var(--muted)]">38% faster than last upgrade</span>
        </div>
      </Panel>
      <StatRow
        items={[
          { label: "DROPPED REQUESTS", value: "0", note: "12.4k served during rollout" },
          { label: "P95 LATENCY", value: "142 ms", badge: <Status tone="success">↓ 26ms</Status> },
          { label: "HEALTH CHECKS", value: "7/7", note: "All green across 2 hosts" },
          { label: "SNAPSHOT", value: "Saved", note: "pre-upgrade restore point" },
        ]}
      />
      <Steps
        title="Run log"
        detail="Node 22 upgrade · web-01 / web-02"
        progress="1m 52s"
        items={[
          { label: "Snapshot", meta: "0:09", status: "done" },
          { label: "Drain web-01", meta: "0:12", status: "done" },
          { label: "Upgrade web-01", meta: "0:31", status: "done" },
          { label: "Verify web-01", meta: "0:08", status: "done" },
          { label: "Drain web-02", meta: "0:11", status: "done" },
          { label: "Upgrade web-02", meta: "0:29", status: "done" },
          { label: "Restore traffic", meta: "0:12", status: "done" },
        ]}
      />
      <div className="flex w-full flex-row flex-wrap items-center gap-[10px]">
        <Action>View full run log</Action>
        <Action>Roll back to Node 20</Action>
        <Action variant="ghost">Schedule for staging</Action>
      </div>
      <SceneFooter>Completed on web-01 and web-02 · no further action needed</SceneFooter>
    </div>
  );
}

/* 29 · Empty search ---------------------------------------------------- */
export function EmptyScene(_: SceneProps) {
  const suggestions = [
    { name: "payment-worker", detail: "14 errors · last 2h ago", match: "94%" },
    { name: "payments-api", detail: "3 warnings · Sat 11:02", match: "71%" },
    { name: "billing-worker", detail: "0 errors · healthy", match: "48%" },
  ];
  return (
    <div className="flex w-full flex-col gap-[20px]">
      <SceneIntro
        eyebrow="Searched 2.1M log lines across 4 services"
        title='No "payments-worker" errors since Friday.'
        summary="That's either great news, or the name is slightly off. Here's what I looked at and the closest things I found."
        icon="eye"
      />
      <Panel className="flex w-full flex-col gap-[4px] p-[16px_18px]">
        <span className="font-code mb-[6px] text-[10px] font-medium tracking-[1.1px] text-[var(--muted)]">WHAT I SEARCHED</span>
        <div className="grid w-full grid-cols-1 gap-x-[26px] sm:grid-cols-2">
          <KeyValue label="Query" value="payments-worker" />
          <KeyValue label="Services" value="api · billing · queue · web" />
          <KeyValue label="Window" value="Fri 00:00 → now · 62h" />
          <KeyValue label="Sources" value="journald · app logs · nginx" />
        </div>
      </Panel>
      <div className="flex flex-col gap-[10px]">
        <div className="flex flex-row items-center justify-between gap-[10px]">
          <span className="font-code text-[10px] font-medium tracking-[1.1px] text-[var(--muted)]">DID YOU MEAN</span>
          <span className="font-code text-[10px] text-[var(--muted)]">similarity</span>
        </div>
        <Panel className="flex flex-col">
          {suggestions.map((s) => (
            <div key={s.name} className="flex w-full flex-row flex-wrap items-center justify-between gap-[10px] border-b border-[var(--hairline)] px-[16px] py-[12px] last:border-0">
              <div className="flex min-w-0 flex-col gap-[1px]">
                <span className="font-code text-[12px] text-[var(--ink)]">{s.name}</span>
                <span className="text-[11px] text-[var(--muted)]">{s.detail}</span>
              </div>
              <div className="flex flex-row items-center gap-[10px]">
                <div className="h-[5px] w-[80px] overflow-hidden rounded-full bg-[var(--line)]">
                  <div className="bar-fill h-full rounded-full bg-[var(--accent)]" style={{ width: s.match }} />
                </div>
                <span className="font-code text-[11px] text-[var(--muted)]">{s.match}</span>
              </div>
            </div>
          ))}
        </Panel>
      </div>
      <div className="flex w-full flex-row flex-wrap items-center gap-[10px]">
        <Action>Widen to 7 days</Action>
        <Action>Include archived logs</Action>
        <Action variant="ghost">Alert me if it appears</Action>
      </div>
      <SceneFooter>No matching errors found · nothing changed</SceneFooter>
    </div>
  );
}
