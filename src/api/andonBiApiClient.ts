import { AndonApiError, createAndonApiClient } from "@/api/andonApiClient";

export class AndonBiApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AndonBiApiError";
  }
}

// Keep the BI read-only while sharing the operational client's workstation
// identification, base URL, timeout, and centralized HTTP error handling.
// Without that header, the API rejects browser analytics with HTTP 403.
const apiClient = createAndonApiClient();

async function get<T>(path: string): Promise<T> {
  try {
    return await apiClient.get<T>(path);
  } catch (error) {
    if (error instanceof AndonApiError) {
      throw new AndonBiApiError(error.message, error.status);
    }
    throw error;
  }
}

export const andonBiApiClient = {
  get,
};
