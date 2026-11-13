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
  onOpenChange: (open: boolean) => void;
  onSelect: (reasonId: string, optionId: string) => void;
}

export function CallReasonOptionsModal({
  open, reason, busy = false, activeSubtypes = [], onOpenChange, onSelect,
}: CallReasonOptionsModalProps) {
  useLanguage();
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  useEffect(() => { setSelectedOptionId(null); }, [reason?.id, open]);

  const available = reason?.active ? reason.options.filter(option => option.active) : [];
  const selected = available.find(option => option.id === selectedOptionId);
  const selectedAlreadyOpen = Boolean(selected?.legacySubtype && activeSubtypes.includes(selected.legacySubtype));

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
            {reason?.displayName ?? ui("Selecione a categoria")}
          </DialogTitle>
          <DialogDescription className="text-base">
            {ui("Selecione uma especialidade. Se já existir um chamado ativo para o setor, ele será selecionado sem abrir outro.")}
          </DialogDescription>
        </DialogHeader>

        {available.length === 0 ? (
          <p role="status" className="rounded-lg border border-border bg-muted/30 p-4 text-base">
            {ui("Nenhuma subcategoria ativa para este motivo. Solicite o cadastro ao administrador.")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label={ui("Subcategorias disponíveis")}>
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
                  "min-h-16 rounded-xl border-2 px-3 py-3 text-lg font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                  (selectedOptionId === option.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-accent")
                }
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
