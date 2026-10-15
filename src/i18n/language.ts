export type AndonLanguage = "pt-BR" | "en" | "zh-TW";
export const LANGUAGE_STORAGE_KEY = "andon.interfaceLanguage";
export const DEFAULT_LANGUAGE: AndonLanguage = "pt-BR";
export const LANGUAGE_OPTIONS: ReadonlyArray<{ value: AndonLanguage; label: string }> = [
  { value: "pt-BR", label: "Português" },
  { value: "en", label: "English" },
  { value: "zh-TW", label: "繁體中文" },
];
export function isAndonLanguage(value: unknown): value is AndonLanguage {
  return value === "pt-BR" || value === "en" || value === "zh-TW";
}
export function getInterfaceLanguage(): AndonLanguage {
  if (typeof document !== "undefined" && isAndonLanguage(document.documentElement.lang))
    return document.documentElement.lang;
  return DEFAULT_LANGUAGE;
}
export function getInterfaceLocale(): string {
  return { "pt-BR": "pt-BR", en: "en-US", "zh-TW": "zh-TW" }[getInterfaceLanguage()];
}
