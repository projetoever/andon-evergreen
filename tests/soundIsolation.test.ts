import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("serviço de som mantém estados independentes para dashboard e máquina", async () => {
  const soundService = await readSource("src/services/soundService.ts");

  assert.match(soundService, /export type AndonSoundScope = "dashboard" \| "machine"/);
  assert.match(soundService, /dashboard: createPlaybackState\(\)/);
  assert.match(soundService, /machine: createPlaybackState\(\)/);
  assert.match(soundService, /const state = playbackStates\[scope\]/);
  assert.match(
    soundService,
    /respectMachinePreference && !isMachineSoundEnabled\(machineId\)/,
  );
  assert.doesNotMatch(
    soundService,
    /if \(!isMachineSoundEnabled\(machineId\)\) return;/,
  );
});

test("hook roteia reprodução e parada pelo escopo explícito", async () => {
  const hook = await readSource("src/hooks/useAndonOpenCallSound.ts");

  assert.match(hook, /soundScope\?: "dashboard" \| "machine"/);
  assert.match(hook, /soundScope = "dashboard"/);
  assert.match(hook, /stopAndonSound\(undefined, soundScope\)/);
  assert.match(
    hook,
    /playAndonSound\([\s\S]*soundScope,[\s\S]*respectMachinePreference/,
  );
  assert.match(hook, /stopAndonSound\(callMachineId, soundScope\)/);
});

test("mute do dashboard atua somente no canal dashboard", async () => {
  const dashboard = await readSource("src/pages/DashboardPage.tsx");

  assert.match(dashboard, /soundScope: "dashboard"/);
  assert.match(dashboard, /stopAndonSound\(undefined, "dashboard"\)/);
  assert.doesNotMatch(dashboard, /setMachineSoundEnabled/);
  assert.doesNotMatch(dashboard, /isMachineSoundEnabled/);
});

test("mute da máquina atua somente no canal machine", async () => {
  const machinePage = await readSource("src/pages/MachineDetailPage.tsx");

  assert.match(machinePage, /respectMachinePreference: true/);
  assert.match(machinePage, /soundScope: "machine"/);
  assert.match(machinePage, /stopAndonSound\(machine\.id, "machine"\)/);
  assert.match(
    machinePage,
    /playAndonSound\([\s\S]*machine\.id,[\s\S]*"machine",[\s\S]*true/,
  );
  assert.doesNotMatch(machinePage, /dashboardSoundMuted/);
});

test("workstation da máquina possui ativação própria de áudio", async () => {
  const machinePage = await readSource("src/pages/MachineDetailPage.tsx");

  assert.match(machinePage, /function handleMachineAudioUnlock\(\)/);
  assert.match(machinePage, /unlockAudio\(\)/);
  assert.match(machinePage, /setAudioUnlocked\(true\)/);
  assert.match(machinePage, /ATIVAR SOM DA MÁQUINA/);
});

test("preferência de mute por máquina continua local à workstation", async () => {
  const preferenceService = await readSource("src/services/machineSoundPreferenceService.ts");

  assert.match(preferenceService, /andon\.machineSoundPreferences/);
  assert.match(preferenceService, /window\.localStorage\.getItem/);
  assert.match(preferenceService, /window\.localStorage\.setItem/);
});
