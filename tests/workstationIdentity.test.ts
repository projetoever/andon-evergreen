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
  hasWorkstationIdentityConflict,
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

test("cookie técnico e espelho usam a mesma chave da identidade da workstation", async () => {
  const identitySource = await readFile(
    new URL("../src/services/workstationIdentityService.ts", import.meta.url),
    "utf8",
  );
  const serviceSource = await readFile(
    new URL("../src/services/workstationService.ts", import.meta.url),
    "utf8",
  );

  assert.match(identitySource, /document\.cookie/);
  assert.match(identitySource, /localStorage/);
  assert.doesNotMatch(serviceSource, /window\.localStorage/);
  assert.match(serviceSource, /getCurrentWorkstationId\(\)/);
  // Human-readable comments may mention hostname and IP as examples.
  // Only executable source must remain independent of network/device identifiers.
  const executableIdentitySource = identitySource.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.doesNotMatch(executableIdentitySource, /machineId|hostname|ipAddress|macAddress/i);
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


test("estado runtime da workstation é centralizado no PostgreSQL", async () => {
  const [schema, route, lockService] = await Promise.all([
    readFile(new URL("../server/prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/workstations.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/machineScreenLockService.ts", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /lockedMachineId\s+String\?/);
  assert.match(route, /runtime-preferences/);
  assert.match(route, /screen-lock/);
  assert.match(lockService, /runtime-preferences/);
  assert.doesNotMatch(lockService, /localStorage/);
});

test("cookie bloqueado usa o mesmo UUID persistido no espelho após reload", async () => {
  const {getCurrentWorkstationId,resetWorkstationIdentityCacheForTests}=await import('../src/services/workstationIdentityService');
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  const previousDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  const storage=new MemoryStorage();
  Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:storage}});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{get cookie(){throw new Error('cookies blocked');},set cookie(_value:string){throw new Error('cookies blocked');}}});
  try {
    resetWorkstationIdentityCacheForTests();const first=getCurrentWorkstationId();assert.ok(isValidWorkstationId(first));
    resetWorkstationIdentityCacheForTests();assert.equal(getCurrentWorkstationId(),first);
    Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:{getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}}}});
    resetWorkstationIdentityCacheForTests();assert.equal(getCurrentWorkstationId(),null);
  }finally{
    resetWorkstationIdentityCacheForTests();
    if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else Reflect.deleteProperty(globalThis,'window');
    if(previousDocument)Object.defineProperty(globalThis,'document',previousDocument);else Reflect.deleteProperty(globalThis,'document');
  }
});

test("cookie/local conflict preserves existing origin UUID without rewriting either persisted ID", async () => {
  const { getCurrentWorkstationId, resetWorkstationIdentityCacheForTests } =
    await import("../src/services/workstationIdentityService");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const storage = new MemoryStorage();
  storage.setItem(WORKSTATION_ID_STORAGE_KEY, `ws_${UUID_A}`);
  let cookieValue = `andon.workstationId=ws_${UUID_B}`;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie() { return cookieValue; },
      set cookie(value: string) { cookieValue = value; },
    },
  });
  try {
    resetWorkstationIdentityCacheForTests();
    assert.equal(hasWorkstationIdentityConflict(), true);
    assert.equal(getCurrentWorkstationId(), `ws_${UUID_A}`);
    resetWorkstationIdentityCacheForTests();
    assert.equal(getCurrentWorkstationId(), `ws_${UUID_A}`);
    assert.equal(storage.getItem(WORKSTATION_ID_STORAGE_KEY), `ws_${UUID_A}`);
    assert.equal(cookieValue, `andon.workstationId=ws_${UUID_B}`);
  } finally {
    resetWorkstationIdentityCacheForTests();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("cached workstation identity stops authorizing requests when storage is lost", async () => {
  const { getCurrentWorkstationId, resetWorkstationIdentityCacheForTests } =
    await import("../src/services/workstationIdentityService");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const storage = new MemoryStorage();
  storage.setItem(WORKSTATION_ID_STORAGE_KEY, `ws_${UUID_A}`);
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { get cookie() { return ""; }, set cookie(_value: string) {} },
  });
  try {
    resetWorkstationIdentityCacheForTests();
    assert.equal(getCurrentWorkstationId(), `ws_${UUID_A}`);
    const unavailableStorage = {
      getItem() { throw new Error("storage unavailable"); },
      setItem() { throw new Error("storage unavailable"); },
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true, value: { localStorage: unavailableStorage },
    });
    assert.equal(getCurrentWorkstationId(), null);
  } finally {
    resetWorkstationIdentityCacheForTests();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
