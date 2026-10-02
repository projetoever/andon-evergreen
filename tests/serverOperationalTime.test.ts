import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DEFAULT_SHIFTS } from "../src/services/shiftConfigService";
import {
  getCurrentShift,
  getCurrentShiftFromConfig,
} from "../src/services/technicianShiftFilterService";
import { formatLocalTime } from "../src/utils/localClockUtils";
import { formatDateTime } from "../src/utils/dateTimeUtils";
import {
  calculateServerTimeOffsetMs,
  getServerNow,
  getServerTimeZone,
  isServerClockSynchronized,
  resetServerClockForTests,
  setServerClockFromTimestamp,
} from "../src/utils/serverClock";

test("calcula offset quando workstation está adiantada ou atrasada", () => {
  assert.equal(calculateServerTimeOffsetMs("1970-01-01T10:00:00.000Z", 36_000_000, 36_000_000), 0);
  assert.equal(
    calculateServerTimeOffsetMs("2026-10-02T10:00:00.000Z", 0, 0),
    new Date("2026-10-02T10:00:00.000Z").getTime(),
  );
  assert.equal(
    calculateServerTimeOffsetMs("1970-01-01T10:00:00.000Z", 54_000_000, 54_000_000),
    -18_000_000,
  );
  assert.equal(
    calculateServerTimeOffsetMs("1970-01-01T15:00:00.000Z", 36_000_000, 36_000_000),
    18_000_000,
  );
});

test("timezone do servidor governa relógio civil e turno", () => {
  const instant = new Date("2026-10-02T13:15:00.000Z");

  assert.equal(formatLocalTime(instant, "America/Sao_Paulo"), "10:15");
  assert.equal(formatLocalTime(instant, "Europe/Berlin"), "15:15");
  assert.equal(getCurrentShift(DEFAULT_SHIFTS, instant, "America/Sao_Paulo")?.id, "morning");
  assert.equal(getCurrentShift(DEFAULT_SHIFTS, instant, "Europe/Berlin")?.id, "afternoon");
});

test("antes da primeira sincronização o modo API não filtra por hora local", () => {
  resetServerClockForTests();
  assert.equal(isServerClockSynchronized(), false);
  assert.equal(getCurrentShiftFromConfig(), null);
});

test("sincronização preserva hora e timezone informados pelo servidor", () => {
  resetServerClockForTests();
  const clientNow = Date.now();
  const serverNow = new Date(clientNow + 5 * 60 * 60 * 1000).toISOString();
  setServerClockFromTimestamp(serverNow, clientNow, clientNow, "America/Sao_Paulo");

  assert.equal(isServerClockSynchronized(), true);
  assert.equal(getServerTimeZone(), "America/Sao_Paulo");
  assert.ok(Math.abs(getServerNow().getTime() - new Date(serverNow).getTime()) < 100);
  assert.match(formatDateTime(serverNow), /^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}:\d{2}$/);
});

test("sincronizações posteriores atualizam o offset existente", () => {
  resetServerClockForTests();
  const clientNow = Date.now();
  setServerClockFromTimestamp(
    new Date(clientNow + 60_000).toISOString(),
    clientNow,
    clientNow,
    "UTC",
  );
  const first = getServerNow().getTime();
  setServerClockFromTimestamp(
    new Date(clientNow + 120_000).toISOString(),
    clientNow,
    clientNow,
    "UTC",
  );
  assert.ok(getServerNow().getTime() - first >= 59_000);
});

test("modo local mantém cálculo explícito pelo relógio local fornecido", () => {
  const localMorning = new Date(2026, 9, 2, 10, 15, 0);
  assert.equal(getCurrentShift(DEFAULT_SHIFTS, localMorning)?.id, "morning");
});

test("relógios, contadores, filtro e polling reutilizam a infraestrutura central", async () => {
  const [clock, machine, dashboardSummary, history, repository, health, selector] =
    await Promise.all([
      readFile(new URL("../src/components/common/ClockDisplay.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/pages/MachineDetailPage.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/hooks/useDashboardSummary.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/pages/MachineCallHistoryPage.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/repositories/apiAndonRepository.ts", import.meta.url), "utf8"),
      readFile(new URL("../server/src/server.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/components/calls/TechnicianSelector.tsx", import.meta.url), "utf8"),
    ]);

  assert.match(clock, /getServerNow/);
  assert.match(clock, /getServerTimeZone/);
  assert.match(clock, /isServerClockSynchronized/);
  assert.match(machine, /getServerNowIso\(\)/);
  assert.match(dashboardSummary, /getServerNowIso\(\)/);
  assert.match(history, /getServerNow\(\)/);
  assert.match(repository, /setServerClockFromTimestamp\([\s\S]*health\.timeZone/);
  assert.match(health, /timeZone: Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.match(selector, /technician\.shiftId === currentShift\.id/);
  assert.match(selector, /subscribeServerClock/);
});

test("timestamps persistidos continuam sob responsabilidade do backend", async () => {
  const route = await readFile(
    new URL("../server/src/routes/andonCalls.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(route, /serverClock|getServerNow/);
  assert.match(route, /new Date\(\)/);
});
