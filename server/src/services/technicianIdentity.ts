import type { Prisma, Technician } from "@prisma/client";
import { createHash } from "node:crypto";

import { prisma } from "../db/prisma.js";
import {
  normalizeCredential,
  type TechnicianCredential,
  verifyCredential,
} from "../security/technicianCredentials.js";

export const technicianIdentitySelect = {
  id: true,
  name: true,
  technicalArea: true,
  shiftId: true,
  active: true,
  pinHash: true,
  tagHash: true,
  shift: { select: { name: true } },
} satisfies Prisma.TechnicianSelect;

export type IdentifiedTechnician = Prisma.TechnicianGetPayload<{
  select: typeof technicianIdentitySelect;
}>;

export function toPublicTechnician(technician: IdentifiedTechnician) {
  return {
    id: technician.id,
    name: technician.name,
    technicalArea: technician.technicalArea,
    shiftId: technician.shiftId,
    shiftName: technician.shift?.name ?? null,
    active: technician.active,
    hasPin: Boolean(technician.pinHash),
    hasTag: Boolean(technician.tagHash),
  };
}

export async function identifyTechnician(
  rawCredential: { method?: unknown; value?: unknown },
  client: Pick<Prisma.TransactionClient, "technician"> = prisma,
) {
  const credential = normalizeCredential(rawCredential.method, rawCredential.value);
  if (!credential) return null;

  const technicians = await client.technician.findMany({
    where: { active: true },
    select: technicianIdentitySelect,
  });

  for (const technician of technicians) {
    const storedHash = credential.method === "pin" ? technician.pinHash : technician.tagHash;
    if (await verifyCredential(credential.value, storedHash)) return technician;
  }

  return null;
}

export async function credentialBelongsToAnotherTechnician(
  credential: TechnicianCredential,
  excludedId?: string,
  client: Pick<Prisma.TransactionClient, "technician"> = prisma,
) {
  const technicians = await client.technician.findMany({
    where: excludedId ? { id: { not: excludedId } } : undefined,
    select: { id: true, pinHash: true, tagHash: true },
  });

  for (const technician of technicians) {
    const storedHash = credential.method === "pin" ? technician.pinHash : technician.tagHash;
    if (await verifyCredential(credential.value, storedHash)) return true;
  }

  return false;
}

export async function lockTechnicianCredential(
  client: Pick<Prisma.TransactionClient, "$queryRaw">,
  credential: TechnicianCredential,
) {
  const fingerprint = createHash("sha256")
    .update(`${credential.method}:${credential.value}`)
    .digest("hex");

  await client.$queryRaw<Array<{ locked: string | null }>>`
    SELECT pg_advisory_xact_lock(
      hashtext(${`andon-technician-credential:${fingerprint}`})
    )::text AS locked
  `;
}

export async function resolveTechniciansByNames(
  names: string[],
  client: Pick<Prisma.TransactionClient, "technician"> = prisma,
) {
  const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
  if (!uniqueNames.length) return [];

  const technicians = await client.technician.findMany({
    where: {
      active: true,
      OR: uniqueNames.map((name) => ({ name: { equals: name, mode: "insensitive" } })),
    },
    select: technicianIdentitySelect,
  });
  const byName = new Map(technicians.map((technician) => [technician.name.toLocaleLowerCase("pt-BR"), technician]));

  return uniqueNames
    .map((name) => byName.get(name.toLocaleLowerCase("pt-BR")))
    .filter((technician): technician is IdentifiedTechnician => Boolean(technician));
}

export function credentialHashField(method: TechnicianCredential["method"]): keyof Pick<Technician, "pinHash" | "tagHash"> {
  return method === "pin" ? "pinHash" : "tagHash";
}
