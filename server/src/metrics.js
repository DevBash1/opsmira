// Samplers: CPU, memory and network readings every few seconds, kept for an hour. History in the console
// comes from here. This server has one that runs from boot (and survives restarts); another server gets one
// when someone first looks at it, reading over SSH, and it stops after a few idle minutes.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { env } from "./env.js";
import os from "os";
import { localMachine } from "./machine.js";

const FILE = join(env.dataDir, "metrics.json");
const INTERVAL_MS = 5000;
const MAX_SAMPLES = 720;
const IDLE_STOP_MS = 10 * 60 * 1000;
export const startedAt = Date.now();

const VIRTUAL = /^(lo|docker\d*|veth.*|br-.*|virbr.*|tun\d*|tap.*)$/;

/* ---- parsing /proc text (the same whether it was read here or over ssh) ---- */
function parseCpu(text) {
  const line = text.split("\n").find((l) => l.startsWith("cpu ")) ?? "";
  const f = line.trim().split(/\s+/).slice(1).map(Number);
  if (f.length < 4 || f.some(Number.isNaN)) return null;
  const [user, nice, system, idle, iowait, irq, softirq, steal] = f;
  return { user: user + nice, system: system + (irq || 0) + (softirq || 0), idle, iowait: iowait || 0, steal: steal || 0, total: f.slice(0, 8).reduce((a, b) => a + b, 0) };
}

function parseNet(text) {
  const out = {};
  for (const line of text.split("\n").slice(2)) {
    const [name, rest] = line.split(":");
    if (!rest) continue;
    const f = rest.trim().split(/\s+/).map(Number);
    out[name.trim()] = { rx: f[0], rxErrs: f[2], rxDrop: f[3], tx: f[8], txErrs: f[10], txDrop: f[11] };
  }
  return out;
}

export function parseMeminfo(text) {
  const m = {};
  for (const line of text.split("\n")) {
    const match = /^(\w+):\s+(\d+)/.exec(line);
    if (match) m[match[1]] = Number(match[2]) * 1024;
  }
  return m;
}

/** One shell run that returns everything a tick needs, so a remote tick is a single ssh exec. */
const REMOTE_TICK =
  "cat /proc/stat; echo; echo --opsmira--; cat /proc/meminfo; echo --opsmira--; cat /proc/net/dev; echo --opsmira--; cat /proc/loadavg /proc/uptime; echo --opsmira--; grep -c ^processor /proc/cpuinfo; grep -m1 'model name' /proc/cpuinfo";

async function readRaw(machine) {
  if (!machine.host) {
    return {
      stat: readFileSync("/proc/stat", "utf8"),
      mem: readFileSync("/proc/meminfo", "utf8"),
      net: readFileSync("/proc/net/dev", "utf8"),
      load: readFileSync("/proc/loadavg", "utf8"),
      uptime: readFileSync("/proc/uptime", "utf8"),
      cores: os.cpus().length,
      model: os.cpus()[0]?.model?.replace(/\s+/g, " ").trim() ?? null,
    };
  }
  const r = await machine.run("sh", ["-c", REMOTE_TICK], { timeout: 9000 });
  if (!r.ok) throw Object.assign(new Error(r.stderr || "no answer"), { stderr: r.stderr });
  const [stat, mem, net, lu, cpuinfo] = r.stdout.split(/\n?--opsmira--\n/);
  const [load, uptime] = (lu ?? "").trim().split("\n");
  const lines = (cpuinfo ?? "").trim().split("\n");
  return { stat, mem, net, load: load ?? "", uptime: uptime ?? "", cores: Number(lines[0]) || null, model: /model name\s*:\s*(.+)/.exec(lines[1] ?? "")?.[1]?.trim() ?? null };
}

class Sampler {
  constructor(machine, { persist = false } = {}) {
    this.machine = machine;
    this.persist = persist;
    this.samples = [];
    this.prevCpu = null;
    this.prevNet = null;
    this.prevAt = 0;
    this.net = { at: 0, interfaces: [] };
    this.raw = null;
    this.mem = null;
    this.error = null;
    this.timer = null;
    this.lastUsed = Date.now();
    this.ticking = false;
  }

