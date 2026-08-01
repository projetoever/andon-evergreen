import type { Prisma, PrismaClient } from "@prisma/client";

import { seedCore } from "./core.js";

export const INSTALLATION_PROFILES = ["empty", "starter", "demo"] as const;

export type InstallationProfile = (typeof INSTALLATION_PROFILES)[number];

const STARTER_MACHINES: Prisma.MachineCreateManyInput[] = [
  {
    id: "1",
    name: "Máquina 1",
    machineStatus: "running",
    andonStatus: "normal",
    productionMode: "scheduled",
    isActive: true,
    displayOrder: 1,
  },
];

const DEMO_MACHINES: Prisma.MachineCreateManyInput[] = [
  {
    id: "demo-01",
    name: "Máquina Demo 01",
    machineStatus: "running",
    andonStatus: "normal",
    productionMode: "scheduled",
    isActive: true,
    displayOrder: 1,
  },
  {
    id: "demo-02",
    name: "Máquina Demo 02",
    machineStatus: "running",
    andonStatus: "normal",
    productionMode: "scheduled",
    isActive: true,
    displayOrder: 2,
  },
  {
    id: "demo-03",
    name: "Máquina Demo 03",
    machineStatus: "running",
    andonStatus: "normal",
    productionMode: "not_scheduled",
    isActive: true,
    displayOrder: 3,
  },
];

const PROFILE_MACHINE_IDS: Record<InstallationProfile, string[]> = {
  empty: [],
  starter: STARTER_MACHINES.map((machine) => machine.id),
  demo: DEMO_MACHINES.map((machine) => machine.id),
};

function readProfileArgument() {
  const profileIndex = process.argv.findIndex((argument) => argument === "--profile");
  if (profileIndex >= 0) return process.argv[profileIndex + 1];

  return process.argv.find((argument) => argument.startsWith("--profile="))?.split("=", 2)[1];
}

export function getInstallationProfile(): InstallationProfile {
  const value = (process.env.ANDON_INSTALL_PROFILE || readProfileArgument() || "")
    .trim()
    .toLowerCase();

  if (INSTALLATION_PROFILES.includes(value as InstallationProfile)) {
    return value as InstallationProfile;
  }

  throw new Error(
    `Perfil de instalação obrigatório. Use um destes valores: ${INSTALLATION_PROFILES.join(", ")}.`,
  );
}

export async function assertInstallationProfileCompatibility(
  prisma: PrismaClient,
  profile: InstallationProfile,
) {
  const existingMachines = await prisma.machine.findMany({ select: { id: true } });
  if (existingMachines.length === 0) return;

  const allowedIds = new Set(PROFILE_MACHINE_IDS[profile]);
  const unexpectedIds = existingMachines
    .map((machine) => machine.id)
    .filter((id) => !allowedIds.has(id));

  if (unexpectedIds.length > 0) {
    throw new Error(
      `O perfil "${profile}" não pode ser aplicado: o banco já contém máquinas fora desse perfil (${unexpectedIds.join(", ")}).`,
    );
  }
}

async function seedDemoHierarchy(prisma: PrismaClient) {
  const moduleType = await prisma.machineSetType.upsert({
    where: { code: "module" },
    update: {},
    create: {
      code: "module",
      name: "Módulo",
      description: "Conjunto funcional principal da máquina",
      displayOrder: 1,
    },
  });

  const equipmentType = await prisma.machineSubsetType.upsert({
    where: { code: "equipment" },
    update: {},
    create: {
      code: "equipment",
      name: "Equipamento",
      description: "Equipamento associado a um módulo da máquina",
      displayOrder: 1,
    },
  });

  for (const machine of DEMO_MACHINES) {
    const machineSet = await prisma.machineSet.upsert({
      where: { machineId_code: { machineId: machine.id, code: "main-module" } },
      update: {},
      create: {
        machineId: machine.id,
        code: "main-module",
        name: "Módulo principal",
        type: moduleType.name,
        typeId: moduleType.id,
        displayOrder: 1,
      },
    });

    await prisma.machineSubset.upsert({
      where: { machineSetId_code: { machineSetId: machineSet.id, code: "main-equipment" } },
      update: {},
      create: {
        machineSetId: machineSet.id,
        typeId: equipmentType.id,
        code: "main-equipment",
        name: "Equipamento principal",
        displayOrder: 1,
      },
    });
  }
}

export async function seedInstallationProfile(prisma: PrismaClient, profile: InstallationProfile) {
  await seedCore(prisma);

  if (profile === "empty") return;

  const machines = profile === "starter" ? STARTER_MACHINES : DEMO_MACHINES;
  await prisma.machine.createMany({ data: machines, skipDuplicates: true });

  if (profile === "demo") await seedDemoHierarchy(prisma);
}
