import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion, useAnimate, useIsPresent, useReducedMotion } from "motion/react";
import { Icon } from "../components/Icons";
import { ConsoleIdle } from "../components/ConsoleIdle";
import { ConsoleApprovalCard } from "../components/ConsoleApprovalCard";
import { Markdown } from "../components/Markdown";
import { SceneView } from "../components/console/scenes";
import { DestructiveScene, OfflineScene, PermissionScene } from "../components/console/scenes/StateScenes";
import { Aurora, type AuroraMood } from "../components/console/Aurora";
import { ConnectServer } from "../components/console/ConnectServer";
import { IconButton } from "../components/console/IconButton";
import { ModelChip } from "../components/console/ModelChip";
import { ModeChip } from "../components/console/ModeChip";
import { Spinner } from "../components/console/Spinner";
import { Popover } from "../components/console/Popover";
import { PresenceIndicator } from "../components/console/PresenceIndicator";
import { useStickToBottom } from "../components/console/useStickToBottom";
import { collapseY, ease, exitUp, spring } from "../lib/motion";
import { MAX_IMAGES, dragHasFiles, imageFiles, prepareImages } from "../lib/images";
import { useTheme, type Theme } from "../lib/theme";
import { EdgeLight } from "../components/EdgeLight";
import {
  api,
  ApiError,
  currentConversationId,
  resetConversation,
  switchConversation,
  type AgentMode,
  type AuditEntry,
  type Artifact,
  type ArtifactSummary,
  type SurfaceInfo,
  type ChatEvent,
  type ConversationSummary,
  type MemoryNote,
  type ModelInfo,
  type Proposal,
  type ServerTurn,
} from "../lib/console-api";

type ToolCall = {
  id: string;
  /** "act": a change run without an approval card (Full access mode). */
  kind: "inspect" | "act";
  command: string;
  /** A connected server it ran on (agent:name). */
  server?: string;
  title?: string;
  output?: string;
  exitCode?: number | null;
  rejected?: string;
  pending: boolean;
};

type SceneCall = { scene: string; data?: Record<string, unknown> };

/**
 * Guidance sent while the agent works. Queued until the agent picks it up at its next step
 * (`delivered`); `dropped` if the turn was stopped first.
 */
type Steer = { localId: string; id?: string; text: string; images: string[]; state: "queued" | "delivered" | "dropped" };

type Turn = {
  id: string;
  ask: string;
  /** Images pasted or dropped with the ask. */
  images: string[];
  tools: ToolCall[];
  proposals: Proposal[];
  /** Assistant messages in arrival order: a turn can gain one after an approval. */
  replies: string[];
  steers: Steer[];
  /** Tappable follow-ups the agent offered under its reply. */
  suggestions: string[];
  /** Notes the agent saved to (or dropped from) its memory during the turn. */
  memories: { action: "saved" | "forgot"; text: string }[];
  /** Artifacts the agent saved, read or deleted during the turn. */
  artifacts: { action: "saved" | "loaded" | "deleted"; id: string; title: string }[];
  error?: string;
  errorCode?: string;
  offline?: boolean;
  stopped?: boolean;
  scene?: SceneCall;
};

const emptyTurn = (ask: string, images: string[] = []): Turn => ({
  id: nextId(),
  ask,
  images,
  tools: [],
  proposals: [],
  replies: [],
  steers: [],
  suggestions: [],
  memories: [],
  artifacts: [],
});

/** The latest turn as the server rebuilt it from the saved conversation. */
function turnFromServer(t: ServerTurn): Turn {
  return {
    id: nextId(),
    ask: t.ask,
    images: t.images,
    tools: t.tools.map((x) => ({ id: nextId(), kind: x.kind, command: x.command, title: x.title, output: x.output, exitCode: x.exitCode, rejected: x.rejected, pending: false })),
    proposals: t.proposals,
    replies: t.replies,
    steers: t.steers.map((x) => ({ localId: nextId(), text: x.text, images: x.images, state: "delivered" as const })),
    suggestions: t.suggestions,
    memories: t.memories,
    artifacts: t.artifacts,
    stopped: t.stopped,
    scene: t.scene,
  };
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

let seq = 0;
const nextId = () => `t${++seq}`;

/** Apply one streamed event to a turn. Shared by chat and approval continuations. */
function applyEvent(turn: Turn, event: ChatEvent): Turn {
  if (event.type === "tool_call") {
    return {
      ...turn,
      tools: [
        ...turn.tools,
        { id: nextId(), kind: event.tool, command: event.command, server: event.server, title: event.title, pending: !event.rejected, rejected: event.rejected },
      ],
    };
  }
  if (event.type === "tool_result") {
    const tools = [...turn.tools];
    const idx = [...tools].reverse().findIndex((x) => x.pending);
    if (idx < 0) return turn;
    const realIdx = tools.length - 1 - idx;
    tools[realIdx] = { ...tools[realIdx], output: event.output, exitCode: event.exitCode, pending: false };
    return { ...turn, tools };
  }
  if (event.type === "proposal") return { ...turn, proposals: [...turn.proposals, event.proposal] };
  if (event.type === "scene") return { ...turn, scene: { scene: event.scene, data: event.data } };
  if (event.type === "message") return { ...turn, replies: [...turn.replies, event.text] };
  if (event.type === "suggestions") return { ...turn, suggestions: event.items };
  if (event.type === "memory") return { ...turn, memories: [...turn.memories, { action: event.action, text: event.text }] };
  if (event.type === "artifact") return { ...turn, artifacts: [...turn.artifacts, { action: event.action, id: event.id, title: event.title }] };
  if (event.type === "error") return { ...turn, error: event.text, errorCode: event.code };
  if (event.type === "steer") {
    return { ...turn, steers: turn.steers.map((s) => (s.id === event.id ? { ...s, state: "delivered" } : s)) };
  }
  if (event.type === "stopped") {
    const dropped = new Set(event.dropped ?? []);
    return {
      ...turn,
      stopped: true,
      tools: turn.tools.map((t) => (t.pending ? { ...t, pending: false } : t)),
      steers: turn.steers.map((s) => (s.state === "queued" && (!s.id || dropped.has(s.id)) ? { ...s, state: "dropped" } : s)),
    };
  }
  return turn;
}

const MODEL_STORAGE_KEY = "opsmira_model";
const MODE_STORAGE_KEY = "opsmira_mode";
const DISCLAIMER: Record<AgentMode, string> = {
  ask: "You're in control. Server changes always need your approval.",
  full: "Full access is on. The agent runs commands, changes included, without asking.",
};

const USERNAME_KEY = "opsmira_username";

function LoginGate({ onAuthed, onMood }: { onAuthed: () => void; onMood: (mood: AuroraMood) => void }) {
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem(USERNAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scope, animate] = useAnimate<HTMLFormElement>();
  const reduce = useReducedMotion();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    onMood("thinking");
    try {
      await api.login(username, password);
      try {
        localStorage.setItem(USERNAME_KEY, username.trim());
      } catch {
        // remembering the name is only a convenience
      }
      onMood("idle");
      onAuthed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      onMood("error");
      if (!reduce && scope.current) animate(scope.current, { x: [0, -8, 7, -4, 2, 0] }, { duration: 0.42, ease: "easeOut" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      exit={{ opacity: 0, scale: 0.98, filter: "blur(8px)", transition: { duration: 0.3, ease: ease.exit } }}
      className="relative z-10 flex h-full w-full items-center justify-center p-[20px]"
    >
      <form
        ref={scope}
        onSubmit={submit}
        className="relative flex w-full max-w-[380px] flex-col items-start gap-[20px] rounded-[20px] bg-[var(--surface)] p-[28px] motion-safe:animate-blur-rise [box-shadow:0px_20px_60px_var(--shadow)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]"
      >
        <div className="flex w-full flex-row items-center gap-[10px]">
          <div className="flex h-[36px] w-[36px] shrink-0 flex-row items-center justify-center rounded-[10px] bg-[var(--soft)]">
            <Icon name="key-round" className="h-[16px] w-[16px] text-[var(--accent)]" />
          </div>
          <div className="font-display text-[18px] font-semibold text-[var(--ink)]">Opsmira console</div>
        </div>
        <p className="text-[13px]/[20px] text-[var(--muted)]">
          Sign in with the username and password for this server. If you never set them, the username is{" "}
          <code className="font-code">admin</code> and the password was printed to the server log on first start.
        </p>
        <div className="flex w-full flex-col gap-[10px]">
          <input
            autoFocus={!username}
            type="text"
            name="username"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (error) {
                setError("");
                onMood("idle");
              }
            }}
            placeholder="Username"
            className="w-full rounded-[10px] bg-[var(--canvas)] p-[12px_14px] text-[14px] text-[var(--ink)] outline-none transition-[outline-color,box-shadow] duration-200 ease-enter [outline:1px_solid_var(--line)] [outline-offset:-0.5px] focus:[box-shadow:0px_0px_0px_4px_var(--glow)] focus:[outline-color:var(--accent)]"
          />
          <input
            autoFocus={!!username}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) {
                setError("");
                onMood("idle");
              }
            }}
            placeholder="Password"
            className="w-full rounded-[10px] bg-[var(--canvas)] p-[12px_14px] text-[14px] text-[var(--ink)] outline-none transition-[outline-color,box-shadow] duration-200 ease-enter [outline:1px_solid_var(--line)] [outline-offset:-0.5px] focus:[box-shadow:0px_0px_0px_4px_var(--glow)] focus:[outline-color:var(--accent)]"
          />
          <AnimatePresence initial={false}>
            {error && (
              <motion.div key="error" {...collapseY(reduce)} className="w-full">
                <div role="alert" className="pt-[10px] text-[13px] text-[var(--danger)]">
                  {error}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button
          type="submit"
          disabled={busy || !password || !username.trim()}
          className="flex w-full cursor-pointer flex-row items-center justify-center gap-[8px] rounded-[10px] bg-[var(--accent)] p-[12px] text-[14px] font-semibold text-[var(--canvas)] transition-[background-color,transform,translate,scale] duration-200 ease-enter hover:bg-[var(--accent-strong)] active:scale-[0.98] active:duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Spinner size={16} />}
          {busy ? "Checking…" : "Enter"}
        </button>
      </form>
    </motion.div>
  );
}