  touch() {
    this.lastUsed = Date.now();
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = Date.now();
      const raw = await readRaw(this.machine);
      const cpu = parseCpu(raw.stat);
      const net = parseNet(raw.net);
      const mem = parseMeminfo(raw.mem);
      if (!cpu || !mem.MemTotal) throw new Error("unreadable /proc");
      const sample = { t: now, mem: Math.round(((mem.MemTotal - (mem.MemAvailable ?? mem.MemFree)) / mem.MemTotal) * 1000) / 10 };

      if (this.prevCpu) {
        const dt = cpu.total - this.prevCpu.total;
        if (dt > 0) {
          const pct = (a, b) => Math.round(((a - b) / dt) * 1000) / 10;
          sample.cpu = Math.round((1 - (cpu.idle + cpu.iowait - this.prevCpu.idle - this.prevCpu.iowait) / dt) * 1000) / 10;
          sample.user = pct(cpu.user, this.prevCpu.user);
          sample.system = pct(cpu.system, this.prevCpu.system);
          sample.iowait = pct(cpu.iowait, this.prevCpu.iowait);
          sample.steal = pct(cpu.steal, this.prevCpu.steal);
        }
      }

      let rxTotal = 0;
      let txTotal = 0;
      const interfaces = [];
      const secs = (now - this.prevAt) / 1000;
      for (const [name, c] of Object.entries(net)) {
        const p = this.prevNet?.[name];
        const rxBps = p && secs > 0 ? Math.max(0, (c.rx - p.rx) / secs) : 0;
        const txBps = p && secs > 0 ? Math.max(0, (c.tx - p.tx) / secs) : 0;
        interfaces.push({ name, virtual: VIRTUAL.test(name), rxBps, txBps, rxTotal: c.rx, txTotal: c.tx, rxErrs: c.rxErrs, txErrs: c.txErrs, rxDrop: c.rxDrop, txDrop: c.txDrop });
        if (!VIRTUAL.test(name)) {
          rxTotal += c.rx;
          txTotal += c.tx;
          if (p) {
            sample.rxBps = (sample.rxBps ?? 0) + rxBps;
            sample.txBps = (sample.txBps ?? 0) + txBps;
          }
        }
      }
      sample.rxTotal = rxTotal;
      sample.txTotal = txTotal;
      this.net = { at: now, interfaces };
      this.samples.push(sample);
      if (this.samples.length > MAX_SAMPLES) this.samples.shift();
      this.prevCpu = cpu;
      this.prevNet = net;
      this.prevAt = now;
      this.raw = raw;
      this.mem = mem;
      this.error = null;
    } catch (err) {
      // Not Linux, or the host stopped answering: readers see `error` and report unavailable.
      this.error = err;
    } finally {
      this.ticking = false;
    }
  }

  start() {
    if (this.timer) return;
    if (this.persist) this.restore();
    this.tick();
    setTimeout(() => this.tick(), 1000).unref();
    this.timer = setInterval(() => {
      if (!this.persist && Date.now() - this.lastUsed > IDLE_STOP_MS) return this.stop();
      this.tick();
    }, INTERVAL_MS);
    this.timer.unref();
    if (this.persist) {
      const saver = setInterval(() => this.save(), 60_000);
      saver.unref();
      process.on("exit", () => this.save());
      process.on("SIGTERM", () => {
        this.save();
        process.exit(0);
      });
    }
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  save() {
    try {
      if (!existsSync(dirname(FILE))) mkdirSync(dirname(FILE), { recursive: true });
      writeFileSync(FILE, JSON.stringify(this.samples));
    } catch {
      // history just won't survive a restart
    }
  }

  /** Readings from before a restart still count: load what is recent enough to show. */
  restore() {
    try {
      const saved = JSON.parse(readFileSync(FILE, "utf8"));
      const cutoff = Date.now() - MAX_SAMPLES * INTERVAL_MS;
      if (Array.isArray(saved)) this.samples.push(...saved.filter((s) => s && typeof s.t === "number" && s.t >= cutoff));
    } catch {
      // nothing saved yet
    }
  }

  /** Make sure at least one interval has been measured (right after boot, or on first look at a server). */
  async ready() {
    this.touch();
    this.start();
    for (let i = 0; i < 6; i++) {
      if (this.raw && this.samples.some((s) => s.cpu !== undefined)) return true;
      if (this.error && i > 1) break;
      await new Promise((r) => setTimeout(r, i === 0 ? 300 : 700));
      await this.tick();
    }
    return !!this.raw;
  }

  recent(field, n = 3) {
    const v = this.samples.slice(-n).map((s) => s[field]).filter((x) => typeof x === "number");
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }

  latestCpuSample() {
    return [...this.samples].reverse().find((s) => s.cpu !== undefined) ?? null;
  }

  /**
   * The last `windowMs` of one field, averaged into at most `buckets` bars. Null until a minute of
   * samples exists. `from`/`to` are real timestamps of the first and last bucket.
   */
  history(field, { windowMs = 30 * 60 * 1000, buckets = 60 } = {}) {
    const now = Date.now();
    const points = this.samples.filter((s) => typeof s[field] === "number" && s.t >= now - windowMs);
    if (points.length < 12) return null;
    const start = points[0].t;
    const bucketMs = Math.max(INTERVAL_MS, Math.ceil((now - start) / buckets));
    const groups = new Map();
    for (const s of points) {
      const k = Math.floor((s.t - start) / bucketMs);
      const g = groups.get(k) ?? { sum: 0, n: 0, t: s.t };
      g.sum += s[field];
      g.n += 1;
      groups.set(k, g);
    }
    const ordered = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => ({ t: g.t, v: g.sum / g.n }));
    const values = ordered.map((p) => Math.round(p.v * 10) / 10);
    const peakIndex = values.indexOf(Math.max(...values));
    return {
      values,
      from: new Date(ordered[0].t).toISOString(),
      to: new Date(ordered[ordered.length - 1].t).toISOString(),
      spanSeconds: Math.round((ordered[ordered.length - 1].t - ordered[0].t) / 1000),
      average: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
      peak: values[peakIndex],
      peakAt: new Date(ordered[peakIndex].t).toISOString(),
    };
  }

  /** Bytes transferred (non-virtual interfaces) over the sampled window. */
  transferred(windowMs = 30 * 60 * 1000) {
    const now = Date.now();
    const inWin = this.samples.filter((s) => s.t >= now - windowMs && typeof s.rxTotal === "number");
    if (inWin.length < 2) return null;
    const a = inWin[0];
    const b = inWin[inWin.length - 1];
    return { rx: Math.max(0, b.rxTotal - a.rxTotal), tx: Math.max(0, b.txTotal - a.txTotal), seconds: Math.round((b.t - a.t) / 1000) };
  }

  /** The numbers behind the memory surface, from the newest reading. */
  memorySnapshot(host) {
    const m = this.mem;
    if (!m?.MemTotal) return null;
    const total = m.MemTotal;
    const available = m.MemAvailable ?? m.MemFree;
    const used = total - available;
    return {
      live: true,
      host,
      at: new Date(this.net.at || Date.now()).toISOString(),
      percent: Math.round((used / total) * 100),
      total,
      used,
      available,
      cached: (m.Cached ?? 0) + (m.SReclaimable ?? 0),
      buffers: m.Buffers ?? 0,
      shared: m.Shmem ?? 0,
      swapTotal: m.SwapTotal ?? 0,
      swapUsed: (m.SwapTotal ?? 0) - (m.SwapFree ?? 0),
      history: this.history("mem"),
    };
  }
}

const local = new Sampler(localMachine(), { persist: true });
const remote = new Map();

export const localSampler = () => local;
export const startSampler = () => local.start();

/** The sampler for a machine: the permanent one here, or a lazily started one for an ssh host. */
export function samplerFor(machine) {
  if (!machine.host) return local;
  let s = remote.get(machine.host);
  if (!s) {
    // Keep a handful at most, dropping idle ones first.
    if (remote.size >= 6) {
      const oldest = [...remote.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
      oldest[1].stop();
      remote.delete(oldest[0]);
    }
    s = new Sampler(machine);
    remote.set(machine.host, s);
  }
  s.touch();
  s.start();
  return s;
}

export const hasProc = () => {
  try {
    readFileSync("/proc/stat");
    return true;
  } catch {
    return false;
  }
};

/** Local, synchronous memory reading for the `free` inspect view. */
export function readMeminfo() {
  return parseMeminfo(readFileSync("/proc/meminfo", "utf8"));
}

export function memorySnapshot() {
  if (!local.mem) local.mem = readMeminfo();
  return local.memorySnapshot(os.hostname());
}
