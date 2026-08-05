import type { PlcAdapter } from "../domain/PlcAdapter.js";
import type {
  PlcConnectionConfig,
  PlcConnectionSnapshot,
  PlcConnectionState,
  PlcLogger,
  PlcReadRequest,
  PlcReadResult,
} from "../domain/types.js";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export class PlcConnectionSupervisor {
  private state: PlcConnectionState;
  private active = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastConnectedAt: string | null = null;
  private lastCommunicationAt: string | null = null;
  private lastHealthCheckAt: string | null = null;
  private lastError: string | null = null;
  private consecutiveFailures = 0;
  private reconnectAttempts = 0;

  constructor(
    readonly config: PlcConnectionConfig,
    private readonly adapter: PlcAdapter,
    private readonly logger: PlcLogger,
  ) {
    if (adapter.connectionId !== config.id) {
      throw new Error(
        `Adaptador ${adapter.connectionId} não corresponde à conexão ${config.id}`,
      );
    }

    this.state = config.enabled ? "idle" : "disabled";
  }

  async start() {
    if (!this.config.enabled || this.active) return;

    this.active = true;
    await this.connectWithRecovery();
  }

  async stop() {
    if (!this.config.enabled) return;

    this.active = false;
    this.clearTimer();
    this.state = "stopping";
    await this.safeDisconnect();
    this.state = "disconnected";
  }

  async read(request: PlcReadRequest) {
    this.ensureConnected();

    try {
      const result = await withTimeout(
        this.adapter.read(request),
        this.config.requestTimeoutMs,
        `Timeout ao ler ${request.signal.id} em ${this.config.id}`,
      );
      this.lastCommunicationAt = result.readAt;
      return result;
    } catch (error) {
      this.registerOperationError(error, "Falha de leitura PLC");
      throw error;
    }
  }

  async readBatch(requests: PlcReadRequest[]): Promise<PlcReadResult[]> {
    this.ensureConnected();

    try {
      const results = await withTimeout(
        this.adapter.readBatch(requests),
        this.config.requestTimeoutMs,
        `Timeout na leitura em lote de ${this.config.id}`,
      );
      const latestReadAt = results.at(-1)?.readAt;
      if (latestReadAt) this.lastCommunicationAt = latestReadAt;
      return results;
    } catch (error) {
      this.registerOperationError(error, "Falha de leitura em lote PLC");
      throw error;
    }
  }

  getSnapshot(): PlcConnectionSnapshot {
    return {
      connectionId: this.config.id,
      machineId: this.config.machineId,
      name: this.config.name,
      vendor: this.config.vendor,
      protocol: this.config.protocol,
      readOnly: true,
      state: this.state,
      lastConnectedAt: this.lastConnectedAt,
      lastCommunicationAt: this.lastCommunicationAt,
      lastHealthCheckAt: this.lastHealthCheckAt,
      lastError: this.lastError,
      consecutiveFailures: this.consecutiveFailures,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  private async connectWithRecovery() {
    if (!this.active) return;

    this.clearTimer();
    this.state = this.reconnectAttempts > 0 ? "reconnecting" : "connecting";

    try {
      await withTimeout(
        this.adapter.connect(),
        this.config.connectTimeoutMs,
        `Timeout ao conectar ${this.config.id}`,
      );

      if (!this.active) {
        await this.safeDisconnect();
        return;
      }

      const now = new Date().toISOString();
      this.state = "connected";
      this.lastConnectedAt = now;
      this.lastCommunicationAt = now;
      this.lastError = null;
      this.consecutiveFailures = 0;
      this.reconnectAttempts = 0;

      this.logger.info(
        { connectionId: this.config.id, machineId: this.config.machineId },
        "Conexão PLC estabelecida",
      );

      this.scheduleHealthCheck();
    } catch (error) {
      this.consecutiveFailures += 1;
      this.lastError = errorMessage(error);
      this.state = "error";

      this.logger.warn(
        {
          connectionId: this.config.id,
          machineId: this.config.machineId,
          error: this.lastError,
        },
        "Falha ao conectar PLC; nova tentativa será agendada",
      );

      await this.safeDisconnect();
      this.scheduleReconnect();
    }
  }

  private scheduleHealthCheck() {
    if (!this.active) return;

    this.clearTimer();
    this.timer = setTimeout(() => {
      void this.runHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  private async runHealthCheck() {
    if (!this.active || this.state !== "connected") return;

    try {
      const health = await withTimeout(
        this.adapter.healthCheck(),
        this.config.requestTimeoutMs,
        `Timeout no health check de ${this.config.id}`,
      );

      this.lastHealthCheckAt = health.checkedAt;
      this.lastCommunicationAt = health.checkedAt;

      if (!health.healthy) {
        throw new Error(health.message || "Health check PLC retornou estado não saudável");
      }

      this.lastError = null;
      this.consecutiveFailures = 0;
      this.scheduleHealthCheck();
    } catch (error) {
      this.consecutiveFailures += 1;
      this.lastError = errorMessage(error);
      this.state = "error";

      this.logger.warn(
        {
          connectionId: this.config.id,
          machineId: this.config.machineId,
          error: this.lastError,
        },
        "Comunicação PLC perdida; reconexão será iniciada",
      );

      await this.safeDisconnect();
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (!this.active) return;

    this.clearTimer();
    this.reconnectAttempts += 1;
    this.state = "reconnecting";

    const multiplier = 2 ** Math.max(0, this.reconnectAttempts - 1);
    const delayMs = Math.min(
      this.config.reconnectDelayMs * multiplier,
      this.config.maxReconnectDelayMs,
    );

    this.timer = setTimeout(() => {
      void this.connectWithRecovery();
    }, delayMs);
  }

  private async safeDisconnect() {
    try {
      if (this.adapter.isConnected()) await this.adapter.disconnect();
    } catch (error) {
      this.logger.warn(
        { connectionId: this.config.id, error: errorMessage(error) },
        "Erro ao encerrar conexão PLC",
      );
    }
  }

  private ensureConnected() {
    if (this.state !== "connected" || !this.adapter.isConnected()) {
      throw new Error(`Conexão PLC ${this.config.id} não está disponível para leitura`);
    }
  }

  private registerOperationError(error: unknown, message: string) {
    this.lastError = errorMessage(error);
    this.consecutiveFailures += 1;
    this.logger.warn(
      { connectionId: this.config.id, error: this.lastError },
      message,
    );
  }

  private clearTimer() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
