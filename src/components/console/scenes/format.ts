/** Number and time formatting for surfaces. Everything shown comes from the server's readings. */

export function bytes(n: number | null | undefined, digits = 1): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "n/a";
  if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(digits)} TB`;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(digits)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(n >= 100 * 1024 ** 2 ? 0 : digits)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${Math.round(n)} B`;
}

/** Bytes per second shown as bits per second, the way network speeds are quoted. */
export function bitRate(bytesPerSecond: number | null | undefined): string {
  if (typeof bytesPerSecond !== "number" || !Number.isFinite(bytesPerSecond)) return "n/a";
  const bits = bytesPerSecond * 8;
  if (bits >= 1e9) return `${(bits / 1e9).toFixed(2)} Gb/s`;
  if (bits >= 1e6) return `${(bits / 1e6).toFixed(bits >= 1e7 ? 1 : 2)} Mb/s`;
  if (bits >= 1e3) return `${Math.round(bits / 1e3)} Kb/s`;
  return `${Math.round(bits)} b/s`;
}

export function clock(iso?: string | null, seconds = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hour12: false });
}

export function dateTime(iso?: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "never";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "in 9 min" / "35 s ago" from an ISO time. */
export function relative(iso?: string | null): string {
  if (!iso) return "never";
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const unit = abs < 90e3 ? `${Math.max(1, Math.round(abs / 1e3))} s` : abs < 90 * 60e3 ? `${Math.round(abs / 60e3)} min` : abs < 36 * 3600e3 ? `${Math.round(abs / 3600e3)} h` : `${Math.round(abs / 86400e3)} d`;
  return diff >= 0 ? `in ${unit}` : `${unit} ago`;
}

export function duration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Axis labels for a history series: first, middle and last bucket times. */
export function historyLabels(h: { from: string; to: string } | null | undefined): string[] | undefined {
  if (!h) return undefined;
  const a = new Date(h.from).getTime();
  const b = new Date(h.to).getTime();
  return [clock(h.from), clock(new Date(a + (b - a) / 2).toISOString()), "Now"];
}

export function historyNote(h: { spanSeconds: number } | null | undefined, what: string, remote = false): string {
  if (!h) return remote ? `${what} history starts when you first look at this server and builds while you watch. Give it a minute.` : `${what} history builds up while the server runs. Check back in a minute.`;
  return `${what} over the last ${h.spanSeconds >= 90 ? `${Math.round(h.spanSeconds / 60)} minutes` : "minute"}, measured on this server.`;
}
