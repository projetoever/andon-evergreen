import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const installerRoot = new URL("../../installer/", import.meta.url);

async function readInstaller(name: string) {
  return readFile(new URL(name, installerRoot), "utf8");
}

test("atualização e reparo preservam o perfil do Chrome e os sons cadastrados", async () => {
  const [updateScript, repairScript, installScript] = await Promise.all([
    readInstaller("update-andon-server.ps1"),
    readInstaller("repair-andon-server.ps1"),
    readInstaller("install-andon-server.ps1"),
  ]);

  for (const script of [updateScript, repairScript]) {
    assert.match(script, /Prepare-AndonChromeProfileForReuse/);
    assert.doesNotMatch(script, /\bClear-AndonChromeProfile\b/);
  }

  assert.match(
    installScript,
    /\bClear-AndonChromeProfile\b/,
    "a instalação limpa continua iniciando com um perfil novo",
  );
});
