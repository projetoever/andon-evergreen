import { PlcConnectionManager } from "./application/PlcConnectionManager.js";
import { PlcConnectionSupervisor } from "./application/PlcConnectionSupervisor.js";
import { MockPlcAdapter } from "./adapters/mock/MockPlcAdapter.js";
import {
  loadPlcRuntimeConfig,
  type PlcRuntimeConfig,
} from "./config/plcRuntimeConfig.js";
import type {
  PlcLogger,
  PlcReadRequest,
  PlcRuntimeHealth,
} from "./domain/types.js";

export class PlcRuntime {
  private readonly manager = new PlcConnectionManager();
  private started = false;

  constructor(
    private readonly config: PlcRuntimeConfig,
    private readonly logger: PlcLogger,
  ) {
    if (config.provider === "mock") {
      for (const connectionConfig of config.connections) {
        const adapter = new MockPlcAdapter(connectionConfig);
        this.manager.register(
          new PlcConnectionSupervisor(connectionConfig, adapter, logger),
        );
      }
    }
  }

  async start() {
    if (this.started) return;
    this.started = true;

    if (!this.config.enabled) {
      this.logger.info({}, "Integração PLC desabilitada por configuração");
      return;
    }

    if (this.config.provider !== "mock") {
      this.logger.warn(
        { provider: this.config.provider },
        "Adaptador PLC solicitado ainda não está instalado; API continuará operando sem conexão industrial",
      );
      return;
    }

    try {
      await this.manager.startAll();
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        "Falha inesperada ao iniciar runtime PLC; API continuará disponível",
      );
    }
  }

  async stop() {
    if (!this.started) return;
    this.started = false;
    await this.manager.stopAll();
  }

  async read(connectionId: string, request: PlcReadRequest) {
    return this.manager.read(connectionId, request);
  }

  async readBatch(connectionId: string, requests: PlcReadRequest[]) {
    return this.manager.readBatch(connectionId, requests);
  }

  getHealth(): PlcRuntimeHealth {
    const connections = this.manager.getSnapshots();

    if (!this.config.enabled) {
      return {
        enabled: false,
        provider: this.config.provider,
        status: "disabled",
        connections,
      };
    }

    if (connections.length === 0) {
      return {
        enabled: true,
        provider: this.config.provider,
        status: "not_configured",
        connections,
      };
    }

    const allConnected = connections.every(
      (connection) => connection.state === "connected",
    );

    return {
      enabled: true,
      provider: this.config.provider,
      status: allConnected ? "ready" : "degraded",
      connections,
    };
  }
}

export function createPlcRuntime(
  logger: PlcLogger,
  config = loadPlcRuntimeConfig(),
) {
  return new PlcRuntime(config, logger);
}
