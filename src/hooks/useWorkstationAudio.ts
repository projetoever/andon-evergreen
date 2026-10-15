import { useCallback, useEffect, useState } from "react";
import {
  readAudioActivationPreference,
  rememberAudioActivation,
} from "@/services/audioActivationPreferenceService";
import {
  AUDIO_PLAYBACK_BLOCKED_EVENT,
  isAudioUnlocked,
  unlockAudio,
} from "@/services/soundService";

export function useWorkstationAudio() {
  const [audioUnlocked, setUnlocked] = useState(isAudioUnlocked);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [remembered, setRemembered] = useState(false);

  const setAudioUnlocked = useCallback((enabled: boolean) => {
    if (enabled) {
      unlockAudio();
      rememberAudioActivation();
      setRemembered(true);
      setAudioPlaybackBlocked(false);
    }
    setUnlocked(enabled);
  }, []);

  useEffect(() => {
    const onBlocked = () => {
      setUnlocked(false);
      setAudioPlaybackBlocked(true);
    };
    window.addEventListener(AUDIO_PLAYBACK_BLOCKED_EVENT, onBlocked);
    if (readAudioActivationPreference()) {
      setRemembered(true);
      unlockAudio();
      setUnlocked(true);
    }
    return () => window.removeEventListener(AUDIO_PLAYBACK_BLOCKED_EVENT, onBlocked);
  }, []);

  useEffect(() => {
    if (!remembered || audioUnlocked) return;
    // A normal interaction also retries audio after a browser autoplay rejection.
    const retry = () => setAudioUnlocked(true);
    window.addEventListener("pointerdown", retry, { once: true });
    window.addEventListener("keydown", retry, { once: true });
    return () => {
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
    };
  }, [audioUnlocked, remembered, setAudioUnlocked]);

  return { audioUnlocked, audioPlaybackBlocked, setAudioUnlocked };
}
