import { useAndon } from "@/context/AndonProvider";
import { Input } from "@/components/ui/input";

export function AlertSettingsPanel() {
  const { settings, updateSettings } = useAndon();
  const r = settings.alertRules;

  function update(field: keyof typeof r, value: number) {
    updateSettings({ alertRules: { ...r, [field]: value } });
  }

  const fields: { key: keyof typeof r; label: string; help: string }[] = [
    {
      key: "callOpenWarningMinutes",
      label: "Chamado aberto — aviso (min)",
      help: "Acima deste valor o chamado fica em amarelo.",
    },
    {
      key: "callOpenCriticalMinutes",
      label: "Chamado aberto — crítico (min)",
      help: "Acima deste valor o chamado pulsa em vermelho.",
    },
    {
      key: "machineStoppedWarningMinutes",
      label: "Máquina parada — aviso (min)",
      help: "Acima deste valor a máquina fica em amarelo.",
    },
    {
      key: "machineStoppedCriticalMinutes",
      label: "Máquina parada — crítico (min)",
      help: "Acima deste valor a máquina pulsa em vermelho.",
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="mb-4 text-xl font-bold uppercase tracking-wider text-foreground">
        Limites de alerta
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {f.label}
            </span>
            <Input
              type="number"
              min={0}
              value={r[f.key]}
              onChange={(e) => update(f.key, Math.max(0, Number(e.target.value) || 0))}
              className="h-12 text-lg"
            />
            <span className="text-xs text-muted-foreground">{f.help}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
