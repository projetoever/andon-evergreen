import assert from "node:assert/strict";
import test from "node:test";

import { PlcConnectionManager } from "./application/PlcConnectionManager.js";
import { PlcConnectionSupervisor } from "./application/PlcConnectionSupervisor.js";
import { MockPlcAdapter } from "./adapters/mock/MockPlcAdapter.js";
import { loadPlcRuntimeConfig } from "./config/plcRuntimeConfig.js";
import type {
  PlcConnectionConfig,
  PlcLogger,
  PlcSignalDefinition,
} from "./domain/types.js";

const silentLogger: PlcLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const runningSignal: PlcSignalDefinition = {
  id: "running",
  address: "MOCK:RUNNING",
  dataType: "boolean",
};

function createConfig(id: string, machineId: string): PlcConnectionConfig {
  return {
    id,
    machineId,
    name: `PLC ${machineId}`,
    vendor: "mock",
    protocol: "mock",
    enabled: true,
    readOnly: true,
    connectTimeoutMs: 100,
    requestTimeoutMs: 100,
    healthCheckIntervalMs: 60_000,
    reconnectDelayMs: 10,
    maxReconnectDelayMs: 20,
    signals: [runningSignal],
  };
}

function wait(durationMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}

test("integração PLC permanece desabilitada por padrão", () => {
  const config = loadPlcRuntimeConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.provider, "mock");
  assert.deepEqual(config.connections, []);
});

test("configuração mock cria uma conexão independente por máquina", () => {
  const config = loadPlcRuntimeConfig({
    PLC_INTEGRATION_ENABLED: "true",
    PLC_ADAPTER: "mock",
    PLC_MOCK_MACHINE_IDS: "1, 2,2, maquina-3",
  });

  assert.equal(config.connections.length, 3);
  assert.deepEqual(
    config.connections.map((connection) => connection.machineId),
    ["1", "2", "maquina-3"],
  );
  assert.ok(config.connections.every((connection) => connection.readOnly));
});

test("falha de uma conexão não impede leitura nas demais", async () => {
  const manager = new PlcConnectionManager();
  const goodConfig = createConfig("plc-good", "1");
  const badConfig = createConfig("plc-bad", "2");
  const goodAdapter = new MockPlcAdapter(goodConfig, {
    initialValues: { running: true },
  });
  const badAdapter = new MockPlcAdapter(badConfig, { available: false });

  manager.register(
    new PlcConnectionSupervisor(goodConfig, goodAdapter, silentLogger),
  );
  manager.register(
    new PlcConnectionSupervisor(badConfig, badAdapter, silentLogger),
  );

  await manager.startAll();

  const snapshots = manager.getSnapshots();
  assert.equal(
    snapshots.find((snapshot) => snapshot.connectionId === "plc-good")?.state,
    "connected",
  );
  assert.equal(
    snapshots.find((snapshot) => snapshot.connectionId === "plc-bad")?.state,
    "reconnecting",
  );

  const result = await manager.read("plc-good", { signal: runningSignal });
  assert.equal(result.quality, "good");
  assert.equal(result.value, true);

  await manager.stopAll();
});

test("supervisor reconecta de forma controlada após falha inicial", async () => {
  const config = createConfig("plc-reconnect", "3");
  const adapter = new MockPlcAdapter(config, { failConnectAttempts: 1 });
  const supervisor = new PlcConnectionSupervisor(config, adapter, silentLogger);

  await supervisor.start();
  assert.equal(supervisor.getSnapshot().state, "reconnecting");

  await wait(40);
  assert.equal(supervisor.getSnapshot().state, "connected");
  assert.equal(adapter.getConnectAttempts(), 2);

  await supervisor.stop();
  assert.equal(supervisor.getSnapshot().state, "disconnected");
});
