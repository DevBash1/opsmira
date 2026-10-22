// Sign-in: username and password, both checked, and wrong guesses slow down.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
process.env.OPSMIRA_USERNAME = "Ops";
process.env.OPSMIRA_PASSWORD = "correct horse";
const { checkLogin, loginBlockedFor, noteLoginFailure, clearLoginFailures } = await import("../src/auth.js");

test("both the username and the password must match", () => {
  assert.equal(checkLogin("ops", "correct horse"), true);
  assert.equal(checkLogin("  OPS ", "correct horse"), true); // the name is not case or space sensitive
  assert.equal(checkLogin("ops", "wrong"), false);
  assert.equal(checkLogin("admin", "correct horse"), false);
  assert.equal(checkLogin("", ""), false);
  assert.equal(checkLogin(undefined, "correct horse"), false);
  assert.equal(checkLogin("ops", "Correct horse"), false); // the password is
});

test("five failures block an address, a success clears it", () => {
  const ip = "203.0.113.9";
  for (let i = 0; i < 4; i++) noteLoginFailure(ip);
  assert.equal(loginBlockedFor(ip), 0);
  noteLoginFailure(ip);
  assert.ok(loginBlockedFor(ip) > 0);
  assert.equal(loginBlockedFor("198.51.100.1"), 0); // others are unaffected
  clearLoginFailures(ip);
  assert.equal(loginBlockedFor(ip), 0);
});

test("signing out revokes the session even for a copied cookie", async () => {
  const { issueSessionCookie, isAuthenticated, revokeSession } = await import("../src/auth.js");
  let cookie = "";
  issueSessionCookie({ secure: false }, { cookie: (_name, value) => (cookie = value) });
  const req = { cookies: { opsmira_session: cookie } };
  assert.equal(isAuthenticated(req), true);
  revokeSession(req);
  assert.equal(isAuthenticated(req), false); // the same cookie, replayed
  assert.equal(isAuthenticated({ cookies: { opsmira_session: "forged.1.abc" } }), false);
});
