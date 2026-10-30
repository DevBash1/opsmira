// What this console is, how it was installed, and whether a newer Opsmira exists. The check asks GitHub every
// few hours: a release build compares its version with the latest release, an `edge` build (the current main
// branch) compares its commit with main. OPSMIRA_UPDATE_CHECK=off turns it off.
import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { env } from "./env.js";

const REPO = process.env.OPSMIRA_UPDATE_REPO || "DevBash1/opsmira";
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const APP_DIR = join(env.agentDir, "..");
const off = () => /^(0|off|false|no)$/i.test(process.env.OPSMIRA_UPDATE_CHECK ?? "");

function git(...args) {
  try {
    return execFileSync("git", ["-C", APP_DIR, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).trim();
  } catch {
    return "";
  }
}

let build = null;
/** This build: version, commit, channel, and how it runs (which decides how it is updated). */
export function buildInfo() {
  if (build) return build;
  let version = process.env.OPSMIRA_VERSION || "";
  if (!version) {
    try {
      version = JSON.parse(readFileSync(join(APP_DIR, "package.json"), "utf8")).version;
    } catch {
      version = "unknown";
    }
  }
  const hasGit = existsSync(join(APP_DIR, ".git"));
  const commit = process.env.OPSMIRA_COMMIT || (hasGit ? git("rev-parse", "HEAD") : "");
  const tag = hasGit ? git("describe", "--tags", "--exact-match") : "";
  if (tag && !process.env.OPSMIRA_VERSION) version = tag.replace(/^v/, "");
  // A release is built from a version tag; anything else follows main.
  const channel = process.env.OPSMIRA_CHANNEL || (tag ? "release" : commit ? "edge" : "release");
  let install = "source";
  let namespace = null;
  if (process.env.KUBERNETES_SERVICE_HOST) {
    install = "kubernetes";
    try {
      namespace = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/namespace", "utf8").trim();
    } catch {
      namespace = process.env.POD_NAMESPACE || null;
    }
  } else if (existsSync("/.dockerenv")) install = "docker";
  // The native installer clones into <dir>/app and runs it as a systemd service.
  else if (process.env.OPSMIRA_INSTALL === "systemd" || (process.env.INVOCATION_ID && /\/app$/.test(APP_DIR))) install = "systemd";
  const host = process.env.HOSTNAME || "";
  build = {
    version: String(version).replace(/^v/, ""),
    commit: commit || null,
    channel,
    install,
    image: process.env.OPSMIRA_IMAGE || (install === "docker" || install === "kubernetes" ? `ghcr.io/devbash1/opsmira:${channel === "edge" ? "edge" : "latest"}` : null),
    // In Kubernetes the pod is <deployment>-<replicaset hash>-<pod hash>; in Docker HOSTNAME is the container id.
    namespace,
    deployment: install === "kubernetes" ? host.split("-").slice(0, -2).join("-") || null : null,
    container: install === "docker" ? host || null : null,
    dir: install === "systemd" || install === "source" ? APP_DIR : null,
  };
  return build;
}

/** -1, 0 or 1, for dotted versions (1.10.0 > 1.9.2). */
export function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, "").split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, "").split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0) ? 1 : -1;
  }
  return 0;
}

async function github(path) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "opsmira-update-check" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return res.json();
}

let status = { available: false, latest: null, checkedAt: null, error: null };
let checking = null;

