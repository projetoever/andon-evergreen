import type { ReactNode } from "react";
import { useLanguage } from "./LanguageProvider";
import { systemMessage } from "./translate";

function LocalizedToast({ render }: { render: () => ReactNode }) {
  const { language } = useLanguage();
  const value = render();
  return typeof value === "string" ? systemMessage(value, language) : value;
}
export function localizedToast(render: () => ReactNode) {
  return <LocalizedToast render={render} />;
}
