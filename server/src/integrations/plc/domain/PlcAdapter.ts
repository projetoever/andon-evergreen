import type {
  PlcAdapterCapabilities,
  PlcHealthResult,
  PlcReadRequest,
  PlcReadResult,
} from "./types.js";

export interface PlcAdapter {
  readonly connectionId: string;
  readonly capabilities: PlcAdapterCapabilities;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  read(request: PlcReadRequest): Promise<PlcReadResult>;
  readBatch(requests: PlcReadRequest[]): Promise<PlcReadResult[]>;
  healthCheck(): Promise<PlcHealthResult>;
}
