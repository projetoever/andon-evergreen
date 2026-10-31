import { useCallback, useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { AndonApiError } from "@/api/andonApiClient";
import { readGlobalVisualPalette, saveGlobalVisualPalette } from "@/services/visualPaletteService";
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
  slate: "Cinza industrial",
  evergreen: "Verde padrão",
  ocean: "Azul oceano",
  indigo: "Índigo",
  violet: "Violeta",
};

/**
 * Preview remains draft-only in the legacy settings modal. Central Admin
 * can save only if the server explicitly exposes its protected feature flag.
 */
export function AppearanceSettingsPreview({ allowGlobalSave = false }: { allowGlobalSave?: boolean }) {
  const [draft, setDraft] = useState<VisualPaletteDraft>(restoreDefaultVisualPalette);
  const [saved, setSaved] = useState<VisualPaletteDraft>(restoreDefaultVisualPalette);
  const [revision, setRevision] = useState(0);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(allowGlobalSave);
  const [busy, setBusy] = useState(false);
  const [restorePending, setRestorePending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState("");
  const changed = VISUAL_PALETTE_KEYS.some(key => draft[key] !== saved[key]);

  const reload = useCallback(async () => {
    if (!allowGlobalSave) return;
    setLoading(true);
    try {
      const latest = await readGlobalVisualPalette();
      setSaved(latest.palette);
      setDraft(latest.palette);
      setRevision(latest.revision);
      setCanWrite(latest.canWrite);
      setConflict(false);
      setRestorePending(false);
      setMessage("");
    } catch {
      setCanWrite(false);
      setMessage("Não foi possível consultar a paleta global.");
    } finally {
      setLoading(false);
    }
  }, [allowGlobalSave]);

  useEffect(() => { void reload(); }, [reload]);

  async function persist(palette: VisualPaletteDraft) {
    if (!allowGlobalSave || !canWrite || busy || conflict) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await saveGlobalVisualPalette(palette, revision);
      setSaved(updated.palette);
      setDraft(updated.palette);
      setRevision(updated.revision);
      setRestorePending(false);
      window.dispatchEvent(new CustomEvent("andon:global-palette-changed"));
      setMessage("Paleta salva globalmente. Os terminais receberão a atualização.");
    } catch (error) {
      if (error instanceof AndonApiError && error.status === 409) {
        setConflict(true);
        setMessage("A paleta foi modificada por outro administrador. Recarregue antes de salvar.");
      } else {
        setMessage("Não foi possível salvar a paleta. As alterações globais foram preservadas.");
      }
    } finally {
      setBusy(false);
    }
  }


  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 md:p-5"
      aria-label={ui("Aparência e cores")}>
      <div>
        <h3 className="text-lg font-bold text-foreground">{ui("Aparência e cores")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {allowGlobalSave
            ? ui("Prévia da paleta global. Alterações entram em vigor somente após Salvar globalmente com acesso autorizado.")
            : ui("Prévia local sem aplicação global. Utilize o Admin principal do Hub para salvar com auditoria.")}
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
      {allowGlobalSave && (
        <div className="space-y-3 rounded-lg border border-border bg-background/60 p-3">
          <p className="text-xs text-muted-foreground">
            {loading ? ui("Carregando paleta global...") :
              canWrite ? ui("Paleta global autorizada para esta sessão. Revisão {0}.", { 0: revision }) :
              ui("Gravação global desabilitada no servidor ou nesta sessão. Prévia disponível.") }
          </p>
          {message && <p role={conflict ? "alert" : "status"} className="flex items-center gap-2 text-sm text-foreground">
            {conflict && <AlertCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}
            {ui(message)}
          </p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void persist(draft)}
              disabled={!canWrite || !changed || busy || loading || conflict || restorePending}>
              {busy ? ui("Salvando...") : ui("Salvar globalmente")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setRestorePending(true)}
              disabled={!canWrite || busy || loading || conflict || restorePending}>
              {ui("Restaurar padrão global")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void reload()} disabled={busy || loading}>
              {ui("Recarregar paleta")}
            </Button>
          </div>
          {restorePending && (
            <div role="group" aria-label={ui("Confirmar restauração global")} className="space-y-2 rounded-md border border-warning/50 bg-warning/5 p-3">
              <p className="text-sm text-foreground">
                {ui("Confirma restaurar o padrão de cores para todos os terminais?")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="destructive"
                  disabled={busy} onClick={() => void persist(restoreDefaultVisualPalette())}>
                  {ui("Confirmar restauração global")}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setRestorePending(false)}>
                  {ui("Cancelar")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={!changed}
          onClick={() => setDraft(restoreDefaultVisualPalette())}>
          {ui("Restaurar padrão da prévia")}
        </Button>
        <p role="status" className="text-xs text-muted-foreground">
          {changed ? ui("Alterações apenas na prévia, sem salvar.") : ui("Paleta carregada sem alterações pendentes.")}
        </p>
      </div>
    </section>
  );
}