/** Ask GitHub now. Never throws: a failed check is reported in `error`. */
export function checkForUpdate() {
  if (off()) return Promise.resolve(status);
  checking ??= (async () => {
    const b = buildInfo();
    try {
      if (b.channel === "edge" && b.commit) {
        const cmp = await github(`/compare/${b.commit}...main`);
        const last = cmp.commits?.at(-1);
        status = {
          available: cmp.ahead_by > 0,
          latest: { commit: last?.sha ?? null, behind: cmp.ahead_by ?? 0, label: cmp.ahead_by > 0 ? `main @ ${(last?.sha ?? "").slice(0, 7)}` : null, url: cmp.html_url ?? null, notes: (cmp.commits ?? []).slice(-8).map((c) => c.commit?.message?.split("\n")[0]).filter(Boolean) },
          checkedAt: new Date().toISOString(),
          error: null,
        };
      } else {
        const rel = await github("/releases/latest");
        const tag = String(rel.tag_name ?? "");
        status = {
          available: !!tag && compareVersions(tag, b.version) > 0,
          latest: { version: tag.replace(/^v/, ""), label: tag, url: rel.html_url ?? null, notes: String(rel.body ?? "").split("\n").filter((l) => l.trim()).slice(0, 8) },
          checkedAt: new Date().toISOString(),
          error: null,
        };
      }
    } catch (err) {
      status = { ...status, checkedAt: new Date().toISOString(), error: err.message };
    } finally {
      checking = null;
    }
    return status;
  })();
  return checking;
}

/** The last result, with this build; starts a check in the background when the last one is old. */
export function updateStatus() {
  const stale = !status.checkedAt || Date.now() - Date.parse(status.checkedAt) > CHECK_EVERY_MS;
  if (stale && !off()) checkForUpdate();
  return { current: buildInfo(), ...status, enabled: !off() };
}

/**
 * Instructions for the agent: how this console runs and how it is updated. An update restarts the console, which
 * cuts a turn that runs it from here, so it runs detached on the machine that hosts the console.
 */
export function selfUpdateNote() {
  const b = buildInfo();
  const s = status;
  const latest = s.available ? `An update is available: ${s.latest?.label}${s.latest?.behind ? ` (${s.latest.behind} commits newer)` : ""}.` : "No update is known to be available.";
  const how = {
    kubernetes: `It runs in Kubernetes (namespace ${b.namespace ?? "?"}, deployment ${b.deployment ?? "?"}, image ${b.image}). Update it from a machine with kubectl for that cluster: ${b.channel === "edge" ? `kubectl -n ${b.namespace} rollout restart deployment/${b.deployment} (the :edge tag is pulled again)` : `kubectl -n ${b.namespace} set image deployment/${b.deployment} opsmira=ghcr.io/devbash1/opsmira:${s.latest?.version ?? "<version>"} (check the container name with kubectl get deploy -o yaml first)`}, then kubectl -n ${b.namespace} rollout status deployment/${b.deployment} --timeout=300s.`,
    docker: `It runs in Docker (container ${b.container ?? "?"}, image ${b.image}). Update it on the Docker host: if it was installed with the installer, run curl -fsSL https://devbash1.github.io/opsmira/install.sh | sh (it pulls the image and recreates the container, keeping settings and data); otherwise docker pull the image and recreate the container with the same options (docker inspect it first).`,
    systemd: `It runs as a systemd service from ${b.dir}. Update it by running the installer again on that machine: curl -fsSL https://devbash1.github.io/opsmira/install.sh | sh -s -- --mode native (it fetches the code, rebuilds and restarts the service, keeping settings and data).`,
    source: `It runs from a checkout at ${b.dir}. Update it there with git pull, npm run setup, npm run build, then restart it the way it is started.`,
  }[b.install];
  return `

Updating Opsmira itself (when the owner asks): this console is Opsmira ${b.version}${b.commit ? ` (${b.commit.slice(0, 7)}, ${b.channel})` : ""}. ${latest} ${how}
- Updating restarts the console, which ends any turn running it from here and kills its command halfway. So never run the update with propose_action from this console: run it with detach on the server that hosts the console (or the one with kubectl for its cluster), which needs that server connected with opsmira-agent in operate access. If there is none, give the owner the exact commands to run themselves, and say the console will be unreachable for a minute.
- In the detached run: note the current version first, run the update, wait until the console answers again (curl its URL), and roll back if it does not come back (the previous image tag or commit).
- Afterwards connected agents update themselves to the agent the new console ships; nothing to do for them.`;
}
