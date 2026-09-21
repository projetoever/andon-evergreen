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
  assert.match(markup, /border-transparent/);
  assert.match(markup, /bg-transparent/);
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

test("integra o mesmo relógio no dashboard e no cabeçalho da máquina", async () => {
  const [dashboard, machineHeader] = await Promise.all([
    readFile(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/machines/MachineDetailHeader.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(
    dashboard,
    /<ClockDisplay className="col-span-2 row-start-2 justify-self-center sm:col-span-1 sm:col-start-2 sm:row-start-1" \/>/,
  );
  assert.match(dashboard, /sm:grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
  assert.match(
    machineHeader,
    /<ClockDisplay className="col-start-1 row-start-2 justify-self-center lg:col-start-2 lg:row-start-1" \/>/,
  );
  assert.match(machineHeader, /lg:grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
});
