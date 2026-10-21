// The live surfaces of the console. Every collector reads the real machine (/proc, systemd, ss, du,
// docker, openssl, journalctl) and returns the data a surface renders. Nothing here is sample data: when
// a source isn't available on this host, a collector says so (`unavailable`) instead of inventing numbers.
import net from "net";
import { join, resolve } from "path";
import { hasProc, samplerFor } from "./metrics.js";
import { machineFor } from "./machine.js";
import { diskScene, filesScene, levelOf, logsScene, processesScene, containersScene } from "./views.js";

const unavailable = (reason, hint) => ({ unavailable: true, reason, ...(hint ? { hint } : {}) });
const round1 = (n) => Math.round(n * 10) / 10;

/** Shared fields of a reading: which machine it came from and when. `ssh` is set for another server. */
const base = async (m, extra = {}) => ({ live: true, host: await m.name(), ...(m.host ? { ssh: m.host } : {}), at: new Date().toISOString(), ...extra });

/* ---------------- CPU ---------------- */
async function topProcesses(m) {
  const res = await m.run("top", ["-b", "-n", "2", "-d", "0.5", "-w", "200", "-o", "%CPU"], { timeout: 6000 });
  if (!res.stdout) return [];
  const blocks = res.stdout.split(/\n\s*\n?(?=top - )/);
  const last = blocks[blocks.length - 1] ?? "";
  const lines = last.split("\n");
  const head = lines.findIndex((l) => /^\s*PID\s+USER/.test(l));
  if (head < 0) return [];
  const rows = [];
  for (const line of lines.slice(head + 1)) {
    const c = line.trim().split(/\s+/);
    if (c.length < 12) continue;
    const command = c.slice(11).join(" ");
    if (command === "top") continue;
    rows.push({ pid: c[0], user: c[1], cpu: Number(c[8].replace(",", ".")), mem: Number(c[9].replace(",", ".")), command });
    if (rows.length === 5) break;
  }
  return rows;
}

async function cpu(m) {
  if (!m.host && !hasProc()) return unavailable("This host doesn't expose /proc, so CPU readings aren't available.");
  const sampler = samplerFor(m);
  if (!(await sampler.ready())) return unavailable("CPU readings aren't available.", sampler.error ? String(sampler.error.message).split("\n")[0] : undefined);
  const latest = sampler.latestCpuSample();
  if (!latest) return unavailable("CPU readings aren't ready yet. Try again in a few seconds.");
  const percent = round1(sampler.recent("cpu", 3) ?? latest.cpu);
  const raw = sampler.raw;
  const [l1, l5, l15] = raw.load.trim().split(/\s+/).map(Number);
  const cores = raw.cores ?? 1;
  const uptimeSeconds = Math.round(Number(raw.uptime.trim().split(/\s+/)[0]) || 0);
  const hist = sampler.history("cpu");
  return {
    data: await base(m, {
      cores,
      model: raw.model,
      percent,
      breakdown: { user: latest.user, system: latest.system, iowait: latest.iowait, steal: latest.steal },
      load: [l1, l5, l15].map((n) => Math.round(n * 100) / 100),
      uptimeSeconds,
      history: hist,
      top: await topProcesses(m),
    }),
    summary: `CPU ${percent}% busy across ${cores} cores, load ${l1.toFixed(2)}.${hist ? ` Peak ${hist.peak}% in the last ${Math.round(hist.spanSeconds / 60)} min.` : ""}`,
  };
}

/* ---------------- Memory ---------------- */
async function memory(m) {
  if (!m.host && !hasProc()) return unavailable("This host doesn't expose /proc, so memory readings aren't available.");
  const sampler = samplerFor(m);
  if (!(await sampler.ready())) return unavailable("Memory readings aren't available.", sampler.error ? String(sampler.error.message).split("\n")[0] : undefined);
  const data = sampler.memorySnapshot(await m.name());
  if (!data) return unavailable("Memory readings aren't ready yet. Try again in a few seconds.");
  return { data: { ...data, ...(m.host ? { ssh: m.host } : {}) }, summary: `Memory ${data.percent}% used, ${Math.round((data.available / 1e9) * 10) / 10} GB available, swap ${data.swapUsed ? "in use" : "idle"}.` };
}

