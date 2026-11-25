import { useState } from "react";
import { BookOpen, ClipboardList, LayoutDashboard, ListOrdered, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ui } from "@/i18n/translate";
import { cn } from "@/lib/utils";

export type PrioritySectionId = "overview" | "sequence" | "history" | "help";

const sections = [
  { id: "overview", label: "Visão Geral", Icon: LayoutDashboard },
  { id: "sequence", label: "Sequência e Programação", Icon: ListOrdered },
  { id: "history", label: "Histórico e Auditoria", Icon: ClipboardList },
  { id: "help", label: "Ajuda e Orientações", Icon: BookOpen },
] as const;

type Props = {
  activeSection: PrioritySectionId;
  onSectionChange: (section: PrioritySectionId) => void;
};

export function PrioritySectionNav({ activeSection, onSectionChange }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const choose = (section: PrioritySectionId) => {
    onSectionChange(section);
    setMobileOpen(false);
  };
  const links = (mobile: boolean) => sections.map(({ id, label, Icon }) => (
    <button
      key={id}
      type="button"
      aria-current={activeSection === id ? "page" : undefined}
      onClick={() => choose(id)}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        activeSection === id
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{ui(label)}</span>
      {mobile && activeSection === id && <span className="sr-only">{ui("Seção atual")}</span>}
    </button>
  ));

  return (
    <>
      <div className="lg:hidden">
        <Button type="button" variant="outline" className="w-full justify-start gap-2"
          onClick={() => setMobileOpen(true)} aria-label={ui("Abrir navegação de Prioridades")}>
          <Menu className="h-4 w-4" aria-hidden="true" />
          {ui(sections.find((section) => section.id === activeSection)?.label ?? "Visão Geral")}
        </Button>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[min(86vw,20rem)] p-4">
            <SheetHeader>
              <SheetTitle>{ui("Navegação de Prioridades")}</SheetTitle>
              <SheetDescription>{ui("Escolha uma seção do módulo de Prioridades.")}</SheetDescription>
            </SheetHeader>
            <nav aria-label={ui("Navegação de Prioridades")} className="mt-6 space-y-1">
              {links(true)}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
      <aside className="hidden lg:block" aria-label={ui("Navegação de Prioridades")}>
        <nav aria-label={ui("Navegação de Prioridades")}
          className="sticky top-4 space-y-1 rounded-xl border border-border bg-card p-3">
          <div className="mb-3 border-b border-border px-2 pb-3">
            <p className="flex items-center gap-2 text-sm font-bold text-foreground">
              <ListOrdered className="h-4 w-4 text-primary" aria-hidden="true" />
              {ui("Seções de Prioridades")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{ui("Escolha uma seção do módulo de Prioridades.")}</p>
          </div>
          {links(false)}
        </nav>
      </aside>
    </>
  );
}
