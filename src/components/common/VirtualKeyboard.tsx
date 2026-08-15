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

import { cn } from "@/lib/utils";
import {
  applyVirtualKeyboardEdit,
  isVirtualKeyboardTarget,
  resolveVirtualKeyboardLayout,
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
  const openRef = useRef(false);
  const [target, setTarget] = useState<EditableTarget | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<KeyboardView>("letters");
  const [uppercase, setUppercase] = useState(false);
  const [preview, setPreview] = useState("");
  const [launcherPosition, setLauncherPosition] = useState({ left: 16, top: 16 });

  const updateLauncherPosition = useCallback((candidate = targetRef.current) => {
    if (!candidate?.isConnected) {
      targetRef.current = null;
      setTarget(null);
      return;
    }
    const rect = candidate.getBoundingClientRect();
    const size = 46;
    const gap = 7;
    const outsideLeft = rect.right + gap;
    const left =
      outsideLeft + size <= window.innerWidth - 8
        ? outsideLeft
        : Math.max(8, Math.min(rect.right - size - 4, window.innerWidth - size - 8));
    const top = Math.max(
      8,
      Math.min(rect.top + (rect.height - size) / 2, window.innerHeight - size - 8),
    );
    setLauncherPosition({ left, top });
  }, []);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      if (!isVirtualKeyboardTarget(event.target)) return;
      targetRef.current = event.target;
      setTarget(event.target);
      setPreview(event.target.value);
      setView(resolveVirtualKeyboardLayout(event.target.type, event.target.inputMode));
      setUppercase(false);
      updateLauncherPosition(event.target);
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
  }, [updateLauncherPosition]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open]);

  const insertKey = (rawKey: string) => {
    const candidate = targetRef.current;
    if (!candidate?.isConnected) return;
    candidate.focus({ preventScroll: true });
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
    candidate.focus({ preventScroll: true });
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
    candidate.focus({ preventScroll: true });
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
    candidate.focus({ preventScroll: true });
    const shouldSubmit = dispatchSpecialKey(candidate, "Enter");
    if (shouldSubmit && candidate.form) candidate.form.requestSubmit();
    setOpen(false);
  };

  const handleTab = () => {
    const candidate = targetRef.current;
    if (!candidate?.isConnected) return;
    candidate.focus({ preventScroll: true });
    if (!dispatchSpecialKey(candidate, "Tab")) {
      setOpen(false);
      return;
    }
    const eligible = Array.from(document.querySelectorAll("input, textarea")).filter(
      isVirtualKeyboardTarget,
    );
    const currentIndex = eligible.indexOf(candidate);
    eligible[(currentIndex + 1) % eligible.length]?.focus();
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

  return createPortal(
    <>
      {target && !open && (
        <button
          type="button"
          data-virtual-keyboard-ui
          aria-label={`Abrir teclado virtual para ${getTargetLabel(target)}`}
          title="Abrir teclado virtual"
          className="fixed z-[190] flex h-[46px] w-[46px] touch-manipulation items-center justify-center rounded-xl border-2 border-primary bg-card text-primary shadow-xl transition-transform hover:scale-105 active:scale-95"
          style={launcherPosition}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            setView(resolveVirtualKeyboardLayout(target.type, target.inputMode));
            setPreview(target.value);
            setOpen(true);
          }}
        >
          <Keyboard className="h-6 w-6" />
        </button>
      )}

      {target && open && (
        <div
          data-virtual-keyboard-ui
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-2 backdrop-blur-[2px] sm:p-3"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              event.preventDefault();
              setOpen(false);
            }
          }}
        >
          <section className="max-h-[96vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-border bg-card p-2.5 shadow-2xl sm:p-4">
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
                aria-label="Fechar teclado virtual"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary hover:bg-accent"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
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
          </section>
        </div>
      )}
    </>,
    document.body,
  );
}
