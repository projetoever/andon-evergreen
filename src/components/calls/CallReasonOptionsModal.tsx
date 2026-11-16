import { useEffect, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ui } from "@/i18n/translate";
import { useLanguage } from "@/i18n/LanguageProvider";

/** Display-only group selector. Server revalidates every selection in its write transaction. */
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
  sectorNames?: Readonly<Record<string, string>>;
  /** When present, the machine can select multiple independent sectors. */
  onSelectMany?: (reasonId: string, optionIds: string[]) => void;
  onOpenChange: (open: boolean) => void;
  onSelect: (reasonId: string, optionId: string) => void;
}

function readableText(hex: string) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return "#FFFFFF";
  const rgb = [0, 2, 4].map(index => Number.parseInt(normalized.slice(index, index + 2), 16));
  return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 145
    ? "#071015" : "#FFFFFF";
}

export function CallReasonOptionsModal({
  open, reason, busy = false, activeSubtypes = [], sectorColors = {},
  sectorNames = {}, onSelectMany, onOpenChange, onSelect,
}: CallReasonOptionsModalProps) {
  useLanguage();
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  useEffect(() => { setSelectedOptionIds([]); }, [reason?.id, open]);
  const available = reason?.active ? reason.options.filter(option => option.active) : [];
  const selected = available.filter(option => selectedOptionIds.includes(option.id));
  const hasExisting = selected.some(option =>
    Boolean(option.legacySubtype && activeSubtypes.includes(option.legacySubtype)));
  const canConfirm = Boolean(reason?.active && selected.length > 0 && !busy &&
    (!onSelectMany || !hasExisting));
  const sectorColor = (subtype?: string) =>
    sectorColors[subtype ?? ""] ?? reason?.color ?? "#64748B";
  const sectorName = (option: (typeof available)[number]) =>
    sectorNames[option.legacySubtype ?? ""] ?? option.displayName;

  function confirm() {
    if (!reason || !canConfirm) return;
    if (onSelectMany && selected.length > 1) {
      onSelectMany(reason.id, selected.map(option => option.id));
    } else {
      onSelect(reason.id, selected[0].id);
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="max-h-[calc(100dvh_-_1.5rem)] w-[calc(100vw_-_1rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl sm:text-3xl">
            {reason?.displayName ?? ui("Selecione o grupo")}
          </DialogTitle>
          <DialogDescription className="text-base">
            {onSelectMany
              ? ui("Selecione um ou mais setores. Setores com chamados ativos não podem ser incluídos novamente.")
              : ui("Selecione um setor deste grupo. Se ele já tiver chamado ativo, o sistema selecionará o existente, sem duplicar nem alterar sua classificação.")}
          </DialogDescription>
        </DialogHeader>

        {available.length === 0 ? (
          <p role="status" className="rounded-lg border border-border bg-muted/30 p-4 text-base">
            {ui("Nenhum setor ativo vinculado a este grupo. Solicite a configuração ao administrador.")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label={ui("Setores disponíveis no grupo")}>
            {available.map(option => {
              const alreadyOpen = Boolean(option.legacySubtype && activeSubtypes.includes(option.legacySubtype));
              const chosen = selectedOptionIds.includes(option.id);
              const color = sectorColor(option.legacySubtype);
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={busy || Boolean(onSelectMany && alreadyOpen)}
                  aria-pressed={chosen}
                  aria-label={sectorName(option) + (alreadyOpen ? " — " + ui("Chamado já aberto") : "")}
                  onClick={() => setSelectedOptionIds(current =>
                    onSelectMany
                      ? chosen ? current.filter(id => id !== option.id) : [...current, option.id]
                      : [option.id])}
                  className={
                    "machine-sector-action relative min-h-16 rounded-lg border-2 px-3 py-2 text-lg font-black uppercase tracking-wide shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 " +
                    (chosen ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "")
                  }
                  style={{ backgroundColor: color, borderColor: color, color: readableText(color) }}
                >
                  <span className="block break-words">{sectorName(option)}</span>
                  {chosen && <Check className="absolute right-2 top-2 h-5 w-5" aria-hidden="true" />}
                  {alreadyOpen && (
                    <span className="mt-1 block text-xs font-semibold normal-case">
                      {ui("Chamado já aberto")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button type="button" variant="outline" className="min-h-11 px-5" disabled={busy}
            onClick={() => onOpenChange(false)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {ui("Voltar")}
          </Button>
          <div className="flex items-center gap-3">
            {onSelectMany && (
              <span role="status" className="text-sm font-semibold text-muted-foreground">
                {selected.length} {ui("setores selecionados")}
              </span>
            )}
            <Button type="button" size="lg" className="min-h-12 min-w-40 px-6 text-base font-bold"
              disabled={!canConfirm} onClick={confirm}>
              {ui(!onSelectMany && hasExisting ? "Selecionar chamado existente" : "Continuar")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
