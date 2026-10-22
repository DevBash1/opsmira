const CONVERSATION_KEY = "opsmira_conversation";
const CONVERSATION_HEADER = "X-Opsmira-Conversation";

let memoryId: string | null = null;

/**
 * Per-tab conversation id. sessionStorage survives reloads but is isolated
 * between tabs, so two tabs on the same login keep separate conversations.
 */
function conversationId(): string {
  try {
    const stored = sessionStorage.getItem(CONVERSATION_KEY);
    if (stored) return stored;
    const id = crypto.randomUUID();
    sessionStorage.setItem(CONVERSATION_KEY, id);
    return id;
  } catch {
    // Storage blocked — fall back to a per-page-load id.
    memoryId ??= crypto.randomUUID();
    return memoryId;
  }
}

/** Starts a fresh conversation in this tab. */
export function resetConversation() {
  try {
    sessionStorage.setItem(CONVERSATION_KEY, crypto.randomUUID());
  } catch {
    // ignore — storage blocked
  }
  memoryId = null;
}

/** Points this tab at an older conversation (History). The caller reloads its history afterwards. */
export function switchConversation(id: string) {
  try {
    sessionStorage.setItem(CONVERSATION_KEY, id);
  } catch {
    // ignore: storage blocked
  }
  memoryId = id;
}

export function currentConversationId(): string {
  return conversationId();
}

/** The server the owner picked in the composer ("local" or agent:<name>); empty means the server's own default. */
let serverChoice = "";
export function setServerChoice(id: string) {
  serverChoice = id;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { [CONVERSATION_HEADER]: conversationId(), ...(serverChoice ? { "X-Opsmira-Server": serverChoice } : {}), ...extra };
}

export interface Proposal {
  id: string;
  command: string;
  title: string;
  context: string;
  riskLevel: "Low" | "Medium" | "High";
  riskDetail: string;
  /** A connected server the command runs on (agent:name); absent for the server Opsmira is on. */
  server?: string;
  confirmPhrase?: string;
  status: "pending" | "approved" | "declined";
  result?: { exitCode: number | null; output: string; durationMs: number };
}

export interface ModelInfo {
  id: string;
  name: string;
  free: boolean;
  /** Reads images (pasted screenshots). */
  vision: boolean;
  contextLength: number | null;
}

export interface AuditEntry {
  id: string;
  at: string;
  kind: "inspect" | "act";
  command: string;
  title?: string;
  exitCode: number | null;
  output: string;
  durationMs: number;
  /** Ran without an approval card because the console was in Full access mode. */
  auto?: boolean;
}

/** "ask": changes wait for approval (default). "full": the agent runs any command without asking. */
export type AgentMode = "ask" | "full";

export type ChatEvent =
  | { type: "status"; text: string }
  | { type: "tool_call"; tool: "inspect" | "act"; command: string; server?: string; rejected?: string; title?: string }
  | { type: "tool_result"; tool: "inspect" | "act"; command: string; server?: string; exitCode: number | null; output: string; durationMs: number }
  | { type: "proposal"; proposal: Proposal }
  | { type: "scene"; scene: string; data?: Record<string, unknown> }
  | { type: "message"; text: string }
  /** What a reasoning model thought before it acted or answered. */
  | { type: "thinking"; text: string }
  /** The current step of thinking is complete. */
  | { type: "thinking_end" }
  | { type: "error"; text: string; code?: string }
  /** Tappable follow-up actions the agent offers under its reply. */
  | { type: "suggestions"; items: string[] }
  /** The agent saved or dropped a note in its memory. */
  | { type: "memory"; action: "saved" | "forgot"; text: string }
  /** The agent saved, read or deleted an artifact. */
  | { type: "artifact"; action: "saved" | "loaded" | "deleted"; id: string; title: string }
  /** A steering message reached the agent (id from api.steer). */
  | { type: "steer"; id: string }
  /** The owner stopped the turn; `dropped` are steering messages that never reached the agent. */
  | { type: "stopped"; dropped?: string[] }
  | { type: "done" };

/** The latest turn of a conversation as the server rebuilds it from the stored messages. */
export interface ServerTurn {
  ask: string;
  images: string[];
  steers: { text: string; images: string[] }[];
  tools: { kind: "inspect" | "act"; command: string; title?: string; output?: string; exitCode?: number | null; rejected?: string }[];
  thoughts: string[];
  scene?: { scene: string; data?: Record<string, unknown> };
  replies: string[];
  proposals: Proposal[];
  suggestions: string[];
  memories: { action: "saved" | "forgot"; text: string }[];
  artifacts: { action: "saved" | "loaded" | "deleted"; id: string; title: string }[];
  stopped: boolean;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  messages: number;
}

export interface ArtifactSummary {
  id: string;
  title: string;
  updatedAt: string;
  chars: number;
}

