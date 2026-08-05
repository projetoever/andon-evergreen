import type { PlcReadRequest } from "../domain/types.js";
import { PlcConnectionSupervisor } from "./PlcConnectionSupervisor.js";

export class PlcConnectionManager {
  private readonly connections = new Map<string, PlcConnectionSupervisor>();

  register(connection: PlcConnectionSupervisor) {
    if (this.connections.has(connection.config.id)) {
      throw new Error(`Conexão PLC duplicada: ${connection.config.id}`);
    }
    this.connections.set(connection.config.id, connection);
  }

  async startAll() {
    await Promise.allSettled(
      Array.from(this.connections.values(), (connection) => connection.start()),
    );
  }

  async stopAll() {
    await Promise.allSettled(
      Array.from(this.connections.values(), (connection) => connection.stop()),
    );
  }

  getSnapshots() {
    return Array.from(this.connections.values(), (connection) => connection.getSnapshot());
  }

  async read(connectionId: string, request: PlcReadRequest) {
    return this.getConnection(connectionId).read(request);
  }

  async readBatch(connectionId: string, requests: PlcReadRequest[]) {
    return this.getConnection(connectionId).readBatch(requests);
  }

  private getConnection(connectionId: string) {
    const connection = this.connections.get(connectionId);
    if (!connection) throw new Error(`Conexão PLC não encontrada: ${connectionId}`);
    return connection;
  }
}
