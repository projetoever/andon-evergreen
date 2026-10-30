import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

if (
  process.env.ANDON_INTEGRATION_TEST !== "1" ||
  new URL(process.env.DATABASE_URL ?? "").pathname !== "/andon_test"
)
  throw Error("Isolated andon_test required");

const temp = mkdtempSync(join(tmpdir(), "andon-https-runtime-"));
const certPath = join(temp, "cert.pem");
const keyPath = join(temp, "key.pem");
const cert = () => readFileSync(certPath);
const origin = "https://localhost:8443";

execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ],
  { stdio: "ignore" },
);

async function unusedPort() {
  return new Promise((resolve, reject) => {
    const listener = createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      const port = typeof address === "object" && address ? address.port : 0;
      listener.close(() => resolve(port));
    });
  });
}

function request(client, options, body) {
  return new Promise((resolve, reject) => {
    const req = client(options, (response) => {
      let body = "";
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () =>
        resolve({ status: response.statusCode, headers: response.headers, body }),
      );
    });
    req.once("error", reject);
    req.end(body);
  });
}

async function waitForTls(port) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      return await request(httpsRequest, {
        hostname: "localhost",
        port,
        path: "/health",
        ca: cert(),
      });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("HTTPS runtime did not become ready");
}

let api;
let legacy;
const db = new PrismaClient();
let originalSettings;
try {
  // No hardcoded password: exercise the same first-run path a customer sees.
  // This script is guarded above and must never mutate a non-test database.
  originalSettings = await db.systemSettings.findUnique({
    where: { id: "global" },
    select: { adminPasswordHash: true },
  });
  await db.systemSettings.upsert({
    where: { id: "global" },
    update: { adminPasswordHash: null },
    create: { id: "global", adminPasswordHash: null },
  });
  const tlsPort = await unusedPort();
  api = spawn(process.execPath, ["dist/server.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(tlsPort),
      ANDON_TLS_CERT: certPath,
      ANDON_TLS_KEY: keyPath,
      CORS_ORIGINS: origin,
      ANDON_ACCESS_ORIGIN: origin,
      ANDON_CENTRAL_ACCESS_ENABLED: "1",
    },
    stdio: "ignore",
  });

  const health = await waitForTls(tlsPort);
  assert.equal(health.status, 200);

  await assert.rejects(
    request(httpsRequest, { hostname: "localhost", port: tlsPort, path: "/health" }),
    /self-signed certificate|unable to verify/i,
  );
  await assert.rejects(
    request(httpRequest, { hostname: "127.0.0.1", port: tlsPort, path: "/health" }),
  );

  const bootstrapHeaders = { Origin: origin };
  const status = await request(httpsRequest, {
    hostname: "localhost", port: tlsPort, path: "/api/admin-auth/status",
    ca: cert(), headers: bootstrapHeaders,
  });
  assert.equal(status.status, 200);
  const initialState = JSON.parse(status.body);
  assert.equal(initialState.passwordConfigured, false);
  assert.equal(initialState.setupAvailable, true);
  assert.match(initialState.setupToken ?? "", /^[a-f0-9]{64}$/);

  const beforeSetup = await request(httpsRequest, {
    hostname: "localhost", port: tlsPort, path: "/api/access/session",
    ca: cert(), headers: bootstrapHeaders,
  });
  assert.equal(beforeSetup.status, 428);
  assert.equal(JSON.parse(beforeSetup.body).error, "initial_admin_setup_required");

  const password = "Hml#T9xB7";
  const setupBody = JSON.stringify({ setupToken: initialState.setupToken, password });
  const setup = await request(httpsRequest, {
    hostname: "localhost", port: tlsPort, path: "/api/admin-auth/initialize",
    method: "POST", ca: cert(),
    headers: { ...bootstrapHeaders, "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(setupBody) },
  }, setupBody);
  assert.equal(setup.status, 200, setup.body);
  assert.equal(JSON.parse(setup.body).passwordConfigured, true);

  const readyStatus = await request(httpsRequest, {
    hostname: "localhost", port: tlsPort, path: "/api/admin-auth/status",
    ca: cert(), headers: bootstrapHeaders,
  });
  assert.equal(JSON.parse(readyStatus.body).passwordConfigured, true);
  assert.equal(JSON.parse(readyStatus.body).setupToken, undefined);

  const workstationId = `ws_${crypto.randomUUID()}`;
  const registrationBody = JSON.stringify({ id: workstationId });
  const registered = await request(
    httpsRequest,
    {
      hostname: "localhost",
      port: tlsPort,
      path: "/api/workstations/register",
      method: "POST",
      ca: cert(),
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(registrationBody),
        "X-Andon-Workstation-Id": workstationId,
      },
    },
    registrationBody,
  );
  assert.equal(registered.status, 200);

  const allowed = await request(httpsRequest, {
    hostname: "localhost",
    port: tlsPort,
    path: "/api/access/session",
    ca: cert(),
    headers: { Origin: origin, "X-Andon-Workstation-Id": workstationId },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers["access-control-allow-origin"], origin);

  const denied = await request(httpsRequest, {
    hostname: "localhost",
    port: tlsPort,
    path: "/api/access/session",
    ca: cert(),
    headers: {
      Origin: "https://untrusted.example",
      "X-Andon-Workstation-Id": workstationId,
    },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers["access-control-allow-origin"], undefined);

  const apiExit = new Promise((resolve) => api.once("exit", resolve));
  api.kill("SIGTERM");
  await apiExit;
  api = null;

  const legacyPort = await unusedPort();
  legacy = spawn(process.execPath, ["dist/server.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(legacyPort),
      ANDON_TLS_CERT: "",
      ANDON_TLS_KEY: "",
      ANDON_CENTRAL_ACCESS_ENABLED: "0",
    },
    stdio: "ignore",
  });
  let legacyHealth;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      legacyHealth = await request(httpRequest, {
        hostname: "127.0.0.1",
        port: legacyPort,
        path: "/health",
      });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  assert.equal(legacyHealth?.status, 200);
  console.log(
    "HTTPS homologation runtime PASS: native TLS, no default password, first-run local setup, HTTP refusal, strict origin and legacy HTTP isolation.",
  );
} finally {
  api?.kill("SIGKILL");
  legacy?.kill("SIGKILL");
  try {
    if (originalSettings) {
      await db.systemSettings.update({
        where: { id: "global" },
        data: { adminPasswordHash: originalSettings.adminPasswordHash },
      });
    } else {
      await db.systemSettings.deleteMany({ where: { id: "global" } });
    }
  } finally {
    await db.$disconnect();
    rmSync(temp, { recursive: true, force: true });
  }
}
