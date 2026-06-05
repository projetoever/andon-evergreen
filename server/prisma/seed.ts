import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const machineIds = ["17", "10", "12", "32", "9", "11", "37", "15", "38"];

const shifts = [
  { id: "morning", name: "Manhã", startTime: "06:00", endTime: "14:00" },
  { id: "afternoon", name: "Tarde", startTime: "14:00", endTime: "22:00" },
  { id: "night", name: "Noite", startTime: "22:00", endTime: "06:00" },
  { id: "business", name: "Comercial", startTime: "06:00", endTime: "16:00" },
];

const failureClassifications = [
  { label: "Falha real da máquina", value: "real_machine_failure" },
  { label: "Falha operacional", value: "operational_failure" },
  { label: "Simulação manual", value: "manual_simulation" },
  { label: "Ajuste", value: "adjustment" },
  { label: "Teste", value: "test" },
];

async function main() {
  await prisma.machine.createMany({
    data: machineIds.map((id) => ({
      id,
      name: `Máquina ${id}`,
      machineStatus: "running",
      andonStatus: "normal",
      productionMode: "production",
    })),
    skipDuplicates: true,
  });

  await prisma.shift.createMany({
    data: shifts,
    skipDuplicates: true,
  });

  await prisma.failureClassification.createMany({
    data: failureClassifications,
    skipDuplicates: true,
  });

  console.log("Seed inicial do ANDON concluído.");
}

main()
  .catch((error) => {
    console.error("Erro ao executar seed inicial do ANDON:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
