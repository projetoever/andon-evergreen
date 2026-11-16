import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ui } from "@/i18n/translate";
import { useLanguage } from "@/i18n/LanguageProvider";

/**
 * S3-B3 isolated, presentational category -> option step.
 * The caller must fetch a server-authorized, active catalog and MUST validate
 * the selected IDs again at the backend during the call-open transaction.
 * No call is opened by this component.
 */
export type CallReasonChoice = {
  id: string;
  displayName: string;
  color: string;
  active: boolean;
  options: ReadonlyArray<{
    id: string;
    displayName: string;
    active: boolean;
    legacySubtype?: string;
  }>;
};

export interface CallReasonOptionsModalProps {
  open: boolean;
  reason: CallReasonChoice | null;
  busy?: boolean;
  activeSubtypes?: readonly string[];
  sectorColors?: Readonly<Record<string, string>>;
  onOpenChange: (open: boolean) => void;
  onSelect: (reasonId: string, optionId: string) => void;
}

export function CallReasonOptionsModal({
  open, reason, busy = false, activeSubtypes = [], sectorColors = {}, onOpenChange, onSelect,
}: CallReasonOptionsModalProps) {
  useLanguage();
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  useEffect(() => { setSelectedOptionId(null); }, [reason?.id, open]);

  const available = reason?.active ? reason.options.filter(option => option.active) : [];
  const selected = available.find(option => option.id === selectedOptionId);
  const selectedAlreadyOpen = Boolean(selected?.legacySubtype && activeSubtypes.includes(selected.legacySubtype));
  const optionColor = (legacySubtype?: string) =>
    sectorColors[legacySubtype ?? ""] ?? reason?.color ?? "#64748B";
  const readableText = (hex: string) => {
    const normalized = hex.replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return "#FFFFFF";
    const rgb = [0, 2, 4].map(index => Number.parseInt(normalized.slice(index, index + 2), 16));
    return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 145
      ? "#071015" : "#FFFFFF";
  };

  function confirm() {
    if (!reason?.active || !selected || busy) return;
    // Selection is not a server-side authorization or a committed call.
    onSelect(reason.id, selected.id);
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="max-h-[calc(100dvh_-_1.5rem)] w-[calc(100vw_-_1rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl sm:text-3xl">
            {reason?.displayName ?? ui("Selecione o grupo")}
          </DialogTitle>
          <DialogDescription className="text-base">
            {ui("Selecione um setor deste grupo. Se ele já tiver chamado ativo, o sistema selecionará o existente, sem duplicar nem alterar sua classificação.")}
          </DialogDescription>
        </DialogHeader>

        {available.length === 0 ? (
          <p role="status" className="rounded-lg border border-border bg-muted/30 p-4 text-base">
            {ui("Nenhum setor ativo vinculado a este grupo. Solicite a configuração ao administrador.")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label={ui("Setores disponíveis no grupo")}>
            {available.map(option => (
              <button
                key={option.id}
                type="button"
                disabled={busy}
                aria-pressed={selectedOptionId === option.id}
                aria-label={option.displayName + (option.legacySubtype && activeSubtypes.includes(option.legacySubtype)
                  ? " — " + ui("Chamado já aberto") : "")}
                onClick={() => setSelectedOptionId(option.id)}
                className={
                  "machine-sector-action relative min-h-16 rounded-lg border-2 px-3 py-2 text-lg font-black uppercase tracking-wide shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 " +
                  (selectedOptionId === option.id ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "")
                }
                style={{
                  backgroundColor: optionColor(option.legacySubtype),
                  borderColor: optionColor(option.legacySubtype),
                  color: readableText(optionColor(option.legacySubtype)),
                }}
              >
                <span className="block break-words">{option.displayName}</span>
                {option.legacySubtype && activeSubtypes.includes(option.legacySubtype) && (
                  <span className="mt-1 block text-xs font-semibold normal-case">
                    {ui("Chamado já aberto")}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap justify-between gap-3 pt-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {ui("Voltar")}
          </Button>
          <Button type="button" disabled={!selected || busy} onClick={confirm}>
            {ui(selectedAlreadyOpen ? "Selecionar chamado existente" : "Continuar")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
