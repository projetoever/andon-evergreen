import { ui, systemMessage } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { loginModule } from "@/services/moduleAuthService";
import type { PasswordModule } from "@/types/modules";

export function ModuleLoginPanel({ module, name }: { module: PasswordModule; name: string }) {
  useInterfaceLanguage();
  const { refresh } = useModuleAccess();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await loginModule(module, username, password);
      setPassword("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível entrar no módulo.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4 text-foreground">
      <section className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <KeyRound className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-black">
            {ui("Acesso ao ")}
            {ui(name)}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {ui("Entre com a credencial deste módulo, configurada pelo administrador no Hub.")}
        </p>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1">
            <Label htmlFor="module-username">{ui("Usuário")}</Label>
            <Input
              id="module-username"
              autoComplete="username"
              required
              maxLength={80}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="module-password">{ui("Senha")}</Label>
            <Input
              id="module-password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {systemMessage(error)}
            </p>
          )}
          <Button className="w-full" disabled={submitting} type="submit">
            {submitting ? ui("Entrando...") : ui("Entrar")}
          </Button>
        </form>
        <div className="flex flex-wrap justify-between gap-3 text-sm">
          <Link to="/hub" className="font-bold text-primary underline">
            {ui("Voltar ao Hub")}
          </Link>
          <Link to="/hub/admin" className="text-muted-foreground underline">
            {ui("Acesso administrativo")}
          </Link>
        </div>
      </section>
    </main>
  );
}
