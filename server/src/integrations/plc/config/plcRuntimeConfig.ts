import type {
  PlcConnectionConfig,
  PlcSignalDefinition,
} from "../domain/types.js";

const DEFAULT_CONNECT_TIMEOUT_MS = 3_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 2_000;
const DEFAULT_HEALTH_INTERVAL_MS = 5_000;
const DEFAULT_RECONNECT_DELAY_MS = 2_000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000;

export type PlcRuntimeConfig = {
  enabled: boolean;
  provider: string;
  connections: PlcConnectionConfig[];
};

function parseBoolean(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseMachineIds(value: string | undefined) {
  const ids = (value ?? "mock-machine-1")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function createMockSignals(): PlcSignalDefinition[] {
  return [
    {
      id: "heartbeat",
      address: "MOCK:HEARTBEAT",
      dataType: "uint32",
      description: "Contador de vida da comunicação simulada",
    },
    {
      id: "running",
      address: "MOCK:RUNNING",
      dataType: "boolean",
      description: "Máquina em movimento ou ciclo",
    },
    {
      id: "automaticMode",
      address: "MOCK:AUTOMATIC_MODE",
      dataType: "boolean",
      description: "Máquina em modo automático",
    },
    {
      id: "faultActive",
      address: "MOCK:FAULT_ACTIVE",
      dataType: "boolean",
      description: "Falha ativa informada pelo CLP",
    },
    {
      id: "maintenanceRequested",
      address: "MOCK:MAINTENANCE_REQUESTED",
      dataType: "boolean",
      description: "Solicitação de manutenção",
    },
    {
      id: "faultCode",
      address: "MOCK:FAULT_CODE",
      dataType: "uint16",
      description: "Código de falha da máquina",
    },
  ];
}

export function loadPlcRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): PlcRuntimeConfig {
  const enabled = parseBoolean(env.PLC_INTEGRATION_ENABLED);
  const provider = env.PLC_ADAPTER?.trim().toLowerCase() || "mock";

  if (!enabled || provider !== "mock") {
    return { enabled, provider, connections: [] };
  }

  const connectTimeoutMs = parsePositiveInteger(
    env.PLC_CONNECT_TIMEOUT_MS,
    DEFAULT_CONNECT_TIMEOUT_MS,
  );
  const requestTimeoutMs = parsePositiveInteger(
    env.PLC_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
  );
  const healthCheckIntervalMs = parsePositiveInteger(
    env.PLC_HEALTH_INTERVAL_MS,
    DEFAULT_HEALTH_INTERVAL_MS,
  );
  const reconnectDelayMs = parsePositiveInteger(
    env.PLC_RECONNECT_DELAY_MS,
    DEFAULT_RECONNECT_DELAY_MS,
  );
  const maxReconnectDelayMs = Math.max(
    reconnectDelayMs,
    parsePositiveInteger(
      env.PLC_MAX_RECONNECT_DELAY_MS,
      DEFAULT_MAX_RECONNECT_DELAY_MS,
    ),
  );

  const connections = parseMachineIds(env.PLC_MOCK_MACHINE_IDS).map(
    (machineId): PlcConnectionConfig => ({
      id: `mock-${machineId}`,
      machineId,
      name: `PLC simulado da máquina ${machineId}`,
      vendor: "mock",
      protocol: "mock",
      enabled: true,
      readOnly: true,
      connectTimeoutMs,
      requestTimeoutMs,
      healthCheckIntervalMs,
      reconnectDelayMs,
      maxReconnectDelayMs,
      signals: createMockSignals(),
    }),
  );

  return { enabled, provider, connections };
}
