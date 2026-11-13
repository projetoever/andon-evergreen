import { useCallback, useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { AndonApiError } from "@/api/andonApiClient";
import { readGlobalVisualPalette, saveGlobalVisualPalette } from "@/services/visualPaletteService";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VisualAccentRgbPicker } from "./VisualAccentRgbPicker";
import { ui } from "@/i18n/translate";
import {
  accentForTheme,
  restoreDefaultVisualPalette,
  VISUAL_PALETTE_KEYS,
  INDUSTRIAL_VISUAL_PRESETS,
  paletteContrastRatio,
  type VisualPaletteDraft,
  type VisualAccent,
  type VisualPaletteKey,
} from "@/theme/andonVisualPalette";

const fieldLabels: Readonly<Record<VisualPaletteKey, string>> = {
  cardBorder: "Contorno padrão dos cards",
  selectedCardBorder: "Contorno do card selecionado",
  sectorSelection: "Destaque de setor selecionado",
  operationAccent: "Acento dos botões de operação",
  focusAccent: "Foco e seleção",
  priorityBorder: "Contorno de prioridades",
};
/**
 * Preview remains draft-only in legacy mode. An authenticated ANDON
 * settings delegate may save only when the separately guarded server flag
 * is enabled; the API still checks current grants, CSRF and revision.
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
  const [editingKey, setEditingKey] = useState<VisualPaletteKey | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<VisualAccent | null>(null);

  function beginColorEdit(key: VisualPaletteKey) {
    setEditingOriginal(draft[key]);
    setEditingKey(key);
  }

  function cancelColorEdit() {
    if (editingKey && editingOriginal !== null) {
      const key = editingKey;
      setDraft(previous => ({ ...previous, [key]: editingOriginal }));
    }
    setEditingKey(null);
    setEditingOriginal(null);
  }

  function confirmColorEdit() {
    setEditingKey(null);
    setEditingOriginal(null);
  }
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
    if (!allowGlobalSave || !canWrite || busy || loading || conflict) return;
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
      <p className="text-xs text-muted-foreground">
        {ui("Escolha qualquer cor no seletor ou informe HEX/RGB. A prévia não altera alarmes críticos.")}
      </p>
      <div className="space-y-3 rounded-xl border border-border bg-muted/15 p-3">
        <div>
          <h4 className="font-semibold text-foreground">{ui("Paletas industriais prontas")}</h4>
          <p className="text-xs text-muted-foreground">
            {ui("Selecione um conjunto de contornos e destaques para prévia. O tema claro/escuro continua independente e os alertas de segurança permanecem protegidos.")}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {INDUSTRIAL_VISUAL_PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              disabled={loading || busy}
              onClick={() => { setDraft({ ...preset.palette }); setRestorePending(false); }}
              aria-label={ui("Visualizar paleta {0}", { 0: ui(preset.label) })}
              className="flex min-h-20 flex-col justify-between gap-2 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <span className="text-sm font-bold">{ui(preset.label)}</span>
              <span className="text-xs text-muted-foreground">{ui(preset.description)}</span>
              <span className="flex gap-1" aria-hidden="true">
                {VISUAL_PALETTE_KEYS.map(key => (
                  <span key={key} className="h-3 flex-1 rounded-sm border border-border/40"
                    style={{ backgroundColor: accentForTheme(preset.palette[key], "dark") }}/>
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {VISUAL_PALETTE_KEYS.map(key => (
          <button
            key={key}
            type="button"
            aria-label={ui("Personalizar cor de {0}", { 0: ui(fieldLabels[key]) })}
            disabled={loading || busy}
            onClick={() => beginColorEdit(key)}
            className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-background/50 p-3 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <span className="h-10 w-10 shrink-0 rounded-md border border-border shadow-sm"
              style={{ backgroundColor: accentForTheme(draft[key], "dark") }} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{ui(fieldLabels[key])}</span>
              <span className="block font-mono text-xs text-muted-foreground">
                {accentForTheme(draft[key], "dark")}
              </span>
            </span>
          </button>
        ))}
      </div>
      <Dialog open={editingKey !== null} onOpenChange={open => { if (!open) cancelColorEdit(); }}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-[440px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingKey ? ui(fieldLabels[editingKey]) : ui("Selecionar cor")}</DialogTitle>
            <DialogDescription>
              {ui("Arraste no espectro ou informe HEX/RGB, depois aplique à prévia.")}
            </DialogDescription>
          </DialogHeader>
          {editingKey && (
            <VisualAccentRgbPicker
              label={fieldLabels[editingKey]}
              disabled={loading || busy}
              value={draft[editingKey]}
              onChange={color => {
                const key = editingKey;
                setDraft(previous => ({ ...previous, [key]: color }));
              }}
            />
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={cancelColorEdit}>{ui("Cancelar")}</Button>
            <Button type="button" onClick={confirmColorEdit}>{ui("Aplicar à prévia")}</Button>
          </div>
        </DialogContent>
      </Dialog>
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
              <div className="mt-3 rounded-lg border-2 px-3 py-2 text-xs font-semibold" style={{
                borderColor: accentForTheme(draft.priorityBorder, theme),
              }}>
                {ui("Grupo de máquinas prioritárias — contorno configurável")}
              </div>
              {VISUAL_PALETTE_KEYS.filter(key =>
                paletteContrastRatio(accentForTheme(draft[key], theme),
                  key === "priorityBorder" ? background : card) < 3
              ).length > 0 && (
                <p role="status" className="mt-2 text-xs" style={{ color: foreground }}>
                  {ui("Atenção: alguns contornos possuem contraste inferior a 3:1 neste modo. Ajuste as cores antes de publicar.")}
                </p>
              )}
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
