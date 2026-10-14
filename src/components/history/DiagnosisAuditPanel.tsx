import { useState } from "react";
import { createAndonApiClient } from "@/api/andonApiClient";
import { readAdminSession } from "@/services/adminSessionStorage";
import { toast } from "sonner";

type AuditEntry = {
  id: string;
  technicianName: string;
  technicianId: string;
  createdAt: string;
  ipAddress: string | null;
  workstationId: string | null;
  previousClassification: string | null;
  newClassification: string | null;
  previousDescription: string | null;
  newDescription: string | null;
};

const client = createAndonApiClient();

/** The API requires an active administrator session for audit consultation. */
export function DiagnosisAuditPanel({ callId, failureEventId }: { callId?: string; failureEventId?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!readAdminSession()) {
      toast.error("Entre como administrador para consultar a auditoria.");
      return;
    }
    if (expanded) { setExpanded(false); return; }
    setLoading(true);
    setError(null);
    try {
      const filter = callId ? `callId=${encodeURIComponent(callId)}` : `failureEventId=${encodeURIComponent(failureEventId ?? "")}`;
      const result = await client.get<AuditEntry[]>(`/api/diagnosis-audit?${filter}&limit=100`);
      setEntries(result);
      setExpanded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar auditoria.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3 text-sm">
      <button type="button" disabled={loading} onClick={() => void load()} className="font-semibold text-primary hover:underline">
        {loading ? "Carregando auditoria..." : expanded ? "Ocultar auditoria" : "Consultar auditoria de edições (Admin)"}
      </button>
      {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
      {expanded && (
        <div className="mt-2 space-y-2">
          {entries.length === 0 && <p className="text-muted-foreground">Nenhuma edição posterior registrada.</p>}
          {entries.map((entry) => (
            <div key={entry.id} className="space-y-1 rounded-lg border border-border bg-background p-3">
              <div className="font-semibold">{entry.technicianName} · {new Date(entry.createdAt).toLocaleString("pt-BR")}</div>
              <p className="text-xs text-muted-foreground">Mantenedor: {entry.technicianId} · IP: {entry.ipAddress ?? "Não identificado"} · Workstation: {entry.workstationId ?? "Não identificada"}</p>
              <p><strong>Classificação:</strong> {entry.previousClassification ?? "Não registrada"} → {entry.newClassification ?? "Não registrada"}</p>
              <p className="whitespace-pre-wrap"><strong>Descrição anterior:</strong> {entry.previousDescription ?? "Não registrada"}</p>
              <p className="whitespace-pre-wrap"><strong>Descrição nova:</strong> {entry.newDescription ?? "Não registrada"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
