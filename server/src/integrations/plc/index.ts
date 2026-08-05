export { PlcRuntime, createPlcRuntime } from "./PlcRuntime.js";
export { registerPlcHealthRoute } from "./routes/plcHealth.js";
export type {
  PlcConnectionConfig,
  PlcConnectionSnapshot,
  PlcHealthResult,
  PlcReadRequest,
  PlcReadResult,
  PlcRuntimeHealth,
  PlcSignalDefinition,
} from "./domain/types.js";
