import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AndonCall } from "@/types/andon";
import type { Machine, MachineStatus, ProductionMode } from "@/types/machine";
import type { AppSettings, SoundConfig } from "@/types/settings";
import { LOCAL_STORAGE_KEYS } from "@/constants/localStorageKeys";
import { APP_VERSION } from "@/constants/appConstants";
import { createInitialMachines } from "@/data/initialMachines";
import { SOUND_CONFIGS } from "@/data/soundFiles";
import { loadFromStorage, removeFromStorage, saveToStorage } from "@/services/localStorageService";
import * as andonService from "@/services/andonService";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import { andonRepository } from "@/repositories/selectedAndonRepository";
import { DEFAULT_SETTINGS } from "./defaultSettings";
import { setSoundVolume, stopAllSounds, stopAndonSound } from "@/services/soundService";
import { setServerTimeOffsetMs } from "@/utils/serverClock";

const DEFAULT_API_SYNC_INTERVAL_MS = 2_000;
const MIN_API_SYNC_INTERVAL_MS = 500;

function getApiSyncIntervalMs() {
  const configured = Number(import.meta.env.VITE_ANDON_SYNC_INTERVAL_MS);
  if (Number.isFinite(configured) && configured >= MIN_API_SYNC_INTERVAL_MS) return configured;
  return DEFAULT_API_SYNC_INTERVAL_MS;
}

interface AndonContextValue {
  machines: Machine[];
  calls: AndonCall[];
  settings: AppSettings;
  soundConfigs: SoundConfig[];
  audioUnlocked: boolean;
  serverTimeOffsetMs: number;
  setAudioUnlocked: (unlocked: boolean) => void;
  openCall: (params: andonService.OpenAndonCallParams) => Promise<AndonCall>;
  openCalls: (params: andonService.OpenAndonCallParams[]) => Promise<void>;
  attendCall: (params: string | andonService.StartAttendanceParams) => Promise<void>;
  addTechnicianSessions: (params: andonService.AddTechnicianSessionsParams) => Promise<void>;
  endTechnicianSession: (params: andonService.EndTechnicianSessionParams) => void;
  completeMaintenance: (callId: string) => Promise<AndonCall>;
  returnToMaintenance: (callId: string) => Promise<AndonCall>;
  finishCall: (params: andonService.FinishAndonCallParams) => Promise<void>;
  cancelCall: (params: andonService.CancelAndonCallParams) => Promise<void>;
  changeMachineStatus: (machineId: string, status: MachineStatus) => void;
  updateMachineProductionMode: (machineId: string, productionMode: ProductionMode) => Machine;
  createMachine: (params: { id: string; name?: string; productionMode?: ProductionMode }) => void;
  updateMachineCatalog: (machineId: string, patch: { name?: string; productionMode?: ProductionMode }) => void;
  updateMachineActive: (machineId: string, isActive: boolean) => void;
  updateMachineStopEventDescription: (
    machineId: string,
    stopEventId: string,
    failureDescription: string,
    failureClassification?: import("@/types/machine").FailureClassification,
  ) => Machine;
  updateSettings: (patch: Partial<AppSettings>) => void;
  updateSoundConfigs: (configs: SoundConfig[]) => void;
  resetAllLocalData: () => void;
  importBackup: (data: {
    machines?: Machine[];
    calls?: AndonCall[];
    settings?: AppSettings;
    soundConfigs?: SoundConfig[];
  }) => void;
}

const AndonContext = createContext<AndonContextValue | null>(null);

