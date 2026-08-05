export type PlcVendor = "mock" | "mitsubishi" | "rockwell" | "siemens" | "generic";

export type PlcProtocol =
  | "mock"
  | "mc-slmp"
  | "ethernet-ip"
  | "opc-ua"
  | "s7"
  | "modbus-tcp";

export type PlcConnectionState =
  | "disabled"
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error"
  | "stopping";

export type PlcSignalDataType =
  | "boolean"
  | "int16"
  | "uint16"
  | "int32"
  | "uint32"
  | "float32"
  | "float64"
  | "string";

export type PlcSignalValue = boolean | number | string | null;
export type PlcReadQuality = "good" | "uncertain" | "bad";

export type PlcSignalDefinition = {
  id: string;
  address: string;
  dataType: PlcSignalDataType;
  description?: string;
  scale?: number;
};

export type PlcReadRequest = {
  signal: PlcSignalDefinition;
};

export type PlcReadResult = {
  signalId: string;
  address: string;
  value: PlcSignalValue;
  quality: PlcReadQuality;
  readAt: string;
  latencyMs: number;
  error?: string;
};

export type PlcHealthResult = {
  healthy: boolean;
  checkedAt: string;
  latencyMs: number;
  message?: string;
};

export type PlcAdapterCapabilities = {
  readSingle: boolean;
  readBatch: boolean;
  writeSingle: false;
  writeBatch: false;
  subscriptions: boolean;
  symbolicTags: boolean;
};

export type PlcConnectionConfig = {
  id: string;
  machineId: string;
  name: string;
  vendor: PlcVendor;
  protocol: PlcProtocol;
  enabled: boolean;
  readOnly: true;
  connectTimeoutMs: number;
  requestTimeoutMs: number;
  healthCheckIntervalMs: number;
  reconnectDelayMs: number;
  maxReconnectDelayMs: number;
  signals: PlcSignalDefinition[];
};

export type PlcConnectionSnapshot = {
  connectionId: string;
  machineId: string;
  name: string;
  vendor: PlcVendor;
  protocol: PlcProtocol;
  readOnly: true;
  state: PlcConnectionState;
  lastConnectedAt: string | null;
  lastCommunicationAt: string | null;
  lastHealthCheckAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  reconnectAttempts: number;
};

export type PlcRuntimeHealth = {
  enabled: boolean;
  provider: string;
  status: "disabled" | "not_configured" | "ready" | "degraded";
  connections: PlcConnectionSnapshot[];
};

export interface PlcLogger {
  debug(bindings: Record<string, unknown>, message?: string): void;
  info(bindings: Record<string, unknown>, message?: string): void;
  warn(bindings: Record<string, unknown>, message?: string): void;
  error(bindings: Record<string, unknown>, message?: string): void;
}