/* ---------------- Network ---------------- */
async function connectionCounts(m) {
  const res = await m.run("ss", ["-s"]);
  const tcp = /TCP:\s+(\d+)\s+\(estab (\d+), closed (\d+), orphaned (\d+), timewait (\d+)\)/.exec(res.stdout);
  const listening = await m.run("ss", ["-ltnH"]);
  return {
    total: tcp ? Number(tcp[1]) : null,
    established: tcp ? Number(tcp[2]) : null,
    timeWait: tcp ? Number(tcp[5]) : null,
    listening: listening.ok ? listening.stdout.split("\n").filter(Boolean).length : null,
  };
}

async function network(m) {
  if (!m.host && !hasProc()) return unavailable("This host doesn't expose /proc, so network readings aren't available.");
  const sampler = samplerFor(m);
  if (!(await sampler.ready())) return unavailable("Network readings aren't available.", sampler.error ? String(sampler.error.message).split("\n")[0] : undefined);
  const ifaces = sampler.net.interfaces.filter((i) => i.name !== "lo");
  if (!ifaces.length) return unavailable("No network interfaces were found.");
  const real = ifaces.filter((i) => !i.virtual);
  const rxBps = sampler.recent("rxBps", 3) ?? 0;
  const txBps = sampler.recent("txBps", 3) ?? 0;
  const errors = real.reduce((n, i) => n + i.rxErrs + i.txErrs, 0);
  const dropped = real.reduce((n, i) => n + i.rxDrop + i.txDrop, 0);
  const primary = [...real].sort((a, b) => b.rxTotal + b.txTotal - (a.rxTotal + a.txTotal))[0];
  const hist = { rx: sampler.history("rxBps"), tx: sampler.history("txBps") };
  const moved = sampler.transferred();
  const connections = await connectionCounts(m);
  return {
    data: await base(m, {
      rxBps,
      txBps,
      primary: primary?.name ?? null,
      interfaces: ifaces.map((i) => ({ name: i.name, virtual: i.virtual, rxBps: i.rxBps, txBps: i.txBps, rxTotal: i.rxTotal, txTotal: i.txTotal, errors: i.rxErrs + i.txErrs, dropped: i.rxDrop + i.txDrop })),
      errors,
      dropped,
      history: hist,
      transferred: moved,
      connections,
    }),
    summary: `Network ${primary?.name ?? "n/a"}: ${((rxBps / 1e6) * 8).toFixed(2)} Mb/s in, ${((txBps / 1e6) * 8).toFixed(2)} Mb/s out, ${errors} errors, ${dropped} dropped, ${connections.established ?? "?"} established connections.`,
  };
}

/* ---------------- Disk / processes / logs / files (shared builders) ---------------- */
async function disk(m) {
  const res = await m.run("df", ["-hP", "-x", "tmpfs", "-x", "devtmpfs", "-x", "squashfs", "-x", "overlay", "-x", "efivarfs"]);
  const view = res.ok ? diskScene("df -h", res.stdout) : null;
  if (!view) return unavailable("Couldn't read filesystem usage with df.");
  const root = view.data.mounts.find((m) => m.mount === "/") ?? view.data.mounts[0];
  return { data: await base(m, view.data), summary: `Disk ${view.data.percent}% full (${view.data.used} of ${view.data.total}) on ${root?.mount}.` };
}

async function processes(m) {
  const res = await m.run("ps", ["aux", "--sort=-%cpu"]);
  const view = res.ok ? processesScene("ps aux --sort=-%cpu", res.stdout) : null;
  if (!view) return unavailable("Couldn't list processes with ps.");
  const top = view.data.rows[0];
  return { data: await base(m, view.data), summary: `${view.data.total} processes, ${view.data.zombies} zombies. Busiest: ${top?.name} at ${top?.cpu}.` };
}

