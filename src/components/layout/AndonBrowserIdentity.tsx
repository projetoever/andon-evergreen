import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  getSystemSettings,
  SYSTEM_SETTINGS_CHANGED_EVENT,
} from "@/services/systemSettingsService";
import type { SystemSettings } from "@/types/systemSettings";
import { formatAndonBrowserTitle } from "@/utils/andonBrowserTitle";

/**
 * Browser chrome only. Uses the same clientName persisted by Hub > Empresa e
 * unidade. No extra endpoint, server mutation, login or station permission.
 * SSR starts with a customer-neutral title; the browser resolves identity.
 */
export function AndonBrowserIdentity() {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const [clientName, setClientName] = useState<unknown>(null);

  useEffect(() => {
    let mounted = true;
    let requestVersion = 0;

    function refresh() {
      const version = ++requestVersion;
      void getSystemSettings().then(settings => {
        if (mounted && version === requestVersion) setClientName(settings.clientName);
      }).catch(() => {
        // Reading identity must never block an operational screen or disclose
        // a stale company after a failed refresh.
        if (mounted && version === requestVersion) setClientName(null);
      });
    }

    function onSettingsChanged(event: Event) {
      // Ignore any earlier in-flight read when the Hub saves a new name.
      requestVersion += 1;
      const settings = (event as CustomEvent<SystemSettings>).detail;
      setClientName(settings?.clientName ?? null);
    }

    refresh();
    window.addEventListener(SYSTEM_SETTINGS_CHANGED_EVENT, onSettingsChanged);
    window.addEventListener("focus", refresh);
    return () => {
      mounted = false;
      window.removeEventListener(SYSTEM_SETTINGS_CHANGED_EVENT, onSettingsChanged);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  // Reapply after client navigation because the router may refresh <head>.
  useEffect(() => {
    document.title = formatAndonBrowserTitle(clientName);
  }, [clientName, pathname]);

  return null;
}
