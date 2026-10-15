import assert from "node:assert/strict";
import test from "node:test";
import {
  readAudioActivationPreference,
  rememberAudioActivation,
} from "../src/services/audioActivationPreferenceService";

test("audio activation survives a reload for the same workstation only", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  const station = "ws_00000000-0000-4000-8000-000000000037";
  assert.equal(readAudioActivationPreference(station, storage), false);
  rememberAudioActivation(station, storage);
  const reloadedStorage = { ...storage };
  assert.equal(readAudioActivationPreference(station, reloadedStorage), true);
  assert.equal(readAudioActivationPreference(station.replace(/37$/, "38"), reloadedStorage), false);
  assert.equal(readAudioActivationPreference(null, reloadedStorage), false);
});

test("missing or blocked browser storage does not prevent activation in the current session", () => {
  const storage = {
    getItem: () => {
      throw new Error("Storage disabled");
    },
    setItem: () => {
      throw new Error("Storage disabled");
    },
  };
  assert.doesNotThrow(() => rememberAudioActivation("workstation", storage));
  assert.equal(readAudioActivationPreference("workstation", storage), false);
  assert.equal(readAudioActivationPreference("workstation", null), false);
});