async function logs(m, target) {
  const unit = typeof target === "string" && /^[\w@.\-:]+$/.test(target) ? target : null;
  const args = ["-n", "80", "--no-pager", ...(unit ? ["-u", unit] : [])];
  let res = await m.run("journalctl", args);
  let command = `journalctl ${args.join(" ")}`;
  if (!res.ok || /No journal files were opened/i.test(res.stdout + res.stderr) || !res.stdout.trim()) {
    if (unit) return unavailable(`No log lines found for ${unit}.`);
    res = await m.run("tail", ["-n", "80", "/var/log/syslog"]);
    command = "tail -n 80 /var/log/syslog";
    if (!res.ok || !res.stdout.trim()) return unavailable("Couldn't read the system log. This user may need to be in the adm or systemd-journal group.");
  }
  const view = logsScene(command, res.stdout);
  if (!view) return unavailable("The log had no readable lines.");
  const errors = view.data.lines.filter((l) => l.level === "ERROR").length;
  return { data: await base(m, { ...view.data, source: unit ?? "system" }), summary: `${view.data.lines.length} recent log lines${unit ? ` for ${unit}` : ""}, ${errors} errors.` };
}

async function files(m, target) {
  const path = typeof target === "string" && target.startsWith("/") ? resolve(target) : await m.home();
  if (!(await m.isDir(path))) return unavailable(`${path} is not a directory on ${m.host ? "that server" : "this server"}.`);
  const res = await m.run("ls", ["-lA", path]);
  if (!res.ok && !res.stdout) return unavailable(`Couldn't read ${path}: ${res.stderr.trim().split("\n")[0] || "permission denied"}.`);
  const view = filesScene(`ls -lA ${path}`, res.stdout);
  if (!view) return { data: await base(m, { path, items: [], empty: true, command: `ls -lA ${path}` }), summary: `${path} is empty.` };
  return { data: await base(m, { ...view.data, path }), summary: `${view.data.items.length} items in ${path}.` };
}

/* ---------------- Docker ---------------- */
async function dockerList(m) {
  const res = await m.run("docker", ["ps", "-a", "--format", "{{json .}}"]);
  if (!res.ok) {
    const err = res.stderr.trim();
    const where = m.host ? m.host : "this server";
    if (/not installed/.test(err)) return { error: unavailable(`Docker isn't installed on ${where}.`) };
    if (/permission denied/i.test(err)) {
      return {
        error: unavailable(
          `Docker is installed on ${where}, but this user can't reach it.`,
          m.host ? `Add the account you connect with to the docker group on ${m.host}.` : "Add the user that runs Opsmira to the docker group, then restart the server.",
        ),
      };
    }
    return { error: unavailable("Docker isn't running or didn't answer.", err.split("\n")[0]) };
  }
  const rows = res.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return { rows };
}

async function inventory(m) {
  const { rows, error } = await dockerList(m);
  if (error) return error;
  const mapped = rows.map((c) => ({
    name: c.Names,
    image: c.Image,
    status: String(c.Status).replace(/\s*\(.*$/, ""),
    state: c.State,
    health: /\((healthy|unhealthy|health: starting)\)/.exec(c.Status)?.[1] ?? null,
    ports: c.Ports || "",
    up: c.State === "running",
  }));
  if (!mapped.length) return { data: await base(m, { total: 0, running: 0, rows: [] }), summary: "No containers exist on this server." };
  const running = mapped.filter((r) => r.up).length;
  const rank = (r) => (r.state === "restarting" || r.health === "unhealthy" ? 0 : r.up ? 2 : 1);
  mapped.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return { data: await base(m, { total: mapped.length, running, rows: mapped.slice(0, 14) }), summary: `${mapped.length} containers, ${running} running, ${mapped.filter((r) => rank(r) === 0).length} need attention.` };
}

async function containers(m, target) {
  const { rows, error } = await dockerList(m);
  if (error) return error;
  if (!rows.length) return unavailable("There are no containers on this server to diagnose.");
  const named = typeof target === "string" && target ? rows.find((r) => r.Names === target || r.ID.startsWith(target)) : null;
  const bad = (r) => r.State === "restarting" || /unhealthy/.test(r.Status) || (r.State === "exited" && !/Exited \(0\)/.test(r.Status));
  const pick = named ?? rows.find(bad) ?? rows[0];
  const inspect = await m.run("docker", ["inspect", pick.ID]);
  let state = {};
  let restartCount = 0;
  try {
    const info = JSON.parse(inspect.stdout)[0];
    state = info.State ?? {};
    restartCount = info.RestartCount ?? 0;
  } catch {
    // fall back to the list row
  }
  const logRes = await m.run("docker", ["logs", "--tail", "40", "--timestamps", pick.ID]);
  const lines = (logRes.stdout + logRes.stderr)
    .split("\n")
    .filter(Boolean)
    .slice(-40)
    .map((line) => {
      const ts = /^(\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})\S*)\s+(.*)$/.exec(line);
      const text = ts ? ts[3] : line;
      return { time: ts ? ts[2] : "", level: levelOf(text), source: pick.Names, text };
    });
  const problem = bad(pick);
  return {
    data: await base(m, {
      name: pick.Names,
      image: pick.Image,
      status: pick.Status,
      state: state.Status ?? pick.State,
      health: state.Health?.Status ?? null,
      restarting: !!state.Restarting,
      restartCount,
      exitCode: state.ExitCode ?? null,
      oomKilled: !!state.OOMKilled,
      error: state.Error || null,
      startedAt: state.StartedAt && !state.StartedAt.startsWith("0001") ? state.StartedAt : null,
      finishedAt: state.FinishedAt && !state.FinishedAt.startsWith("0001") ? state.FinishedAt : null,
      problem,
      logs: lines,
      others: rows.length - 1,
    }),
    summary: `${pick.Names} is ${pick.Status}${restartCount ? `, restarted ${restartCount} times` : ""}${state.ExitCode ? `, last exit code ${state.ExitCode}` : ""}. ${lines.filter((l) => l.level === "ERROR").length} error lines in the last ${lines.length}.`,
  };
}

