import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralVisualPaletteWritesEnabled,
  isCentralVisualPaletteMutation,
  markCentralVisualPaletteAuthorized,
  isAuthorizedCentralVisualPalette,
} from "./centralVisualPaletteHttp.js";
import { parseCentralVisualPaletteUpdate } from "../access/centralVisualPalette.js";
import { DEFAULT_STORED_VISUAL_PALETTE } from "../services/andonVisualPalette.js";

const token = "a".repeat(64);
const admin: Principal = {
  userId: "u", login: "admin", displayName: "Admin", roleLabel: "Admin",
  accountType: "person", isPrimaryAdmin: true, machineScope: "all",
  machineIds: [], permissions: ["andon.read"], sessionId: "s",
  workstationId: "ws", purpose: "normal", authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const req = (csrf = csrfToken(token)) => ({
  method: "PATCH", url: "/api/andon-visual-palette",
  headers: { cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf },
}) as unknown as FastifyRequest;
const denied = (fn: () => unknown, code: string) =>
  assert.throws(fn, (error: unknown) => error instanceof AccessError && error.code === code);

test("UX-12: dedicated palette write always OFF unless central mode and separate flag enabled", () => {
  const central = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const flag = process.env.ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    process.env.ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED = "1";
    assert.equal(centralVisualPaletteWritesEnabled(), false);
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED = "0";
    assert.equal(centralVisualPaletteWritesEnabled(), false);
    denied(() => markCentralVisualPaletteAuthorized(req(), admin, station), "central_action_not_supported");
    process.env.ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED = "1";
    assert.equal(centralVisualPaletteWritesEnabled(), true);
    assert.equal(isCentralVisualPaletteMutation("PATCH", "/api/andon-visual-palette"), true);
    assert.equal(isCentralVisualPaletteMutation("PATCH", "/api/system-settings"), false);
    assert.equal(isCentralVisualPaletteMutation("GET", "/api/andon-visual-palette"), false);
    const accepted = req();
    markCentralVisualPaletteAuthorized(accepted, admin, station);
    assert.equal(isAuthorizedCentralVisualPalette(accepted), true);
    denied(() => markCentralVisualPaletteAuthorized(req("bad"), admin, station), "csrf_denied");
    denied(() => markCentralVisualPaletteAuthorized(req(), { ...admin, isPrimaryAdmin: false }, station), "permission_denied");
    denied(() => markCentralVisualPaletteAuthorized(req(), { ...admin, machineScope: "selected" }, station), "scoped_query_required");
    denied(() => markCentralVisualPaletteAuthorized(req(), { ...admin, purpose: "password_change" }, station), "password_change_required");
    assert.doesNotThrow(() => markCentralVisualPaletteAuthorized(req(), admin, { ...station, allowOperational: false }));
    process.env.ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralVisualPalette(accepted), false);
  } finally {
    if (central === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = central;
    if (flag === undefined) delete process.env.ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED = flag;
  }
});

test("UX-12: only versioned named presets or strict RGB can be submitted, not CSS/status fields", () => {
  const good = { palette: DEFAULT_STORED_VISUAL_PALETTE, expectedRevision: 0 };
  assert.deepEqual(parseCentralVisualPaletteUpdate(good), good);
  const custom = { palette: { ...DEFAULT_STORED_VISUAL_PALETTE, cardBorder: "#34A1C9" }, expectedRevision: 1 };
  assert.deepEqual(parseCentralVisualPaletteUpdate(custom), custom);
  const invalid = [
    {}, null, { ...good, danger: "ocean" }, { ...good, expectedRevision: -1 },
    { ...good, expectedRevision: 1.5 }, { ...good, expectedRevision: "0" },
    { ...good, palette: { ...DEFAULT_STORED_VISUAL_PALETTE, warning: "ocean" } },
    { ...good, palette: { ...DEFAULT_STORED_VISUAL_PALETTE, cardBorder: "#f00" } },
    { ...good, palette: { ...DEFAULT_STORED_VISUAL_PALETTE, cardBorder: "var(--danger)" } },
  ];
  for (const body of invalid) denied(() => parseCentralVisualPaletteUpdate(body), "invalid_input");
});


test("R10-09: any centrally delegated human profile can edit the global visual palette", () => {
  const c = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const f = process.env.ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED = "1";
    for (const roleLabel of ["Produção", "Manutenção", "Líder", "Gestor/Gerente", "Externo"]) {
      const user: Principal = {
        ...admin, isPrimaryAdmin: false, roleLabel,
        machineScope: "selected", machineIds: ["37"],
        permissions: ["andon.read", "andon.settings.open"],
      };
      assert.doesNotThrow(() => markCentralVisualPaletteAuthorized(req(), user, station));
      denied(() => markCentralVisualPaletteAuthorized(req(), {
        ...user, permissions: ["andon.read"],
      }, station), "scoped_query_required");
      denied(() => markCentralVisualPaletteAuthorized(req(), {
        ...user, accountType: "kiosk",
      }, station), "permission_denied");
      denied(() => markCentralVisualPaletteAuthorized(req("invalid"), user, station), "csrf_denied");
    }
  } finally {
    if (c === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = c;
    if (f === undefined) delete process.env.ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED = f;
  }
});