export function AndonProvider({ children }: { children: ReactNode }) {
  const [machines, setMachines] = useState<Machine[]>(() =>
    CONFIGURED_DATA_MODE === "api"
      ? []
      : loadFromStorage<Machine[]>(LOCAL_STORAGE_KEYS.machines, createInitialMachines()).map(
        andonService.normalizeMachine,
      ),
  );
  const [calls, setCalls] = useState<AndonCall[]>(() =>
    CONFIGURED_DATA_MODE === "api"
      ? []
      : loadFromStorage<AndonCall[]>(LOCAL_STORAGE_KEYS.calls, []).map(andonService.normalizeAndonCall),
  );
  const [settings, setSettings] = useState<AppSettings>(() =>
    CONFIGURED_DATA_MODE === "api"
      ? DEFAULT_SETTINGS
      : loadFromStorage<AppSettings>(LOCAL_STORAGE_KEYS.settings, DEFAULT_SETTINGS),
  );
  const [soundConfigs, setSoundConfigs] = useState<SoundConfig[]>(() =>
    CONFIGURED_DATA_MODE === "api"
      ? SOUND_CONFIGS
      : loadFromStorage<SoundConfig[]>(LOCAL_STORAGE_KEYS.soundConfigs, SOUND_CONFIGS),
  );
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [serverTimeOffsetStateMs, setServerTimeOffsetStateMs] = useState(0);
  const apiSyncInFlightRef = useRef(false);

  const isLocalDataMode = CONFIGURED_DATA_MODE === "local";

  useEffect(() => {
    if (isLocalDataMode) return;

    let disposed = false;
    const syncIntervalMs = getApiSyncIntervalMs();

    async function syncSnapshot(reason: "initial" | "poll" | "online" | "visible") {
      if (apiSyncInFlightRef.current) return;
      apiSyncInFlightRef.current = true;

      try {
        const snapshot = await andonRepository.loadSnapshot();
        if (!snapshot || disposed) return;

        setMachines(snapshot.machines.map(andonService.normalizeMachine));
        setCalls(snapshot.calls.map(andonService.normalizeAndonCall));
        setSettings(snapshot.settings);
        setSoundConfigs(snapshot.soundConfigs);

        if (typeof snapshot.serverTimeOffsetMs === "number" && Number.isFinite(snapshot.serverTimeOffsetMs)) {
          setServerTimeOffsetMs(snapshot.serverTimeOffsetMs);
          setServerTimeOffsetStateMs(snapshot.serverTimeOffsetMs);
        }
      } catch (error) {
        console.error(
          error instanceof Error
            ? `[${reason}] ${error.message}`
            : "Falha ao sincronizar dados da API ANDON.",
        );
      } finally {
        apiSyncInFlightRef.current = false;
      }
    }

    void syncSnapshot("initial");

    const intervalId = window.setInterval(() => {
      void syncSnapshot("poll");
    }, syncIntervalMs);

    const handleOnline = () => void syncSnapshot("online");
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void syncSnapshot("visible");
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isLocalDataMode]);

  // Persistência automática local
  useEffect(() => {
    if (isLocalDataMode) saveToStorage(LOCAL_STORAGE_KEYS.machines, machines);
  }, [isLocalDataMode, machines]);
  useEffect(() => {
    if (isLocalDataMode) saveToStorage(LOCAL_STORAGE_KEYS.calls, calls);
  }, [isLocalDataMode, calls]);
  useEffect(() => {
    if (isLocalDataMode) saveToStorage(LOCAL_STORAGE_KEYS.settings, settings);
  }, [isLocalDataMode, settings]);
  useEffect(() => {
    if (isLocalDataMode) saveToStorage(LOCAL_STORAGE_KEYS.soundConfigs, soundConfigs);
  }, [isLocalDataMode, soundConfigs]);
  useEffect(() => {
    if (isLocalDataMode) saveToStorage(LOCAL_STORAGE_KEYS.appVersion, APP_VERSION);
  }, [isLocalDataMode]);

  // Sincroniza volume
  useEffect(() => {
    setSoundVolume(settings.soundVolume);
  }, [settings.soundVolume]);

  const handleRepositoryError = useCallback((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Falha na operação ANDON.");
  }, []);

  const openCall = useCallback(
    async (params: andonService.OpenAndonCallParams) => {
      const result = await andonRepository.openCall(machines, calls, params);
      setMachines(result.machines);
      setCalls(result.calls);
      return result.call;
    },
    [machines, calls, handleRepositoryError],
  );

  const openCalls = useCallback(
    async (params: andonService.OpenAndonCallParams[]) => {
      const result = await andonRepository.openCalls(machines, calls, params);
      setMachines(result.machines);
      setCalls(result.calls);
    },
    [machines, calls],
  );

  const attendCall = useCallback(
    async (params: string | andonService.StartAttendanceParams) => {
      const callId = typeof params === "string" ? params : params.callId;
      const currentCall = calls.find((call) => call.id === callId);
      const result = await andonRepository.attendCall(machines, calls, params);
      setMachines(result.machines);
      setCalls(result.calls);
      stopAndonSound(currentCall?.machineId);
    },
    [machines, calls, handleRepositoryError],
  );



  const addTechnicianSessions = useCallback(
    async (params: andonService.AddTechnicianSessionsParams) => {
      const result = await andonRepository.addTechnicianSessions(machines, calls, params);
      setCalls(result.calls);
    },
    [machines, calls, handleRepositoryError],
  );

  const endTechnicianSession = useCallback(
    (params: andonService.EndTechnicianSessionParams) => {
      void andonRepository.endTechnicianSession(machines, calls, params).then((result) => {
        setCalls(result.calls);
      }).catch(handleRepositoryError);
    },
    [machines, calls, handleRepositoryError],
  );

  const completeMaintenance = useCallback(
    async (callId: string) => {
      const result = await andonRepository.completeMaintenance(machines, calls, callId);
      setMachines(result.machines);
      setCalls(result.calls);
      return result.call;
    },
    [machines, calls, handleRepositoryError],
  );

  const returnToMaintenance = useCallback(
    async (callId: string) => {
      const result = await andonRepository.returnToMaintenance(machines, calls, callId);
      setMachines(result.machines);
      setCalls(result.calls);
      return result.call;
    },
    [machines, calls, handleRepositoryError],
  );

  const finishCall = useCallback(
    async (
      params: andonService.FinishAndonCallParams,
    ) => {
      const result =
        await andonRepository.finishCall(
          machines,
          calls,
          params,
        );

      setMachines(result.machines);
      setCalls(result.calls);
    },
    [machines, calls],
  );

  const cancelCall = useCallback(
    async (params: andonService.CancelAndonCallParams) => {
      const currentCall = calls.find((call) => call.id === params.callId);
      const result = await andonRepository.cancelCall(machines, calls, params);
      setMachines(result.machines);
      setCalls(result.calls);
      stopAndonSound(currentCall?.machineId);
    },
    [machines, calls, handleRepositoryError],
  );

  const changeMachineStatus = useCallback(
    (machineId: string, status: MachineStatus) => {
      void andonRepository.updateMachineStatus(machines, machineId, status).then((result) => {
        setMachines(result.machines);
      }).catch(handleRepositoryError);
    },
    [machines, handleRepositoryError],
  );

  const updateMachineProductionMode = useCallback(
    (machineId: string, productionMode: ProductionMode) => {
      const optimisticResult = andonService.updateMachineProductionMode(machines, machineId, productionMode);
      void andonRepository.updateMachineProductionMode(machines, machineId, productionMode).then((result) => {
        setMachines(result.machines);
      }).catch(handleRepositoryError);
      return optimisticResult.machine;
    },
    [machines, handleRepositoryError],
  );


  const createMachine = useCallback(
    (params: { id: string; name?: string; productionMode?: ProductionMode }) => {
      void andonRepository.createMachine(machines, params).then((result) => {
        setMachines(result.machines.map(andonService.normalizeMachine));
      }).catch(handleRepositoryError);
    },
    [machines, handleRepositoryError],
  );

  const updateMachineCatalog = useCallback(
    (machineId: string, patch: { name?: string; productionMode?: ProductionMode }) => {
      void andonRepository.updateMachineCatalog(machines, machineId, patch).then((result) => {
        setMachines(result.machines.map(andonService.normalizeMachine));
      }).catch(handleRepositoryError);
    },
    [machines, handleRepositoryError],
  );

  const updateMachineActive = useCallback(
    (machineId: string, isActive: boolean) => {
      void andonRepository.updateMachineActive(machines, machineId, isActive).then((result) => {
        setMachines(result.machines.map(andonService.normalizeMachine));
      }).catch(handleRepositoryError);
    },
    [machines, handleRepositoryError],
  );

  const updateMachineStopEventDescription = useCallback(
    (
      machineId: string,
      stopEventId: string,
      failureDescription: string,
      failureClassification?: import("@/types/machine").FailureClassification,
    ) => {
      const optimisticResult = andonService.updateMachineStopEventDescription(
        machines,
        machineId,
        stopEventId,
        failureDescription,
        failureClassification,
      );

      setMachines(optimisticResult.machines);

      void andonRepository
        .updateMachineStopEventDescription(
          machines,
          machineId,
          stopEventId,
          failureDescription,
          failureClassification,
        )
        .then((result) => {
          setMachines(result.machines.map(andonService.normalizeMachine));
        })
        .catch(handleRepositoryError);

      return optimisticResult.machine;
    },
    [machines, handleRepositoryError],
  );

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateSoundConfigs = useCallback((configs: SoundConfig[]) => {
    setSoundConfigs(configs);
  }, []);

  const resetAllLocalData = useCallback(() => {
    Object.values(LOCAL_STORAGE_KEYS).forEach(removeFromStorage);
    setMachines(createInitialMachines());
    setCalls([]);
    setSettings(DEFAULT_SETTINGS);
    setSoundConfigs(SOUND_CONFIGS);
    setServerTimeOffsetMs(0);
    setServerTimeOffsetStateMs(0);
    stopAllSounds();
  }, []);

  const importBackup = useCallback(
    (data: {
      machines?: Machine[];
      calls?: AndonCall[];
      settings?: AppSettings;
      soundConfigs?: SoundConfig[];
    }) => {
      if (data.machines) setMachines(data.machines.map(andonService.normalizeMachine));
      if (data.calls) setCalls(data.calls.map(andonService.normalizeAndonCall));
      if (data.settings) setSettings(data.settings);
      if (data.soundConfigs) setSoundConfigs(data.soundConfigs);
    },
    [],
  );

  const value = useMemo<AndonContextValue>(
    () => ({
      machines,
      calls,
      settings,
      soundConfigs,
      audioUnlocked,
      serverTimeOffsetMs: serverTimeOffsetStateMs,
      setAudioUnlocked,
      openCall,
      openCalls,
      attendCall,
      addTechnicianSessions,
      endTechnicianSession,
      completeMaintenance,
      returnToMaintenance,
      finishCall,
      cancelCall,
      changeMachineStatus,
      updateMachineProductionMode,
      createMachine,
      updateMachineCatalog,
      updateMachineActive,
      updateMachineStopEventDescription,
      updateSettings,
      updateSoundConfigs,
      resetAllLocalData,
      importBackup,
    }),
    [
      machines,
      calls,
      settings,
      soundConfigs,
      audioUnlocked,
      serverTimeOffsetStateMs,
      openCall,
      openCalls,
      attendCall,
      addTechnicianSessions,
      endTechnicianSession,
      completeMaintenance,
      returnToMaintenance,
      finishCall,
      cancelCall,
      changeMachineStatus,
      updateMachineProductionMode,
      createMachine,
      updateMachineCatalog,
      updateMachineActive,
      updateMachineStopEventDescription,
      updateSettings,
      updateSoundConfigs,
      resetAllLocalData,
      importBackup,
    ],
  );

  return <AndonContext.Provider value={value}>{children}</AndonContext.Provider>;
}

export function useAndon(): AndonContextValue {
  const ctx = useContext(AndonContext);
  if (!ctx) throw new Error("useAndon must be used within AndonProvider");
  return ctx;
}
