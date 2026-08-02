import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import { TechnicianContext, type TechnicianContextValue } from "@/context/technicianContext";
import { TECHNICIANS } from "@/data/technicians";
import {
  createTechnicianConfig,
  listTechnicianConfigs,
  updateTechnicianConfig,
  type TechnicianConfigDraft,
} from "@/services/technicianConfigService";
import type { TechnicianConfig } from "@/types/settings";

const TECHNICIAN_SYNC_INTERVAL_MS = 10_000;

function getLocalDevelopmentTechnicians(): TechnicianConfig[] {
  return TECHNICIANS.map((technician) => ({
    id: technician.id,
    name: technician.name,
    area: technician.area,
    shiftId: "",
    shiftIds: [],
    active: technician.active,
  }));
}

function sortTechnicians(technicians: TechnicianConfig[]) {
  return [...technicians].sort((current, next) => current.name.localeCompare(next.name, "pt-BR"));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Não foi possível carregar os mantenedores pela API.";
}

export function TechnicianProvider({ children }: { children: ReactNode }) {
  const isApiMode = CONFIGURED_DATA_MODE === "api";
  const [technicians, setTechnicians] = useState<TechnicianConfig[]>(() =>
    isApiMode ? [] : getLocalDevelopmentTechnicians(),
  );
  const [isLoading, setIsLoading] = useState(isApiMode);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlightRef = useRef(false);

  const refreshTechnicians = useCallback(async () => {
    if (!isApiMode || refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;

    try {
      const items = await listTechnicianConfigs();
      setTechnicians(sortTechnicians(items));
      setError(null);
    } catch (refreshError) {
      setError(getErrorMessage(refreshError));
    } finally {
      refreshInFlightRef.current = false;
      setIsLoading(false);
    }
  }, [isApiMode]);

  useEffect(() => {
    if (!isApiMode) return;

    void refreshTechnicians();
    const intervalId = window.setInterval(() => {
      void refreshTechnicians();
    }, TECHNICIAN_SYNC_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [isApiMode, refreshTechnicians]);

  const createTechnician = useCallback(
    async (draft: TechnicianConfigDraft) => {
      if (!isApiMode) {
        const created: TechnicianConfig = {
          ...draft,
          id: `dev-tech-${Date.now()}`,
          shiftIds: draft.shiftId ? [draft.shiftId] : [],
        };
        setTechnicians((current) => sortTechnicians([...current, created]));
        return created;
      }

      const created = await createTechnicianConfig(draft);
      setTechnicians((current) => sortTechnicians([...current, created]));
      setError(null);
      return created;
    },
    [isApiMode],
  );

  const updateTechnician = useCallback(
    async (id: string, patch: Partial<TechnicianConfigDraft>) => {
      if (!isApiMode) {
        const current = technicians.find((technician) => technician.id === id);
        if (!current) throw new Error("Manutentor não encontrado.");

        const updated: TechnicianConfig = {
          ...current,
          ...patch,
          shiftIds:
            patch.shiftId !== undefined ? (patch.shiftId ? [patch.shiftId] : []) : current.shiftIds,
        };
        setTechnicians((items) =>
          sortTechnicians(items.map((technician) => (technician.id === id ? updated : technician))),
        );
        return updated;
      }

      const updated = await updateTechnicianConfig(id, patch);
      setTechnicians((current) =>
        sortTechnicians(
          current.map((technician) => (technician.id === updated.id ? updated : technician)),
        ),
      );
      setError(null);
      return updated;
    },
    [isApiMode, technicians],
  );

  const findTechnicianByName = useCallback(
    (name: string) =>
      technicians.find(
        (technician) => technician.name.localeCompare(name, "pt-BR", { sensitivity: "base" }) === 0,
      ),
    [technicians],
  );

  const value = useMemo<TechnicianContextValue>(
    () => ({
      technicians,
      isLoading,
      error,
      refreshTechnicians,
      createTechnician,
      updateTechnician,
      findTechnicianByName,
    }),
    [
      technicians,
      isLoading,
      error,
      refreshTechnicians,
      createTechnician,
      updateTechnician,
      findTechnicianByName,
    ],
  );

  return <TechnicianContext.Provider value={value}>{children}</TechnicianContext.Provider>;
}