/* ---------------- Services, ports, probes ---------------- */
function probe(port) {
  return new Promise((resolveProbe) => {
    const started = process.hrtime.bigint();
    const socket = net.connect({ host: "127.0.0.1", port, timeout: 800 });
    const done = (up) => {
      socket.destroy();
      resolveProbe({ port, up, ms: up ? Math.max(1, Math.round(Number(process.hrtime.bigint() - started) / 1e6)) : null });
    };
    socket.on("connect", () => done(true));
    socket.on("error", () => done(false));
    socket.on("timeout", () => done(false));
  });
}

/** Whether each port accepts a connection. On another server the check runs there, without a timing. */
export const portProbeScript = (ports) =>
  `for p in ${ports.join(" ")}; do if timeout 1 bash -c "exec 3<>/dev/tcp/127.0.0.1/$p" 2>/dev/null; then echo "$p up"; else echo "$p down"; fi; done`;

async function probePorts(m, ports) {
  if (!m.host) return Promise.all(ports.map(probe));
  const script = portProbeScript(ports);
  const res = await m.run("sh", ["-c", script], { timeout: 15000 });
  const up = new Set(res.stdout.split("\n").filter((l) => l.endsWith(" up")).map((l) => Number(l.split(" ")[0])));
  return ports.map((port) => ({ port, up: up.has(port), ms: null }));
}

async function listeningPorts(m) {
  const res = await m.run("ss", ["-ltunHp"]);
  if (!res.ok && !res.stdout) return null;
  const out = [];
  for (const line of res.stdout.split("\n")) {
    const c = line.trim().split(/\s+/);
    if (c.length < 5) continue;
    const local = c[4];
    const idx = local.lastIndexOf(":");
    const address = local.slice(0, idx).replace(/^\[|\]$/g, "");
    const port = Number(local.slice(idx + 1));
    if (!Number.isFinite(port)) continue;
    const proc = /users:\(\("([^"]+)"/.exec(line)?.[1] ?? null;
    const scope = ["0.0.0.0", "*", "::"].includes(address) ? "all" : /^127\.|^::1$/.test(address) ? "local" : "address";
    out.push({ proto: c[0], address: address === "*" ? "0.0.0.0" : address, port, scope, process: proc });
  }
  return out;
}

