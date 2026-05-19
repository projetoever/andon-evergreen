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
import { APP_NAME, APP_VERSION } from "@/constants/appConstants";
import { DEFAULT_ALERT_RULES } from "@/constants/alertRules";
import { createInitialMachines } from "@/data/initialMachines";
import { SOUND_CONFIGS } from "@/data/soundFiles";
import { loadFromStorage, removeFromStorage, saveToStorage } from "@/services/localStorageService";
import * as andonService from "@/services/andonService";
import {
  playCallSound,
  setSoundVolume,
  stopAllSounds,
  stopCallSound,
} from "@/services/soundService";
import { getCallTypeOption } from "@/data/callTypes";

const DEFAULT_SETTINGS: AppSettings = {
  appName: APP_NAME,
  kioskMode: true,
  simulationMode: true,
  soundsEnabled: true,
  soundVolume: 0.8,
  alertRules: DEFAULT_ALERT_RULES,
  theme: {
    primaryColor: "#2E7D32",
    dangerColor: "#C62828",
    warningColor: "#FBC02D",
    successColor: "#2E7D32",
    neutralColor: "#37474F",
  },
};

interface AndonContextValue {
  machines: Machine[];
  calls: AndonCall[];
  settings: AppSettings;
  soundConfigs: SoundConfig[];
  audioUnlocked: boolean;
  setAudioUnlocked: (unlocked: boolean) => void;
  openCall: (params: andonService.OpenAndonCallParams) => AndonCall;
  attendCall: (callId: string) => void;
  completeMaintenance: (callId: string) => AndonCall;
  returnToMaintenance: (callId: string) => AndonCall;
  finishCall: (params: andonService.FinishAndonCallParams) => void;
  changeMachineStatus: (machineId: string, status: MachineStatus) => void;
  updateMachineProductionMode: (machineId: string, productionMode: ProductionMode) => Machine;
  updateMachineStopEventDescription: (
    machineId: string,
    stopEventId: string,
    failureDescription: string,
  ) => void;
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
  const activeSoundsRef = useRef<Set<string>>(new Set());

  // Persistência automática
  useEffect(() => {
    saveToStorage(LOCAL_STORAGE_KEYS.machines, machines);
  }, [machines]);
  useEffect(() => {
    saveToStorage(LOCAL_STORAGE_KEYS.calls, calls);
  }, [calls]);
  useEffect(() => {
    saveToStorage(LOCAL_STORAGE_KEYS.settings, settings);
  }, [settings]);
  useEffect(() => {
    saveToStorage(LOCAL_STORAGE_KEYS.soundConfigs, soundConfigs);
  }, [soundConfigs]);
  useEffect(() => {
    saveToStorage(LOCAL_STORAGE_KEYS.appVersion, APP_VERSION);
  }, []);

  // Sincroniza volume
  useEffect(() => {
    setSoundVolume(settings.soundVolume);
  }, [settings.soundVolume]);

  // Sincroniza sons com chamados abertos
  useEffect(() => {
    if (!settings.soundsEnabled || !audioUnlocked) {
      stopAllSounds();
      activeSoundsRef.current.clear();
      return;
    }
    const openCalls = calls.filter((c) => c.status === "open");
    const wantedKeys = new Set<string>();
    for (const call of openCalls) {
      const opt = getCallTypeOption(call.subtype);
      const cfg = soundConfigs.find((s) => s.key === call.subtype);
      if (!opt || !cfg || !cfg.enabled) continue;
      wantedKeys.add(opt.soundKey);
    }
    // Tocar novos
    for (const key of wantedKeys) {
      if (!activeSoundsRef.current.has(key)) {
        const cfg = soundConfigs.find((s) => s.key === key);
        const interval = cfg?.repeatUntilAttended ? cfg.repeatIntervalSeconds : 0;
        playCallSound(key as never, interval);
        activeSoundsRef.current.add(key);
      }
    }
    // Parar os que não são mais necessários
    for (const key of Array.from(activeSoundsRef.current)) {
      if (!wantedKeys.has(key)) {
        stopCallSound(key as never);
        activeSoundsRef.current.delete(key);
      }
    }
  }, [calls, settings.soundsEnabled, audioUnlocked, soundConfigs]);

  const openCall = useCallback(
    (params: andonService.OpenAndonCallParams) => {
      const result = andonService.openAndonCall(machines, calls, params);
      setMachines(result.machines);
      setCalls(result.calls);
      return result.call;
    },
    [machines, calls],
  );

  const attendCall = useCallback(
    (callId: string) => {
      const result = andonService.attendAndonCall(machines, calls, callId);
      setMachines(result.machines);
      setCalls(result.calls);
    },
    [machines, calls],
  );

  const completeMaintenance = useCallback(
    (callId: string) => {
      const result = andonService.completeMaintenanceAttendance(machines, calls, callId);
      setMachines(result.machines);
      setCalls(result.calls);
      return result.call;
    },
    [machines, calls],
  );

  const returnToMaintenance = useCallback(
    (callId: string) => {
      const result = andonService.returnToMaintenance(machines, calls, callId);
      setMachines(result.machines);
      setCalls(result.calls);
      return result.call;
    },
    [machines, calls],
  );

  const finishCall = useCallback(
    (params: andonService.FinishAndonCallParams) => {
      const result = andonService.finishAndonCall(machines, calls, params);
      setMachines(result.machines);
      setCalls(result.calls);
    },
    [machines, calls],
  );

  const changeMachineStatus = useCallback(
    (machineId: string, status: MachineStatus) => {
      const result = andonService.updateMachineStatus(machines, machineId, status);
      setMachines(result.machines);
    },
    [machines],
  );

  const updateMachineProductionMode = useCallback(
    (machineId: string, productionMode: ProductionMode) => {
      const result = andonService.updateMachineProductionMode(machines, machineId, productionMode);
      setMachines(result.machines);
      return result.machine;
    },
    [machines],
  );
  const updateMachineStopEventDescription = useCallback(
    (machineId: string, stopEventId: string, failureDescription: string) => {
      setMachines((prevMachines) =>
        prevMachines.map((machine) =>
          machine.id !== machineId
            ? machine
            : {
                ...machine,
                stopHistory: machine.stopHistory.map((stopEvent) =>
                  stopEvent.id !== stopEventId
                    ? stopEvent
                    : { ...stopEvent, failureDescription: failureDescription.trim() },
                ),
              },
        ),
      );
    },
    [],
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
      completeMaintenance,
      returnToMaintenance,
      finishCall,
      changeMachineStatus,
      updateMachineProductionMode,
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
      completeMaintenance,
      returnToMaintenance,
      finishCall,
      changeMachineStatus,
      updateMachineProductionMode,
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
