export type VirtualKeyboardLayout = "letters" | "numeric";
export type VirtualKeyboardEditKey = string | "backspace";

export const VIRTUAL_KEYBOARD_OPEN_ATTRIBUTE = "data-andon-virtual-keyboard-open";

const SUPPORTED_INPUT_TYPES = new Set([
  "email",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "url",
]);

export function isVirtualKeyboardInputType(type?: string | null) {
  return SUPPORTED_INPUT_TYPES.has((type || "text").toLowerCase());
}

export function resolveVirtualKeyboardLayout(type?: string | null, inputMode?: string | null) {
  const normalizedType = (type || "text").toLowerCase();
  const normalizedInputMode = (inputMode || "").toLowerCase();
  return normalizedType === "number" ||
    normalizedInputMode === "numeric" ||
    normalizedInputMode === "decimal"
    ? ("numeric" satisfies VirtualKeyboardLayout)
    : ("letters" satisfies VirtualKeyboardLayout);
}

export function isVirtualKeyboardTarget(
  target: EventTarget | null,
): target is HTMLInputElement | HTMLTextAreaElement {
  if (typeof HTMLInputElement === "undefined" || typeof HTMLTextAreaElement === "undefined") {
    return false;
  }
  if (target instanceof HTMLTextAreaElement) {
    return !target.disabled && !target.readOnly && target.dataset.virtualKeyboard !== "off";
  }
  if (!(target instanceof HTMLInputElement)) return false;
  return (
    !target.disabled &&
    !target.readOnly &&
    target.dataset.virtualKeyboard !== "off" &&
    isVirtualKeyboardInputType(target.type)
  );
}

type EditParams = {
  value: string;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  key: VirtualKeyboardEditKey;
  maxLength?: number | null;
};

export function applyVirtualKeyboardEdit({
  value,
  selectionStart,
  selectionEnd,
  key,
  maxLength,
}: EditParams) {
  const start = Math.max(0, Math.min(selectionStart ?? value.length, value.length));
  const end = Math.max(start, Math.min(selectionEnd ?? start, value.length));

  if (key === "backspace") {
    if (start !== end) {
      return { value: `${value.slice(0, start)}${value.slice(end)}`, cursor: start };
    }
    if (start === 0) return { value, cursor: 0 };

    const prefix = value.slice(0, start);
    const previousCharacter = Array.from(prefix).at(-1) ?? "";
    const previousStart = start - previousCharacter.length;
    return {
      value: `${value.slice(0, previousStart)}${value.slice(end)}`,
      cursor: previousStart,
    };
  }

  const normalizedMaxLength = maxLength && maxLength > 0 ? maxLength : null;
  const retainedLength = value.length - (end - start);
  const availableLength =
    normalizedMaxLength === null ? key.length : normalizedMaxLength - retainedLength;
  const insertedText = availableLength > 0 ? key.slice(0, availableLength) : "";
  const nextValue = `${value.slice(0, start)}${insertedText}${value.slice(end)}`;

  return { value: nextValue, cursor: start + insertedText.length };
}
