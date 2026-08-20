import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  CaseUpper,
  CornerDownLeft,
  Delete,
  Keyboard,
  Space,
  X,
} from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  getSystemSettings,
  VIRTUAL_KEYBOARD_SETTING_CHANGED_EVENT,
} from "@/services/systemSettingsService";
import {
  applyVirtualKeyboardEdit,
  isVirtualKeyboardTarget,
  resolveVirtualKeyboardLayout,
  VIRTUAL_KEYBOARD_OPEN_ATTRIBUTE,
  type VirtualKeyboardLayout,
} from "@/utils/virtualKeyboardUtils";

type EditableTarget = HTMLInputElement | HTMLTextAreaElement;
type KeyboardView = VirtualKeyboardLayout | "symbols";

const LETTER_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ç"],
  ["z", "x", "c", "v", "b", "n", "m", ",", ".", "-"],
];
const ACCENT_KEYS = ["á", "à", "â", "ã", "é", "ê", "í", "ó", "ô", "õ", "ú", "ü", "ç"];
const SYMBOL_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["@", "#", "$", "%", "&", "*", "(", ")", "-", "_"],
  ["/", "\\", ":", ";", "!", "?", "+", "=", "[", "]"],
  ['"', "'", "<", ">", "{", "}", "°", "º", "ª"],
];
const NUMERIC_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["-", "0", "."],
];
const DIGIT_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", ""],
];
const DECIMAL_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "."],
];

function getTargetLabel(target: EditableTarget) {
  return (
    target.getAttribute("aria-label") ||
    target.getAttribute("placeholder") ||
    target.getAttribute("name") ||
    "Campo de texto"
  );
}

function getSelection(target: EditableTarget) {
  try {
    return {
      start: target.selectionStart ?? target.value.length,
      end: target.selectionEnd ?? target.value.length,
    };
  } catch {
    return { start: target.value.length, end: target.value.length };
  }
}

function updateNativeValue(
  target: EditableTarget,
  value: string,
  cursor: number,
  data: string | null,
) {
  const prototype =
    target instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(target, value);

  const event =
    typeof InputEvent === "undefined"
      ? new Event("input", { bubbles: true })
      : new InputEvent("input", {
          bubbles: true,
          data,
          inputType: data === null ? "deleteContentBackward" : "insertText",
        });
  target.dispatchEvent(event);
  try {
    target.setSelectionRange(cursor, cursor);
  } catch {
    // Campos number não expõem seleção; o valor ainda é atualizado normalmente.
  }
}

function dispatchSpecialKey(target: EditableTarget, key: "Enter" | "Tab") {
  const code = key === "Enter" ? "Enter" : "Tab";
  const keyDown = new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true });
  const shouldContinue = target.dispatchEvent(keyDown);
  target.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true }));
  return shouldContinue;
}

