import { useEffect, useMemo, useRef } from "react";
import type { AndonCall } from "@/types/andon";
import type { Machine } from "@/types/machine";
import type { AppSettings, SoundConfig } from "@/types/settings";
import { getCallTypeOption } from "@/data/callTypes";
import { isMachineSoundEnabled } from "@/services/machineSoundPreferenceService";
import { playAndonSound, stopAndonSound } from "@/services/soundService";

interface UseAndonOpenCallSoundParams {
  calls: AndonCall[];
  machines: Machine[];
  settings: AppSettings;
  soundConfigs: SoundConfig[];
  audioUnlocked: boolean;
  machineId?: string;
  respectMachinePreference?: boolean;
}

export function useAndonOpenCallSound({
  calls,
  machines,
  settings,
  soundConfigs,
  audioUnlocked,
  machineId,
  respectMachinePreference = false,
}: UseAndonOpenCallSoundParams) {
  const activeSoundMachineIdRef = useRef<string | null>(null);
  const activeMachines = useMemo(
    () => new Set(machines.filter((machine) => machine.isActive).map((machine) => machine.id)),
    [machines],
  );

  useEffect(() => {
    const stopCurrent = () => {
      if (activeSoundMachineIdRef.current) {
        stopAndonSound(activeSoundMachineIdRef.current);
        activeSoundMachineIdRef.current = null;
      } else {
        stopAndonSound();
      }
    };

    if (!settings.soundsEnabled || !audioUnlocked) {
      stopCurrent();
      return;
    }

    const callToAlert = calls.find((call) => {
      if (call.status !== "open") return false;
      if (machineId && call.machineId !== machineId) return false;
      if (!activeMachines.has(call.machineId)) return false;
      if (respectMachinePreference && !isMachineSoundEnabled(call.machineId)) return false;
      const config = soundConfigs.find((item) => item.key === call.subtype);
      return Boolean(getCallTypeOption(call.subtype) && config?.enabled);
    });

    if (!callToAlert) {
      stopCurrent();
      return;
    }

    if (activeSoundMachineIdRef.current === callToAlert.machineId) return;

    stopCurrent();
    const config = soundConfigs.find((item) => item.key === callToAlert.subtype);
    const repeatInterval = config?.repeatUntilAttended ? config.repeatIntervalSeconds : 0;
    activeSoundMachineIdRef.current = callToAlert.machineId;
    void playAndonSound(callToAlert.machineId, callToAlert.subtype, repeatInterval).catch(() => undefined);

    return () => {
      stopAndonSound(callToAlert.machineId);
      if (activeSoundMachineIdRef.current === callToAlert.machineId) {
        activeSoundMachineIdRef.current = null;
      }
    };
  }, [activeMachines, audioUnlocked, calls, machineId, respectMachinePreference, settings.soundsEnabled, soundConfigs]);
}
