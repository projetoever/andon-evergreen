import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ui } from "@/i18n/translate";
import {
  accentForTheme,
  DEFAULT_VISUAL_PALETTE,
  isVisualAccent,
  restoreDefaultVisualPalette,
  VISUAL_ACCENTS,
  VISUAL_PALETTE_KEYS,
  type VisualAccent,
  type VisualPaletteDraft,
  type VisualPaletteKey,
} from "@/theme/andonVisualPalette";

const fieldLabels: Readonly<Record<VisualPaletteKey, string>> = {
  cardBorder: "Contorno padrão dos cards",
  selectedCardBorder: "Contorno do card selecionado",
  sectorSelection: "Destaque de setor selecionado",
  operationAccent: "Acento dos botões de operação",
  focusAccent: "Foco e seleção",
};
const accentLabels: Readonly<Record<VisualAccent, string>> = {
  evergreen: "Verde padrão",
  ocean: "Azul oceano",
  indigo: "Índigo",
  violet: "Violeta",
};

/** Deliberately a draft-only, isolated preview: NO persistence/API call. */
export function AppearanceSettingsPreview() {
  const [draft, setDraft] = useState<VisualPaletteDraft>(restoreDefaultVisualPalette);
  const changed = VISUAL_PALETTE_KEYS.some(key => draft[key] !== DEFAULT_VISUAL_PALETTE[key]);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 md:p-5"
      aria-label={ui("Aparência e cores")}>
      <div>
        <h3 className="text-lg font-bold text-foreground">{ui("Aparência e cores")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {ui("Prévia local sem aplicação global. A gravação auditável e as permissões serão disponibilizadas após a integração segura ao servidor.")}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {VISUAL_PALETTE_KEYS.map(key => (
          <label key={key} className="space-y-1 text-sm font-semibold text-foreground">
            <span>{ui(fieldLabels[key])}</span>
            <select
              aria-label={ui(fieldLabels[key])}
              className="h-11 w-full rounded-md border border-border bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={draft[key]}
              onChange={event => {
                if (!isVisualAccent(event.target.value)) return;
                setDraft(old => ({ ...old, [key]: event.target.value as VisualAccent }));
              }}
            >
              {(Object.keys(VISUAL_ACCENTS) as VisualAccent[]).map(value => (
                <option key={value} value={value}>{ui(accentLabels[value])}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2" aria-label={ui("Prévia clara e escura")}>
        {(["dark", "light"] as const).map(theme => {
          const dark = theme === "dark";
          const foreground = dark ? "#F8FAFC" : "#182531";
          const background = dark ? "#1B2A36" : "#F8FAFC";
          const card = dark ? "#273847" : "#FFFFFF";
          return (
            <div key={theme} className="rounded-xl border p-4"
              style={{ backgroundColor: background, color: foreground, borderColor: dark ? "#526578" : "#C7D2DF" }}>
              <p className="mb-3 text-xs font-black uppercase tracking-wide">{ui(dark ? "Tema escuro" : "Tema claro")}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border-2 p-3" style={{
                  backgroundColor: card, borderColor: accentForTheme(draft.cardBorder, theme),
                }}>
                  <p className="text-xs font-bold">{ui("Máquina normal")}</p>
                  <p className="text-2xl font-black tabular-nums">37</p>
                  <span className="mt-2 inline-block rounded-md border px-2 py-1 text-xs font-bold" style={{
                    borderColor: accentForTheme(draft.sectorSelection, theme),
                  }}>{ui("Setor selecionado")}</span>
                </div>
                <div className="rounded-lg border-[3px] p-3" style={{
                  backgroundColor: card, borderColor: accentForTheme(draft.selectedCardBorder, theme),
                }}>
                  <p className="text-xs font-bold">{ui("Máquina selecionada")}</p>
                  <p className="text-2xl font-black tabular-nums">38</p>
                  <span className="mt-2 inline-block rounded-md border px-2 py-1 text-xs font-bold" style={{
                    borderColor: accentForTheme(draft.focusAccent, theme),
                  }}>{ui("Foco")}</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-md border-2 px-3 py-1 text-xs font-bold" style={{
                  borderColor: accentForTheme(draft.operationAccent, theme),
                }}>{ui("Ação operacional")}</span>
                <span className="rounded-md border-2 px-3 py-1 text-xs font-bold"
                  style={{ borderColor: "#D73A35", color: dark ? "#FF817B" : "#B22222" }}>
                  {ui("Parada — cor protegida")}
                </span>
                <span className="rounded-md border-2 px-3 py-1 text-xs font-bold"
                  style={{ borderColor: "#A5790B", color: dark ? "#FAD85C" : "#765C08" }}>
                  {ui("Atenção — cor protegida")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={!changed}
          onClick={() => setDraft(restoreDefaultVisualPalette())}>
          {ui("Restaurar padrão da prévia")}
        </Button>
        <p role="status" className="text-xs text-muted-foreground">
          {changed ? ui("Alterações apenas na prévia, sem salvar.") : ui("Preset padrão atual selecionado.")}
        </p>
      </div>
    </section>
  );
}
