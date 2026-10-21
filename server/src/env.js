import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, isAbsolute, join, resolve } from "path";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, "..");

// Settings come from the real environment first, then server/.env (or the file named by OPSMIRA_ENV_FILE).
const ENV_PATH = process.env.OPSMIRA_ENV_FILE || join(SERVER_DIR, ".env");
config({ path: ENV_PATH, quiet: true });

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error(
    "OPENROUTER_API_KEY is not set. Copy .env.example to server/.env (or pass it as an environment variable) " +
      "and add a key from https://openrouter.ai/keys. See docs/self-hosting.md.",
  );
}

/** Everything Opsmira keeps (chats, memory, artifacts, audit log, metrics, trusted hosts, secrets). */
const dataDir = resolve(
  process.env.OPSMIRA_DATA_DIR ? (isAbsolute(process.env.OPSMIRA_DATA_DIR) ? process.env.OPSMIRA_DATA_DIR : resolve(process.cwd(), process.env.OPSMIRA_DATA_DIR)) : join(SERVER_DIR, "data"),
);
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

/** A value generated on first boot and kept in the data directory, so it survives restarts and container rebuilds. */
function persisted(name, make) {
  const file = join(dataDir, name);
  if (existsSync(file)) {
    const saved = readFileSync(file, "utf8").trim();
    if (saved) return { value: saved, created: false };
  }
  const value = make();
  writeFileSync(file, `${value}\n`, { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // Best effort on filesystems without modes.
  }
  return { value, created: true };
}

let password = process.env.OPSMIRA_PASSWORD;
if (!password) {
  const made = persisted(".admin-password", () => randomBytes(9).toString("base64url"));
  password = made.value;
  if (made.created) {
    console.log(`\nGenerated an admin password (saved to ${join(dataDir, ".admin-password")}):\n  ${password}\n`);
  }
}

const truthy = (value) => /^(1|true|yes|on)$/i.test(String(value ?? ""));

export const env = {
  port: Number(process.env.PORT) || 8787,
  host: process.env.HOST || "127.0.0.1",
  openrouterApiKey: process.env.OPENROUTER_API_KEY,
  openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  model: process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5",
  password,
  // Stable across restarts, so owners are not signed out every time the server restarts.
  sessionSecret: persisted(".session-secret", () => randomBytes(32).toString("hex")).value,
  dataDir,
  /** The built web app (`npm run build`). Served by this server when it exists. */
  webDir: process.env.OPSMIRA_WEB_DIR ? resolve(process.env.OPSMIRA_WEB_DIR) : join(SERVER_DIR, "..", "dist"),
  /** The agent program and installer that servers download to connect themselves. */
  agentDir: join(SERVER_DIR, "..", "agent"),
  /** Also serve the marketing pages. Off by default: a self-hosted install opens straight into the console. */
  site: truthy(process.env.OPSMIRA_SITE),
  /** Behind a reverse proxy that terminates TLS: trust X-Forwarded-* so cookies are marked secure. */
  trustProxy: truthy(process.env.OPSMIRA_TRUST_PROXY),
};
