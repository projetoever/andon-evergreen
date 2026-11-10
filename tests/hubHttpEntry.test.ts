import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { getSafeHubHttpsUrl } from "../src/utils/secureHubEntry";

const location = {
  protocol: "http:", hostname: "localhost", host: "localhost:8080",
  pathname: "/hub", search: "?module=andon", hash: "#login",
};

test("REFINE13: HTTP localhost Hub offers precise HTTPS URL preserving path", () => {
  assert.equal(getSafeHubHttpsUrl(location), "https://localhost:8080/hub?module=andon#login");
  assert.equal(getSafeHubHttpsUrl({
    ...location, host: "127.0.0.1:8080", hostname: "127.0.0.1",
  }), "https://127.0.0.1:8080/hub?module=andon#login");
});

test("REFINE13: no suggestion for HTTPS or remote origins and no implicit redirect", async () => {
  assert.equal(getSafeHubHttpsUrl(null), null);
  assert.equal(getSafeHubHttpsUrl({ ...location, protocol: "https:" }), null);
  assert.equal(getSafeHubHttpsUrl({
    ...location, hostname: "andon.factory.local", host: "andon.factory.local:8080",
  }), null);
  const page = await readFile(new URL("../src/pages/HubPage.tsx", import.meta.url), "utf8");
  assert.match(page, /getSafeHubHttpsUrl/);
  assert.match(page, /href=\{secureHubUrl\}/);
  assert.doesNotMatch(page, /window\.location\.replace\(/);
  assert.match(page, /initialStatusError/);
});

test("REFINE13: secure entry action is translated and recovery retry remains available", async () => {
  const page = await readFile(new URL("../src/pages/HubPage.tsx", import.meta.url), "utf8");
  const messages = await readFile(new URL("../src/i18n/messages.ts", import.meta.url), "utf8");
  assert.match(page, /ui\("Abrir Hub em HTTPS"\)/);
  assert.match(page, /ui\("Tentar novamente"\)/);
  assert.match(messages, /Abrir Hub em HTTPS.*Open Hub over HTTPS/);
});
