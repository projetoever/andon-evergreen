import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getCurrentWorkstationId } from "@/services/workstationIdentityService";
import {
  listWorkstations,
  registerCurrentWorkstation,
  updateWorkstation,
} from "@/services/workstationService";
import type { Workstation } from "@/types/workstation";
import { toast } from "sonner";

function workstationLabel(workstation: Workstation) {
  return workstation.name || `Workstation não identificada · ${workstation.id.slice(-8)}`;
}

function formatLastSeen(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Não informado" : date.toLocaleString("pt-BR");
}

export function WorkstationsSettingsTab() {
  const currentWorkstationId = getCurrentWorkstationId();
  const [items, setItems] = useState<Workstation[]>([]);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      await registerCurrentWorkstation();
      const workstations = await listWorkstations();
      setItems(workstations);
      setDraftNames(
        Object.fromEntries(
          workstations.map((workstation) => [workstation.id, workstation.name ?? ""]),
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar workstations.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveName(workstation: Workstation) {
    setSavingId(workstation.id);
    try {
      const updated = await updateWorkstation(workstation.id, {
        name: draftNames[workstation.id] ?? "",
      });
      setItems((current) => current.map((item) => (item.id === workstation.id ? updated : item)));
      setDraftNames((current) => ({ ...current, [updated.id]: updated.name ?? "" }));
      toast.success("Nome da workstation atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar workstation.");
    } finally {
      setSavingId(null);
    }
  }

  async function changeActive(workstation: Workstation, active: boolean) {
    setSavingId(workstation.id);
    try {
      const updated = await updateWorkstation(workstation.id, { active });
      setItems((current) => current.map((item) => (item.id === workstation.id ? updated : item)));
      toast.success(active ? "Workstation ativada." : "Workstation inativada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar workstation.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-bold">Workstations conhecidas</h3>
        <p className="text-sm text-muted-foreground">
          Identidades geradas pelo ANDON para cada navegador. Não utilizam IP ou dados do Windows.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando workstations...</p>}
      {!isLoading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma workstation registrada.</p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((workstation) => {
          const isCurrent = workstation.id === currentWorkstationId;
          const isSaving = workstation.id === savingId;

          return (
            <Card key={workstation.id} className={!workstation.active ? "opacity-70" : undefined}>
              <CardHeader className="space-y-2 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">{workstationLabel(workstation)}</CardTitle>
                  <div className="flex gap-2">
                    {isCurrent && <Badge>Esta workstation</Badge>}
                    <Badge variant={workstation.active ? "secondary" : "outline"}>
                      {workstation.active ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>
                </div>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {workstation.id}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor={`workstation-name-${workstation.id}`}>Nome amigável</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`workstation-name-${workstation.id}`}
                      value={draftNames[workstation.id] ?? ""}
                      maxLength={120}
                      placeholder="Ex.: PC Máquina 37"
                      onChange={(event) =>
                        setDraftNames((current) => ({
                          ...current,
                          [workstation.id]: event.target.value,
                        }))
                      }
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isSaving}
                      onClick={() => void saveName(workstation)}
                    >
                      Salvar
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    Último acesso: {formatLastSeen(workstation.lastSeenAt)}
                  </span>
                  <label className="flex items-center gap-2 font-semibold">
                    <Switch
                      checked={workstation.active}
                      disabled={isSaving}
                      onCheckedChange={(active) => void changeActive(workstation, active)}
                    />
                    {workstation.active ? "Ativa" : "Inativa"}
                  </label>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
