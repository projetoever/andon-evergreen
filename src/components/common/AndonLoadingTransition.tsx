import { LoaderCircle } from "lucide-react";
import { ui } from "@/i18n/translate";

/** While the first API snapshot is pending, never display a false 404. */
export function AndonLoadingTransition({
  recovering = false,
}: { recovering?: boolean }) {
  return (
    <div role="status" aria-live="polite"
      className="flex min-h-[52dvh] w-full flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/25 bg-primary/5">
        <LoaderCircle aria-hidden="true"
          className="h-9 w-9 animate-spin text-primary motion-reduce:animate-none"/>
      </span>
      <div className="space-y-1">
        <p className="text-base font-bold text-foreground">
          {ui(recovering ? "Reconectando aos dados do ANDON…" : "Carregando dados da máquina…")}
        </p>
        <p className="text-sm text-muted-foreground">
          {ui(recovering ? "A conexão ainda não foi confirmada. Uma nova consulta será realizada automaticamente." :
            "Verificando o estado da máquina antes de apresentar as operações.")}
        </p>
      </div>
      <div aria-hidden="true" className="h-1 w-48 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/70"/>
      </div>
    </div>
  );
}
