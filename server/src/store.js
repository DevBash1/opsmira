import { appendFileSync, readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { env } from "./env.js";

const DATA_DIR = env.dataDir;
const AUDIT_PATH = join(DATA_DIR, "audit.jsonl");

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

export function appendAudit(entry) {
  const row = { id: entry.id, at: new Date().toISOString(), ...entry };
  appendFileSync(AUDIT_PATH, JSON.stringify(row) + "\n");
  return row;
}

export function readAudit(limit = 50) {
  if (!existsSync(AUDIT_PATH)) return [];
  const lines = readFileSync(AUDIT_PATH, "utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).map((l) => JSON.parse(l)).reverse();
}

// ---------- Memory: short durable notes the agent keeps about the owner and their server ----------

const MEMORY_PATH = join(DATA_DIR, "memory.json");
const MAX_MEMORIES = 50;
export const MAX_MEMORY_CHARS = 200;

function writeJson(path, value) {
  // Write beside the target and rename, so a crash never leaves half a file behind.
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value));
  renameSync(tmp, path);
}

export function readMemory() {
  try {
    const list = JSON.parse(readFileSync(MEMORY_PATH, "utf8"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const normal = (text) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** Returns { entry } (new), { entry, existing: true }, or { error }. */
export function addMemory(text) {
  const fact = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_MEMORY_CHARS);
  if (!fact) return { error: "a non-empty fact is required." };
  const list = readMemory();
  const dupe = list.find((m) => normal(m.text) === normal(fact));
  if (dupe) return { entry: dupe, existing: true };
  if (list.length >= MAX_MEMORIES) return { error: `memory is full (${MAX_MEMORIES}). Forget something stale first.` };
  const entry = { id: randomUUID().slice(0, 8), text: fact, at: new Date().toISOString() };
  writeJson(MEMORY_PATH, [...list, entry]);
  return { entry };
}

export function removeMemory(id) {
  const list = readMemory();
  const entry = list.find((m) => m.id === id);
  if (!entry) return null;
  writeJson(MEMORY_PATH, list.filter((m) => m.id !== id));
  return entry;
}

// ---------- Conversations: one JSON file per conversation, plus a small index for the history list ----------

const CONVERSATIONS_DIR = join(DATA_DIR, "conversations");
const INDEX_PATH = join(CONVERSATIONS_DIR, "index.json");
if (!existsSync(CONVERSATIONS_DIR)) mkdirSync(CONVERSATIONS_DIR, { recursive: true });

const ID = /^[A-Za-z0-9-]{8,64}$/;

function readIndex() {
  try {
    const index = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
    return index && typeof index === "object" ? index : {};
  } catch {
    return {};
  }
}

export function saveConversation(id, data) {
  if (!ID.test(id)) return;
  writeJson(join(CONVERSATIONS_DIR, `${id}.json`), data);
  const index = readIndex();
  index[id] = { id, title: data.title, updatedAt: data.updatedAt, createdAt: data.createdAt, messages: data.messages, ...(data.via ? { via: data.via } : {}) };
  writeJson(INDEX_PATH, index);
}

export function loadConversation(id) {
  if (!ID.test(id)) return null;
  try {
    return JSON.parse(readFileSync(join(CONVERSATIONS_DIR, `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

export function listConversations() {
  return Object.values(readIndex()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function deleteConversation(id) {
  if (!ID.test(id)) return false;
  const index = readIndex();
  const had = id in index || existsSync(join(CONVERSATIONS_DIR, `${id}.json`));
  delete index[id];
  writeJson(INDEX_PATH, index);
  rmSync(join(CONVERSATIONS_DIR, `${id}.json`), { force: true });
  return had;
}

// ---------- Artifacts: longer saved documents (runbooks, configs, checklists). Only titles reach the model until it loads one. ----------

const ARTIFACTS_DIR = join(DATA_DIR, "artifacts");
const ARTIFACT_INDEX = join(ARTIFACTS_DIR, "index.json");
if (!existsSync(ARTIFACTS_DIR)) mkdirSync(ARTIFACTS_DIR, { recursive: true });

const MAX_ARTIFACTS = 100;
export const MAX_ARTIFACT_TITLE = 80;
export const MAX_ARTIFACT_BODY = 20000;

function readArtifactIndex() {
  try {
    const index = JSON.parse(readFileSync(ARTIFACT_INDEX, "utf8"));
    return index && typeof index === "object" ? index : {};
  } catch {
    return {};
  }
}

/** Titles only, newest first. This is all the model sees until it asks for a body. */
export function listArtifacts() {
  return Object.values(readArtifactIndex()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function readArtifact(id) {
  if (!/^[A-Za-z0-9-]{4,64}$/.test(String(id))) return null;
  try {
    return JSON.parse(readFileSync(join(ARTIFACTS_DIR, `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Create an artifact, or update one (by id, else by the same title). Returns { artifact, created } or { error }.
 */
export function saveArtifact({ id, title, body }) {
  const name = String(title ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_ARTIFACT_TITLE);
  const text = String(body ?? "").trim();
  if (!name) return { error: "a non-empty title is required." };
  if (!text) return { error: "a non-empty body is required." };
  if (text.length > MAX_ARTIFACT_BODY) return { error: `the body is too long (max ${MAX_ARTIFACT_BODY} characters). Save a shorter version or split it.` };
  const index = readArtifactIndex();
  const same = Object.values(index).find((a) => a.title.toLowerCase() === name.toLowerCase());
  const existingId = id && index[id] ? id : same?.id;
  if (!existingId && Object.keys(index).length >= MAX_ARTIFACTS) return { error: `too many artifacts (${MAX_ARTIFACTS}). Delete one first.` };
  const now = new Date().toISOString();
  const previous = existingId ? readArtifact(existingId) : null;
  const artifact = {
    id: existingId ?? randomUUID().slice(0, 8),
    title: name,
    body: text,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
  writeJson(join(ARTIFACTS_DIR, `${artifact.id}.json`), artifact);
  index[artifact.id] = { id: artifact.id, title: name, updatedAt: now, chars: text.length };
  writeJson(ARTIFACT_INDEX, index);
  return { artifact, created: !existingId };
}

export function deleteArtifact(id) {
  const index = readArtifactIndex();
  const entry = index[id];
  if (!entry) return null;
  delete index[id];
  writeJson(ARTIFACT_INDEX, index);
  rmSync(join(ARTIFACTS_DIR, `${id}.json`), { force: true });
  return entry;
}
