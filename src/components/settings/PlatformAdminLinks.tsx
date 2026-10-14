import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HubAdminSection } from "@/types/modules";

const links: { section: HubAdminSection; title: string; description: string }[] = [
  {
    section: "workstations",
    title: "Estações e acessos",
    description: "Ativação de estações e permissões independentes do ANDON e BI.",
  },
  {
    section: "security",
    title: "Segurança administrativa",
    description: "Senha global do Admin e código de recuperação.",
  },
  {
    section: "priorities",
    title: "Acesso de Prioridades",
    description: "Provisionamento da credencial própria da gestão de produção.",
  },
];

export function PlatformAdminLinks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Administração da plataforma
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Estações, permissões e credenciais são gerenciadas no Hub com a mesma sessão
          administrativa.
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
