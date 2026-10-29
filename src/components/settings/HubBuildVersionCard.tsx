import { useState } from "react";
import { Copy, ExternalLink, GitCommitHorizontal, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ui } from "@/i18n/translate";

const GITHUB_REPO = "https://github.com/projetoever/andon-evergreen";

/** Shows the actual frontend BUILD fingerprint, not the live GitHub main. */
export function HubBuildVersionCard() {
  const build = __ANDON_BUILD_METADATA__;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const commitUrl = build.commit ? `${GITHUB_REPO}/commit/${build.commit}` : null;
  const compareUrl = build.commit
    ? `${GITHUB_REPO}/compare/${build.commit}...main`
    : null;
  const prUrl = build.pullRequest
    ? `${GITHUB_REPO}/pull/${build.pullRequest}`
    : null;
  const copyCommit = async () => {
    if (!build.commit) return;
    try {
      await navigator.clipboard.writeText(build.commit);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <section
      aria-label={ui("Identificação da versão instalada")}
      className="space-y-3 rounded-xl border border-border bg-card p-4 md:p-5"
    >
      <h3 className="flex items-center gap-2 font-bold">
        <GitCommitHorizontal className="h-5 w-5 text-primary" aria-hidden="true" />
        {ui("Versão e rastreabilidade")}
      </h3>
      <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="text-muted-foreground">{ui("Versão do produto")}</dt>
          <dd className="font-semibold">{build.version}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">{ui("Branch de origem da compilação")}</dt>
          <dd className="font-mono text-xs">{build.branch ?? ui("Não identificada")}</dd>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <dt className="text-muted-foreground">{ui("Commit do frontend compilado")}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 break-all rounded-md bg-muted px-2 py-1 text-xs" title={build.commit ?? undefined}>
              {build.commit ?? ui("Não identificado")}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!build.commit}
              onClick={() => void copyCommit()}
              aria-label={ui("Copiar SHA completo")}
            >
              {copyState === "copied"
                ? <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                : <Copy className="mr-2 h-4 w-4" aria-hidden="true" />}
              {ui(copyState === "copied" ? "Copiado" : "Copiar SHA")}
            </Button>
          </dd>
          {copyState === "failed" && (
            <p role="status" className="text-xs text-muted-foreground">
              {ui("Cópia automática indisponível. Selecione o código para copiar.")}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">{ui("Compilado em (UTC)")}</dt>
          <dd className="font-mono text-xs">{build.compiledAt.slice(0, 16).replace("T", " ")}</dd>
        </div>
        {prUrl && (
          <div className="space-y-1">
            <dt className="text-muted-foreground">{ui("PR de origem da compilação")}</dt>
            <dd><a href={prUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
              #{build.pullRequest}
            </a></dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        {commitUrl && (
          <Button asChild variant="outline" size="sm">
            <a href={commitUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              {ui("Ver commit no GitHub")}
            </a>
          </Button>
        )}
        {compareUrl && (
          <Button asChild variant="outline" size="sm">
            <a href={compareUrl} target="_blank" rel="noopener noreferrer">
              {ui("Comparar com a main")}
            </a>
          </Button>
        )}
        <Button asChild variant="outline" size="sm">
          <a href={`${GITHUB_REPO}/commits/main`} target="_blank" rel="noopener noreferrer">
            {ui("Consultar main atual")}
          </a>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {ui("Este identificador pertence ao frontend compilado nesta instalação. Não confirma o commit do backend nem consulta a main em tempo real.")}
      </p>
    </section>
  );
}
