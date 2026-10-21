/**
 * Turns read-only inspection output into the structured payloads the console's
 * dynamic surfaces render. Only well-understood, read-only commands are mapped;
 * everything else falls back to the plain tool output.
 */

import { memorySnapshot } from "./metrics.js";

const ANSI = /\x1b\[[0-9;]*m/g;

function clean(output) {
  return String(output || "").replace(ANSI, "");
}

function toBytes(value) {
  const match = /^([\d.]+)\s*([KMGTP]?i?B?)$/i.exec(String(value).trim());
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (match[2] || "B").toLowerCase();
  const multipliers = {
    b: 1,
    k: 1e3,
    kb: 1e3,
    ki: 1024,
    m: 1e6,
    mb: 1e6,
    mi: 1024 ** 2,
    g: 1e9,
    gb: 1e9,
    gi: 1024 ** 3,
    t: 1e12,
    tb: 1e12,
    ti: 1024 ** 4,
  };
  return n * (multipliers[unit] ?? 1);
}

function fmtBytes(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes)} B`;
}

/** Memory comes straight from /proc/meminfo, whatever flags the command used. */
function memoryScene() {
  return { scene: "memory", data: memorySnapshot() };
}

export function diskScene(command, output) {
  const rows = [];
  for (const line of output.split("\n").slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 6) continue;
    const percent = Number.parseInt(cols.find((c) => /^\d+%$/.test(c)) || "", 10);
    if (!Number.isFinite(percent)) continue;
    rows.push({
      filesystem: cols[0],
      size: cols[1],
      used: cols[2],
      avail: cols[3],
      percent,
      mount: cols.slice(5).join(" "),
    });
  }
  if (!rows.length) return null;
  const root = rows.find((row) => row.mount === "/") ?? rows[0];
  return {
    scene: "disk",
    data: {
      live: true,
      percent: root.percent,
      used: root.used,
      total: root.size,
      mounts: rows.slice(0, 6),
      command,
    },
  };
}

export function processesScene(command, output) {
  const lines = output.split("\n").filter((line) => line.trim());
  const header = lines.findIndex((line) => /^\s*USER\s+PID\s+%CPU/.test(line));
  if (header < 0) return null;

  const parsed = [];
  for (const line of lines.slice(header + 1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 11) continue;
    const rss = Number(cols[5]) * 1024; // ps aux reports RSS in KiB
    parsed.push({
      user: cols[0],
      pid: cols[1],
      cpu: cols[2],
      state: cols[7].startsWith("R")
        ? "Running"
        : cols[7].startsWith("Z")
          ? "Zombie"
          : cols[7].startsWith("T")
            ? "Stopped"
            : cols[7].startsWith("S")
              ? "Sleeping"
              : cols[7],
      command: cols.slice(10).join(" "),
      mem: Number.isFinite(rss) && rss > 0 ? fmtBytes(rss) : `${cols[3]}%`,
    });
  }
  // The inspection command itself (and any grep/awk wrapper) is often the
  // top CPU row for a split second — it is noise, not a finding.
  const visible = parsed.filter((p) => !/^\s*(?:ps|grep|awk|sort|head|tail)\b/.test(p.command));
  if (!visible.length) return null;

  const count = (prefix) => visible.filter((p) => p.state.startsWith(prefix)).length;
  const simplify = (cmd) => {
    const [bin, ...rest] = cmd.split(" ");
    const base = bin.split("/").filter(Boolean).pop() || bin;
    const detail = rest.filter((part) => !part.startsWith("-")).slice(0, 1).join(" ");
    return detail ? `${base} · ${detail}` : base;
  };

  return {
    scene: "processes",
    data: {
      live: true,
      total: visible.length,
      running: count("R"),
      sleeping: count("S"),
      zombies: count("Z"),
      rows: visible.slice(0, 5).map((p) => ({
        name: simplify(p.command),
        pid: p.pid,
        user: p.user,
        cpu: `${p.cpu}%`,
        mem: p.mem,
        state: p.state,
      })),
      command,
    },
  };
}

export function containersScene(command, output) {
  const rows = [];
  for (const line of output.split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5 || /^CONTAINER/i.test(line)) continue;
    const name = cols[cols.length - 1];
    const image = cols[1];
    const statusStart = cols.findIndex((col) => /^(Up|Restarting|Exited|Created|Paused|Dead)$/.test(col));
    const status =
      statusStart >= 0
        ? cols
            .slice(statusStart, Math.min(statusStart + 3, cols.length - 1))
            .join(" ")
            .replace(/\s*\(.*$/, "")
        : "Running";
    if (!name || !image) continue;
    rows.push({ name, image, status, up: /^Up\b/i.test(status) });
  }
  if (!rows.length) return null;
  return {
    scene: "inventory",
    data: {
      live: true,
      total: rows.length,
      running: rows.filter((row) => row.up).length,
      rows: rows.slice(0, 10),
      command,
    },
  };
}

export function levelOf(text) {
  if (/\b(error|failed|failure|fatal|panic|refused|timed out)\b/i.test(text)) return "ERROR";
  if (/\b(warn|warning|slow|retry|timeout)\b/i.test(text)) return "WARN";
  return "INFO";
}

export function logsScene(command, output) {
  const parsed = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const syslog = /^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+\S+\s+([^:]+):\s*(.*)$/.exec(line);
    if (syslog) {
      parsed.push({
        time: syslog[1].replace(/^\w{3}\s+\d{1,2}\s+/, ""),
        source: syslog[2].trim(),
        text: syslog[3],
        level: levelOf(syslog[3]),
      });
      continue;
    }
    const app = /^(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+(INFO|WARN|WARNING|ERROR|DEBUG|TRACE)?\s*([\w./[\]-]+)?\s*(.*)$/.exec(line);
    if (app) {
      const level = (app[2] || levelOf(app[4])).replace("WARNING", "WARN");
      parsed.push({
        time: app[1],
        source: app[3] || "log",
        text: app[4] || app[2] || line,
        level: level === "WARNING" ? "WARN" : level,
      });
      continue;
    }
    parsed.push({ time: "", source: "log", text: line, level: levelOf(line) });
  }
  if (!parsed.length) return null;
  return {
    scene: "logs",
    data: { live: true, lines: parsed.slice(-40), command },
  };
}

export function filesScene(command, output) {
  const items = [];
  for (const line of output.split("\n")) {
    const match = /^([-dl])\S{9}\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\w{3}\s+\d{1,2}\s+[\d:]+)\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const name = match[4].replace(/^.*\s+->\s+/, "");
    if (!name || name === "." || name === "..") continue;
    items.push({
      dir: match[1] === "d",
      name,
      size: match[1] === "d" ? "—" : fmtBytes(Number(match[2])),
      modified: match[3],
    });
  }
  if (!items.length) return null;
  const arg = command
    .replace(/^ls\b/, "")
    .split(/\s+/)
    .filter((part) => part && !part.startsWith("-"))
    .join(" ");
  return {
    scene: "files",
    data: { live: true, path: arg || "/srv", items: items.slice(0, 10), command },
  };
}

export function deriveScene(command, run) {
  if (!run || run.exitCode !== 0) return null;
  const output = clean(run.output);
  if (!output.trim()) return null;
  const cmd = String(command || "").trim();
  if (!cmd) return null;

  // Only a plain command is read as a known kind of output. A chain (`a; b`, `a && b`), a wrapper such as
  // ssh, or a pipe into anything but a trimming filter can print something else entirely, and reading
  // those by keyword gave scenes that did not match (a file list titled with half an ssh command).
  if (/;|&&|\|\||`|\$\(|>/.test(cmd.replace(/\b\d?>&\d\b|\d?>\s*\/dev\/null/g, ""))) return null;
  const stages = cmd.split("|").map((part) => part.trim());
  if (stages.slice(1).some((part) => !/^(head|tail|sort|grep|wc)\b/.test(part))) return null;
  const words = stages[0].replace(/^sudo\s+/, "").split(/\s+/);
  const program = words[0].replace(/^.*\//, "");
  const rest = words.slice(1).join(" ");

  try {
    if (program === "free") return memoryScene();
    if (program === "df") return diskScene(cmd, output);
    if (program === "docker" && /^ps(\s|$)/.test(rest)) return containersScene(cmd, output);
    if (program === "ps") return processesScene(cmd, output);
    if (program === "journalctl") return logsScene(cmd, output);
    if ((program === "tail" || program === "cat") && /\/var\/log\//.test(rest)) return logsScene(cmd, output);
    if (program === "ls") return filesScene(cmd, output);
  } catch {
    return null;
  }
  return null;
}
