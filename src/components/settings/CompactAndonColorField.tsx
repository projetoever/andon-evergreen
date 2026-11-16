import { useState } from "react";
import { ui } from "@/i18n/translate";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { VisualAccentRgbPicker } from "./VisualAccentRgbPicker";
import { accentForTheme } from "@/theme/andonVisualPalette";

/** Reuse the ANDON HSV/RGB selector; only the trigger and spectrum are compact. */
export function CompactAndonColorField({
  label, value, disabled = false, onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(value);
  function start() {
    setPending(value);
    setOpen(true);
  }
  function cancel() { setOpen(false); }
  function apply() {
    onChange(pending.toUpperCase());
    setOpen(false);
  }
  return (
    <>
      <div className="min-w-0 space-y-1">
        <span className="text-sm font-semibold">{ui(label)}</span>
        <button type="button" onClick={start} disabled={disabled}
          aria-label={ui("Personalizar cor de {0}", { 0: ui(label) })}
          className="flex h-11 w-full items-center gap-3 rounded-md border border-border bg-background px-2 text-left hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
          <span aria-hidden="true" className="h-7 w-10 shrink-0 rounded border border-border"
            style={{ backgroundColor: value }}/>
          <span className="font-mono text-xs text-muted-foreground">{value.toUpperCase()}</span>
        </button>
      </div>
      <Dialog open={open} onOpenChange={next => { if (!next) cancel(); }}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-[370px] overflow-y-auto p-3 sm:p-4">
          <DialogHeader>
            <DialogTitle>{ui(label)}</DialogTitle>
            <DialogDescription>{ui("Arraste no espectro ou informe HEX/RGB, depois aplique à prévia.")}</DialogDescription>
          </DialogHeader>
          <VisualAccentRgbPicker compact label={label} value={pending as `#${string}`}
            disabled={disabled}
            onChange={next => setPending(accentForTheme(next, "dark"))}/>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={cancel}>{ui("Cancelar")}</Button>
            <Button type="button" size="sm" onClick={apply} disabled={disabled}>{ui("Aplicar")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
