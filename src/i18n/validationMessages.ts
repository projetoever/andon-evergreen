import { translateLabel } from "./translate";
import type { AndonLanguage } from "./language";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
export function validationMessage(
  field: Pick<Field, "validity"> & {
    minLength?: number;
    maxLength?: number;
    min?: string;
    max?: string;
  },
  language: AndonLanguage,
) {
  const t = (source: string, params = {}) => translateLabel(language, source, params);
  const v = field.validity;
  if (v.valueMissing) return t("Preencha este campo.");
  if (v.tooShort) return t("Use pelo menos {0} caracteres.", { 0: field.minLength });
  if (v.tooLong) return t("Use no máximo {0} caracteres.", { 0: field.maxLength });
  if (v.rangeUnderflow) return t("Use um valor maior ou igual a {0}.", { 0: field.min });
  if (v.rangeOverflow) return t("Use um valor menor ou igual a {0}.", { 0: field.max });
  if (v.typeMismatch || v.patternMismatch || v.badInput || v.stepMismatch)
    return t("Informe um valor válido.");
  return "";
}

/** Browser validation bubbles follow the interface locale, not browser settings. */
export function localizeFormValidation(language: AndonLanguage) {
  const changed = new Set<Field>();
  const isField = (target: EventTarget | null): target is Field =>
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement;
  const clear = (event: Event) => {
    if (isField(event.target) && changed.has(event.target)) {
      event.target.setCustomValidity("");
      changed.delete(event.target);
    }
  };
  const invalid = (event: Event) => {
    if (!isField(event.target)) return;
    const field = event.target;
    if (field.validity.customError && !changed.has(field)) return;
    const message = validationMessage(field, language);
    if (message) {
      field.setCustomValidity(message);
      changed.add(field);
    }
  };
  document.addEventListener("invalid", invalid, true);
  document.addEventListener("input", clear, true);
  document.addEventListener("change", clear, true);
  return () => {
    document.removeEventListener("invalid", invalid, true);
    document.removeEventListener("input", clear, true);
    document.removeEventListener("change", clear, true);
    for (const field of changed) field.setCustomValidity("");
  };
}