export interface Artifact {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface SurfaceInfo {
  id: string;
  name: string;
  group: string;
  description: string;
}

export interface MemoryNote {
  id: string;
  text: string;
  at: string;
}

/** An API error that keeps the server's machine-readable code (e.g. "busy", "no_vision"). */
export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function fail(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}));
  throw new ApiError(body?.error || fallback, body?.code);
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) await fail(res, `HTTP ${res.status}`);
  return res.json();
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify(body) });

/** A server that connected itself (opsmira-agent). `host` is what the surfaces take: agent:<name>. */
export type AgentInfo = {
  id: string;
  name: string;
  host: string;
  online: boolean;
  access: "read-only" | "operate" | "full" | null;
  hostname: string | null;
  platform: string | null;
  createdAt: string;
  lastSeen: string | null;
};

export const api = {
  me: () => fetch("/api/me").then((r) => json<{ authenticated: boolean }>(r)),
  login: (username: string, password: string) =>
    fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) }).then(
      (r) => json<{ ok: true }>(r),
    ),
  logout: () => fetch("/api/logout", { method: "POST" }),
  history: () => fetch("/api/history", { headers: headers() }).then((r) => json<{ turn: ServerTurn | null; pending: Proposal[] }>(r)),
  conversations: () =>
    fetch("/api/conversations", { headers: headers() }).then((r) => json<{ conversations: ConversationSummary[]; current: string | null }>(r)),
  deleteConversation: (id: string) =>
    fetch(`/api/conversations/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers() }).then((r) => json<{ ok: true }>(r)),
  /** Take back the latest message (and the agent's work after it) so it can be edited and sent again. */
  rewind: () => post("/api/rewind", {}).then((r) => json<{ rewound: boolean; ask?: { text: string; images: string[] }; ran?: number }>(r)),
  artifacts: () => fetch("/api/artifacts").then((r) => json<{ artifacts: ArtifactSummary[] }>(r)),
  artifact: (id: string) => fetch(`/api/artifacts/${encodeURIComponent(id)}`).then((r) => json<{ artifact: Artifact }>(r)),
  deleteArtifact: (id: string) => fetch(`/api/artifacts/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),
  memory: () => fetch("/api/memory").then((r) => json<{ memories: MemoryNote[] }>(r)),
  forget: (id: string) => fetch(`/api/memory/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),
  /** The live surfaces this server can read, and a fresh reading of one. */
  surfaces: () => fetch("/api/surfaces").then((r) => json<{ surfaces: SurfaceInfo[] }>(r)),
  /** `host` reads another server over SSH; leave it out for the server Opsmira runs on. */
  surface: (id: string, opts: { target?: string; host?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.target) q.set("target", opts.target);
    if (opts.host) q.set("host", opts.host);
    const qs = q.toString();
    return fetch(`/api/surfaces/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`, { headers: headers() }).then((r) =>
      json<{ scene: string; data: Record<string, unknown> }>(r),
    );
  },
  hosts: () => fetch("/api/hosts").then((r) => json<{ hosts: string[] }>(r)),
  agents: () => fetch("/api/agents").then((r) => json<{ agents: AgentInfo[]; defaultServer?: string }>(r)),
  agentToken: () => post("/api/agents/token", {}).then((r) => json<{ token: string; expiresAt: number; command: string; manual: string }>(r)),
  removeAgent: (id: string) => fetch(`/api/agents/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers() }).then((r) => json<{ ok: true }>(r)),
  audit: () => fetch("/api/audit").then((r) => json<{ entries: AuditEntry[] }>(r)),
  models: () => fetch("/api/models").then((r) => json<{ models: ModelInfo[]; default: string }>(r)),
  approve: (id: string, confirmText?: string, model?: string, mode: AgentMode = "ask") =>
    fetch("/api/approve", {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id, confirmText, model, mode }),
    }).then((r) => json<{ ok: true; proposal: Proposal; events?: ChatEvent[] }>(r)),
  decline: (id: string, model?: string, mode: AgentMode = "ask") =>
    fetch("/api/decline", {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id, model, mode }),
    }).then((r) => json<{ ok: true; proposal: Proposal; events?: ChatEvent[] }>(r)),

  /** Guidance for the turn in flight. `queued: false` means no turn is running: send it as a message instead. */
  steer: (message: string, images: string[] = []) =>
    post("/api/steer", { message, images }).then((r) => json<{ queued: boolean; id?: string }>(r)),
  stop: () => post("/api/stop", {}).then((r) => json<{ stopped: boolean }>(r)),

  async chat(
    message: string,
    onEvent: (e: ChatEvent) => void,
    model?: string,
    images: string[] = [],
    signal?: AbortSignal,
    mode: AgentMode = "ask",
  ) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message, model, images, mode }),
      signal,
    });
    if (!res.ok) await fail(res, `The server couldn't start that turn (HTTP ${res.status}).`);
    if (!res.body) throw new Error("No response stream");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const line = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        onEvent(JSON.parse(line.slice(6)));
      }
    }
  },
};