function KeyButton({
  children,
  className,
  onClick,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "flex h-10 min-w-0 flex-1 touch-manipulation items-center justify-center rounded-lg border border-border bg-secondary px-2 text-base font-black text-secondary-foreground shadow-sm transition-colors hover:bg-accent active:scale-[0.98] md:h-12 md:text-lg",
        className,
      )}
      onPointerDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function VirtualKeyboard() {
  const targetRef = useRef<EditableTarget | null>(null);
  const launcherHostRef = useRef<HTMLElement | null>(null);
  const launcherHostPositionRef = useRef("");
  const openRef = useRef(false);
  const [enabled, setEnabled] = useState(true);
  const [target, setTarget] = useState<EditableTarget | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<KeyboardView>("letters");
  const [uppercase, setUppercase] = useState(false);
  const [preview, setPreview] = useState("");
  const [launcherPosition, setLauncherPosition] = useState({
    left: 0,
    top: 0,
    width: 34,
    height: 34,
  });

  const updateLauncherPosition = useCallback((candidate = targetRef.current) => {
    const host = launcherHostRef.current;
    if (!candidate?.isConnected || !host?.isConnected) {
      targetRef.current = null;
      setTarget(null);
      return;
    }
    const rect = candidate.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const size = Math.min(38, Math.max(30, rect.height - 6));
    const left = rect.right - hostRect.left - size - 4;
    const top = rect.top - hostRect.top + Math.max(3, (rect.height - size) / 2);
    setLauncherPosition({ left, top, width: size, height: size });
  }, []);

  useEffect(() => {
    let active = true;

    void getSystemSettings()
      .then((settings) => {
        if (active) setEnabled(settings.virtualKeyboardEnabled !== false);
      })
      .catch(() => {
        // Mantém habilitado como padrão para instalações ainda não atualizadas.
      });

    const handleSettingChange = (event: Event) => {
      const customEvent = event as CustomEvent<boolean>;
      if (typeof customEvent.detail === "boolean") setEnabled(customEvent.detail);
    };

    window.addEventListener(VIRTUAL_KEYBOARD_SETTING_CHANGED_EVENT, handleSettingChange);
    return () => {
      active = false;
      window.removeEventListener(VIRTUAL_KEYBOARD_SETTING_CHANGED_EVENT, handleSettingChange);
    };
  }, []);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const root = document.documentElement;
    root.setAttribute(VIRTUAL_KEYBOARD_OPEN_ATTRIBUTE, "true");
    return () => root.removeAttribute(VIRTUAL_KEYBOARD_OPEN_ATTRIBUTE);
  }, [open]);

  useEffect(() => {
    const previousHost = launcherHostRef.current;
    if (previousHost) previousHost.style.position = launcherHostPositionRef.current;
    launcherHostRef.current = null;
    target?.classList.remove("virtual-keyboard-target");

    if (!enabled || !target?.isConnected || !target.parentElement) return;

    const host = target.parentElement;
    launcherHostRef.current = host;
    launcherHostPositionRef.current = host.style.position;
    if (window.getComputedStyle(host).position === "static") host.style.position = "relative";
    target.classList.add("virtual-keyboard-target");
    updateLauncherPosition(target);

    return () => {
      target.classList.remove("virtual-keyboard-target");
      if (launcherHostRef.current === host) {
        host.style.position = launcherHostPositionRef.current;
        launcherHostRef.current = null;
      }
    };
  }, [enabled, target, updateLauncherPosition]);

  useEffect(() => {
    if (enabled) return;
    openRef.current = false;
    setOpen(false);
    targetRef.current = null;
    setTarget(null);
  }, [enabled]);

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      if (!enabled || !isVirtualKeyboardTarget(event.target)) return;
      targetRef.current = event.target;
      setTarget(event.target);
      setPreview(event.target.value);
      setView(resolveVirtualKeyboardLayout(event.target.type, event.target.inputMode));
      setUppercase(false);
    };

    const handleFocusOut = () => {
      window.setTimeout(() => {
        if (openRef.current || isVirtualKeyboardTarget(document.activeElement)) return;
        targetRef.current = null;
        setTarget(null);
      }, 0);
    };

    const handleInput = (event: Event) => {
      if (event.target === targetRef.current && isVirtualKeyboardTarget(event.target)) {
        setPreview(event.target.value);
      }
    };

    const handleViewportChange = () => updateLauncherPosition();
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    document.addEventListener("input", handleInput);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      document.removeEventListener("input", handleInput);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [enabled, updateLauncherPosition]);

  const insertKey = (rawKey: string) => {
    const candidate = targetRef.current;
    if (!candidate?.isConnected) return;
    const key = uppercase && /[a-zà-üç]/i.test(rawKey) ? rawKey.toLocaleUpperCase("pt-BR") : rawKey;
    const selection = getSelection(candidate);
    const result = applyVirtualKeyboardEdit({
      value: candidate.value,
      selectionStart: selection.start,
      selectionEnd: selection.end,
      key,
      maxLength: candidate.maxLength,
    });
    updateNativeValue(candidate, result.value, result.cursor, key);
    setPreview(result.value);
  };

  const backspace = () => {
    const candidate = targetRef.current;
    if (!candidate?.isConnected) return;
    const selection = getSelection(candidate);
    const result = applyVirtualKeyboardEdit({
      value: candidate.value,
      selectionStart: selection.start,
      selectionEnd: selection.end,
      key: "backspace",
      maxLength: candidate.maxLength,
    });
    updateNativeValue(candidate, result.value, result.cursor, null);
    setPreview(result.value);
  };

  const moveCursor = (offset: -1 | 1) => {
    const candidate = targetRef.current;
    if (!candidate?.isConnected) return;
    const selection = getSelection(candidate);
    const cursor = Math.max(0, Math.min(selection.start + offset, candidate.value.length));
    try {
      candidate.setSelectionRange(cursor, cursor);
    } catch {
      // Campos numéricos não oferecem cursor programático.
    }
  };

  const handleEnter = () => {
    const candidate = targetRef.current;
    if (!candidate?.isConnected) return;
    if (candidate instanceof HTMLTextAreaElement) {
      insertKey("\n");
      return;
    }
    const shouldSubmit = dispatchSpecialKey(candidate, "Enter");
    if (shouldSubmit && candidate.form) candidate.form.requestSubmit();
    handleOpenChange(false);
  };

  const handleTab = () => {
    const candidate = targetRef.current;
    if (!candidate?.isConnected) return;
    if (!dispatchSpecialKey(candidate, "Tab")) {
      handleOpenChange(false);
      return;
    }
    const eligible = Array.from(document.querySelectorAll("input, textarea")).filter(
      isVirtualKeyboardTarget,
    );
    const currentIndex = eligible.indexOf(candidate);
    const nextTarget = eligible[(currentIndex + 1) % eligible.length];
    handleOpenChange(false, false);
    window.setTimeout(() => nextTarget?.focus({ preventScroll: true }), 0);
  };

  if (typeof document === "undefined") return null;

  const numericOnly = target
    ? resolveVirtualKeyboardLayout(target.type, target.inputMode) === "numeric"
    : false;
  const numericRows =
    target?.inputMode === "numeric" && target.type !== "number"
      ? DIGIT_ROWS
      : target?.inputMode === "decimal"
        ? DECIMAL_ROWS
        : NUMERIC_ROWS;
  const rows = view === "numeric" ? numericRows : view === "symbols" ? SYMBOL_ROWS : LETTER_ROWS;
  const visiblePreview = target?.type === "password" ? "•".repeat(preview.length) : preview;
  const launcherHost = launcherHostRef.current;

  function handleOpenChange(nextOpen: boolean, restoreFocus = true) {
    openRef.current = nextOpen;
    setOpen(nextOpen);
    if (!nextOpen && restoreFocus) {
      const candidate = targetRef.current;
      const selection = candidate?.isConnected ? getSelection(candidate) : null;
      window.setTimeout(() => {
        if (!candidate?.isConnected) return;
        candidate.focus({ preventScroll: true });
        if (!selection) return;
        try {
          candidate.setSelectionRange(selection.start, selection.end);
        } catch {
          // Campos numéricos mantêm o foco, mas não oferecem seleção programática.
        }
      }, 0);
    }
  }

  return (
    <>
      {enabled &&
        target &&
        launcherHost &&
        !open &&
        createPortal(
          <button
            type="button"
            data-virtual-keyboard-ui
            aria-label={`Abrir teclado virtual para ${getTargetLabel(target)}`}
            title="Abrir teclado virtual"
            className="absolute z-[190] flex touch-manipulation items-center justify-center rounded-lg border border-primary bg-card text-primary shadow-lg transition-transform hover:scale-105 active:scale-95"
            style={launcherPosition}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              setView(resolveVirtualKeyboardLayout(target.type, target.inputMode));
              setPreview(target.value);
              handleOpenChange(true);
            }}
          >
            <Keyboard className="h-5 w-5" />
          </button>,
          launcherHost,
        )}

      {enabled && target && (
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent
            data-virtual-keyboard-ui
            hideDefaultClose
            virtualKeyboard
            className="max-h-[96vh] max-w-6xl gap-0 overflow-y-auto rounded-2xl p-2.5 sm:p-4"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DialogTitle className="sr-only">Teclado virtual</DialogTitle>
            <header className="mb-2 flex items-center gap-2 sm:mb-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Keyboard className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                  {getTargetLabel(target)}
                </p>
                <p className="truncate rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-sm text-foreground sm:text-base">
                  {visiblePreview || "Digite usando o teclado abaixo"}
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar teclado virtual e voltar ao campo"
                title="Fechar teclado e voltar ao campo"
                className="flex h-10 shrink-0 touch-manipulation items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-3 font-bold text-secondary-foreground shadow-sm transition-colors hover:bg-accent active:scale-[0.98] sm:h-12 sm:px-4"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => handleOpenChange(false)}
              >
                <X className="h-5 w-5" />
                <span className="hidden sm:inline">Fechar teclado</span>
              </button>
            </header>

            <div
              className={cn("space-y-1.5 sm:space-y-2", view === "numeric" && "mx-auto max-w-md")}
            >
              {rows.map((row, rowIndex) => (
                <div key={`${view}-${rowIndex}`} className="flex justify-center gap-1.5 sm:gap-2">
                  {row.map((key, keyIndex) =>
                    key ? (
                      <KeyButton key={`${key}-${keyIndex}`} onClick={() => insertKey(key)}>
                        {uppercase && view === "letters" ? key.toLocaleUpperCase("pt-BR") : key}
                      </KeyButton>
                    ) : (
                      <span key={`empty-${keyIndex}`} aria-hidden className="flex-1" />
                    ),
                  )}
                </div>
              ))}
              {view === "letters" && (
                <div className="flex justify-center gap-1 overflow-x-auto pb-0.5">
                  {ACCENT_KEYS.map((key) => (
                    <KeyButton
                      key={key}
                      className="min-w-10 max-w-14 bg-muted text-sm md:text-base"
                      onClick={() => insertKey(key)}
                    >
                      {uppercase ? key.toLocaleUpperCase("pt-BR") : key}
                    </KeyButton>
                  ))}
                </div>
              )}
            </div>

            <div
              className={cn(
                "mt-2 grid gap-1.5 sm:gap-2",
                numericOnly
                  ? "grid-cols-3 sm:grid-cols-5"
                  : "grid-cols-4 sm:grid-cols-[auto_auto_auto_minmax(12rem,1fr)_auto_auto_auto]",
              )}
            >
              {!numericOnly && (
                <KeyButton
                  className="px-3 sm:min-w-20"
                  label={view === "letters" ? "Exibir números e símbolos" : "Exibir letras"}
                  onClick={() =>
                    setView((current) => (current === "letters" ? "symbols" : "letters"))
                  }
                >
                  {view === "letters" ? "123" : "ABC"}
                </KeyButton>
              )}
              {!numericOnly && view === "letters" && (
                <KeyButton
                  className={cn(
                    "px-3 sm:min-w-20",
                    uppercase && "bg-primary text-primary-foreground",
                  )}
                  label="Alternar maiúsculas"
                  onClick={() => setUppercase((current) => !current)}
                >
                  <CaseUpper className="h-5 w-5" />
                </KeyButton>
              )}
              <KeyButton
                className="px-3 sm:min-w-16"
                label="Mover cursor para a esquerda"
                onClick={() => moveCursor(-1)}
              >
                <ArrowLeft className="h-5 w-5" />
              </KeyButton>
              {!numericOnly && (
                <KeyButton
                  className="col-span-2 px-4 sm:col-span-1"
                  label="Espaço"
                  onClick={() => insertKey(" ")}
                >
                  <Space className="mr-2 h-5 w-5" />
                  Espaço
                </KeyButton>
              )}
              <KeyButton
                className="px-3 sm:min-w-16"
                label="Mover cursor para a direita"
                onClick={() => moveCursor(1)}
              >
                <ArrowRight className="h-5 w-5" />
              </KeyButton>
              <KeyButton className="px-3 sm:min-w-20" label="Apagar" onClick={backspace}>
                <Delete className="h-5 w-5" />
              </KeyButton>
              <KeyButton
                className="px-3 sm:min-w-20"
                label="Avançar para o próximo campo"
                onClick={handleTab}
              >
                Tab
              </KeyButton>
              <KeyButton
                className="col-span-2 bg-primary px-4 text-primary-foreground hover:bg-primary/90 sm:col-span-1 sm:min-w-28"
                label={
                  target instanceof HTMLTextAreaElement ? "Quebrar linha" : "Confirmar com Enter"
                }
                onClick={handleEnter}
              >
                <CornerDownLeft className="mr-2 h-5 w-5" />
                Enter
              </KeyButton>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
