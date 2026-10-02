import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  attendAndonCall,
  openAndonCall,
  type StartAttendanceParams,
} from "../src/services/andonService";
import type { Machine } from "../src/types/machine";

function createMachine(): Machine {
  const now = new Date().toISOString();
  return {
    id: "multi-area-machine",
    name: "Máquina multiárea",
    machineStatus: "running",
    andonStatus: "none",
    currentCallId: null,
    lastStatusChangedAt: now,
    stoppedAt: null,
    lastStopDurationMinutes: 0,
    stopHistory: [],
    productionMode: "scheduled",
    productionModeChangedAt: now,
    productionHistory: [],
    useCommercialShift: false,
    isActive: true,
    displayOrder: null,
  };
}

test("migration cria relação aditiva, protegida e com backfill legado", async () => {
  const migration = await readFile(
    new URL(
      "../server/prisma/migrations/20261002170000_add_technician_technical_areas/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /CREATE TABLE "technician_technical_areas"/);
  assert.match(migration, /PRIMARY KEY \("technicianId", "technicalArea"\)/);
  assert.match(migration, /CREATE INDEX "technician_technical_areas_technicalArea_idx"/);
  assert.match(migration, /INSERT INTO "technician_technical_areas"/);
  assert.match(migration, /FROM "technicians" AS technician/);
  assert.match(migration, /REFERENCES "technicians"\("id"\)[\s\S]*ON DELETE CASCADE/);
  assert.match(migration, /REFERENCES "andon_categories"\("id"\)[\s\S]*ON DELETE RESTRICT/);
  assert.doesNotMatch(migration, /^\s*(DROP|TRUNCATE|DELETE FROM|UPDATE)\b/im);
});

test("modo local aceita habilitação múltipla e registra a área real da sessão", () => {
  const opened = openAndonCall([createMachine()], [], {
    machineId: "multi-area-machine",
    category: "maintenance",
    subtype: "mechanical",
    machineCondition: "running",
  });
  const params: StartAttendanceParams = {
    callId: opened.call.id,
    technicians: [
      {
        id: "tech-celso",
        name: "Celso",
        technicalArea: "electrical",
        technicalAreas: ["electrical", "mechanical"],
      },
    ],
  };

  const attended = attendAndonCall(opened.machines, opened.calls, params);
  const session = attended.calls[0]?.technicianSessions?.[0];

  assert.equal(session?.technicianId, "tech-celso");
  assert.equal(session?.technicalArea, "mechanical");
});

test("modo local rejeita área não habilitada", () => {
  const opened = openAndonCall([createMachine()], [], {
    machineId: "multi-area-machine",
    category: "maintenance",
    subtype: "hot_melt",
    machineCondition: "running",
  });

  assert.throws(
    () =>
      attendAndonCall(opened.machines, opened.calls, {
        callId: opened.call.id,
        technicians: [
          {
            id: "tech-celso",
            name: "Celso",
            technicalArea: "electrical",
            technicalAreas: ["electrical", "mechanical"],
          },
        ],
      }),
    /não pertence à área deste chamado/i,
  );
});

test("API, Admin e seletor usam technicalAreas sem remover o contrato legado", async () => {
  const [route, identity, admin, selector, service, categories] = await Promise.all([
    readFile(new URL("../server/src/routes/technicians.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/services/technicianIdentity.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/settings/TechniciansSettingsTab.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/components/calls/TechnicianSelector.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/services/technicianConfigService.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/andonCategories.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /technicalAreas\?: unknown/);
  assert.match(route, /technicalAreas: \{\s*some: \{ technicalArea \}/);
  assert.match(route, /deleteMany: \{\}/);
  assert.match(identity, /technicalAreas,/);
  assert.match(identity, /technicalArea: technician\.technicalArea \?\?/);
  assert.match(service, /technicalAreas: draft\.areas \?\? \[draft\.area\]/);
  assert.match(admin, /Áreas técnicas/);
  assert.match(admin, /\+ Adicionar área técnica/);
  assert.match(admin, /\(inativa\)/);
  assert.match(selector, /technicianAreas\(technician\)\.includes\(currentArea\)/);
  assert.match(categories, /technicianTechnicalArea\.count/);
});
