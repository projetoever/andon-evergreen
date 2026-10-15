import { useEffect, useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { getModuleCredentials, saveModuleCredentials } from "@/services/moduleAuthService";
import type { ModuleCredentialSettings as CredentialSettings } from "@/types/modules";
import { PriorityAccessSettings } from "./PriorityAccessSettings";

const names = { operational: "ANDON operacional", bi: "ANDON BI" };
function CredentialPanel({ initial }: { initial: CredentialSettings }) {
  const { refresh } = useModuleAccess();
  const [settings, setSettings] = useState(initial);
  const [username, setUsername] = useState(initial.username ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [required, setRequired] = useState(initial.passwordRequired);
  const [saving, setSaving] = useState(false);
  const prefix = `credential-${initial.id}`;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (password.trim() !== confirm.trim()) {
      toast.error("A confirmação da senha não confere.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveModuleCredentials(initial.id, {
        username: username.trim(),
        ...(password ? { password: password.trim() } : {}),
        passwordRequired: required,
      });
      setSettings(saved);
      setUsername(saved.username ?? "");
      setPassword("");
      setConfirm("");
      await refresh();
      toast.success("Acesso do módulo atualizado. Sessões anteriores foram invalidadas.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível salvar o acesso.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          {names[initial.id]}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <label className="flex items-center justify-between gap-4 text-sm font-bold">
            Exigir senha para abrir {names[initial.id]}
            <Switch
              aria-label={`Exigir senha para abrir ${names[initial.id]}`}
              checked={required}
              disabled={saving}
              onCheckedChange={setRequired}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {settings.configured
              ? "Credencial configurada. Deixe a nova senha em branco para manter a atual."
              : "Configure usuário e senha antes de exigir autenticação."}{" "}
            A permissão da workstation continua obrigatória.
          </p>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor={`${prefix}-username`}>Usuário</Label>
              <Input
                id={`${prefix}-username`}
                required={required || Boolean(password)}
                minLength={3}
                maxLength={80}
                autoComplete="off"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${prefix}-password`}>Nova senha</Label>
              <Input
                id={`${prefix}-password`}
                required={required && !settings.configured}
                minLength={6}
                maxLength={128}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${prefix}-confirm`}>Confirmar senha</Label>
              <Input
                id={`${prefix}-confirm`}
                required={Boolean(password)}
                minLength={6}
                maxLength={128}
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                disabled={saving}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving}
              className="h-auto min-h-9 whitespace-normal text-center"
            >
              {saving ? "Salvando..." : `Salvar acesso do ${names[initial.id]}`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function ModuleCredentialSettings() {
  const [items, setItems] = useState<CredentialSettings[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    setItems(null);
    setError(null);
    void getModuleCredentials()
      .then((rows) => {
        if (!disposed) setItems(rows);
      })
      .catch((cause) => {
        if (!disposed)
          setError(
            cause instanceof Error ? cause.message : "Não foi possível carregar as credenciais.",
          );
      });
    return () => {
      disposed = true;
    };
  }, [attempt]);
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-black">Módulos e senhas</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Credenciais de entrada independentes da senha administrativa do Hub e do PIN dos
          mantenedores.
        </p>
      </div>
      {error ? (
        <div role="alert" className="space-y-3 rounded-xl border border-danger/40 p-4">
          <p className="text-sm text-danger">{error}</p>
          <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
            Tentar novamente
          </Button>
        </div>
      ) : !items ? (
        <p role="status">Carregando acessos...</p>
      ) : (
        <>
          {items.map((item) => (
            <CredentialPanel key={item.id} initial={item} />
          ))}
          <PriorityAccessSettings />
        </>
      )}
    </section>
  );
}
