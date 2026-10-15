import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HubAdminSection } from "@/types/modules";

const links: { section: HubAdminSection; title: string; description: string }[] = [
  {
    section: "workstations",
    get title() {
      return ui("Estações e acessos");
    },
    get description() {
      return ui("Ativação de estações e permissões independentes do ANDON e BI.");
    },
  },
  {
    section: "security",
    get title() {
      return ui("Segurança administrativa");
    },
    get description() {
      return ui("Senha global do Admin e código de recuperação.");
    },
  },
  {
    section: "modules",
    get title() {
      return ui("Módulos e senhas");
    },
    get description() {
      return ui("Credenciais de entrada e exigência de senha dos três módulos.");
    },
  },
];

export function PlatformAdminLinks() {
  useInterfaceLanguage();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          {ui("Administração da plataforma")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {ui(
            "Estações, permissões e credenciais são gerenciadas no Hub com a mesma sessão administrativa.",
          )}
        </p>
        {links.map((item) => (
          <Link
            key={item.section}
            to="/hub/admin"
            search={{ section: item.section }}
            className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0">
              <span className="block text-sm font-bold">{item.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-primary" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
