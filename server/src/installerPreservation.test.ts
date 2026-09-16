import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../../", import.meta.url);
const installerRoot = new URL("installer/", repositoryRoot);

async function readInstaller(name: string) {
  return readFile(new URL(name, installerRoot), "utf8");
}

async function readRepositoryFile(path: string) {
  return readFile(new URL(path, repositoryRoot), "utf8");
}

function normalizeWindowsPath(value: string) {
  return value.replaceAll("/", "\\").toLowerCase();
}

function matchesAndonNodeOwnershipPolicy({
  executablePath,
  commandLine,
}: {
  executablePath: string;
  commandLine: string;
}) {
  const projectPath = normalizeWindowsPath("C:\\web-andon-industrial\\andon");
  const dedicatedNodePath = normalizeWindowsPath(
    "C:\\web-andon-industrial\\runtime\\node\\node.exe",
  );
  const normalizedExecutablePath = normalizeWindowsPath(executablePath);
  const normalizedCommandLine = normalizeWindowsPath(commandLine);
  const hasApiMarker = normalizedCommandLine.includes(`${projectPath}\\server\\dist\\server.js`);
  const hasProjectMarker = normalizedCommandLine.includes(`${projectPath}\\`);
  const hasViteEntrypoint =
    normalizedCommandLine.includes("\\vite\\bin\\vite.js") ||
    normalizedCommandLine.includes("\\vite\\dist\\node\\cli.js");
  const hasFrontendMarker =
    hasProjectMarker &&
    normalizedCommandLine.includes("\\node_modules\\") &&
    hasViteEntrypoint &&
    /(^|\s)preview(\s|$)/.test(normalizedCommandLine);

  if (!hasApiMarker && !hasFrontendMarker) return false;
  if (normalizedExecutablePath === dedicatedNodePath) return true;

  return hasProjectMarker;
}

