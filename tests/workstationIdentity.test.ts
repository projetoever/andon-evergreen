import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createInitialMachines } from "../src/data/initialMachines";
import { SOUND_CONFIGS } from "../src/data/soundFiles";
import { appBackupSchema } from "../src/services/backupSchema";
import {
  ensureWorkstationId,
  isValidWorkstationId,
  WORKSTATION_ID_STORAGE_KEY,
} from "../src/services/workstationIdentityService";
import { DEFAULT_SETTINGS } from "../src/context/defaultSettings";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const UUID_A = "550e8400-e29b-41d4-a716-446655440000";
const UUID_B = "a8098c1a-f86e-4a6d-a734-446655440000";

test("primeira execução gera e persiste uma identidade namespaced", () => {
  const storage = new MemoryStorage();
  const id = ensureWorkstationId(storage, () => UUID_A);

  assert.equal(id, `ws_${UUID_A}`);
  assert.equal(storage.getItem(WORKSTATION_ID_STORAGE_KEY), id);
  assert.equal(isValidWorkstationId(id), true);
});

test("reload e nova execução reutilizam o mesmo workstationId", () => {
  const storage = new MemoryStorage();
  const first = ensureWorkstationId(storage, () => UUID_A);
  const second = ensureWorkstationId(storage, () => {
    throw new Error("não deveria gerar outro UUID");
  });

  assert.equal(second, first);
});

test("ID ausente ou corrompido é recuperado com segurança", () => {
  const storage = new MemoryStorage();
  storage.setItem(WORKSTATION_ID_STORAGE_KEY, "machine-37");

  const recovered = ensureWorkstationId(storage, () => UUID_B);
  assert.equal(recovered, `ws_${UUID_B}`);
  assert.equal(storage.getItem(WORKSTATION_ID_STORAGE_KEY), recovered);
  assert.equal(isValidWorkstationId("ws_37"), false);
});

test("storage indisponível não impede uma identidade segura para a sessão", () => {
  const unavailableStorage = {
    getItem() {
      throw new Error("storage bloqueado");
    },
    setItem() {
      throw new Error("storage bloqueado");
    },
  };

  assert.equal(
    ensureWorkstationId(unavailableStorage, () => UUID_A),
    `ws_${UUID_A}`,
  );
});

test("Admin identifica a workstation atual e permite nome e status", async () => {
  const source = await readFile(
    new URL("../src/components/settings/WorkstationsSettingsTab.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Esta workstation/);
  assert.match(source, /Nome amigável/);
  assert.match(source, /Último acesso/);
  assert.match(source, /updateWorkstation/);
});

test("modo local usa a mesma identidade persistente sem vincular Machine.id", async () => {
  const identitySource = await readFile(
    new URL("../src/services/workstationIdentityService.ts", import.meta.url),
    "utf8",
  );
  const serviceSource = await readFile(
    new URL("../src/services/workstationService.ts", import.meta.url),
    "utf8",
  );

  assert.match(serviceSource, /CONFIGURED_DATA_MODE === "local"/);
  assert.match(serviceSource, /getCurrentWorkstationId\(\)/);
  assert.doesNotMatch(identitySource, /machineId|hostname|ipAddress|macAddress/i);
});

test("backup legado sem workstation continua válido e não clona identidade de dispositivo", () => {
  const parsed = appBackupSchema.parse({
    exportedAt: new Date().toISOString(),
    appVersion: "test",
    machines: createInitialMachines(),
    calls: [],
    settings: DEFAULT_SETTINGS,
    soundConfigs: SOUND_CONFIGS,
  });

  assert.equal(parsed.calls.length, 0);
  assert.equal("workstations" in parsed, false);
  assert.equal("workstationId" in parsed, false);
});

test("migration de workstations é aditiva e não altera dados históricos", async () => {
  const migration = await readFile(
    new URL(
      "../server/prisma/migrations/20260929210000_create_workstations/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /CREATE TABLE "workstations"/);
  assert.match(migration, /"id" TEXT NOT NULL/);
  assert.match(migration, /"active" BOOLEAN NOT NULL DEFAULT true/);
  assert.match(migration, /"lastSeenAt" TIMESTAMP\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE|UPDATE|TRUNCATE)\b|ALTER TABLE "andon_calls"/i);
});

test("camada central prepara requisições futuras sem alterar finalização", async () => {
  const apiClient = await readFile(
    new URL("../src/api/andonApiClient.ts", import.meta.url),
    "utf8",
  );
  const cors = await readFile(new URL("../server/src/config/cors.ts", import.meta.url), "utf8");

  assert.match(apiClient, /X-Andon-Workstation-Id/);
  assert.match(cors, /X-Andon-Workstation-Id/);
});
