import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { accessRequest, type AccessState } from "@/services/accessService";

type UiEvent = { page: string; control: "button" | "link" | "checkbox" | "radio" | "tab"; action?: string };
const PAGE_ALLOWLIST = /^\/(?:$|hub(?:\/admin)?$|andon(?:\/admin)?$|bi$|machine-priorities$|history$|active-calls$|settings$|machines\/[a-zA-Z0-9_-]{1,80}(?:\/(?:call-history|failure-history))?$)/;
const ACTION = /^[a-z][a-z0-9_.-]{0,79}$/;

/**
 * Best-effort interface trace. Server mutations already carry the authoritative
 * before/after audit. Browser events are labels for interactions only; never
 * collect text, selected values, credentials or arbitrary DOM attributes.
 */
export function UiAuditTracker() {
  const { access } = useModuleAccess();
  const path = useRouterState({ select: state => state.location.pathname });
  const allowed = access?.centralAccessEnabled === true &&
    access.principal?.purpose === "normal";
  const queue = useRef<UiEvent[]>([]);
  const inFlight = useRef(false);
  const csrfReady = useRef(false);

  useEffect(() => {
    if (!allowed) {
      queue.current = [];
      csrfReady.current = false;
      return;
    }
    if (!PAGE_ALLOWLIST.test(path)) return;
    let active = true;
    const sendRoute = async () => {
      try {
        // The central CSRF token is in memory only and must be refreshed
        // after reload. This call does not grant authorization.
        await accessRequest<AccessState>("/session");
        if (!active) return;
        csrfReady.current = true;
        await accessRequest("/audit-events/navigation", "POST", { page: path });
      } catch {
        // Trace failures must never block UI or cause logout.
      }
    };
    void sendRoute();
    return () => { active = false; };
  }, [allowed, path]);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    const flush = async () => {
      if (!active || inFlight.current || queue.current.length === 0) return;
      inFlight.current = true;
      const events = queue.current.splice(0, 24);
      try {
        if (!csrfReady.current) {
          await accessRequest<AccessState>("/session");
          csrfReady.current = true;
        }
        await accessRequest("/audit-events/interactions", "POST", { events });
      } catch {
        // No retries of telemetry: preventing duplicate audit rows is more
        // important than guessing whether the server committed a batch.
      } finally {
        inFlight.current = false;
      }
    };
    const onClick = (event: MouseEvent) => {
      if (!PAGE_ALLOWLIST.test(window.location.pathname)) return;
      if (!(event.target instanceof Element)) return;
      const element = event.target.closest("button,a,input[type=checkbox],input[type=radio],[role=button],[role=tab]");
      if (!element) return;
      // Sensitive data lives in form inputs, never captured by this event.
      const control: UiEvent["control"] =
        element.matches("input[type=checkbox]") ? "checkbox" :
        element.matches("input[type=radio]") ? "radio" :
        element.matches("[role=tab]") ? "tab" :
        element.matches("a") ? "link" : "button";
      const action = element.getAttribute("data-audit-action");
      const page = window.location.pathname;
      // Hard cap avoids memory expansion during an unavailable API.
      if (queue.current.length >= 48) queue.current.shift();
      queue.current.push({
        page, control, ...(action && ACTION.test(action) ? { action } : {}),
      });
      if (queue.current.length >= 24) void flush();
    };
    document.addEventListener("click", onClick, { capture: true });
    const timer = window.setInterval(() => void flush(), 3000);
    return () => {
      active = false;
      queue.current = [];
      document.removeEventListener("click", onClick, { capture: true });
      window.clearInterval(timer);
    };
  }, [allowed]);

  return null;
}
