import type { PrismaClient } from "@prisma/client";

const CORE_SHIFTS = [
  { id: "morning", name: "Manhã", startTime: "06:00", endTime: "14:00" },
  { id: "afternoon", name: "Tarde", startTime: "14:00", endTime: "22:00" },
  { id: "night", name: "Noite", startTime: "22:00", endTime: "06:00" },
  { id: "business", name: "Comercial", startTime: "06:00", endTime: "16:00" },
];

const CORE_FAILURE_CLASSIFICATIONS = [
  { label: "Falha real da máquina", value: "real_machine_failure" },
  { label: "Falha operacional", value: "operational_failure" },
  { label: "Simulação manual", value: "manual_simulation" },
  { label: "Ajuste", value: "adjustment" },
  { label: "Teste", value: "test" },
];

export async function seedCore(prisma: PrismaClient) {
  await prisma.shift.createMany({ data: CORE_SHIFTS, skipDuplicates: true });
  await prisma.failureClassification.createMany({
    data: CORE_FAILURE_CLASSIFICATIONS,
    skipDuplicates: true,
  });
}
