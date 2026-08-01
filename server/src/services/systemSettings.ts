import { prisma } from "../db/prisma.js";

export const GLOBAL_SYSTEM_SETTINGS_ID = "global";

export function getSystemSettings() {
  return prisma.systemSettings.upsert({
    where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
    update: {},
    create: { id: GLOBAL_SYSTEM_SETTINGS_ID },
  });
}

export async function allowsWholeSetCalls() {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
    select: { allowWholeSetCalls: true },
  });

  return settings?.allowWholeSetCalls ?? true;
}
