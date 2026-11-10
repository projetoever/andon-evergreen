import { useEffect, useState } from "react";
import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/i18n/toast";
import {
  listMachineConfigurationInventory, updateMachineConfigurationInventoryMetadata,
  type MachineConfigurationInventoryItem,
} from "@/services/machineConfigurationInventoryService";

/** H2: global metadata editor with its own safe API. Operational machine
 * lists, calls and production events NEVER enter this component. */
export function MachineConfigurationInventoryCard() {
  useInterfaceLanguage();
  const [items, setItems] = useState<MachineConfigurationInventoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftOS, setDraftOS] = useState(false);
  const selected = items.find(item => item.id === selectedId) ?? null;

  useEffect(() => {
    let active = true;
    void listMachineConfigurationInventory().then(page => {
      if (!active) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setStatus("ready");
    }).catch(() => {
      if (active) setStatus("unavailable");
    });
    return () => { active = false; };
  }, []);

  async function loadMore() {
    if (busy || status !== "ready" || !nextCursor) return;
    setBusy(true);
    try {
      const page = await listMachineConfigurationInventory(nextCursor);
      setItems(prev => [...prev, ...page.items.filter(next =>
        !prev.some(item => item.id === next.id))]);
      setNextCursor(page.nextCursor);
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }
  function choose(item: MachineConfigurationInventoryItem) {
    setSelectedId(item.id);
    setDraftName(item.name);
    setDraftOS(item.requireWorkOrderAtOpen);
  }
  async function save() {
    if (!selected || busy) return;
    const name = draftName.trim();
    if (!name || [...name].length > 120) {
      toast.error(ui("Informe um nome de máquina entre 1 e 120 caracteres."));
      return;
    }
    if (name === selected.name && draftOS === selected.requireWorkOrderAtOpen) return;
    setBusy(true);
    try {
      const saved = await updateMachineConfigurationInventoryMetadata(selected.id, {
        name, requireWorkOrderAtOpen: draftOS,
      });
      // Accept only the four safe metadata fields, even for full-scope admins.
      setItems(prev => prev.map(item => item.id === selected.id ? {
        id: saved.id, name: saved.name,
        requireWorkOrderAtOpen: saved.requireWorkOrderAtOpen, isActive: saved.isActive,
      } : item));
      toast.success(ui("Cadastro da máquina atualizado."));
    } catch {
      toast.error(ui("Não foi possível salvar o cadastro desta máquina."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4"
      aria-label={ui("Inventário cadastral global")}>
      <div>
        <h4 className="text-sm font-black">{ui("Inventário cadastral global")}</h4>
        <p className="text-xs text-muted-foreground">
          {ui("Somente ID, nome, regra de OS e cadastro ativo. Não exibe chamados, status operacional ou histórico de produção.")}
        </p>
      </div>
      {status === "loading" && (
        <p role="status" className="text-xs text-muted-foreground">{ui("Carregando inventário cadastral...")}</p>
      )}
      {status === "unavailable" && (
        <p role="status" className="text-xs text-muted-foreground">
          {ui("Inventário global indisponível até a liberação de segurança no laboratório.")}
        </p>
      )}
      {status === "error" && (
        <p role="alert" className="text-xs text-destructive">
          {ui("Não foi possível carregar mais máquinas no inventário.")}
        </p>
      )}
      {status === "ready" && (
        <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)]">
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
            {items.length === 0 && <p className="text-xs text-muted-foreground">{ui("Nenhuma máquina cadastrada")}</p>}
            {items.map(item => (
              <button key={item.id} type="button"
                aria-pressed={selectedId === item.id}
                onClick={() => choose(item)}
                className="w-full rounded-md border border-border px-2 py-1.5 text-left text-xs hover:bg-accent"
              >
                <span className="font-bold">{item.name}</span>
                <span className="ml-2 font-mono text-muted-foreground">ID {item.id}</span>
              </button>
            ))}
            {nextCursor && (
              <Button variant="outline" size="sm" type="button" onClick={() => void loadMore()} disabled={busy}>
                {ui("Carregar mais máquinas")}
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {selected ? (
              <>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold">{ui("Nome cadastral")}</span>
                  <Input value={draftName} onChange={event => setDraftName(event.target.value)}
                    disabled={busy} maxLength={120} />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs font-semibold">
                  <span>{ui("Exigir OS nesta máquina")}</span>
                  <Switch checked={draftOS} onCheckedChange={setDraftOS} disabled={busy}/>
                </label>
                <Button size="sm" type="button" disabled={busy ||
                  (!draftName.trim()) ||
                  (selected.name === draftName.trim() &&
                   selected.requireWorkOrderAtOpen === draftOS)}
                  onClick={() => void save()}>
                  {ui("Salvar cadastro")}
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {ui("Selecione uma máquina para editar apenas os dados cadastrais.")}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