function assertAppearsOnce(source: string, pattern: RegExp, description: string) {
  const matches = source.match(new RegExp(pattern.source, "g")) ?? [];
  assert.equal(matches.length, 1, `${description} deve aparecer exatamente uma vez`);
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

test("instalador e runtime usam exclusivamente o Node dedicado do ANDON", async () => {
  const [common, runtimeCommon, startApi, startFrontend, bootstrap] = await Promise.all([
    readInstaller("AndonInstaller.Common.ps1"),
    readRepositoryFile("scripts/Andon.Runtime.Common.ps1"),
    readRepositoryFile("scripts/start-api.ps1"),
    readRepositoryFile("scripts/start-frontend.ps1"),
    readRepositoryFile("INSTALAR_ANDON_SERVIDOR.ps1"),
  ]);

  assert.match(common, /AndonNodeRuntimePath = "\$Global:AndonRuntimeRoot\\node"/);
  assert.match(common, /AndonNodeVersion = "22\.23\.2"/);
  assert.match(common, /1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97/);
  assert.match(common, /Invoke-AndonNodeProcess/);
  assert.doesNotMatch(common, /C:\\Program Files\\nodejs\\npm\.cmd/);

  assert.match(runtimeCommon, /runtime\\node/);
  assert.match(runtimeCommon, /AndonRequiredNodeVersion = "v22\.23\.2"/);
  assert.match(startApi, /\$nodePath = \$context\.NodePath/);
  assert.match(startFrontend, /\$npmPath = \$context\.NpmPath/);
  assert.doesNotMatch(startApi, /C:\\Program Files\\nodejs/);
  assert.doesNotMatch(startFrontend, /C:\\Program Files\\nodejs/);
  assert.match(bootstrap, /Ensure-AndonDedicatedNodeRuntime/);
});

test("instalação, atualização e reparo mantêm o runtime dedicado", async () => {
  const [installScript, updateScript, repairScript] = await Promise.all([
    readInstaller("install-andon-server.ps1"),
    readInstaller("update-andon-server.ps1"),
    readInstaller("repair-andon-server.ps1"),
  ]);

  for (const script of [installScript, updateScript, repairScript]) {
    assert.match(script, /Ensure-AndonDedicatedNodeRuntime/);
  }

  for (const script of [updateScript, repairScript]) {
    assert.match(script, /Invoke-AndonNodePipeline -RunSeed \$false/);
    assert.doesNotMatch(script, /Invoke-AndonNodePipeline -RunSeed \$true/);
  }
});

test("primeira atualização legada sincroniza e relança antes de parar e atualizar", async () => {
  const updateScript = await readInstaller("update-andon-server.ps1");

  assert.match(updateScript, /\[switch\]\$ContinueAfterSync/);
  assert.match(updateScript, /\[string\]\$ExpectedCommit/);

  const syncIndex = updateScript.indexOf("Sync-AndonRepositoryAndTools");
  const relaunchIndex = updateScript.indexOf("& $powershellPath");
  const newRuntimeModuleIndex = updateScript.indexOf("AndonInstaller.Runtime.ps1");
  const stopIndex = updateScript.indexOf("Stop-AndonRuntime");
  const ensureNodeIndex = updateScript.indexOf("Ensure-AndonDedicatedNodeRuntime");
  const pipelineIndex = updateScript.indexOf("Invoke-AndonNodePipeline");

  assert.ok(syncIndex >= 0, "a instalação legada deve sincronizar os scripts novos");
  assert.ok(relaunchIndex > syncIndex, "o script atualizado deve ser relançado após o sync");
  assert.ok(
    newRuntimeModuleIndex > relaunchIndex,
    "o módulo Runtime novo deve ser carregado somente na segunda fase",
  );
  assert.ok(stopIndex > newRuntimeModuleIndex, "a parada deve usar o módulo Runtime novo");
  assert.ok(ensureNodeIndex > stopIndex, "o Node dedicado deve ser garantido após a parada");
  assert.ok(pipelineIndex > ensureNodeIndex, "build e migrations devem rodar uma única vez no fim");

  assert.match(updateScript, /-File \$updatedScriptPath\s*`\s*\r?\n\s*-ContinueAfterSync/);
  assert.match(updateScript, /-ExpectedCommit \$selectedCommit/);
  assert.match(updateScript, /Assert-AndonRepositoryCommit -ExpectedCommit \$ExpectedCommit/);
  assertAppearsOnce(updateScript, /Sync-AndonRepositoryAndTools/, "sync");
  assertAppearsOnce(updateScript, /Stop-AndonRuntime/, "parada");
  assertAppearsOnce(
    updateScript,
    /Ensure-AndonDedicatedNodeRuntime/,
    "instalação do Node dedicado",
  );
  assertAppearsOnce(updateScript, /Invoke-AndonNodePipeline/, "pipeline de atualização");
  assert.match(updateScript, /Invoke-AndonNodePipeline -RunSeed \$false/);
  assert.doesNotMatch(updateScript, /Invoke-AndonNodePipeline -RunSeed \$true/);
});

test("PostgreSQL local valida login, privilégios e ownership antes de alterar", async () => {
  const [common, localDatabase] = await Promise.all([
    readInstaller("AndonInstaller.Common.ps1"),
    readInstaller("AndonInstaller.Database.Local.ps1"),
  ]);

  assert.match(common, /AndonDatabaseMode = "docker"/);
  assert.match(common, /AndonDatabaseName = "andon_db"/);
  assert.match(common, /AndonDatabaseUser = "andon"/);
  assert.match(common, /AndonPostgresPort = 5433/);
  assert.doesNotMatch(common, /andon_web_industrial|andon_web|MIGRAR_BANCO/);
  assert.doesNotMatch(common, /database(?:User)?CreatedByInstaller/);

  const precheckIndex = localDatabase.indexOf("PRECHECK POSTGRESQL LOCAL");
  const mutableIndex = localDatabase.indexOf("$mutableStatements = @()");
  assert.ok(precheckIndex >= 0, "precheck PostgreSQL deve existir");
  assert.ok(mutableIndex > precheckIndex, "SQL mutável deve ocorrer somente após o precheck");

  assert.match(localDatabase, /Usuario administrativo PostgreSQL \[postgres\]/);
  assert.match(localDatabase, /rolcanlogin, rolsuper, rolcreatedb, rolcreaterole/);
  assert.match(localDatabase, /possui NOLOGIN/);
  assert.match(localDatabase, /nao possui CREATEROLE/);
  assert.match(localDatabase, /nao possui CREATEDB/);
  assert.match(localDatabase, /CREATE ROLE \$Global:AndonDatabaseUser LOGIN PASSWORD/);
  assert.match(localDatabase, /CREATE DATABASE/);
  assert.doesNotMatch(localDatabase, /ALTER USER/);
  assert.doesNotMatch(localDatabase, /GRANT ALL PRIVILEGES/);
  assert.doesNotMatch(
    localDatabase.slice(0, localDatabase.indexOf("function Remove-AndonLocalDatabaseClean")),
    /pg_terminate_backend/,
  );
  assert.match(localDatabase, /Expected "APAGAR_BANCO"/);
});

test("installationProfile aceita config legada e só é persistido depois da seleção", async () => {
  const [common, installScript, localDatabase, dockerDatabase] = await Promise.all([
    readInstaller("AndonInstaller.Common.ps1"),
    readInstaller("install-andon-server.ps1"),
    readInstaller("AndonInstaller.Database.Local.ps1"),
    readInstaller("AndonInstaller.Database.Docker.ps1"),
  ]);

  assert.match(common, /function Set-AndonConfigProperty/);
  assert.match(common, /Add-Member\s*`?\s*-NotePropertyName \$Name/);
  assert.match(installScript, /-Name "installationProfile"/);
  assert.match(installScript, /-Value \$installationProfile/);
  assert.match(installScript, /-SeedProfile \$installationProfile/);
  assert.doesNotMatch(installScript, /\$dbConfig\.installationProfile\s*=/);
  assert.doesNotMatch(localDatabase, /Save-AndonConfig/);
  assert.doesNotMatch(dockerDatabase, /Save-AndonConfig/);
});

test("fresh install fixa SHA, relança scripts sincronizados e bloqueia configuração existente", async () => {
  const [common, installScript, bootstrap] = await Promise.all([
    readInstaller("AndonInstaller.Common.ps1"),
    readInstaller("install-andon-server.ps1"),
    readRepositoryFile("INSTALAR_ANDON_SERVIDOR.ps1"),
  ]);

  const syncIndex = installScript.indexOf("Sync-AndonRepositoryAndTools");
  const relaunchIndex = installScript.indexOf("& $powershellPath");
  const runtimeModuleIndex = installScript.indexOf("AndonInstaller.Runtime.ps1");
  assert.ok(syncIndex >= 0, "fresh install deve sincronizar antes da execução principal");
  assert.ok(relaunchIndex > syncIndex, "fresh install deve relançar após sincronizar");
  assert.ok(runtimeModuleIndex > relaunchIndex, "módulos novos só devem ser carregados após relançar");

  assert.match(installScript, /-ExpectedCommit \$selectedCommit/);
  assert.match(installScript, /Assert-AndonRepositoryCommit -ExpectedCommit \$ExpectedCommit/);
  assert.match(common, /installedCommit = ""/);
  assert.match(common, /Assert-AndonFreshInstallTarget/);
  assert.match(common, /git\.exe/);
  assert.match(common, /"merge", "--ff-only", \$selectedCommit/);
  assert.doesNotMatch(common, /"pull", "--ff-only"/);
  assert.match(bootstrap, /git merge --ff-only \$SelectedCommit/);
  assert.doesNotMatch(bootstrap, /git pull --ff-only/);
});

test("runtime Node usa staging controlado, retry, cópia fallback e rollback validado", async () => {
  const common = await readInstaller("AndonInstaller.Common.ps1");

  assert.match(common, /node\.staging\.\$operationId/);
  assert.match(common, /function Invoke-AndonMoveItemWithRetry/);
  assert.match(common, /function Copy-AndonRuntimeContent/);
  assert.match(common, /fallback seguro por copia/);
  assert.match(common, /Runtime Node anterior restaurado e validado/);
  assert.match(common, /Test-AndonNodeRuntimeAtPath -RuntimePath \$stagingRuntime/);
  assert.match(common, /Test-AndonDedicatedNodeRuntime/);
  assert.doesNotMatch(common, /C:\\Program Files\\nodejs\\npm\.cmd/);
});

test("health check representa PASS WARN SKIP FAIL e empty sem máquina não é crítico", async () => {
  const [common, runtime] = await Promise.all([
    readInstaller("AndonInstaller.Common.ps1"),
    readInstaller("AndonInstaller.Runtime.ps1"),
  ]);

  for (const status of ["PASS", "WARN", "SKIP", "FAIL"]) {
    assert.match(common, new RegExp(`"${status}"`));
  }
  assert.match(common, /-Status "SKIP"[\s\S]*nenhuma maquina livre/);
  assert.match(runtime, /if \(\$writeResult\.Status -eq "FAIL"\)/);
  assert.doesNotMatch(runtime, /if \(!\(Test-AndonApiWrite\)\)/);
});

test("multi-IP permanece escolha explícita e não usa rota automática", async () => {
  const common = await readInstaller("AndonInstaller.Common.ps1");
  const selectionStart = common.indexOf("function Select-AndonServerIp");
  const selectionEnd = common.indexOf("function Ensure-AndonNetworkConfig");
  const selection = common.slice(selectionStart, selectionEnd);

  assert.match(selection, /Read-Host "Escolha o IP/);
  assert.match(selection, /Read-Host "Digite o IP/);
  assert.doesNotMatch(selection, /DefaultIPGateway|Get-NetRoute/);
  assert.doesNotMatch(common, /189\.201\.137\.232/);
});

test("logs de install update repair registram SHA sem expor credenciais em previews", async () => {
  const [common, installScript, updateScript, repairScript] = await Promise.all([
    readInstaller("AndonInstaller.Common.ps1"),
    readInstaller("install-andon-server.ps1"),
    readInstaller("update-andon-server.ps1"),
    readInstaller("repair-andon-server.ps1"),
  ]);

  assert.match(common, /function Protect-AndonLogText/);
  assert.match(common, /POSTGRES_PASSWORD=/);
  assert.match(common, /function Write-AndonInstallerLogLine/);
  assert.match(common, /Add-Content/);
  assert.doesNotMatch(common, /Start-Transcript|Stop-Transcript/);
  assert.match(installScript, /Start-AndonInstallerLog -Operation "install"/);
  assert.match(updateScript, /Start-AndonInstallerLog -Operation "update"/);
  assert.match(repairScript, /Start-AndonInstallerLog -Operation "repair"/);
});

test("parada encerra Node dedicado e Node global legado somente com marcadores inequívocos", async () => {
  const [runtime, stopTool] = await Promise.all([
    readInstaller("AndonInstaller.Runtime.ps1"),
    readRepositoryFile("install-tools/01-parar-servicos-andon.ps1"),
  ]);

  const scenarios = [
    {
      name: "Node dedicado executando a API do ANDON",
      executablePath: "C:\\web-andon-industrial\\runtime\\node\\node.exe",
      commandLine:
        '"C:\\web-andon-industrial\\runtime\\node\\node.exe" "C:\\web-andon-industrial\\andon\\server\\dist\\server.js"',
      expected: true,
    },
    {
      name: "Node global 20.10 executando a API legada do ANDON",
      executablePath: "C:\\Program Files\\nodejs\\node.exe",
      commandLine:
        '"C:\\Program Files\\nodejs\\node.exe" "C:\\web-andon-industrial\\andon\\server\\dist\\server.js"',
      expected: true,
    },
    {
      name: "Node global 20.10 executando o Vite legado do ANDON",
      executablePath: "C:\\Program Files\\nodejs\\node.exe",
      commandLine:
        '"C:\\Program Files\\nodejs\\node.exe" "C:\\web-andon-industrial\\andon\\node_modules\\.bin\\..\\vite\\bin\\vite.js" preview --host 0.0.0.0',
      expected: true,
    },
    {
      name: "Node global executando aplicação externa",
      executablePath: "C:\\Program Files\\nodejs\\node.exe",
      commandLine: '"C:\\Program Files\\nodejs\\node.exe" "D:\\erp\\dist\\server.js"',
      expected: false,
    },
    {
      name: "Node global dentro do projeto sem entrypoint oficial",
      executablePath: "C:\\Program Files\\nodejs\\node.exe",
      commandLine:
        '"C:\\Program Files\\nodejs\\node.exe" "C:\\web-andon-industrial\\andon\\scripts\\utilitario.js"',
      expected: false,
    },
  ];

  for (const scenario of scenarios) {
    assert.equal(matchesAndonNodeOwnershipPolicy(scenario), scenario.expected, scenario.name);
  }

  for (const script of [runtime, stopTool]) {
    assert.match(script, /function Test-AndonNodeProcessOwned/);
    assert.match(script, /\\server\\dist\\server\.js/);
    assert.match(script, /\\node_modules\\/);
    assert.match(script, /\\vite\\bin\\vite\.js/);
    assert.match(script, /Test-AndonNodeProcessOwned/);
    assert.doesNotMatch(script, /Get-Process node[^\r\n|]*\|\s*Stop-Process/i);
  }
});

test("bootstraps V10.5.1 não reaplicam o instalador legado", async () => {
  const [legacyBootstrap, legacyApply] = await Promise.all([
    readRepositoryFile("INSTALAR_ANDON_AMBIENTE_VIRGEM_V10_5_1.ps1"),
    readRepositoryFile("APLICAR_INSTALLER_V10_5_1.ps1"),
  ]);

  for (const script of [legacyBootstrap, legacyApply]) {
    assert.match(script, /INSTALAR_ANDON_SERVIDOR\.ps1/);
    assert.match(script, /obsoleto/i);
    assert.doesNotMatch(script, /FromBase64String/);
    assert.doesNotMatch(script, /Copy-Item.*installer/i);
  }
});

test("desinstalação limpa remove só o runtime dedicado e preservação mantém runtime e banco", async () => {
  const [cleanUninstall, preserveUninstall] = await Promise.all([
    readInstaller("uninstall-andon-clean.ps1"),
    readInstaller("uninstall-andon-preserve-db.ps1"),
  ]);

  assert.match(cleanUninstall, /Remove-AndonLocalDatabaseClean/);
  assert.match(cleanUninstall, /Remove-Item \$Global:AndonNodeRuntimePath/);
  assert.doesNotMatch(preserveUninstall, /Remove-AndonLocalDatabaseClean/);
  assert.doesNotMatch(preserveUninstall, /Remove-Item \$Global:AndonNodeRuntimePath/);
});
