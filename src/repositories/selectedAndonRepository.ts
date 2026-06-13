import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import { apiAndonRepository } from "./apiAndonRepository";
import type { AndonRepository } from "./andonRepository";
import { localAndonRepository } from "./localAndonRepository";

export const andonRepository: AndonRepository =
  CONFIGURED_DATA_MODE === "api" ? apiAndonRepository : localAndonRepository;