async function uptime(m) {
  const sampler = samplerFor(m);
  if (!(await sampler.ready()) || !sampler.raw) return unavailable("Couldn't read this server's uptime.", sampler.error ? String(sampler.error.message).split("\n")[0] : undefined);
  const svc = await m.run("systemctl", ["list-units", "--type=service", "--state=running,failed", "--no-pager", "--no-legend", "--plain"]);
  if (svc.stderr && !svc.stdout && /not installed|System has not been booted/i.test(svc.stderr)) return unavailable(`${m.host ?? "This server"} doesn't use systemd, so services can't be listed.`);
  const running = [];
  const failed = [];
  for (const line of svc.stdout.split("\n")) {
    const sm = /^(\S+\.service)\s+\S+\s+(active|failed|activating|inactive)\s+(\S+)\s*(.*)$/.exec(line.trim());
    if (!sm) continue;
    const entry = { name: sm[1].replace(/\.service$/, ""), description: sm[4] };
    (sm[2] === "failed" ? failed : running).push(entry);
  }
  const ports = (await listeningPorts(m)) ?? [];
  const tcp = [...new Map(ports.filter((p) => p.proto === "tcp" && p.scope !== "address").map((p) => [p.port, p])).values()]
    .sort((a, b) => a.port - b.port)
    .slice(0, 10);
  const answered = await probePorts(m, tcp.map((p) => p.port));
  const probes = answered.map((r, i) => ({ ...r, process: tcp[i].process, scope: tcp[i].scope }));
  const up = Number(sampler.raw.uptime.trim().split(/\s+/)[0]) || 0;
  return {
    data: await base(m, {
      uptimeSeconds: Math.round(up),
      bootAt: new Date(Date.now() - up * 1000).toISOString(),
      load: sampler.raw.load.trim().split(/\s+/).slice(0, 3).map((n) => Math.round(Number(n) * 100) / 100),
      cores: sampler.raw.cores,
      running: running.length,
      services: running.slice(0, 14),
      failed,
      probes,
    }),
    summary: `Up ${Math.floor(up / 86400)}d ${Math.floor((up % 86400) / 3600)}h. ${running.length} services running, ${failed.length} failed${failed.length ? ` (${failed.map((f) => f.name).join(", ")})` : ""}. ${probes.filter((p) => p.up).length} of ${probes.length} listening ports answered.`,
  };
}

/* ---------------- Scheduled jobs ---------------- */
async function readableLines(m, path) {
  return (await m.readFile(path))?.split("\n") ?? [];
}

function cronEntries(lines, source, withUser) {
  const out = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || /^[A-Z_]+=/.test(line)) continue;
    const parts = line.split(/\s+/);
    let schedule;
    let rest;
    if (parts[0].startsWith("@")) {
      schedule = parts[0];
      rest = parts.slice(1);
    } else {
      schedule = parts.slice(0, 5).join(" ");
      rest = parts.slice(5);
    }
    if (!rest.length) continue;
    const user = withUser ? rest.shift() : null;
    out.push({ schedule, command: rest.join(" "), user, source });
  }
  return out;
}

async function jobs(m) {
  const timers = await m.run("systemctl", ["list-timers", "--all", "--no-pager", "--output=json"]);
  let timerList = [];
  try {
    timerList = JSON.parse(timers.stdout)
      .map((t) => ({
        unit: t.unit.replace(/\.timer$/, ""),
        activates: t.activates?.replace(/\.service$/, ""),
        nextAt: t.next ? new Date(t.next / 1000).toISOString() : null,
        lastAt: t.last ? new Date(t.last / 1000).toISOString() : null,
      }))
      .sort((a, b) => String(a.nextAt ?? "9").localeCompare(String(b.nextAt ?? "9")));
  } catch {
    // no systemd timers on this host
  }
  const user = await m.run("crontab", ["-l"]);
  const cron = [
    ...(user.ok ? cronEntries(user.stdout.split("\n"), "your crontab", false) : []),
    ...cronEntries(await readableLines(m, "/etc/crontab"), "/etc/crontab", true),
  ];
  for (const f of (await m.listDir("/etc/cron.d")) ?? []) {
    cron.push(...cronEntries(await readableLines(m, join("/etc/cron.d", f)), `/etc/cron.d/${f}`, true));
  }
  if (!timerList.length && !cron.length) return unavailable("No systemd timers or cron jobs were found on this server.");
  return {
    data: await base(m, { timers: timerList.slice(0, 12), timerCount: timerList.length, cron: cron.slice(0, 12), cronCount: cron.length }),
    summary: `${timerList.length} systemd timers and ${cron.length} cron entries.${timerList[0] ? ` Next up: ${timerList[0].unit} at ${timerList[0].nextAt}.` : ""}`,
  };
}

