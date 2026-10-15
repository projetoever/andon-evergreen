import { contextMessages, type MessageContext } from "./contextMessages";
export type { MessageContext } from "./contextMessages";
import baseMessages from "./baseMessages.json";
import { messages } from "./messages";
import { getInterfaceLanguage, type AndonLanguage } from "./language";
export { getInterfaceLanguage, getInterfaceLocale } from "./language";

export type MessageParams = Readonly<Record<string, string | number | null | undefined>>;
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const catalog = new Map<string, readonly string[]>();
for (const row of [...baseMessages, ...messages]) catalog.set(normalize(row[0]), row);
export const interfaceMessages: ReadonlyMap<string, readonly string[]> = catalog;
const contextCatalog = new Map<string, readonly string[]>();
for (const [context, rows] of Object.entries(contextMessages))
  for (const row of rows) contextCatalog.set(`${context}:${normalize(row[0])}`, row);
function interpolate(template: string, params: MessageParams) {
  return template.replace(/\{([\w]+)\}/g, (token, key) =>
    key in params ? String(params[key] ?? "") : token,
  );
}
export function translateLabel(
  language: AndonLanguage,
  source: string,
  params: MessageParams = {},
  context?: MessageContext,
): string {
  const key = normalize(source);
  const row = (context ? contextCatalog.get(`${context}:${key}`) : undefined) ?? catalog.get(key);
  if (!row) return interpolate(source, params);
  const value = row[language === "en" ? 1 : language === "zh-TW" ? 2 : 0];
  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = source.match(/\s*$/)?.[0] ?? "";
  return leading + interpolate(value, params) + trailing;
}
export function ui(source: string, params: MessageParams = {}, context?: MessageContext): string {
  return translateLabel(getInterfaceLanguage(), source, params, context);
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const messagePatterns = [...catalog.values()]
  .flatMap((row) =>
    row.flatMap((template, index) => {
      const slots = [...template.matchAll(/\{([\w]+)\}/g)];
      if (!slots.length) return [];
      let cursor = 0,
        pattern = "^";
      for (const slot of slots) {
        pattern += escapeRegex(template.slice(cursor, slot.index)) + "([\\s\\S]*?)";
        cursor = slot.index! + slot[0].length;
      }
      pattern += escapeRegex(template.slice(cursor)) + "$";
      return [
        {
          regex: new RegExp(pattern),
          source: row[0],
          keys: slots.map((slot) => slot[1]),
          specificity: template.replace(/\{[\w]+\}/g, "").length,
        },
      ];
    }),
  )
  .sort((a, b) => b.specificity - a.specificity);
const reverse = new Map<string, string>();
for (const row of catalog.values()) for (const value of row) reverse.set(normalize(value), row[0]);
/** Only for trusted application messages and error states, never user content. */
export function systemMessage(
  value: string | null | undefined,
  language = getInterfaceLanguage(),
): string {
  if (!value) return "";
  const normalized = normalize(value);
  const source = reverse.get(normalized);
  if (source) return translateLabel(language, source);
  for (const entry of messagePatterns) {
    const match = entry.regex.exec(normalized);
    if (!match) continue;
    const params = Object.fromEntries(entry.keys.map((key, index) => [key, match[index + 1]]));
    return translateLabel(language, entry.source, params);
  }
  // Unrecognized diagnostics stay explicit; the caller retains the original for logs.
  return value;
}
