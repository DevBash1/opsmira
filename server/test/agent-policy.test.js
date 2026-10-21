// The agent is a separate file that decides what it will run. These checks keep it in step with the
// scripts and programs the console's surfaces actually send, and prove read-only refuses the rest.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
const { denied, KNOWN_SHELL_SCRIPTS } = await import("../../agent/opsmira-agent.mjs");
const { REMOTE_TICK } = await import("../src/metrics.js");
const { portProbeScript } = await import("../src/surfaces.js");
const { HOME_SCRIPT } = await import("../src/machine.js");

const readOnly = (file, args = []) => denied("read-only", file, args);

test("the scripts the console sends are allowed in read-only mode", () => {
  assert.equal(readOnly("sh", ["-c", REMOTE_TICK]), null);
  assert.equal(readOnly("sh", ["-c", HOME_SCRIPT]), null);
  assert.equal(readOnly("sh", ["-c", portProbeScript([22, 80, 443, 5432])]), null);
  assert.ok(KNOWN_SHELL_SCRIPTS.includes(REMOTE_TICK) && KNOWN_SHELL_SCRIPTS.includes(HOME_SCRIPT));
});

test("the read-only commands the surfaces use are allowed", () => {
  const calls = [
    ["top", ["-b", "-n", "2"]],
    ["journalctl", ["-n", "80", "--no-pager"]],
    ["docker", ["ps", "-a", "--format", "{{json .}}"]],
    ["docker", ["system", "df", "--format", "{{json .}}"]],
    ["systemctl", ["list-units", "--type=service", "--no-pager"]],
    ["systemctl", ["list-timers", "--all"]],
    ["crontab", ["-l"]],
    ["du", ["-sb", "/var/log"]],
    ["openssl", ["x509", "-noout", "-in", "/etc/x.pem"]],
    ["ufw", ["status"]],
    ["ss", ["-ltunHp"]],
    ["cat", ["/proc/meminfo"]],
  ];
  for (const [file, args] of calls) assert.equal(readOnly(file, args), null, `${file} ${args.join(" ")}`);
});

test("anything that changes the machine is refused in read-only mode", () => {
  const refused = [
    ["rm", ["-rf", "/tmp/x"]],
    ["sh", ["-c", "rm -rf /"]],
    ["sh", ["-c", `${REMOTE_TICK}; rm -rf /`]],
    ["systemctl", ["restart", "nginx"]],
    ["systemctl", ["--now", "stop", "nginx"]],
    ["docker", ["rm", "-f", "web"]],
    ["docker", ["system", "prune"]],
    ["journalctl", ["--vacuum-size=1M"]],
    ["crontab", ["-r"]],
    ["ufw", ["disable"]],
    ["openssl", ["genrsa"]],
    ["bash", ["-c", "id"]],
  ];
  for (const [file, args] of refused) assert.notEqual(readOnly(file, args), null, `${file} ${args.join(" ")}`);
});

test("operate access allows anything", () => {
  assert.equal(denied("operate", "systemctl", ["restart", "nginx"]), null);
});
