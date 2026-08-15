import { useEffect, useMemo } from "react";
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
  const activeMachines = useMemo(
    () => new Set(machines.filter((machine) => machine.isActive).map((machine) => machine.id)),
    [machines],
  );

  const callToAlert = useMemo(
    () =>
      calls
        .filter((call) => {
          if (call.isSystemTest) return false;
          if (call.status !== "open") return false;
          if (machineId && call.machineId !== machineId) return false;
          if (!activeMachines.has(call.machineId)) return false;
          if (respectMachinePreference && !isMachineSoundEnabled(call.machineId)) return false;
          const config = soundConfigs.find((item) => item.key === call.subtype);
          return Boolean(getCallTypeOption(call.subtype) && config?.enabled);
        })
        .sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0] ?? null,
    [activeMachines, calls, machineId, respectMachinePreference, soundConfigs],
  );

  const callId = callToAlert?.id ?? null;
  const callMachineId = callToAlert?.machineId ?? null;
  const callSubtype = callToAlert?.subtype ?? null;
  const config = callSubtype ? soundConfigs.find((item) => item.key === callSubtype) : null;
  const repeatInterval = config?.repeatUntilAttended ? config.repeatIntervalSeconds : 0;
  const playbackEnabled = settings.soundsEnabled && audioUnlocked;

  useEffect(() => {
    if (!playbackEnabled || !callId || !callMachineId || !callSubtype) {
      stopAndonSound();
      return;
    }

    void playAndonSound(callMachineId, callSubtype, repeatInterval).catch(() => undefined);

    return () => {
      stopAndonSound(callMachineId);
    };
  }, [callId, callMachineId, callSubtype, playbackEnabled, repeatInterval]);
}
