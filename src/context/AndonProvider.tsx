import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

interface AndonContextValue {
  machines: Machine[];
  calls: AndonCall[];
  settings: AppSettings;
  soundConfigs: SoundConfig[];
  audioUnlocked: boolean;
  setAudioUnlocked: (unlocked: boolean) => void;
  openCall: (params: andonService.OpenAndonCallParams) => AndonCall;
  attendCall: (params: string | andonService.StartAttendanceParams) => void;
  addTechnicianSessions: (params: andonService.AddTechnicianSessionsParams) => void;
  endTechnicianSession: (params: andonService.EndTechnicianSessionParams) => void;
  completeMaintenance: (callId: string) => AndonCall;
  returnToMaintenance: (callId: string) => AndonCall;
  finishCall: (params: andonService.FinishAndonCallParams) => void;
  cancelCall: (params: andonService.CancelAndonCallParams) => void;
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
    loadFromStorage<Machine[]>(LOCAL_STORAGE_KEYS.machines, createInitialMachines()).map(
      andonService.normalizeMachine,
    ),
  );
  const [calls, setCalls] = useState<AndonCall[]>(() =>
    loadFromStorage<AndonCall[]>(LOCAL_STORAGE_KEYS.calls, []).map(andonService.normalizeAndonCall),
  );
  const [settings, setSettings] = useState<AppSettings>(() =>
    loadFromStorage<AppSettings>(LOCAL_STORAGE_KEYS.settings, DEFAULT_SETTINGS),
  );
  const [soundConfigs, setSoundConfigs] = useState<SoundConfig[]>(() =>
    loadFromStorage<SoundConfig[]>(LOCAL_STORAGE_KEYS.soundConfigs, SOUND_CONFIGS),
  );
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const isLocalDataMode = CONFIGURED_DATA_MODE === "local";

  useEffect(() => {
    if (isLocalDataMode) return;

    void andonRepository.loadSnapshot().then((snapshot) => {
      if (!snapshot) return;
      setMachines(snapshot.machines.map(andonService.normalizeMachine));
      setCalls(snapshot.calls.map(andonService.normalizeAndonCall));
      setSettings(snapshot.settings);
      setSoundConfigs(snapshot.soundConfigs);
    }).catch((error) => {
      console.error(error instanceof Error ? error.message : "Falha ao carregar dados da API ANDON.");
    });
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
    (params: andonService.OpenAndonCallParams) => {
      const optimisticResult = andonService.openAndonCall(machines, calls, params);
      void andonRepository.openCall(machines, calls, params).then((result) => {
        setMachines(result.machines);
        setCalls(result.calls);
      }).catch(handleRepositoryError);
      return optimisticResult.call;
    },
    [machines, calls, handleRepositoryError],
  );

  const attendCall = useCallback(
    (params: string | andonService.StartAttendanceParams) => {
      const callId = typeof params === "string" ? params : params.callId;
      const currentCall = calls.find((call) => call.id === callId);
      stopAndonSound(currentCall?.machineId);
      void andonRepository.attendCall(machines, calls, params).then((result) => {
        setMachines(result.machines);
        setCalls(result.calls);
      }).catch(handleRepositoryError);
    },
    [machines, calls, handleRepositoryError],
  );



  const addTechnicianSessions = useCallback(
    (params: andonService.AddTechnicianSessionsParams) => {
      void andonRepository.addTechnicianSessions(machines, calls, params).then((result) => {
        setCalls(result.calls);
      }).catch(handleRepositoryError);
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
    (callId: string) => {
      const optimisticResult = andonService.completeMaintenanceAttendance(machines, calls, callId);
      void andonRepository.completeMaintenance(machines, calls, callId).then((result) => {
        setMachines(result.machines);
        setCalls(result.calls);
      }).catch(handleRepositoryError);
      return optimisticResult.call;
    },
    [machines, calls, handleRepositoryError],
  );

  const returnToMaintenance = useCallback(
    (callId: string) => {
      const optimisticResult = andonService.returnToMaintenance(machines, calls, callId);
      void andonRepository.returnToMaintenance(machines, calls, callId).then((result) => {
        setMachines(result.machines);
        setCalls(result.calls);
      }).catch(handleRepositoryError);
      return optimisticResult.call;
    },
    [machines, calls, handleRepositoryError],
  );

  const finishCall = useCallback(
    (params: andonService.FinishAndonCallParams) => {
      void andonRepository.finishCall(machines, calls, params).then((result) => {
        setMachines(result.machines);
        setCalls(result.calls);
      }).catch(handleRepositoryError);
    },
    [machines, calls, handleRepositoryError],
  );

  const cancelCall = useCallback(
    (params: andonService.CancelAndonCallParams) => {
      const currentCall = calls.find((call) => call.id === params.callId);
      stopAndonSound(currentCall?.machineId);
      void andonRepository.cancelCall(machines, calls, params).then((result) => {
        setMachines(result.machines);
        setCalls(result.calls);
      }).catch(handleRepositoryError);
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
      const result = andonService.updateMachineStopEventDescription(
        machines,
        machineId,
        stopEventId,
        failureDescription,
        failureClassification,
      );
      setMachines(result.machines);
      return result.machine;
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
      setAudioUnlocked,
      openCall,
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
      openCall,
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
