import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/** Shared visual treatment for all short credential/security operations.
 * Keeps each action's existing server-side authorization and audit intact. */
export function CredentialActionDialog({
  open, busy = false, onOpenChange, icon: Icon, title, description, children,
}: {
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-h-[90dvh] overflow-y-auto rounded-2xl border border-border bg-card p-0 shadow-2xl sm:max-w-md">
        <DialogHeader className="space-y-2 border-b border-border/70 bg-muted/20 px-5 py-5 pr-12 text-left sm:px-6 sm:pr-12">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Icon aria-hidden="true" className="h-5 w-5" />
            </span>
            <DialogTitle className="text-base font-bold leading-snug">{title}</DialogTitle>
          </div>
          <DialogDescription className="text-xs leading-relaxed">{description}</DialogDescription>
        </DialogHeader>
        <div className="px-5 pb-6 pt-5 sm:px-6">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
