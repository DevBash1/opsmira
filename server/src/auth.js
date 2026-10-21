import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import { env } from "./env.js";

const COOKIE_NAME = "opsmira_session";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function sign(value) {
  return createHmac("sha256", env.sessionSecret).update(value).digest("hex");
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function checkPassword(candidate) {
  if (typeof candidate !== "string" || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(env.password);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Issues a fresh, unique session cookie and returns its session id. */
export function issueSessionCookie(req, res) {
  const id = randomUUID();
  const expires = Date.now() + MAX_AGE_MS;
  const payload = `${id}.${expires}`;
  const token = `${payload}.${sign(payload)}`;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    // Secure only over HTTPS (req.secure follows X-Forwarded-Proto when OPSMIRA_TRUST_PROXY is on).
    secure: req.secure,
    maxAge: MAX_AGE_MS,
  });
  return id;
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

function parseToken(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, expires, sig] = parts;
  if (!id || !expires) return null;
  const payload = `${id}.${expires}`;
  if (!safeEqual(sig, sign(payload))) return null;
  if (Number(expires) <= Date.now()) return null;
  return id;
}

/** Reads the session id straight off the request, without requiring auth to already be enforced upstream. */
export function sessionIdFromRequest(req) {
  return parseToken(req.cookies?.[COOKIE_NAME]);
}

export function requireAuth(req, res, next) {
  const id = sessionIdFromRequest(req);
  if (!id) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  req.sessionId = id;
  next();
}

export function isAuthenticated(req) {
  return !!sessionIdFromRequest(req);
}
