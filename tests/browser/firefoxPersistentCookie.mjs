import assert from "node:assert/strict";
import { createServer } from "node:https";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

if (!process.env.ANDON_TEST_TLS_KEY || !process.env.ANDON_TEST_TLS_CERT)
  throw new Error("Firefox test needs isolated TLS certificate and key");
const { firefox } = await import(process.env.ANDON_PLAYWRIGHT_MODULE || "playwright");
const [key, cert] = await Promise.all([
  readFile(process.env.ANDON_TEST_TLS_KEY),
  readFile(process.env.ANDON_TEST_TLS_CERT),
]);
const profile = await mkdtemp(join(tmpdir(), "andon-firefox-persistent-"));
const cookieName = "__Host-andon-access";
let logins = 0;
const server = createServer({ key, cert }, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "POST" && req.url === "/login") {
    logins++;
    res.setHeader("Set-Cookie",
      cookieName + "=" + "a".repeat(64) +
      "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=34560000");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ persistentOperational: true }));
    return;
  }
  if (req.url === "/session") {
    const present = (req.headers.cookie || "").split(";")
      .some(entry => entry.trim().startsWith(cookieName + "="));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ persistentOperational: present }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<!doctype html><title>Firefox ANDON isolated persistence test</title>");
});
let first, second;
try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const origin = "https://127.0.0.1:" + port;
  first = await firefox.launchPersistentContext(profile, {
    headless: true, ignoreHTTPSErrors: true,
  });
  let page = await first.newPage();
  await page.goto(origin);
  const login = await page.evaluate(async () => {
    const response = await fetch("/login", { method: "POST", credentials: "include" });
    return response.json();
  });
  assert.equal(login.persistentOperational, true);
  const cookies = await first.cookies(origin);
  const item = cookies.find(cookie => cookie.name === cookieName);
  assert(item, "Firefox rejected the secure host-only cookie");
  assert.equal(item.httpOnly, true);
  assert.equal(item.secure, true);
  assert.equal(item.sameSite, "Strict");
  assert(item.expires > Date.now() / 1000 + 24 * 60 * 60,
    "Firefox did not persist an absolute expiration");
  await first.close();
  first = null;

  // Restart an actual Firefox process with THE SAME persisted profile.
  second = await firefox.launchPersistentContext(profile, {
    headless: true, ignoreHTTPSErrors: true,
  });
  page = await second.newPage();
  await page.goto(origin);
  const resumed = await page.evaluate(async () => {
    const response = await fetch("/session", { credentials: "include" });
    return response.json();
  });
  assert.equal(resumed.persistentOperational, true,
    "Normal Firefox profile must preserve HttpOnly cookie through restart");
  assert.equal(logins, 1, "Firefox must not need another password login");
  process.stdout.write("P0 Firefox persistent cookie restart test PASS\n");
} finally {
  if (first) await first.close();
  if (second) await second.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
}