/* ---------------- Storage cleanup ---------------- */
async function duBytes(m, path) {
  const res = await m.run("du", ["-sb", path], { timeout: 20000 });
  const n = Number(/^(\d+)/.exec(res.stdout.trim())?.[1]);
  return Number.isFinite(n) ? n : null;
}

const PRETTY = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };

async function cleanup(m) {
  const home = await m.home();
  const sources = [
    { id: "apt", label: "Package cache", path: "/var/cache/apt", note: "Downloaded .deb files. Safe to clear, they are fetched again when needed.", ask: "Clean the apt package cache" },
    { id: "tmp", label: "Temporary files", path: "/tmp", note: "Scratch files. Some may belong to running programs.", ask: "Show what is taking space in /tmp" },
    { id: "cache", label: "Your app caches", path: join(home, ".cache"), note: "Per-user caches (browsers, build tools). They rebuild on demand.", ask: "Show the largest folders in ~/.cache" },
    { id: "trash", label: "Trash", path: join(home, ".local/share/Trash"), note: "Files you already deleted.", ask: "Empty the trash" },
    { id: "logs", label: "Log files", path: "/var/log", note: "System and application logs, without the journal below.", ask: "Show the largest files in /var/log" },
  ];
  const items = (await Promise.all(sources.map(async (s) => ({ ...s, bytes: await duBytes(m, s.path) })))).filter((i) => i.bytes !== null);
  const journal = await m.run("journalctl", ["--disk-usage"]);
  const jm = /take up ([\d.]+)([KMGT])/.exec(journal.stdout);
  if (jm) {
    // The journal lives inside /var/log, so take it out of that line to avoid counting it twice.
    const logItem = items.find((i) => i.id === "logs");
    const journalBytes = Math.round(Number(jm[1]) * PRETTY[jm[2]]);
    if (logItem) logItem.bytes = Math.max(0, logItem.bytes - journalBytes);
  }
  if (jm) items.push({ id: "journal", label: "System journal", path: "/var/log/journal", bytes: Math.round(Number(jm[1]) * PRETTY[jm[2]]), note: "Systemd's own log. Can be trimmed to a size limit.", ask: "Trim the system journal to 500 MB" });
  const dock = await m.run("docker", ["system", "df", "--format", "{{json .}}"]);
  if (dock.ok) {
    for (const line of dock.stdout.split("\n").filter(Boolean)) {
      try {
        const d = JSON.parse(line);
        const m = /([\d.]+)\s*([KMGT]?)B/i.exec(d.Reclaimable ?? "");
        if (m && Number(m[1]) > 0) items.push({ id: `docker-${d.Type}`, label: `Docker ${String(d.Type).toLowerCase()}`, path: "docker", bytes: Math.round(Number(m[1]) * (PRETTY[m[2].toUpperCase()] ?? 1)), note: "Reclaimable according to docker.", ask: "Show unused Docker data I can remove" });
      } catch {
        // skip row
      }
    }
  }
  if (!items.length) return unavailable("Couldn't measure any cleanup candidates on this server.");
  items.sort((a, b) => b.bytes - a.bytes);
  const df = await m.run("df", ["-PB1", "/"]);
  const cols = df.stdout.split("\n")[1]?.trim().split(/\s+/);
  const diskInfo = cols ? { total: Number(cols[1]), used: Number(cols[2]), free: Number(cols[3]), percent: Number.parseInt(cols[4], 10) } : null;
  return {
    data: await base(m, { items, disk: diskInfo }),
    summary: `Largest cleanup candidates: ${items.slice(0, 3).map((i) => `${i.label} ${(i.bytes / 1e9).toFixed(1)} GB`).join(", ")}.${diskInfo ? ` Root disk ${diskInfo.percent}% full.` : ""} Nothing was deleted.`,
  };
}

/* ---------------- TLS certificates ---------------- */
const CERT_FIELDS = ["-noout", "-subject", "-issuer", "-enddate", "-ext", "subjectAltName"];

