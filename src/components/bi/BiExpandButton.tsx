import { Maximize2 } from "lucide-react";
import { ui } from "@/i18n/translate";

export function BiExpandButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const title = ui("Expandir {0}", { 0: label });
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-haspopup="dialog"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background/50 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
    >
      <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
