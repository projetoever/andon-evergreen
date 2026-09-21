import type { PrismaClient } from "@prisma/client";

const CORE_SHIFTS = [
  { id: "morning", name: "Manhã", startTime: "06:00", endTime: "14:00" },
  { id: "afternoon", name: "Tarde", startTime: "14:00", endTime: "22:00" },
  { id: "night", name: "Noite", startTime: "22:00", endTime: "06:00" },
  { id: "business", name: "Comercial", startTime: "06:00", endTime: "16:00" },
];

export async function seedCore(prisma: PrismaClient) {
  await prisma.shift.createMany({ data: CORE_SHIFTS, skipDuplicates: true });
}
