import { PrismaClient } from "@prisma/client";

import {
  assertInstallationProfileCompatibility,
  getInstallationProfile,
  seedInstallationProfile,
} from "./seeds/profiles.js";

const prisma = new PrismaClient();

async function main() {
  const profile = getInstallationProfile();

  await assertInstallationProfileCompatibility(prisma, profile);
  await seedInstallationProfile(prisma, profile);

  console.log(`Seed do ANDON concluído com o perfil "${profile}".`);
}

main()
  .catch((error) => {
    console.error("Erro ao executar seed inicial do ANDON:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
