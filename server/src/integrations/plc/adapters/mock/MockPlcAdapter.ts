import type { PlcAdapter } from "../../domain/PlcAdapter.js";
import type {
  PlcAdapterCapabilities,
  PlcConnectionConfig,
  PlcHealthResult,
  PlcReadRequest,
  PlcReadResult,
  PlcSignalValue,
} from "../../domain/types.js";

export type MockPlcAdapterOptions = {
  available?: boolean;
  failConnectAttempts?: number;
  responseDelayMs?: number;
  initialValues?: Record<string, PlcSignalValue>;
};

function sleep(durationMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}

function defaultValue(dataType: PlcReadRequest["signal"]["dataType"]): PlcSignalValue {
  return dataType === "boolean" ? false : dataType === "string" ? "" : 0;
}

export class MockPlcAdapter implements PlcAdapter {
  readonly connectionId: string;
  readonly capabilities: PlcAdapterCapabilities = {
    readSingle: true,
    readBatch: true,
    writeSingle: false,
    writeBatch: false,
    subscriptions: false,
    symbolicTags: true,
  };

  private connected = false;
  private available: boolean;
  private connectAttempts = 0;
  private remainingConnectFailures: number;
  private remainingHealthFailures = 0;
  private readonly responseDelayMs: number;
  private readonly values = new Map<string, PlcSignalValue>();

  constructor(
    private readonly config: PlcConnectionConfig,
    options: MockPlcAdapterOptions = {},
  ) {
    this.connectionId = config.id;
    this.available = options.available ?? true;
    this.remainingConnectFailures = Math.max(0, options.failConnectAttempts ?? 0);
    this.responseDelayMs = Math.max(0, options.responseDelayMs ?? 0);

    for (const signal of config.signals) {
      this.values.set(
        signal.id,
        options.initialValues?.[signal.id] ?? defaultValue(signal.dataType),
      );
    }
  }

  async connect() {
    this.connectAttempts += 1;
    await sleep(this.responseDelayMs);

    if (!this.available) {
      throw new Error(`Mock PLC ${this.connectionId} indisponível`);
    }

    if (this.remainingConnectFailures > 0) {
      this.remainingConnectFailures -= 1;
      throw new Error(`Falha simulada ao conectar ${this.connectionId}`);
    }

    this.connected = true;
  }

  async disconnect() {
    await sleep(this.responseDelayMs);
    this.connected = false;
  }

  isConnected() {
    return this.connected;
  }

  async read(request: PlcReadRequest): Promise<PlcReadResult> {
    const startedAt = Date.now();
    await sleep(this.responseDelayMs);

    if (!this.connected) {
      throw new Error(`Mock PLC ${this.connectionId} não está conectado`);
    }

    const configuredSignal = this.config.signals.find(
      (signal) => signal.id === request.signal.id,
    );

    if (!configuredSignal) {
      return {
        signalId: request.signal.id,
        address: request.signal.address,
        value: null,
        quality: "bad",
        readAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        error: "Sinal não configurado para esta conexão",
      };
    }

    return {
      signalId: configuredSignal.id,
      address: configuredSignal.address,
      value: this.values.get(configuredSignal.id) ?? defaultValue(configuredSignal.dataType),
      quality: "good",
      readAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
    };
  }

  async readBatch(requests: PlcReadRequest[]) {
    return Promise.all(requests.map((request) => this.read(request)));
  }

  async healthCheck(): Promise<PlcHealthResult> {
    const startedAt = Date.now();
    await sleep(this.responseDelayMs);

    if (!this.connected || !this.available) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        message: "Mock PLC desconectado ou indisponível",
      };
    }

    if (this.remainingHealthFailures > 0) {
      this.remainingHealthFailures -= 1;
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        message: "Falha simulada no health check",
      };
    }

    return {
      healthy: true,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
    };
  }

  setAvailable(available: boolean) {
    this.available = available;
  }

  setValue(signalId: string, value: PlcSignalValue) {
    if (!this.values.has(signalId)) {
      throw new Error(`Sinal ${signalId} não configurado em ${this.connectionId}`);
    }
    this.values.set(signalId, value);
  }

  failNextHealthChecks(quantity = 1) {
    this.remainingHealthFailures += Math.max(0, quantity);
  }

  getConnectAttempts() {
    return this.connectAttempts;
  }
}
