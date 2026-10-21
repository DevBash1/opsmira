import express from "express";
import { existsSync } from "fs";
import { join } from "path";
import cookieParser from "cookie-parser";
import { randomUUID } from "crypto";
import { env } from "./env.js";
import {
  checkPassword,
  issueSessionCookie,
  clearSessionCookie,
  requireAuth,
  isAuthenticated,
  sessionIdFromRequest,
} from "./auth.js";
import { runTurn } from "./ai.js";
import { getModels, getModelInfo } from "./models.js";
import { contentImages, contentText, parseUserInput, userContent } from "./content.js";
import { runCommand } from "./exec.js";
import { getSession, deleteSession, persistSession, removeConversation } from "./state.js";
import { appendAudit, deleteArtifact, listArtifacts, listConversations, readArtifact, readAudit, readMemory, removeMemory } from "./store.js";
import { buildLastTurn, rewindLast } from "./history.js";
import { startSampler } from "./metrics.js";
import { knownHosts } from "./machine.js";
import { AGENT_PATH, attachAgentGateway, createPairingToken, listAgents, revokeAgent } from "./agents.js";
import { collectSurface, surfaceList } from "./surfaces.js";

const app = express();
app.disable("x-powered-by");
if (env.trustProxy) app.set("trust proxy", true);
// Generous limit: pasted screenshots arrive as data URLs (validated and capped in content.js).
app.use(express.json({ limit: "16mb" }));
app.use(cookieParser());

