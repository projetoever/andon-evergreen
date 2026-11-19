import type { EndTechnicianSessionParams } from "@/services/andonService";

/**
 * Single contract for individual technician exit. Only the authenticated
 * server can verify the credential / name-declared technician identity.
 * Never send an undefined credential or technicianId in the central body.
 */
export function buildTechnicianEndPayload(
  params: EndTechnicianSessionParams,
  session: { technicianId?: string; technicianName: string } | undefined,
  central: boolean,
) {
  const reason = typeof params.endReason === "string" ? params.endReason.trim() : "";
  if (!reason || reason.length > 2000) {
    throw new Error("Motivo do encerramento inválido. Selecione novamente o motivo.");
  }
  const notes = typeof params.notes === "string" ? params.notes.trim() : "";
  if (notes.length > 4000) {
    throw new Error("Observação acima do limite de 4.000 caracteres.");
  }

  if (central) {
    if (!params.credential && !session?.technicianId) {
      throw new Error("Mantenedor sem identificação válida na sessão. Atualize o chamado e tente novamente.");
    }
  } else if (!params.credential && !(params.technicianName || session?.technicianName)) {
    throw new Error("Selecione o mantenedor em atendimento.");
  }

  return {
    ...(central
      ? (params.credential
        ? { credential: params.credential }
        : { technicianId: session!.technicianId! })
      : {
        technicianName: params.technicianName ?? session?.technicianName,
        ...(params.credential ? { credential: params.credential } : {}),
      }),
    reason,
    ...(notes ? { notes } : {}),
  };
}