function parseCert(stdout, source) {
  const subject = /subject=.*?CN\s*=\s*([^,\n]+)/.exec(stdout)?.[1]?.trim();
  const issuer = /issuer=.*?(?:O\s*=\s*([^,\n]+)|CN\s*=\s*([^,\n]+))/.exec(stdout);
  const end = /notAfter=(.+)/.exec(stdout)?.[1]?.trim();
  const sans = [...stdout.matchAll(/DNS:([^,\s]+)/g)].map((m) => m[1]);
  const endMs = end ? Date.parse(end.replace(/\s+GMT$/, " UTC")) : NaN;
  if (!Number.isFinite(endMs)) return null;
  return {
    name: subject ?? sans[0] ?? source,
    issuer: (issuer?.[1] ?? issuer?.[2] ?? "unknown").trim(),
    sans: sans.slice(0, 6),
    expiresAt: new Date(endMs).toISOString(),
    daysLeft: Math.floor((endMs - Date.now()) / 86400000),
    source,
  };
}

async function certFromFile(m, path) {
  const res = await m.run("openssl", ["x509", ...CERT_FIELDS, "-in", path]);
  return res.ok ? parseCert(res.stdout, path) : null;
}

async function certFromHost(m, target) {
  const [hostname, port = "443"] = target.split(":");
  const res = await m.run("openssl", ["s_client", "-connect", `${hostname}:${port}`, "-servername", hostname], { input: "", timeout: 9000 });
  const pem = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/.exec(res.stdout)?.[0];
  if (!pem) return { error: `Couldn't open a TLS connection to ${hostname}:${port}.` };
  const parsed = await m.run("openssl", ["x509", ...CERT_FIELDS], { input: pem });
  const cert = parsed.ok ? parseCert(parsed.stdout, `${hostname}:${port}`) : null;
  return cert ? { cert } : { error: `The certificate from ${hostname}:${port} couldn't be read.` };
}

