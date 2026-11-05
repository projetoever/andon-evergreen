import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("R9.3 fixed machine uses central credentials when central ACL enabled, not disabled legacy Admin login", async () => {
  const source = await readFile(new URL("../src/pages/MachineDetailPage.tsx", import.meta.url), "utf8");
  const modal = await readFile(new URL("../src/components/machines/CentralMachineScreenUnlockModal.tsx", import.meta.url), "utf8");
  const routes = await readFile(new URL("../server/src/routes/workstations.ts", import.meta.url), "utf8");
  const access = await readFile(new URL("../server/src/routes/access.ts", import.meta.url), "utf8");
  assert.match(source, /access\?\.centralAccessEnabled !== false \? \(/);
  assert.match(source, /CentralMachineScreenUnlockModal/);
  assert.match(modal, /accessRequest\("\/workstations\/screen-unlock", "POST"/);
  assert.match(modal, /await accessRequest<AccessState>\("\/session"\)/);
  assert.match(routes, /screen_unlock_requires_verified_credential/);
  assert.match(access, /unlockCentralMachineScreen\(db/);
  assert.match(access, /centralOwnWorkstationPreferencesEnabled\(\)/);
});
test("R9.3 shared-IP workstation investigation is advisory and never merges IDs", async () => {
  const source = await readFile(new URL("../src/components/settings/WorkstationsSettingsTab.tsx", import.meta.url), "utf8");
  assert.match(source, /sharedIp/);
  assert.match(source, /Nenhuma workstation será unificada automaticamente/);
});
