import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClockDisplay } from "../src/components/common/ClockDisplay";
import { formatLocalTime, scheduleClockUpdates } from "../src/utils/localClockUtils";

test("formata a hora local em HH:mm", () => {
  const localTime = new Date(2026, 8, 17, 7, 5, 30);

  assert.equal(formatLocalTime(localTime), "07:05");
});

test("renderiza uma hora válida e identificada para acessibilidade", () => {
  const markup = renderToStaticMarkup(<ClockDisplay />);

  assert.match(markup, /aria-label="Hora atual: \d{2}:\d{2}"/);
  assert.match(markup, />\d{2}:\d{2}<\/time>/);
  assert.match(markup, /shrink-0/);
  assert.match(markup, /pointer-events-none/);
  assert.match(markup, /select-none/);
  assert.match(markup, /bg-transparent/);
  assert.match(markup, /text-2xl/);
  assert.match(markup, /md:text-3xl/);
  assert.doesNotMatch(markup, /:\d{2}:\d{2}<\/time>/);
});

test("agenda atualização automática e limpa o timer", () => {
  let scheduledCallback: (() => void) | undefined;
  let scheduledDelay = 0;
  let clearedIntervalId: number | undefined;
  let ticks = 0;

  const cleanup = scheduleClockUpdates(
    () => {
      ticks += 1;
    },
    {
      setInterval: (callback, delay) => {
        scheduledCallback = callback;
        scheduledDelay = delay;
        return 42;
      },
      clearInterval: (intervalId) => {
        clearedIntervalId = intervalId;
      },
    },
  );

  assert.equal(scheduledDelay, 1000);
  scheduledCallback?.();
  assert.equal(ticks, 1);

  cleanup();
  assert.equal(clearedIntervalId, 42);
});

test("integra o mesmo relógio de forma compacta nos dois cabeçalhos", async () => {
  const [dashboard, machineHeader] = await Promise.all([
    readFile(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/machines/MachineDetailHeader.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(dashboard, /Máquinas[\s\S]*<ClockDisplay \/>[\s\S]*audioUnlocked/);
  assert.match(dashboard, /flex shrink-0 flex-wrap items-center justify-between/);
  assert.doesNotMatch(dashboard, /grid-cols-\[minmax\(0,1fr\)_auto/);

  assert.match(machineHeader, /<ClockDisplay \/>[\s\S]*Som do ANDON/);
  assert.match(machineHeader, /md:grid-cols-\[minmax\(0,auto\)_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(machineHeader, /grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
  assert.match(machineHeader, /xl:flex-nowrap/);

  assert.equal(dashboard.match(/<ClockDisplay/g)?.length, 1);
  assert.equal(machineHeader.match(/<ClockDisplay/g)?.length, 1);
});