async function tls(m, target) {
  if ((await m.run("openssl", ["version"])).code === null) return unavailable("OpenSSL isn't installed, so certificates can't be read.");
  const certs = [];
  const notes = [];
  if (typeof target === "string" && /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(target)) {
    const r = await certFromHost(m, target);
    if (r.cert) certs.push(r.cert);
    else notes.push(r.error);
  } else {
    const paths = new Set();
    for (const d of (await m.listDir("/etc/letsencrypt/live")) ?? []) paths.add(join("/etc/letsencrypt/live", d, "fullchain.pem"));
    const confs = ["/etc/nginx/nginx.conf"];
    for (const dir of ["/etc/nginx/conf.d", "/etc/nginx/sites-enabled", "/etc/apache2/sites-enabled", "/etc/caddy"]) {
      for (const f of (await m.listDir(dir)) ?? []) confs.push(join(dir, f));
    }
    for (const conf of confs) {
      for (const line of await readableLines(m, conf)) {
        const hit = /^\s*(?:ssl_certificate|SSLCertificateFile)\s+["']?([^;"'\s]+)/.exec(line);
        if (hit && hit[1].startsWith("/")) paths.add(hit[1]);
      }
    }
    for (const p of paths) {
      const cert = await certFromFile(m, p);
      if (cert) certs.push(cert);
      else notes.push(`Couldn't read ${p}`);
    }
  }
  if (!certs.length) {
    return unavailable(
      notes[0] ?? "No certificates were found on this server (checked Let's Encrypt and the nginx, Apache and Caddy configs).",
      "Name a host to check, for example example.com or example.com:8443.",
    );
  }
  certs.sort((a, b) => a.daysLeft - b.daysLeft);
  const soon = certs.filter((c) => c.daysLeft < 21).length;
  return { data: await base(m, { certs, notes }), summary: `${certs.length} certificate${certs.length === 1 ? "" : "s"}; soonest expiry ${certs[0].name} in ${certs[0].daysLeft} days${soon ? `, ${soon} expiring within 3 weeks` : ""}.` };
}

/* ---------------- Exposure: listening ports and the firewall ---------------- */
async function firewall(m) {
  const ports = await listeningPorts(m);
  if (!ports) return unavailable("Couldn't list listening ports (the ss tool is missing).");
  const ufw = await m.run("systemctl", ["is-active", "ufw"]);
  const ufwStatus = ufw.stdout.trim() === "active" ? "active" : ufw.stdout.trim() === "inactive" ? "inactive" : "not installed";
  let rules = null;
  const status = await m.run("ufw", ["status"]);
  if (status.ok) rules = status.stdout.split("\n").slice(4).filter((l) => l.trim());
  const unique = [...new Map(ports.map((p) => [`${p.proto}:${p.address}:${p.port}`, p])).values()].sort((a, b) => a.port - b.port);
  const open = unique.filter((p) => p.scope === "all");
  return {
    data: await base(m, { ufw: ufwStatus, rules, rulesNeedRoot: !status.ok && ufwStatus !== "not installed", ports: unique.slice(0, 40), open: open.length, total: unique.length }),
    summary: `${open.length} of ${unique.length} listening ports accept connections on every interface. Firewall (ufw) is ${ufwStatus}${rules ? "" : "; its rules need root to read"}.`,
  };
}

/* ---------------- Registry ---------------- */
export const SURFACES = [
  { id: "cpu", name: "CPU activity", group: "Diagnostics", description: "Load now, history and the busiest processes", collect: cpu },
  { id: "memory", name: "Memory", group: "Diagnostics", description: "Usage, available memory, swap and history", collect: memory },
  { id: "network", name: "Network traffic", group: "Diagnostics", description: "Throughput, interfaces, errors and connections", collect: network },
  { id: "disk", name: "Disk capacity", group: "Diagnostics", description: "Every mounted filesystem", collect: disk },
  { id: "processes", name: "Running processes", group: "Diagnostics", description: "Top processes by CPU", collect: processes },
  { id: "logs", name: "System logs", group: "Diagnostics", description: "Recent journal lines, optionally one service", collect: logs },
  { id: "files", name: "File explorer", group: "Diagnostics", description: "A directory listing", collect: files },
  { id: "containers", name: "Container diagnosis", group: "Diagnostics", description: "State, restarts and logs of one container", collect: containers },
  { id: "inventory", name: "Container inventory", group: "Diagnostics", description: "All Docker containers", collect: inventory },
  { id: "uptime", name: "Services and uptime", group: "Reliability", description: "Systemd services and port checks", collect: uptime },
  { id: "jobs", name: "Scheduled jobs", group: "Reliability", description: "Systemd timers and cron", collect: jobs },
  { id: "tls", name: "TLS certificates", group: "Reliability", description: "Expiry of local certificates or a host", collect: tls },
  { id: "firewall", name: "Exposure", group: "Reliability", description: "Listening ports and firewall state", collect: firewall },
  { id: "cleanup", name: "Storage cleanup", group: "Operations", description: "Where reclaimable space is", collect: cleanup },
];

export const SURFACE_IDS = SURFACES.map((s) => s.id);
export const surfaceList = () => SURFACES.map(({ collect, ...meta }) => meta);

/**
 * Run a collector on this server or, with `host`, on another one over SSH. Always resolves:
 * { ok:true, scene, data, summary } or { ok:false, scene, reason, hint }.
 */
export async function collectSurface(id, { target, host } = {}) {
  const surface = SURFACES.find((s) => s.id === id);
  if (!surface) return { ok: false, reason: `Unknown surface "${id}".` };
  const m = machineFor(host);
  if (!m) return { ok: false, scene: id, ssh: host, reason: `"${String(host).slice(0, 60)}" isn't a valid server address.`, hint: "Use a name like web1, user@web1 or user@10.0.0.5:2222." };
  const tag = (extra) => ({ ...extra, ...(m.host ? { ssh: m.host } : {}) });
  try {
    const down = await m.check();
    if (down) {
      const d = typeof down === "string" ? { reason: down } : down;
      return { ok: false, scene: id, ...tag({}), reason: d.reason, hint: d.hint };
    }
    const result = await surface.collect(m, target);
    if (result.unavailable) return { ok: false, scene: id, ...tag({}), reason: result.reason, hint: result.hint };
    return { ok: true, scene: id, data: { ...result.data, collected: true, ...(target ? { target } : {}) }, summary: result.summary };
  } catch (err) {
    return { ok: false, scene: id, ...tag({}), reason: `Couldn't read this from ${m.host ?? "the server"}: ${err.message}` };
  }
}