const CONVERSATION_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Tab-scoped conversation id (kept in the tab's sessionStorage); cookie-only fallback for old clients. */
function conversationIdFromRequest(req) {
  const id = req.get("x-opsmira-conversation");
  return typeof id === "string" && CONVERSATION_ID.test(id) ? id : undefined;
}

// The agent program itself. Public on purpose: it is only code. What authorizes an agent is the token.
app.get("/agent/opsmira-agent.mjs", (req, res) => {
  res.type("text/javascript").sendFile(env.agentFile, (err) => {
    if (err && !res.headersSent) res.status(404).type("text").send("The agent file is not part of this install.");
  });
});

app.post("/api/login", (req, res) => {
  if (!checkPassword(req.body?.password)) {
    res.status(401).json({ error: "Wrong password" });
    return;
  }
  issueSessionCookie(req, res);
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  const id = sessionIdFromRequest(req);
  if (id) deleteSession(id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

app.use("/api", requireAuth);

app.get("/api/history", (req, res) => {
  const { conversation, pendingApprovals } = getSession(req.sessionId, conversationIdFromRequest(req));
  // The latest turn, rebuilt with its tool pills, surface, approvals and follow-up chips.
  const turn = buildLastTurn(conversation, pendingApprovals);
  const shown = new Set((turn?.proposals ?? []).map((p) => p.id));
  res.json({
    turn,
    pending: [...pendingApprovals.values()].filter((p) => p.status === "pending" && !shown.has(p.id)),
  });
});

/** Past conversations, newest first, for the History menu. */
app.get("/api/conversations", (req, res) => {
  res.json({ conversations: listConversations(), current: conversationIdFromRequest(req) ?? null });
});

app.delete("/api/conversations/:id", (req, res) => {
  if (!CONVERSATION_ID.test(req.params.id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  if (!removeConversation(req.sessionId, req.params.id)) return busy(res);
  res.json({ ok: true });
});

/**
 * Take back the owner's latest message: it, and everything the agent did after it, leave the
 * conversation so the message can be edited and sent again. Changes that already ran stay run.
 */
app.post("/api/rewind", (req, res) => {
  const session = getSession(req.sessionId, conversationIdFromRequest(req));
  if (session.run) return busy(res);
  const undone = rewindLast(session.conversation);
  if (!undone) {
    res.json({ rewound: false });
    return;
  }
  for (const id of undone.droppedProposals) session.pendingApprovals.delete(id);
  persistSession(session);
  res.json({ rewound: true, ask: undone.ask, ran: undone.ran });
});

/** The live surfaces this server can read, and a fresh reading of one (used by the Surfaces menu). */
app.get("/api/surfaces", (req, res) => {
  res.json({ surfaces: surfaceList() });
});

app.get("/api/agents", (req, res) => {
  res.json({ agents: listAgents() });
});

/** A one-time command that connects a server to this console. */
app.post("/api/agents/token", (req, res) => {
  const { token, expiresAt } = createPairingToken();
  const origin = `${req.protocol}://${req.get("host")}`;
  const ws = origin.replace(/^http/, "ws") + AGENT_PATH;
  res.json({
    token,
    expiresAt,
    command: `curl -fsSL ${origin}/agent/opsmira-agent.mjs -o opsmira-agent.mjs && node opsmira-agent.mjs --server ${ws} --token ${token}`,
  });
});

app.delete("/api/agents/:id", (req, res) => {
  if (!revokeAgent(req.params.id)) {
    res.status(404).json({ error: "No such server" });
    return;
  }
  res.json({ ok: true });
});

app.get("/api/hosts", (req, res) => {
  res.json({ hosts: knownHosts() });
});

app.get("/api/surfaces/:id", async (req, res) => {
  const target = typeof req.query.target === "string" && req.query.target ? req.query.target.slice(0, 300) : undefined;
  const host = typeof req.query.host === "string" && req.query.host ? req.query.host.slice(0, 160) : undefined;
  const read = await collectSurface(req.params.id, { target, host });
  if (read.ok) res.json({ scene: read.scene, data: read.data });
  else res.json({ scene: "unavailable", data: { for: read.scene ?? req.params.id, reason: read.reason, hint: read.hint, ...(read.ssh ? { ssh: read.ssh } : {}) } });
});

app.get("/api/artifacts", (req, res) => {
  res.json({ artifacts: listArtifacts() });
});

app.get("/api/artifacts/:id", (req, res) => {
  const artifact = readArtifact(req.params.id);
  if (!artifact) {
    res.status(404).json({ error: "No saved artifact with that id" });
    return;
  }
  res.json({ artifact });
});

app.delete("/api/artifacts/:id", (req, res) => {
  if (!deleteArtifact(req.params.id)) {
    res.status(404).json({ error: "No saved artifact with that id" });
    return;
  }
  res.json({ ok: true });
});

app.get("/api/memory", (req, res) => {
  res.json({ memories: readMemory() });
});

app.delete("/api/memory/:id", (req, res) => {
  if (!removeMemory(req.params.id)) {
    res.status(404).json({ error: "No saved note with that id" });
    return;
  }
  res.json({ ok: true });
});

app.get("/api/audit", (req, res) => {
  res.json({ entries: readAudit(100) });
});

app.get("/api/models", async (req, res) => {
  const models = await getModels();
  res.json({ models, default: env.model });
});

/** One turn at a time per conversation. Returns the new run, or null if one is already in flight. */
function beginRun(session, vision) {
  if (session.run) return null;
  session.run = { abort: new AbortController(), steers: [], vision };
  return session.run;
}

function endRun(session, run) {
  if (session.run === run) session.run = null;
}

function busy(res) {
  res.status(409).json({ error: "The agent is still working on the last request.", code: "busy" });
}

const NO_VISION = "This model can't read images. Pick a model with vision, or send without the image.";

async function resolveModel(requested, fallback) {
  const catalog = await getModels();
  return catalog.some((m) => m.id === requested) ? requested : fallback;
}

/** Unknown models are treated as text-only, so images are never sent somewhere that can't take them. */
async function visionFor(model) {
  return (await getModelInfo(model || env.model))?.vision ?? false;
}

app.post("/api/chat", async (req, res) => {
  const input = parseUserInput(req.body);
  if (input.error) {
    res.status(400).json({ error: input.error });
    return;
  }
  const model = await resolveModel(req.body?.model, undefined);
  const vision = await visionFor(model);
  if (input.images.length && !vision) {
    res.status(400).json({ error: NO_VISION, code: "no_vision" });
    return;
  }
  const session = getSession(req.sessionId, conversationIdFromRequest(req));
  let run = beginRun(session, vision);
  // The owner pressed Stop and sent the next message right away: let the old turn wind down (an approved
  // command can take up to its timeout) instead of refusing the new one.
  if (!run && session.run?.abort.signal.aborted) {
    for (let waited = 0; waited < 35_000 && session.run; waited += 100) await new Promise((r) => setTimeout(r, 100));
    run = beginRun(session, vision);
  }
  if (!run) return busy(res);
  const { conversation, pendingApprovals } = session;
  if (model) session.lastModel = model;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event) => {
    if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const keepAlive = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(": ping\n\n");
  }, 15000);
  // The tab closing (or the client aborting its stream) stops the agent too.
  res.on("close", () => {
    if (!res.writableEnded) run.abort.abort();
  });

  conversation.push({ role: "user", content: userContent(input.text, input.images), ask: true });

  try {
    await runTurn(conversation, send, model, pendingApprovals, { signal: run.abort.signal, steers: run.steers, vision, fullAccess: req.body?.mode === "full" });
  } catch (err) {
    if (!run.abort.signal.aborted) send({ type: "error", text: err.message, code: err.code });
  } finally {
    // Release first and synchronously: from here no steering message can join this turn.
    endRun(session, run);
    persistSession(session);
    clearInterval(keepAlive);
    send({ type: "done" });
    res.end();
  }
});

/**
 * Guidance sent while the agent works. It is picked up at the agent's next step; if no turn is
 * running (or it is being stopped) the client sends it as a normal message instead.
 */
app.post("/api/steer", (req, res) => {
  const input = parseUserInput(req.body);
  if (input.error) {
    res.status(400).json({ error: input.error });
    return;
  }
  const { run } = getSession(req.sessionId, conversationIdFromRequest(req));
  if (!run || run.abort.signal.aborted) {
    res.json({ queued: false });
    return;
  }
  if (input.images.length && !run.vision) {
    res.status(400).json({ error: NO_VISION, code: "no_vision" });
    return;
  }
  const id = randomUUID();
  run.steers.push({ id, content: userContent(input.text, input.images) });
  res.json({ queued: true, id });
});

/** Stop the agent. An approved action that is already executing finishes; nothing after it runs. */
app.post("/api/stop", (req, res) => {
  const { run } = getSession(req.sessionId, conversationIdFromRequest(req));
  if (!run) {
    res.json({ stopped: false });
    return;
  }
  run.abort.abort();
  res.json({ stopped: true });
});

app.post("/api/approve", async (req, res) => {
  const id = req.body?.id;
  const session = getSession(req.sessionId, conversationIdFromRequest(req));
  const { conversation, pendingApprovals } = session;
  const proposal = pendingApprovals.get(id);
  if (!proposal || proposal.status !== "pending") {
    res.status(404).json({ error: "No pending proposal with that id" });
    return;
  }

  if (proposal.confirmPhrase) {
    const confirmText = typeof req.body?.confirmText === "string" ? req.body.confirmText : "";
    if (confirmText !== proposal.confirmPhrase) {
      res.status(400).json({ error: "Confirmation text doesn't match" });
      return;
    }
  }

  const model = await resolveModel(req.body?.model, session.lastModel);
  const vision = await visionFor(model);
  if (proposal.status !== "pending") {
    res.status(404).json({ error: "No pending proposal with that id" });
    return;
  }
  // Holding the run while the command executes also stops a double approve from running it twice.
  const run = beginRun(session, vision);
  if (!run) return busy(res);

  const events = [];
  let audit;
  try {
    // No abort signal: Stop never kills a change the owner approved halfway through.
    const result = await runCommand(proposal.command);
    proposal.status = "approved";
    proposal.result = result;
    audit = appendAudit({ id: randomUUID(), kind: "act", approvalId: id, command: proposal.command, title: proposal.title, ...result });

    conversation.push({
      role: "user",
      content: `[System] The owner approved action "${proposal.title}" (${proposal.command}). Exit code ${result.exitCode}. Output:\n${result.output || "(no output)"}`,
    });

    // The action resolving is only half the turn. Let the agent see the result
    // and close the loop instead of going silent after approval.
    try {
      await runTurn(conversation, (event) => events.push(event), model, pendingApprovals, {
        signal: run.abort.signal,
        steers: run.steers,
        vision,
        fullAccess: req.body?.mode === "full",
      });
    } catch (err) {
      if (!run.abort.signal.aborted) events.push({ type: "error", text: err.message, code: err.code });
    }
  } finally {
    endRun(session, run);
    persistSession(session);
  }

  res.json({ ok: true, proposal, audit, events });
});

app.post("/api/decline", async (req, res) => {
  const id = req.body?.id;
  const session = getSession(req.sessionId, conversationIdFromRequest(req));
  const { conversation, pendingApprovals } = session;
  const proposal = pendingApprovals.get(id);
  if (!proposal || proposal.status !== "pending") {
    res.status(404).json({ error: "No pending proposal with that id" });
    return;
  }

  const model = await resolveModel(req.body?.model, session.lastModel);
  const vision = await visionFor(model);
  if (proposal.status !== "pending") {
    res.status(404).json({ error: "No pending proposal with that id" });
    return;
  }
  const run = beginRun(session, vision);
  if (!run) return busy(res);

  const events = [];
  try {
    proposal.status = "declined";
    conversation.push({
      role: "user",
      content: `[System] The owner declined action "${proposal.title}" (${proposal.command}). Do not run it.`,
    });
    try {
      await runTurn(conversation, (event) => events.push(event), model, pendingApprovals, {
        signal: run.abort.signal,
        steers: run.steers,
        vision,
        fullAccess: req.body?.mode === "full",
      });
    } catch (err) {
      if (!run.abort.signal.aborted) events.push({ type: "error", text: err.message, code: err.code });
    }
  } finally {
    endRun(session, run);
    persistSession(session);
  }

  res.json({ ok: true, proposal, events });
});

// The built web app. A self-hosted install opens straight into the console; OPSMIRA_SITE=1 also serves
// the marketing pages. Anything that is not a file falls back to index.html (client-side routing).
if (existsSync(join(env.webDir, "index.html"))) {
  app.use(express.static(env.webDir, { index: false, maxAge: "1h" }));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api/")) return next();
    if (!env.site && !req.path.startsWith("/app")) {
      res.redirect(302, "/app");
      return;
    }
    res.sendFile(join(env.webDir, "index.html"));
  });
} else {
  console.log(`No web build found at ${env.webDir}. Run "npm run build" to serve the console from this server.`);
}

startSampler();

const server = app.listen(env.port, env.host, () => {
  console.log(`Opsmira server listening on http://${env.host}:${env.port}`);
});
attachAgentGateway(server);