const MAX_COMMAND_DISPLAY = 64;
const trimCommand = (cmd: string) => (cmd.length > MAX_COMMAND_DISPLAY ? `${cmd.slice(0, MAX_COMMAND_DISPLAY)}…` : cmd);

function ToolActivityLine({ tool, open, onToggle }: { tool: ToolCall; open: boolean; onToggle: () => void }) {
  const rejected = !!tool.rejected;
  const reduce = useReducedMotion();
  const hasOutput = tool.output !== undefined && tool.output.length > 0;
  const trimmed = tool.command.length > MAX_COMMAND_DISPLAY;

  // A ring ripples out once when a command finishes while you watch (not when an old pill mounts).
  const wasPending = useRef(tool.pending);
  const [ripple, setRipple] = useState(0);
  useEffect(() => {
    if (wasPending.current && !tool.pending) setRipple((n) => n + 1);
    wasPending.current = tool.pending;
  }, [tool.pending]);

  return (
    <div className="flex w-full min-w-0 shrink-0 flex-col items-start">
      <button
        type="button"
        title={tool.kind === "act" ? `${tool.title ?? "Change"} — ran without approval (Full access)` : trimmed ? tool.command : undefined}
        onClick={() => hasOutput && onToggle()}
        aria-expanded={hasOutput ? open : undefined}
        className={`flex max-w-full min-w-0 shrink-0 flex-row items-center gap-[8px] rounded-full bg-[var(--surface)] p-[5px_11px_5px_7px] transition-[background-color] duration-200 ease-enter [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px] ${tool.pending ? "sheen" : ""} ${hasOutput ? "cursor-pointer hover:bg-[var(--soft)]" : "cursor-default"}`}
      >
        <span className="relative flex h-[14px] w-[14px] shrink-0 flex-row items-center justify-center">
          <AnimatePresence initial={false}>
            {tool.pending ? (
              <motion.span
                key="pending"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={spring.snappy}
                className="absolute inset-0 flex items-center justify-center"
              >
                <Spinner className="text-[var(--accent-2)]" />
              </motion.span>
            ) : (
              <motion.span
                key="done"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={spring.snappy}
                className="absolute inset-0 flex items-center justify-center"
              >
                <Icon
                  name={rejected ? "triangle-alert" : tool.kind === "act" ? "play" : "terminal"}
                  className={`h-[12px] w-[12px] shrink-0 ${
                    rejected ? "text-[var(--muted)]" : tool.kind === "act" ? "text-[var(--danger)]" : "text-[var(--accent-2)]"
                  }`}
                />
              </motion.span>
            )}
          </AnimatePresence>
          {ripple > 0 && (
            <span
              key={ripple}
              className="pointer-events-none absolute inset-[-3px] rounded-full [outline:1.5px_solid_var(--accent-2)] motion-safe:animate-[ripple_0.7s_cubic-bezier(0.22,1,0.36,1)_forwards] motion-reduce:hidden"
            />
          )}
        </span>
        {tool.server && (
          <span className="font-code shrink-0 rounded-full bg-[var(--soft)] px-[7px] py-[1px] text-[10px] text-[var(--accent-strong)]">{tool.server.replace(/^agent:/, "")}</span>
        )}
        <span className="font-code min-w-0 truncate text-[12px] text-[var(--ink)]">{trimCommand(tool.command)}</span>
        {tool.kind === "act" && (
          <span className="font-code shrink-0 rounded-full bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] px-[6px] py-[1px] text-[9px] tracking-[0.5px] text-[var(--danger)]">
            AUTO
          </span>
        )}
        {hasOutput && (
          <Icon
            name="arrow-up"
            className={`h-[10px] w-[10px] shrink-0 text-[var(--muted)] transition-transform duration-300 ease-move ${open ? "rotate-0" : "rotate-180"}`}
          />
        )}
      </button>
      {rejected && <div className="font-code pt-[6px] pl-[8px] text-[11px] text-[var(--muted)]">rejected — {tool.rejected}</div>}
      <AnimatePresence initial={false}>
        {hasOutput && open && (
          <motion.div key="output" {...collapseY(reduce)} className="w-full">
            <pre className="theme-dark font-code mt-[6px] max-h-[220px] w-full overflow-auto rounded-[10px] bg-[var(--surface)] p-[12px_14px] text-[11px]/[18px] whitespace-pre-wrap text-[var(--ink)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
              {trimmed ? `$ ${tool.command}\n\n${tool.output}` : tool.output}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const VISIBLE_TOOLS = 3;

/** The last three commands stay in view; older ones slide up into the "+N earlier" counter. */
function ToolActivityList({ tools }: { tools: ToolCall[] }) {
  const [expanded, setExpanded] = useState(false);
  // One output open at a time: opening another closes the one before it.
  const [openId, setOpenId] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const hidden = Math.max(0, tools.length - VISIBLE_TOOLS);
  const visible = expanded ? tools : tools.slice(-VISIBLE_TOOLS);

  return (
    <div className="-mb-[8px] flex w-full shrink-0 flex-col items-start">
      <AnimatePresence initial={false}>
        {hidden > 0 && (
          <motion.div key="earlier" {...collapseY(reduce)} className="w-full">
            <div className="pb-[8px]">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                aria-label={expanded ? "Show last 3 only" : `Show ${hidden} earlier command${hidden === 1 ? "" : "s"}`}
                className="font-code flex w-fit shrink-0 cursor-pointer flex-row items-center gap-[5px] rounded-full bg-[var(--soft)] px-[11px] py-[4px] text-[11px] text-[var(--muted)] transition-colors duration-200 ease-enter hover:text-[var(--ink)]"
              >
                {expanded ? (
                  "Show last 3 only"
                ) : (
                  <>
                    <span key={hidden} className="inline-block motion-safe:animate-roll-in">
                      +{hidden}
                    </span>
                    earlier command{hidden === 1 ? "" : "s"}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
        {visible.map((t) => (
          <motion.div key={t.id} {...collapseY(reduce, { blur: true })} className="w-full">
            <div className="pb-[8px]">
              <ToolActivityLine tool={t} open={openId === t.id} onToggle={() => setOpenId((id) => (id === t.id ? null : t.id))} />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function CreditsNotice({ text }: { text: string }) {
  return (
    <div className="flex w-full max-w-[720px] flex-col gap-[9px] rounded-[14px] bg-[var(--surface)] p-[16px_18px] [box-shadow:0px_10px_30px_var(--shadow)] [outline:1px_solid_var(--line)] [outline-offset:-0.5px]">
      <div className="flex flex-row items-center gap-[8px]">
        <Icon name="key-round" className="h-[13px] w-[13px] shrink-0 text-[var(--accent-2)]" />
        <span className="text-[13px] font-medium text-[var(--ink)]">The model can't run right now</span>
      </div>
      <p className="text-[12.5px] leading-[1.6] text-[var(--muted)]">{text}</p>
      <div className="flex flex-row flex-wrap items-center gap-[12px]">
        <a
          href="https://openrouter.ai/settings/credits"
          target="_blank"
          rel="noreferrer"
          className="flex w-fit cursor-pointer flex-row items-center gap-[6px] rounded-[9px] bg-[var(--accent)] px-[12px] py-[7px] text-[12px] font-medium text-[var(--canvas)] transition-[background-color,transform,scale] duration-200 ease-enter hover:bg-[var(--accent-strong)] active:scale-[0.97]"
        >
          Add credits
          <Icon name="arrow-up-right" className="h-[11px] w-[11px]" />
        </a>
        <span className="text-[11px] text-[var(--muted)]">or pick another model from the model chip below</span>
      </div>
    </div>
  );
}

/**
 * One turn. Each block enters on its own the moment it arrives, with a small fixed slot delay
 * (ask 0 · tools 50 · sample chip 80 · reply 120 · proposals 160ms), so nothing waits on what came before.
 */
/** Thumbnails of images that went out with a message. */
function ImageStrip({ images, size = 64 }: { images: string[]; size?: number }) {
  return (
    <div className="flex flex-row flex-wrap gap-[8px]">
      {images.map((src, i) => (
        <img
          key={i}
          src={src}
          alt={`Attached image ${i + 1}`}
          style={{ width: size, height: size, animationDelay: `${i * 50}ms` }}
          className="shrink-0 rounded-[12px] object-cover [box-shadow:0px_6px_18px_var(--shadow)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px] motion-safe:animate-blur-rise"
        />
      ))}
    </div>
  );
}

/** What the owner sent: the ask, or guidance that reached the agent mid-turn (`steered`). */
function AskLine({ text, images, steered = false }: { text: string; images: string[]; steered?: boolean }) {
  return (
    <div className="flex w-full flex-col items-start gap-[8px] pl-[19px] motion-safe:animate-blur-rise">
      {(text || steered) && (
        <div className="font-code -ml-[19px] flex w-full flex-row items-start gap-[8px] text-[12px] text-[var(--muted)]">
          <Icon name="corner-down-right" className="mt-[2px] h-[11px] w-[11px] shrink-0" />
          <span className="min-w-0 flex-1">
            {text || "Image"}
            {steered && (
              <span className="ml-[8px] inline-flex rounded-full bg-[var(--soft)] px-[7px] py-[1px] align-[1px] text-[9px] tracking-[0.5px] text-[var(--accent-strong)]">
                STEERED
              </span>
            )}
          </span>
        </div>
      )}
      {images.length > 0 && <ImageStrip images={images} />}
    </div>
  );
}

function TurnBlock({
  turn,
  busyProposal,
  locked,
  onDecide,
  onRetry,
  onAsk,
  onOpenArtifact,
}: {
  turn: Turn;
  busyProposal: string | null;
  /** The agent is mid-turn: decisions wait until it finishes. */
  locked: boolean;
  onDecide: (id: string, approve: boolean, confirmText?: string) => void;
  onRetry?: () => void;
  onAsk?: (prompt: string) => void;
  onOpenArtifact?: (id: string) => void;
}) {
  return (
    <div className="flex w-full shrink-0 flex-col items-start gap-[16px] p-[20px_0px]">
      {(turn.ask || turn.images.length > 0) && <AskLine text={turn.ask} images={turn.images} />}
      {turn.steers
        .filter((s) => s.state === "delivered")
        .map((s) => (
          <AskLine key={s.localId} text={s.text} images={s.images} steered />
        ))}

      {turn.tools.length > 0 && (
        <div style={{ animationDelay: "50ms" }} className="w-full motion-safe:animate-blur-rise">
          <ToolActivityList tools={turn.tools} />
        </div>
      )}

      {turn.memories.length > 0 && (
        <div style={{ animationDelay: "70ms" }} className="flex w-full flex-col items-start gap-[6px] motion-safe:animate-blur-rise">
          {turn.memories.map((m, i) => (
            <div
              key={i}
              title={m.text}
              className="flex max-w-full min-w-0 flex-row items-center gap-[7px] rounded-full bg-[var(--soft)] p-[4px_11px_4px_8px] text-[11.5px] text-[var(--muted)]"
            >
              <Icon name="bookmark" className="h-[11px] w-[11px] shrink-0 text-[var(--accent)]" />
              <span className="shrink-0">{m.action === "saved" ? "Remembered" : "Forgot"}</span>
              <span className="min-w-0 truncate text-[var(--ink)]">{m.text}</span>
            </div>
          ))}
        </div>
      )}

      {turn.artifacts.length > 0 && (
        <div style={{ animationDelay: "70ms" }} className="flex w-full flex-col items-start gap-[6px] motion-safe:animate-blur-rise">
          {turn.artifacts.map((a, i) => {
            const label = { saved: "Saved", loaded: "Read", deleted: "Deleted" }[a.action];
            const content = (
              <>
                <Icon name="file-text" className="h-[11px] w-[11px] shrink-0 text-[var(--accent-2)]" />
                <span className="shrink-0">{label}</span>
                <span className="min-w-0 truncate text-[var(--ink)]">{a.title}</span>
                {a.action !== "deleted" && <Icon name="arrow-up-right" className="h-[10px] w-[10px] shrink-0 text-[var(--muted)]" />}
              </>
            );
            const pill = "flex max-w-full min-w-0 flex-row items-center gap-[7px] rounded-full bg-[var(--soft)] p-[4px_11px_4px_8px] text-[11.5px] text-[var(--muted)]";
            return a.action === "deleted" ? (
              <div key={i} className={pill}>
                {content}
              </div>
            ) : (
              <button
                key={i}
                type="button"
                title="Open artifact"
                onClick={() => onOpenArtifact?.(a.id)}
                className={`${pill} cursor-pointer transition-colors duration-200 ease-enter hover:bg-[var(--glow)]`}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}

      {!turn.offline && turn.scene && (
        <div className="w-full">
          <LiveSurface key={turn.scene.scene} scene={turn.scene.scene} data={turn.scene.data} onAsk={onAsk} />
        </div>
      )}

      {turn.offline ? (
        <div className="scene-stagger group/scene w-full">
          <OfflineScene onRetry={onRetry} />
        </div>
      ) : turn.errorCode === "credits" ? (
        <div style={{ animationDelay: "120ms" }} className="w-full motion-safe:animate-soft-rise">
          <CreditsNotice text={turn.error || ""} />
        </div>
      ) : (
        <>
          {turn.replies.map((text, i) => (
            <div key={i} style={{ animationDelay: i === 0 ? "120ms" : "0ms" }} className="w-full motion-safe:animate-soft-rise">
              <Markdown text={text} />
            </div>
          ))}
          {turn.error && (
            <p
              style={{ animationDelay: "120ms" }}
              className="max-w-[720px] text-[16px]/[26px] whitespace-pre-wrap text-[var(--danger)] motion-safe:animate-blur-rise"
            >
              {turn.error}
            </p>
          )}
        </>
      )}

      {turn.proposals.length > 0 && (
        <div className="flex w-full shrink-0 flex-col items-start gap-[12px]">
          {turn.proposals.map((p) => (
            <div key={p.id} style={{ animationDelay: "160ms" }} className="w-full motion-safe:animate-soft-rise">
              {p.confirmPhrase ? (
                <DestructiveScene
                  proposal={p}
                  busy={busyProposal === p.id}
                  locked={locked}
                  onApprove={(confirmText) => onDecide(p.id, true, confirmText)}
                  onDecline={() => onDecide(p.id, false)}
                />
              ) : /^\s*sudo\b/.test(p.command) ? (
                <PermissionScene
                  proposal={p}
                  busy={busyProposal === p.id}
                  locked={locked}
                  onApprove={() => onDecide(p.id, true)}
                  onDecline={() => onDecide(p.id, false)}
                />
              ) : (
                <ConsoleApprovalCard
                  proposal={p}
                  busy={busyProposal === p.id}
                  locked={locked}
                  onApprove={(confirmText) => onDecide(p.id, true, confirmText)}
                  onDecline={() => onDecide(p.id, false)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {turn.suggestions.length > 0 && !turn.stopped && (
        <div className="flex w-full shrink-0 flex-row flex-wrap items-center gap-[8px]">
          {turn.suggestions.map((text, i) => (
            <button
              key={text}
              type="button"
              disabled={locked}
              onClick={() => onAsk?.(text)}
              style={{ animationDelay: `${200 + i * 60}ms` }}
              className="group flex w-fit max-w-full shrink-0 cursor-pointer flex-row items-center gap-[7px] rounded-full bg-[var(--glass)] p-[7px_13px_7px_12px] text-[12.5px] font-medium text-[var(--ink)] transition-[background-color,box-shadow,transform,translate,scale] duration-200 ease-enter hover:-translate-y-[1px] hover:bg-[var(--surface)] hover:[box-shadow:0px_8px_22px_var(--shadow)] active:scale-[0.97] active:duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 motion-safe:animate-blur-rise [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]"
            >
              <span className="min-w-0 truncate">{text}</span>
              <Icon
                name="arrow-up-right"
                className="h-[12px] w-[12px] shrink-0 text-[var(--accent)] transition-transform duration-200 ease-enter group-hover:translate-x-[1px] group-hover:-translate-y-[1px]"
              />
            </button>
          ))}
        </div>
      )}

      {turn.stopped && (
        <div className="flex w-fit flex-row items-center gap-[7px] rounded-full bg-[var(--soft)] px-[11px] py-[5px] text-[11.5px] text-[var(--muted)] motion-safe:animate-blur-rise">
          <Icon name="square" className="h-[10px] w-[10px] shrink-0" />
          Stopped
        </div>
      )}
    </div>
  );
}

/**
 * One screen of the chat area (idle, a turn, or a surface preview). Stages are keyed: the outgoing one
 * dissolves upward over the incoming one. While leaving it is inert, so its buttons (including an old
 * Approve) can't be clicked or focused.
 */
/** Surfaces that move on their own re-read the server every few seconds while they are on screen. */
const LIVE_POLL = new Set(["cpu", "memory", "network", "processes", "disk", "uptime", "logs"]);
const POLL_MS = 5000;

/**
 * A surface that stays current. It starts from the reading it was given (or fetches one) and then keeps
 * reading from the server, so the numbers on screen are never a stale snapshot.
 */
function LiveSurface({ scene, data, host, onAsk }: { scene: string; data?: Record<string, unknown>; host?: string; onAsk?: (prompt: string) => void }) {
  const [reading, setReading] = useState<{ scene: string; data: Record<string, unknown> } | null>(data ? { scene, data } : null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  // A surface built from an inspect command (a filtered ps, a single path) must not be replaced by the
  // generic reading, so only ones the server read itself, or the always-generic memory view, keep updating.
  const refreshable = scene === "memory" || !data || data.collected === true;
  const polls = refreshable && LIVE_POLL.has(scene);
  const target = typeof data?.target === "string" ? data.target : undefined;
  // A surface read over SSH keeps reading from that server when it refreshes.
  const ssh = typeof data?.ssh === "string" ? data.ssh : host;

  // A new reading from the chat replaces what is shown.
  useEffect(() => {
    if (data) setReading({ scene, data });
  }, [scene, data]);

  const load = useCallback(() => {
    setLoading(true);
    api
      .surface(scene === "unavailable" ? String(data?.for ?? "") : scene, { target, host: ssh })
      .then((r) => {
        setReading(r);
        setFailed(false);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [scene, target, ssh, data?.for]);

  useEffect(() => {
    if (!data) load();
  }, [data, load]);

  useEffect(() => {
    if (!polls) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) load();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [polls, load]);

  return (
    <div className="flex w-full flex-col gap-[10px]">
      <div className="flex flex-row items-center justify-end gap-[10px]">
        {failed && <span className="text-[11px] text-[var(--danger)]">Lost the connection. Showing the last reading.</span>}
        <span className="text-[11px] text-[var(--muted)]">{polls ? "Live, updates every few seconds" : "Read once"}</span>
        {refreshable && <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex cursor-pointer flex-row items-center gap-[6px] rounded-full bg-[var(--surface)] px-[10px] py-[3px] text-[11px] text-[var(--ink)] transition-colors duration-150 ease-enter hover:bg-[var(--soft)] disabled:cursor-default disabled:opacity-60 [outline:1px_solid_var(--line)] [outline-offset:-0.5px]"
        >
          <Icon name="refresh-cw" className={`h-[11px] w-[11px] ${loading ? "motion-safe:animate-spin" : ""}`} />
          Refresh
        </button>}
      </div>
      {!reading && !failed && <div className="p-[10px] text-[12px] text-[var(--muted)]">Reading from the server...</div>}
      {!reading && failed && <div className="p-[10px] text-[12px] text-[var(--muted)]">Couldn't reach the server for a reading. Try Refresh.</div>}
      {reading && <SceneView scene={reading.scene} data={reading.data} onAsk={onAsk} />}
    </div>
  );
}

function Stage({
  scrollerRef,
  contentRef,
  onScroll,
  pinned,
  children,
}: {
  scrollerRef: (node: HTMLDivElement | null) => void | (() => void);
  contentRef: (node: HTMLDivElement | null) => void | (() => void);
  onScroll: () => void;
  /** A chat turn follows its newest content; idle and previews read from the top. */
  pinned: boolean;
  children: ReactNode;
}) {
  const isPresent = useIsPresent();
  return (
    <motion.div
      exit={exitUp}
      inert={!isPresent}
      aria-hidden={isPresent ? undefined : true}
      className={`absolute inset-0 ${isPresent ? "z-0" : "pointer-events-none z-[1]"}`}
    >
      <div
        ref={scrollerRef}
        onScroll={pinned ? onScroll : undefined}
        className="stage-fade flex h-full flex-col overflow-x-hidden overflow-y-auto"
      >
        <div ref={contentRef} data-pin={pinned ? "true" : "false"} className="flex min-h-full w-full shrink-0 flex-col">
          {children}
        </div>
      </div>
    </motion.div>
  );
}

function ConsoleApp({
  onMood,
  theme,
  onToggleTheme,
}: {
  onMood: (mood: AuroraMood) => void;
  theme: Theme;
  onToggleTheme: (from?: HTMLElement | null) => void;
}) {
  const [current, setCurrent] = useState<Turn | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  // Newest audit id the owner has seen; undefined until the first load.
  const [seenAudit, setSeenAudit] = useState<string | null | undefined>(undefined);
  const [showAudit, setShowAudit] = useState(false);
  const [showScenes, setShowScenes] = useState(false);
  // The live surfaces this server can read (from the server, so the menu can never list one that isn't real).
  const [surfaces, setSurfaces] = useState<SurfaceInfo[] | null>(null);
  // Which server the Surfaces menu reads: empty is the one Opsmira runs on, otherwise an SSH host.
  const [surfaceHost, setSurfaceHost] = useState("");
  const [knownHosts, setKnownHosts] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [artifactList, setArtifactList] = useState<ArtifactSummary[] | null>(null);
  const [openedArtifact, setOpenedArtifact] = useState<Artifact | null>(null);
  const [copiedArtifact, setCopiedArtifact] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [memories, setMemories] = useState<MemoryNote[] | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busyProposal, setBusyProposal] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState("");
  // Images waiting in the composer, and the composer's drop-target / hint state.
  const [attachments, setAttachments] = useState<{ id: string; url: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState("");
  const [chipAttention, setChipAttention] = useState(0);
  const [stopping, setStopping] = useState(false);
  // Permission mode, per tab: "ask" unless the owner switches this tab to Full access.
  const [mode, setMode] = useState<AgentMode>(() => {
    try {
      return sessionStorage.getItem(MODE_STORAGE_KEY) === "full" ? "full" : "ask";
    } catch {
      return "ask";
    }
  });
  // Mirrors of in-flight state for callbacks that outlive a render (follow-ups, stop fallback).
  const sendingRef = useRef(false);
  const busyRef = useRef(false);
  const streamAbort = useRef<AbortController | null>(null);
  const stopTimer = useRef<number | undefined>(undefined);
  // Guidance that arrived just as a turn ended: sent as the next message once it has.
  const followUp = useRef<{ text: string; images: string[] } | null>(null);
  // Steering acks can beat the steer request's own response; remember them.
  const deliveredSteers = useRef(new Set<string>());
  const sentImages = useRef(false);
  // Double Esc takes the last message back: the time of the previous Esc, and a rewind waiting for Stop to land.
  const lastEsc = useRef(0);
  const pendingRewind = useRef(false);
  const rewinding = useRef(false);
  const performRewindRef = useRef<() => void>(() => {});
  const escRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const inputRef = useRef<HTMLInputElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const memoryButton = useRef<HTMLButtonElement>(null);
  const artifactsButton = useRef<HTMLButtonElement>(null);
  const scenesButton = useRef<HTMLButtonElement>(null);
  const auditButton = useRef<HTMLButtonElement>(null);
  const themeButton = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const { scrollerRef, contentRef, onScroll, showJump, jump, reset } = useStickToBottom();

  const refreshAudit = useCallback(() => {
    api
      .audit()
      .then((r) => {
        // Skip the re-render when nothing new ran.
        setAudit((prev) => (prev.length === r.entries.length && prev[0]?.id === r.entries[0]?.id ? prev : r.entries));
        setSeenAudit((seen) => (seen === undefined ? (r.entries[0]?.id ?? null) : seen));
      })
      .catch(() => {});
  }, []);

  const errorTimer = useRef<number | undefined>(undefined);
  const showError = useCallback((message: string) => {
    setActionError(message);
    window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setActionError(""), 4000);
  }, []);
  useEffect(() => () => window.clearTimeout(errorTimer.current), []);

  const hintTimer = useRef<number | undefined>(undefined);
  const showHint = useCallback((message: string) => {
    setHint(message);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(""), 6000);
  }, []);
  useEffect(() => () => window.clearTimeout(hintTimer.current), []);

  /** Load the conversation's latest turn (tool pills, surface, approvals, follow-ups) from the server. */
  const loadHistory = useCallback(async () => {
    try {
      const r = await api.history();
      let next: Turn | null = r.turn ? turnFromServer(r.turn) : null;
      if (r.pending.length) {
        const base = next ?? emptyTurn("");
        next = { ...base, proposals: [...base.proposals, ...r.pending] };
      }
      sentImages.current = !!next && (next.images.length > 0 || next.steers.some((x) => x.images.length > 0));
      setCurrent(next);
    } catch {
      // keep what is on screen
    }
  }, []);

  useEffect(() => {
    loadHistory().finally(() => setHistoryReady(true));
    api
      .models()
      .then((r) => {
        setModels(r.models);
        let stored: string | null = null;
        try {
          stored = localStorage.getItem(MODEL_STORAGE_KEY);
        } catch {
          // ignore — private browsing / blocked storage
        }
        setModel(stored && r.models.some((m) => m.id === stored) ? stored : r.default);
      })
      .catch(() => {});
    refreshAudit();
    const interval = setInterval(refreshAudit, 5000);
    return () => clearInterval(interval);
  }, [refreshAudit, loadHistory]);

  useEffect(() => {
    if (showAudit) setSeenAudit(audit[0]?.id ?? null);
  }, [showAudit, audit]);
  const unseenActivity = !showAudit && seenAudit !== undefined && !!audit[0] && audit[0].id !== seenAudit;

  // The background reads the room: brighter while the agent works, calmer while it waits on you.
  const pendingApproval = !!current?.proposals.some((p) => p.status === "pending");
  const mood: AuroraMood =
    actionError || current?.offline
      ? "error"
      : busyProposal || (status && status !== "thinking")
        ? "working"
        : sending
          ? "thinking"
          : pendingApproval
            ? "approval"
            : "idle";
  useEffect(() => onMood(mood), [mood, onMood]);

  const closeScenes = useCallback(() => setShowScenes(false), []);
  const closeAudit = useCallback(() => setShowAudit(false), []);
  const closeHistory = useCallback(() => setShowHistory(false), []);
  const closeMemory = useCallback(() => setShowMemory(false), []);
  const closeArtifacts = useCallback(() => setShowArtifacts(false), []);

  /** One top-bar sheet open at a time. History, Memory and Artifacts fetch fresh data each time they open. */
  const togglePanel = (panel: "scenes" | "audit" | "history" | "memory" | "artifacts") => {
    const open = { scenes: showScenes, audit: showAudit, history: showHistory, memory: showMemory, artifacts: showArtifacts }[panel];
    setShowScenes(panel === "scenes" && !open);
    setShowAudit(panel === "audit" && !open);
    setShowHistory(panel === "history" && !open);
    setShowMemory(panel === "memory" && !open);
    setShowArtifacts(panel === "artifacts" && !open);
    if (open) return;
    if (panel === "scenes") {
      api.surfaces().then((r) => setSurfaces(r.surfaces)).catch(() => setSurfaces([]));
      api.hosts().then((r) => setKnownHosts(r.hosts)).catch(() => setKnownHosts([]));
    }
    if (panel === "history") api.conversations().then((r) => setConversations(r.conversations)).catch(() => setConversations([]));
    if (panel === "memory") api.memory().then((r) => setMemories(r.memories)).catch(() => setMemories([]));
    if (panel === "artifacts") {
      setOpenedArtifact(null);
      api.artifacts().then((r) => setArtifactList(r.artifacts)).catch(() => setArtifactList([]));
    }
  };

  /** Open one artifact straight in the Artifacts sheet (from a pill in the chat). */
  const openArtifact = async (id: string) => {
    setShowScenes(false);
    setShowAudit(false);
    setShowHistory(false);
    setShowMemory(false);
    try {
      const [{ artifact }, list] = await Promise.all([api.artifact(id), api.artifacts()]);
      setArtifactList(list.artifacts);
      setOpenedArtifact(artifact);
      setShowArtifacts(true);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Couldn't open that artifact.");
    }
  };

  const viewArtifact = async (id: string) => {
    try {
      setOpenedArtifact((await api.artifact(id)).artifact);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Couldn't open that artifact.");
    }
  };

  const removeArtifact = async (id: string) => {
    try {
      await api.deleteArtifact(id);
      setArtifactList((list) => list?.filter((a) => a.id !== id) ?? list);
      setOpenedArtifact((a) => (a?.id === id ? null : a));
    } catch (err) {
      showError(err instanceof Error ? err.message : "Couldn't delete that artifact.");
    }
  };

  const copyArtifact = async (artifact: Artifact) => {
    try {
      await navigator.clipboard.writeText(`# ${artifact.title}\n\n${artifact.body}`);
      setCopiedArtifact(true);
      window.setTimeout(() => setCopiedArtifact(false), 1600);
    } catch {
      showError("Couldn't copy to the clipboard.");
    }
  };

  // Escape leaves a surface preview (an open popover takes the key first).
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showScenes && !showAudit && !showHistory && !showMemory && !showArtifacts) setPreview(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [preview, showScenes, showAudit, showHistory, showMemory, showArtifacts]);

  const pickMode = (next: AgentMode) => {
    setMode(next);
    try {
      sessionStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      // ignore — the mode still applies for this visit
    }
    showHint(
      next === "full"
        ? "Full access is on: the agent will run commands, changes included, without asking."
        : "Ask first is on: every change waits for your approval.",
    );
  };

  const pickModel = (id: string) => {
    setModel(id);
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, id);
    } catch {
      // ignore — private browsing / blocked storage
    }
  };

  const modelInfo = models.find((m) => m.id === model);
  const canSeeImages = !!modelInfo?.vision;
  const modelName = (model.split("/").pop() || model).replace(/:free$/, "");
  const running = sending || !!busyProposal;

  const send = async (text: string, images: string[] = []) => {
    text = text.trim();
    if ((!text && !images.length) || sendingRef.current) return;
    sendingRef.current = true;
    setInput("");
    setAttachments([]);
    setPreview(null);
    reset();
    setSending(true);
    if (images.length) sentImages.current = true;
    const turn = emptyTurn(text, images);
    const turnId = turn.id;
    setCurrent(turn);

    const updateTurn = (fn: (t: Turn) => Turn) => {
      setCurrent((t) => (t && t.id === turnId ? fn(t) : t));
    };

    const controller = new AbortController();
    streamAbort.current = controller;
    try {
      await api.chat(
        text,
        (event) => {
          if (event.type === "status") {
            setStatus(event.text);
            return;
          }
          if (event.type === "done") return;
          if (event.type === "steer") deliveredSteers.current.add(event.id);
          if (event.type === "stopped") restoreDropped(turnId);
          updateTurn((t) => applyEvent(t, event));
        },
        model,
        images,
        controller.signal,
        mode,
      );
    } catch (err) {
      if (controller.signal.aborted) {
        // Stop didn't wind the stream down in time and it was cut: still a stop, not an outage.
        updateTurn((t) => applyEvent(t, { type: "stopped" }));
        restoreDropped(turnId);
      } else {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        const offline =
          !(err instanceof ApiError) &&
          (err instanceof TypeError || /failed to fetch|networkerror|load failed|connection (lost|reset)|stream/i.test(message));
        updateTurn((t) => ({ ...t, error: offline ? undefined : message, offline }));
      }
    } finally {
      window.clearTimeout(stopTimer.current);
      streamAbort.current = null;
      sendingRef.current = false;
      setSending(false);
      setStopping(false);
      setStatus("");
      refreshAudit();
      settle();
    }
  };
  // Follow-ups fire after the turn's state has settled, so they always use the latest `send`.
  const sendRef = useRef(send);
  sendRef.current = send;

  /** A turn (or an approved action) has ended: run a rewind that was waiting on Stop, else any queued follow-up. */
  const settle = () => {
    if (pendingRewind.current) {
      followUp.current = null;
      window.setTimeout(() => performRewindRef.current(), 0);
      return;
    }
    flushFollowUp();
  };

  const flushFollowUp = () => {
    const next = followUp.current;
    if (!next) return;
    followUp.current = null;
    window.setTimeout(() => sendRef.current(next.text, next.images), 0);
  };

  /** Dropped guidance leaves the tray after a beat; the last one goes back into an empty composer. */
  const restoreDropped = (turnId: string) => {
    window.setTimeout(() => {
      setCurrent((t) => {
        if (!t || t.id !== turnId) return t;
        const dropped = t.steers.filter((s) => s.state === "dropped");
        const last = dropped[dropped.length - 1];
        if (last) setInput((value) => value || last.text);
        return { ...t, steers: t.steers.filter((s) => s.state !== "dropped") };
      });
    }, 2200);
  };

  /** Guidance while the agent works: it picks it up at its next step. */
  const steer = async (text: string, images: string[]) => {
    text = text.trim();
    const turnId = current?.id;
    if ((!text && !images.length) || !turnId) return;
    const localId = nextId();
    setInput("");
    setAttachments([]);
    if (images.length) sentImages.current = true;
    const patchSteers = (fn: (steers: Steer[]) => Steer[]) =>
      setCurrent((t) => (t && t.id === turnId ? { ...t, steers: fn(t.steers) } : t));
    patchSteers((steers) => [...steers, { localId, text, images, state: "queued" }]);
    try {
      const r = await api.steer(text, images);
      if (r.queued && r.id) {
        const id = r.id;
        const state = deliveredSteers.current.has(id) ? "delivered" : "queued";
        patchSteers((steers) => steers.map((s) => (s.localId === localId ? { ...s, id, state } : s)));
      } else {
        // The turn had just ended: this becomes the next message.
        patchSteers((steers) => steers.filter((s) => s.localId !== localId));
        followUp.current = { text, images };
        if (!sendingRef.current && !busyRef.current) flushFollowUp();
      }
    } catch (err) {
      patchSteers((steers) => steers.filter((s) => s.localId !== localId));
      setInput((value) => value || text);
      showError(err instanceof Error ? err.message : "That didn't reach the agent — try again.");
    }
  };

  const stop = () => {
    if (stopping || !running) return;
    setStopping(true);
    api.stop().catch(() => {});
    // If the stream doesn't wind down on its own, cut it.
    window.clearTimeout(stopTimer.current);
    stopTimer.current = window.setTimeout(() => streamAbort.current?.abort(), 4000);
  };

  const submit = () => {
    if (stopping) return;
    const images = attachments.map((a) => a.url);
    if (running) steer(input, images);
    else send(input, images);
  };

  const addImages = async (files: File[]) => {
    if (!files.length) return;
    if (!canSeeImages) {
      setChipAttention((n) => n + 1);
      showHint(`${modelName || "This model"} can't see images — pick a model with vision.`);
      return;
    }
    const room = MAX_IMAGES - attachments.length;
    if (room <= 0) {
      showHint(`Up to ${MAX_IMAGES} images per message.`);
      return;
    }
    const prepared = await prepareImages(files, room);
    if (files.length > room) showHint(`Up to ${MAX_IMAGES} images per message.`);
    setAttachments((list) => [...list, ...prepared.map((url) => ({ id: nextId(), url }))].slice(0, MAX_IMAGES));
  };

  // Switching to a model without vision: images can't go to it, so pending ones are removed and
  // earlier ones are kept out of what it sees (the server swaps them for a note).
  const hadVision = useRef(canSeeImages);
  useEffect(() => {
    if (!models.length) return;
    if (hadVision.current && !canSeeImages) {
      const earlier = sentImages.current ? " Earlier images stay in the chat but won't be sent to it." : "";
      if (attachments.length) {
        setAttachments([]);
        showHint(`Images removed — ${modelName} can't see images.${earlier}`);
      } else if (earlier) {
        showHint(`Earlier images stay in the chat but won't be sent to ${modelName}.`);
      }
    }
    hadVision.current = canSeeImages;
    // Only a change of capability should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSeeImages, models.length]);

  // A file dropped anywhere else on the page shouldn't navigate the tab away from the console.
  useEffect(() => {
    const guard = (e: DragEvent) => {
      if (dragHasFiles(e.dataTransfer)) e.preventDefault();
    };
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    return () => {
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
    };
  }, []);

  const decide = async (id: string, approve: boolean, confirmText?: string) => {
    const turnId = current?.id;
    busyRef.current = true;
    setBusyProposal(id);
    try {
      const r = approve ? await api.approve(id, confirmText, model, mode) : await api.decline(id, model, mode);
      for (const event of r.events ?? []) if (event.type === "steer") deliveredSteers.current.add(event.id);
      if (r.events?.some((e) => e.type === "stopped") && turnId) restoreDropped(turnId);
      setCurrent((t) => {
        if (!t || t.id !== turnId) return t;
        let next: Turn = { ...t, proposals: t.proposals.map((p) => (p.id === id ? r.proposal : p)) };
        for (const event of r.events ?? []) {
          if (event.type === "status" || event.type === "done") continue;
          next = applyEvent(next, event);
        }
        return next;
      });
      refreshAudit();
    } catch (err) {
      showError(err instanceof Error ? err.message : "That action didn't go through — try again.");
    } finally {
      window.clearTimeout(stopTimer.current);
      busyRef.current = false;
      setBusyProposal(null);
      setStopping(false);
      settle();
    }
  };

  const startNewConversation = () => {
    if (sending || busyProposal) return;
    resetConversation();
    reset();
    sentImages.current = false;
    setCurrent(null);
    setPreview(null);
    setShowScenes(false);
    setStatus("");
    setInput("");
    setAttachments([]);
    setActionError("");
  };

  /** Reopen a past conversation from History. */
  const openConversation = async (id: string) => {
    if (running) return;
    setShowHistory(false);
    if (id === currentConversationId()) return;
    switchConversation(id);
    reset();
    sentImages.current = false;
    followUp.current = null;
    setHistoryReady(false);
    setCurrent(null);
    setPreview(null);
    setStatus("");
    setInput("");
    setAttachments([]);
    setActionError("");
    await loadHistory();
    setHistoryReady(true);
  };

  const removeConversation = async (id: string) => {
    try {
      await api.deleteConversation(id);
      setConversations((list) => list?.filter((c) => c.id !== id) ?? list);
      if (id === currentConversationId()) startNewConversation();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Couldn't delete that conversation.");
    }
  };

  const forgetNote = async (id: string) => {
    try {
      await api.forget(id);
      setMemories((list) => list?.filter((m) => m.id !== id) ?? list);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Couldn't forget that.");
    }
  };

  /** Double Esc: stop the agent if it is working, take the last message back out of the conversation, and put it in the composer. */
  const performRewind = async () => {
    if (rewinding.current) return;
    rewinding.current = true;
    try {
      const r = await api.rewind();
      if (!r.rewound || !r.ask) {
        showHint("There's nothing to take back.");
        return;
      }
      followUp.current = null;
      const { text, images } = r.ask;
      setInput(text);
      setAttachments(canSeeImages ? images.slice(0, MAX_IMAGES).map((url) => ({ id: nextId(), url })) : []);
      setPreview(null);
      setActionError("");
      reset();
      await loadHistory();
      inputRef.current?.focus();
      showHint(
        r.ran
          ? `Message restored. ${r.ran === 1 ? "A change" : `${r.ran} changes`} had already run and stay${r.ran === 1 ? "s" : ""} in place.`
          : "Message restored. Edit it and send again.",
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : "Couldn't take that message back.");
    } finally {
      pendingRewind.current = false;
      rewinding.current = false;
    }
  };
  performRewindRef.current = performRewind;

  const rewind = () => {
    if (rewinding.current || !current) return;
    if (running) {
      pendingRewind.current = true;
      if (!stopping) stop();
      return;
    }
    performRewind();
  };

  // Esc twice in a row, with nothing typed, takes the last message back. Popovers and the surface
  // preview own a single Esc, so they keep it.
  escRef.current = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.repeat) return;
    const busyPanel = !!preview || showScenes || showAudit || showHistory || showMemory || showArtifacts;
    if (busyPanel || input.trim() || attachments.length || !historyReady) {
      lastEsc.current = 0;
      return;
    }
    const now = performance.now();
    if (now - lastEsc.current < 450) {
      lastEsc.current = 0;
      rewind();
    } else {
      lastEsc.current = now;
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => escRef.current(e);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const presence = stopping ? "stopping" : busyProposal ? "finishing" : status || (sending ? "thinking" : "");
  const canSend = !stopping && (input.trim().length > 0 || attachments.length > 0);
  // While the agent works, the send button is the Stop button until guidance is typed.
  const stopMode = running && (stopping || !canSend);
  const queuedSteers = current?.steers.filter((s) => s.state !== "delivered") ?? [];
  const previewMeta = preview ? surfaces?.find((x) => x.id === preview) : undefined;

  const stageKey = preview ? `p:${preview}` : !historyReady ? "loading" : (current?.id ?? "idle");
  let stage: ReactNode = null;
  if (preview) {
    stage = (
      <div className="mx-auto flex w-full min-w-0 max-w-[1000px] flex-1 flex-col gap-[18px] p-[8px_20px_24px_20px] sm:p-[8px_40px_24px_40px]">
        <div className="flex flex-row items-center justify-between gap-[12px] rounded-[14px] bg-[var(--glass)] p-[7px_7px_7px_14px] motion-safe:animate-blur-rise [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
          <span className="min-w-0 truncate text-[11.5px] text-[var(--muted)]">
            <span className="font-code text-[var(--accent-2)]">LIVE</span> · {previewMeta?.name ?? preview}
            {surfaceHost.trim() ? ` · ${surfaceHost.trim()}` : ""}
          </span>
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="flex shrink-0 cursor-pointer flex-row items-center gap-[7px] rounded-full bg-[var(--surface)] px-[11px] py-[4px] text-[11px] text-[var(--ink)] transition-colors duration-150 ease-enter hover:bg-[var(--soft)] [outline:1px_solid_var(--line)] [outline-offset:-0.5px]"
          >
            Close
            <kbd className="font-code hidden text-[9.5px] text-[var(--muted)] pointer-fine:inline">Esc</kbd>
          </button>
        </div>
        <LiveSurface key={`${preview}@${surfaceHost}`} scene={preview} host={surfaceHost.trim() || undefined} onAsk={(prompt) => { setPreview(null); send(prompt); }} />
      </div>
    );
  } else if (historyReady && current) {
    stage = (
      <div className="mx-auto flex w-full min-w-0 max-w-[1000px] flex-1 flex-col p-[8px_20px_24px_20px] sm:p-[8px_40px_24px_40px]">
        <TurnBlock
          turn={current}
          busyProposal={busyProposal}
          locked={running}
          onDecide={decide}
          onRetry={() => send(current.ask, current.images)}
          onAsk={(prompt) => send(prompt)}
          onOpenArtifact={openArtifact}
        />
        <AnimatePresence>
          {presence && (
            <motion.div
              key="presence"
              initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: spring.liquid, transitionEnd: { filter: "none" } }}
              exit={{ opacity: 0, scale: 0.96, filter: "blur(6px)", transition: { duration: 0.22, ease: ease.exit } }}
              className="w-fit origin-left pt-[4px] pb-[8px]"
            >
              <PresenceIndicator status={presence} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  } else if (historyReady) {
    stage = <ConsoleIdle onPick={(text) => send(text)} />;
  }

  return (
    <div className="relative z-10 flex h-full w-full flex-col">
      <div role="status" aria-live="polite" className="pointer-events-none fixed top-[16px] left-1/2 z-40 -translate-x-1/2">
        <AnimatePresence>
          {actionError && (
            <motion.div
              key={actionError}
              initial={{ opacity: 0, y: -14, scale: 0.96, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: spring.liquid, transitionEnd: { filter: "none" } }}
              exit={{ opacity: 0, y: -10, scale: 0.97, filter: "blur(6px)", transition: { duration: 0.2, ease: ease.exit } }}
              className="flex flex-row items-center gap-[8px] rounded-full bg-[var(--glass)] p-[8px_16px] [backdrop-filter:blur(14px)] [box-shadow:0px_10px_30px_var(--shadow)] [outline:1px_solid_var(--line)] [outline-offset:-0.5px]"
            >
              <Icon name="triangle-alert" className="h-[13px] w-[13px] shrink-0 text-[var(--accent-2)]" />
              <span className="text-[12px] font-medium whitespace-nowrap text-[var(--ink)]">{actionError}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative z-20 flex w-full shrink-0 flex-row items-center gap-[2px] p-[10px_14px_0px_14px] sm:p-[12px_28px_0px_28px]">
        <IconButton icon="plus" label="New chat" onClick={startNewConversation} disabled={sending} />
        <div className="ml-auto flex flex-row items-center gap-[2px]">
          <IconButton
            ref={themeButton}
            icon={theme === "dark" ? "sun" : "moon"}
            label={theme === "dark" ? "Light mode" : "Dark mode"}
            onClick={() => onToggleTheme(themeButton.current)}
          />
          <IconButton ref={historyButton} icon="history" label="History" active={showHistory} onClick={() => togglePanel("history")} />
          <IconButton ref={artifactsButton} icon="file-text" label="Artifacts" active={showArtifacts} onClick={() => togglePanel("artifacts")} />
          <IconButton ref={memoryButton} icon="bookmark" label="Memory" active={showMemory} onClick={() => togglePanel("memory")} />
          <IconButton ref={scenesButton} icon="box" label="Surfaces" active={showScenes} onClick={() => togglePanel("scenes")} />
          <IconButton
            ref={auditButton}
            icon="scroll-text"
            label="Activity"
            active={showAudit}
            dot={unseenActivity}
            onClick={() => togglePanel("audit")}
          />
        </div>

        <Popover
          open={showHistory}
          onClose={closeHistory}
          anchorRef={historyButton}
          label="History"
          className="right-[14px] w-[min(440px,calc(100vw-28px))] sm:right-[28px]"
        >
          <div className="flex max-h-[min(60vh,440px)] flex-col overflow-y-auto p-[8px]">
            <div className="px-[10px] pt-[4px] pb-[6px] text-[12px] font-medium text-[var(--ink)]">History</div>
            {conversations === null && <div className="p-[10px] text-[12px] text-[var(--muted)]">Loading…</div>}
            {conversations?.length === 0 && <div className="p-[10px] text-[12px] text-[var(--muted)]">Your past conversations will appear here.</div>}
            <AnimatePresence initial={false}>
              {conversations?.map((c) => {
                const active = c.id === currentConversationId();
                return (
                  <motion.div key={c.id} {...collapseY(reduce)}>
                    <div
                      className={`group/row flex flex-row items-center gap-[4px] rounded-[10px] transition-colors duration-150 ease-enter hover:bg-[var(--soft)] focus-within:bg-[var(--soft)] ${active ? "bg-[var(--soft)]" : ""}`}
                    >
                      <button
                        type="button"
                        disabled={running}
                        onClick={() => openConversation(c.id)}
                        className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-[1px] p-[7px_4px_7px_10px] text-left disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="flex w-full min-w-0 flex-row items-center gap-[7px]">
                          {active && <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--accent)] [box-shadow:0px_0px_6px_var(--glow)]" />}
                          <span className="min-w-0 truncate text-[12.5px] text-[var(--ink)]">{c.title}</span>
                        </span>
                        <span className="text-[10.5px] text-[var(--muted)]">
                          {c.messages} message{c.messages === 1 ? "" : "s"} · {timeAgo(c.updatedAt)}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={running && active}
                        aria-label={`Delete "${c.title}"`}
                        onClick={() => removeConversation(c.id)}
                        className="mr-[6px] flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--muted)] transition-[opacity,color,background-color] duration-150 ease-enter hover:bg-[var(--surface)] hover:text-[var(--danger)] focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100"
                      >
                        <Icon name="plus" className="h-[12px] w-[12px] rotate-45" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </Popover>

        <Popover
          open={showArtifacts}
          onClose={closeArtifacts}
          anchorRef={artifactsButton}
          label="Artifacts"
          className="right-[14px] w-[min(560px,calc(100vw-28px))] sm:right-[28px]"
        >
          <div className="flex max-h-[min(70vh,560px)] flex-col overflow-y-auto p-[8px]">
            {openedArtifact ? (
              <div className="flex flex-col gap-[10px] p-[4px_6px_8px_6px]">
                <div className="flex flex-row items-center gap-[6px]">
                  <button
                    type="button"
                    onClick={() => setOpenedArtifact(null)}
                    className="flex shrink-0 cursor-pointer flex-row items-center gap-[5px] rounded-full px-[9px] py-[4px] text-[11.5px] text-[var(--muted)] transition-colors duration-150 ease-enter hover:bg-[var(--soft)] hover:text-[var(--ink)]"
                  >
                    <Icon name="arrow-up" className="h-[10px] w-[10px] -rotate-90" />
                    All
                  </button>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--ink)]">{openedArtifact.title}</span>
                  <button
                    type="button"
                    onClick={() => copyArtifact(openedArtifact)}
                    className="shrink-0 cursor-pointer rounded-full px-[9px] py-[4px] text-[11.5px] text-[var(--muted)] transition-colors duration-150 ease-enter hover:bg-[var(--soft)] hover:text-[var(--ink)]"
                  >
                    {copiedArtifact ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeArtifact(openedArtifact.id)}
                    className="shrink-0 cursor-pointer rounded-full px-[9px] py-[4px] text-[11.5px] text-[var(--muted)] transition-colors duration-150 ease-enter hover:bg-[var(--soft)] hover:text-[var(--danger)]"
                  >
                    Delete
                  </button>
                </div>
                <div className="min-w-0 px-[6px] pb-[4px]">
                  <Markdown text={openedArtifact.body} />
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-row items-baseline justify-between gap-[10px] px-[10px] pt-[4px] pb-[6px]">
                  <span className="text-[12px] font-medium text-[var(--ink)]">Artifacts</span>
                  <span className="text-[10.5px] text-[var(--muted)]">Documents the agent keeps for you</span>
                </div>
                {artifactList === null && <div className="p-[10px] text-[12px] text-[var(--muted)]">Loading…</div>}
                {artifactList?.length === 0 && (
                  <div className="p-[10px] text-[12px]/[18px] text-[var(--muted)]">
                    Nothing saved yet. Ask the agent to write down a runbook, checklist or config and it will keep it here.
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {artifactList?.map((a) => (
                    <motion.div key={a.id} {...collapseY(reduce)}>
                      <div className="group/row flex flex-row items-center gap-[4px] rounded-[10px] transition-colors duration-150 ease-enter hover:bg-[var(--soft)] focus-within:bg-[var(--soft)]">
                        <button
                          type="button"
                          onClick={() => viewArtifact(a.id)}
                          className="flex min-w-0 flex-1 cursor-pointer flex-row items-center gap-[9px] p-[8px_4px_8px_10px] text-left"
                        >
                          <Icon name="file-text" className="h-[13px] w-[13px] shrink-0 text-[var(--accent-2)]" />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-[12.5px] text-[var(--ink)]">{a.title}</span>
                            <span className="text-[10.5px] text-[var(--muted)]">
                              {a.chars.toLocaleString()} characters · {timeAgo(a.updatedAt)}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete "${a.title}"`}
                          onClick={() => removeArtifact(a.id)}
                          className="mr-[6px] flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--muted)] transition-[opacity,color,background-color] duration-150 ease-enter hover:bg-[var(--surface)] hover:text-[var(--danger)] focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100"
                        >
                          <Icon name="plus" className="h-[12px] w-[12px] rotate-45" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </>
            )}
          </div>
        </Popover>

        <Popover
          open={showMemory}
          onClose={closeMemory}
          anchorRef={memoryButton}
          label="Memory"
          className="right-[14px] w-[min(440px,calc(100vw-28px))] sm:right-[28px]"
        >
          <div className="flex max-h-[min(60vh,440px)] flex-col overflow-y-auto p-[8px]">
            <div className="flex flex-row items-baseline justify-between gap-[10px] px-[10px] pt-[4px] pb-[6px]">
              <span className="text-[12px] font-medium text-[var(--ink)]">Memory</span>
              <span className="text-[10.5px] text-[var(--muted)]">What the agent keeps in mind</span>
            </div>
            {memories === null && <div className="p-[10px] text-[12px] text-[var(--muted)]">Loading…</div>}
            {memories?.length === 0 && (
              <div className="p-[10px] text-[12px]/[18px] text-[var(--muted)]">
                Nothing yet. The agent saves lasting facts here, like how your server is set up or how you like things done.
              </div>
            )}
            <AnimatePresence initial={false}>
              {memories?.map((m) => (
                <motion.div key={m.id} {...collapseY(reduce)}>
                  <div className="group/row flex flex-row items-start gap-[8px] rounded-[10px] p-[7px_6px_7px_10px] transition-colors duration-150 ease-enter hover:bg-[var(--soft)] focus-within:bg-[var(--soft)]">
                    <Icon name="bookmark" className="mt-[3px] h-[11px] w-[11px] shrink-0 text-[var(--accent)]" />
                    <span className="min-w-0 flex-1 text-[12.5px]/[18px] text-[var(--ink)]">{m.text}</span>
                    <button
                      type="button"
                      aria-label={`Forget "${m.text}"`}
                      onClick={() => forgetNote(m.id)}
                      className="flex h-[22px] w-[22px] shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--muted)] transition-[opacity,color,background-color] duration-150 ease-enter hover:bg-[var(--surface)] hover:text-[var(--danger)] focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100"
                    >
                      <Icon name="plus" className="h-[12px] w-[12px] rotate-45" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </Popover>

        <Popover
          open={showScenes}
          onClose={closeScenes}
          anchorRef={scenesButton}
          label="Surfaces"
          className="right-[14px] w-[min(760px,calc(100vw-28px))] sm:right-[28px]"
        >
          <div className="flex max-h-[min(70vh,560px)] flex-col gap-[8px] overflow-y-auto p-[10px]">
            <div className="flex flex-row items-baseline justify-between gap-[10px] px-[8px] pt-[4px]">
              <span className="text-[12px] font-medium text-[var(--ink)]">Surfaces</span>
              <span className="text-[10.5px] text-[var(--muted)]">Read live when opened</span>
            </div>
            <div className="flex flex-row items-center gap-[8px] px-[8px] pb-[4px]">
              <label htmlFor="surface-host" className="shrink-0 text-[11px] text-[var(--muted)]">
                Server
              </label>
              <input
                id="surface-host"
                list="surface-hosts"
                value={surfaceHost}
                onChange={(e) => setSurfaceHost(e.target.value)}
                placeholder="This server, user@host over SSH, or agent:name"
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                className="font-code min-w-0 flex-1 rounded-[8px] bg-[var(--canvas)] px-[10px] py-[5px] text-[11.5px] text-[var(--ink)] outline-none [outline:1px_solid_var(--line)] placeholder:text-[var(--muted)] focus:[outline:1px_solid_var(--accent)]"
              />
              <datalist id="surface-hosts">
                {knownHosts.map((h) => (
                  <option key={h} value={h} />
                ))}
              </datalist>
            </div>
            <ConnectServer
              onPick={(host) => {
                setSurfaceHost(host);
                api.hosts().then((r) => setKnownHosts(r.hosts)).catch(() => {});
              }}
            />
            <div className="grid w-full grid-cols-1 gap-[2px] sm:grid-cols-2 lg:grid-cols-3">
              {surfaces?.map((scene, i) => (
                <button
                  key={scene.id}
                  type="button"
                  style={{ animationDelay: `${Math.min(i * 12, 320)}ms` }}
                  onClick={() => {
                    setPreview(scene.id);
                    setShowScenes(false);
                  }}
                  className="group flex w-full cursor-pointer flex-row items-center gap-[10px] rounded-[10px] p-[6px_10px] text-left transition-colors duration-150 ease-enter hover:bg-[var(--soft)] focus-visible:bg-[var(--soft)] motion-safe:animate-blur-rise"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[12.5px] text-[var(--ink)]">{scene.name}</span>
                    <span className="truncate text-[10.5px] text-[var(--muted)]">{scene.description}</span>
                  </span>
                </button>
              ))}
              {surfaces && surfaces.length === 0 && <div className="p-[10px] text-[12px] text-[var(--muted)]">Couldn't load the surfaces.</div>}
              {!surfaces && <div className="p-[10px] text-[12px] text-[var(--muted)]">Loading...</div>}
            </div>
          </div>
        </Popover>

        <Popover
          open={showAudit}
          onClose={closeAudit}
          anchorRef={auditButton}
          label="Activity"
          className="right-[14px] w-[min(440px,calc(100vw-28px))] sm:right-[28px]"
        >
          <div className="flex max-h-[min(60vh,420px)] flex-col overflow-y-auto p-[8px]">
            <div className="px-[10px] pt-[4px] pb-[6px] text-[12px] font-medium text-[var(--ink)]">Activity</div>
            {audit.length === 0 && <div className="p-[10px] text-[12px] text-[var(--muted)]">Nothing run yet.</div>}
            <AnimatePresence initial={false}>
              {audit.map((row) => (
                <motion.div key={row.id} {...collapseY(reduce)}>
                  <div className="group/row flex flex-row items-center gap-[10px] rounded-[10px] p-[7px_10px] transition-colors duration-150 ease-enter hover:bg-[var(--soft)]">
                    <span
                      title={row.kind === "act" ? "Action" : "Inspect"}
                      className={`h-[6px] w-[6px] shrink-0 rounded-full ${row.kind === "act" ? "bg-[var(--accent)] [box-shadow:0px_0px_6px_var(--glow)]" : "bg-[var(--line)]"}`}
                    />
                    <span className="sr-only">{row.kind === "act" ? "Action:" : "Inspect:"}</span>
                    <span className="font-code min-w-0 flex-1 truncate text-[11px] text-[var(--ink)]">{row.title || row.command}</span>
                    {row.auto && (
                      <span
                        title="Ran without approval (Full access)"
                        className="font-code shrink-0 rounded-full bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] px-[6px] py-[1px] text-[9px] tracking-[0.5px] text-[var(--danger)]"
                      >
                        AUTO
                      </span>
                    )}
                    <span className="font-code shrink-0 text-[10px] text-[var(--muted)] transition-opacity duration-200 ease-enter pointer-fine:opacity-40 pointer-fine:group-hover/row:opacity-100">
                      exit {row.exitCode} · {new Date(row.at).toLocaleTimeString()}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </Popover>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence initial={false}>
          <Stage
            key={stageKey}
            scrollerRef={scrollerRef}
            contentRef={contentRef}
            onScroll={onScroll}
            pinned={!preview && historyReady && !!current}
          >
            {stage}
          </Stage>
        </AnimatePresence>

        <AnimatePresence>
          {showJump && !preview && (
            <motion.button
              key="jump"
              type="button"
              onClick={jump}
              aria-label="Jump to latest"
              initial={{ opacity: 0, y: 12, scale: 0.9, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: spring.liquid, transitionEnd: { filter: "none" } }}
              exit={{ opacity: 0, y: 10, scale: 0.92, filter: "blur(4px)", transition: { duration: 0.18, ease: ease.exit } }}
              whileTap={{ scale: 0.95 }}
              className="absolute bottom-[14px] left-1/2 z-10 flex -translate-x-1/2 cursor-pointer flex-row items-center gap-[6px] rounded-full bg-[var(--glass)] py-[7px] pr-[14px] pl-[10px] text-[12px] font-medium text-[var(--ink)] transition-[background-color] duration-200 ease-enter hover:bg-[var(--surface)] [backdrop-filter:blur(14px)] [box-shadow:0px_8px_24px_var(--shadow)] [outline:1px_solid_var(--line)] [outline-offset:-0.5px]"
            >
              <Icon name="arrow-up" className="h-[12px] w-[12px] shrink-0 rotate-180 motion-safe:animate-[bob_1.6s_ease-in-out_infinite]" />
              Jump to latest
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <div className="relative z-10 flex w-full shrink-0 flex-col items-center p-[12px_16px_20px_16px] sm:p-[12px_20px_24px_20px]">
        {/* Guidance waiting for the agent's next step. It leaves this tray once delivered and
            appears in the turn above. */}
        <div className="flex w-full max-w-[800px] flex-col items-end">
          <AnimatePresence initial={false}>
            {queuedSteers.map((s) => (
              <motion.div key={s.localId} {...collapseY(reduce, { blur: true })} className="flex w-full justify-end">
                <div className="pb-[8px]">
                  <div
                    className={`glass relative flex max-w-full min-w-0 flex-row items-center gap-[8px] rounded-full p-[6px_12px_6px_10px] text-[12px] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px] ${
                      s.state === "dropped" ? "opacity-60" : ""
                    }`}
                  >
                    <Icon name="corner-down-right" className="h-[11px] w-[11px] shrink-0 text-[var(--muted)]" />
                    <span className="min-w-0 truncate text-[var(--ink)]">{s.text || "Image"}</span>
                    {s.images.length > 0 && (
                      <span className="font-code shrink-0 text-[10px] text-[var(--muted)]">
                        +{s.images.length} image{s.images.length === 1 ? "" : "s"}
                      </span>
                    )}
                    <span className="font-code flex shrink-0 flex-row items-center gap-[5px] text-[9.5px] tracking-[0.5px] text-[var(--muted)]">
                      {s.state === "dropped" ? (
                        "NOT SENT"
                      ) : (
                        <>
                          <span className="h-[5px] w-[5px] rounded-full bg-[var(--accent)] motion-safe:animate-[dot-pulse_1.4s_ease-in-out_infinite]" />
                          QUEUED
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div
          onDragEnter={(e) => {
            if (!dragHasFiles(e.dataTransfer)) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => {
            if (!dragHasFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(e) => {
            if (!dragHasFiles(e.dataTransfer)) return;
            e.preventDefault();
            setDragging(false);
            addImages(imageFiles(e.dataTransfer));
          }}
          className={`relative flex w-full max-w-[800px] shrink-0 flex-col items-stretch gap-[14px] rounded-[22px] bg-[var(--glass)] p-[18px_12px_12px_20px] transition-[outline-color,box-shadow] duration-300 ease-enter [box-shadow:0px_14px_40px_var(--shadow)] [outline-offset:-0.5px] ${
            // Full access turns the whole composer warm (rim, focus glow and the working light) so
            // the mode is never out of sight and never mixes with the usual green.
            mode === "full"
              ? "[--edge-1:var(--danger)] [--edge-2:color-mix(in_oklab,var(--danger)_55%,var(--ink))] [outline:1px_solid_color-mix(in_oklab,var(--danger)_40%,transparent)] focus-within:[box-shadow:0px_14px_40px_var(--shadow),0px_0px_0px_4px_color-mix(in_oklab,var(--danger)_16%,transparent)] focus-within:[outline-color:color-mix(in_oklab,var(--danger)_70%,transparent)]"
              : "[outline:1px_solid_var(--hairline)] focus-within:[box-shadow:0px_14px_40px_var(--shadow),0px_0px_0px_4px_var(--glow)] focus-within:[outline-color:var(--accent)]"
          }`}
        >
          <AnimatePresence>
            {running && (
              <motion.span
                key="edge"
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-[inherit]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
              >
                <EdgeLight glow />
              </motion.span>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {dragging && (
              <motion.div
                key="drop"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={spring.snappy}
                className="pointer-events-none absolute inset-0 z-10 flex flex-row items-center justify-center gap-[8px] rounded-[inherit] bg-[color-mix(in_oklab,var(--accent)_12%,var(--surface))] text-[13px] font-medium text-[var(--accent-strong)] [outline:1.5px_dashed_var(--accent)] [outline-offset:-5px]"
              >
                <Icon name="image" className="h-[16px] w-[16px] shrink-0" />
                {canSeeImages ? "Drop to attach" : `${modelName || "This model"} can't see images`}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pasted or dropped images, waiting to be sent. */}
          <AnimatePresence initial={false}>
            {attachments.length > 0 && (
              <motion.div key="attachments" {...collapseY(reduce)} className="w-full">
                <div className="flex flex-row flex-wrap gap-[10px] pt-[4px] pr-[6px]">
                  <AnimatePresence initial={false} mode="popLayout">
                    {attachments.map((a, i) => (
                      <motion.div
                        key={a.id}
                        layout
                        initial={{ opacity: 0, scale: 0.6, filter: "blur(6px)" }}
                        animate={{ opacity: 1, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
                        exit={{ opacity: 0, scale: 0.6, filter: "blur(6px)" }}
                        transition={spring.liquid}
                        className="relative h-[56px] w-[56px] shrink-0"
                      >
                        <img
                          src={a.url}
                          alt={`Image ${i + 1} to send`}
                          className="h-full w-full rounded-[12px] object-cover [box-shadow:0px_6px_16px_var(--shadow)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]"
                        />
                        <button
                          type="button"
                          aria-label={`Remove image ${i + 1}`}
                          onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
                          className="absolute -top-[6px] -right-[6px] flex h-[20px] w-[20px] cursor-pointer items-center justify-center rounded-full bg-[var(--ink)] text-[var(--canvas)] transition-[transform,translate,scale] duration-200 ease-enter [box-shadow:0px_2px_6px_var(--shadow)] hover:scale-110"
                        >
                          <Icon name="plus" className="h-[11px] w-[11px] rotate-45" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <input
            ref={inputRef}
            value={input}
            aria-label="Message"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            onPaste={(e) => {
              const files = imageFiles(e.clipboardData);
              if (!files.length) return;
              e.preventDefault();
              addImages(files);
            }}
            placeholder={running ? "Add guidance — the agent picks it up at its next step" : "What would you like to know or do?"}
            className="w-full min-w-0 bg-transparent pr-[8px] text-[16px] text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
          />
          <div className="flex w-full min-w-0 shrink-0 flex-row items-center gap-[10px]">
            <ModeChip mode={mode} onChange={pickMode} disabled={running} />
            {models.length > 0 && model && <ModelChip models={models} value={model} onChange={pickModel} attention={chipAttention} />}
            {/* One button: Send when idle; while the agent works it is Stop (a stop square inside the
                turning loading ring), and becomes "send guidance" as soon as something is typed. */}
            <motion.button
              type="button"
              aria-label={stopMode ? (stopping ? "Stopping" : "Stop the agent") : running ? "Send guidance" : "Send"}
              title={stopMode ? (stopping ? "Stopping…" : "Stop") : undefined}
              disabled={stopMode ? stopping : !canSend}
              onClick={stopMode ? stop : submit}
              animate={{ scale: canSend || running ? 1 : 0.9, opacity: canSend || running ? 1 : 0.45 }}
              whileTap={(stopMode && !stopping) || canSend ? { scale: 0.9 } : undefined}
              transition={spring.snappy}
              className="group/send relative ml-auto flex h-[34px] w-[34px] shrink-0 cursor-pointer flex-row items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(-45deg,var(--accent),var(--accent-2))] transition-[filter] duration-200 ease-enter [box-shadow:0px_6px_18px_var(--glow)] hover:brightness-110 disabled:cursor-not-allowed disabled:hover:brightness-100"
            >
              <AnimatePresence initial={false}>
                {stopMode ? (
                  <motion.span
                    key="stop"
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={spring.snappy}
                    className="absolute inset-0 flex items-center justify-center text-[var(--canvas)]"
                  >
                    <svg
                      viewBox="0 0 28 28"
                      aria-hidden="true"
                      className={`absolute h-[28px] w-[28px] ${
                        stopping ? "motion-safe:animate-[spin-slow_0.55s_linear_infinite]" : "motion-safe:animate-[spin-slow_1.1s_linear_infinite]"
                      }`}
                    >
                      <circle cx="14" cy="14" r="11.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
                      <circle cx="14" cy="14" r="11.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="20 52.3" />
                    </svg>
                    {!stopping && (
                      <Icon name="square" className="h-[11px] w-[11px] shrink-0 transition-transform duration-200 ease-enter group-hover/send:scale-110" />
                    )}
                  </motion.span>
                ) : (
                  <motion.span
                    key="ready"
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -18, opacity: 0 }}
                    transition={spring.snappy}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <Icon name="arrow-up" className="h-[16px] w-[16px] shrink-0 text-[var(--canvas)]" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {hint && (
            <motion.p key="hint" {...collapseY(reduce)} role="status" className="w-full max-w-[800px] text-center text-[11.5px] text-[var(--accent-strong)]">
              <span className="flex flex-row items-center justify-center gap-[6px] pt-[10px]">
                <Icon name="info" className="h-[12px] w-[12px] shrink-0" />
                {hint}
              </span>
            </motion.p>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {!hint && historyReady && !current && !preview && (
            <motion.p key="disclaimer" {...collapseY(reduce)} className="w-full text-center text-[11px] text-[var(--muted)]">
              <span className={`block pt-[10px] ${mode === "full" ? "text-[var(--danger)]" : ""}`}>{DISCLAIMER[mode]}</span>
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function Console() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [mood, setMood] = useState<AuroraMood>("idle");
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    api.me().then((r) => setAuthed(r.authenticated));
  }, []);

  // One aurora for the whole console, so it flows unbroken from load through login into the app.
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative h-dvh w-full overflow-hidden bg-[var(--canvas)]">
        <Aurora mood={mood} />
        <AnimatePresence mode="wait">
          {authed === false && <LoginGate key="login" onAuthed={() => setAuthed(true)} onMood={setMood} />}
          {authed === true && <ConsoleApp key="app" onMood={setMood} theme={theme} onToggleTheme={toggleTheme} />}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
