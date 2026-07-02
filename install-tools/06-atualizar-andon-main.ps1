$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$ToolsPath = "$BasePath\andon-tools"

Write-Host "===== ANDON - ATUALIZAR PELA MAIN ====="
Write-Host "Preserva banco. Nao executa db:seed."

if (!(Test-Path $ProjectPath)) {
    Write-Host "ERRO: Pasta do projeto nao encontrada: $ProjectPath"
    exit 1
}

if (Test-Path "$ToolsPath\01-parar-servicos-andon.ps1") {
    powershell.exe -ExecutionPolicy Bypass -NoProfile -File "$ToolsPath\01-parar-servicos-andon.ps1"
}

Set-Location $ProjectPath

git fetch --all --prune
if ($LASTEXITCODE -ne 0) { exit 1 }

git checkout main
if ($LASTEXITCODE -ne 0) { exit 1 }

git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: git pull falhou. Verifique alteracoes locais com git status."
    exit 1
}

Set-Location "$ProjectPath\server"

Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue

npm.cmd install --include=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { exit 1 }

npm.cmd run db:generate
if ($LASTEXITCODE -ne 0) { exit 1 }

npm.cmd run db:migrate
if ($LASTEXITCODE -ne 0) { exit 1 }

npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit 1 }

Set-Location $ProjectPath

Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue

npm.cmd install --include=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { exit 1 }

$env:VITE_ANDON_DATA_MODE="api"
$env:VITE_ANDON_API_BASE_URL="http://localhost:3001"

npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit 1 }

New-Item -ItemType Directory -Force $ToolsPath | Out-Null

if (Test-Path "$ProjectPath\install-tools") {
    Copy-Item -Force "$ProjectPath\install-tools\*.ps1" "$ToolsPath\"
} else {
    Write-Host "AVISO: install-tools nao encontrado no projeto. Mantendo ferramentas atuais em andon-tools."
}

if (Test-Path "$ToolsPath\09-recriar-tarefas-automaticas-andon.ps1") {
    powershell.exe -ExecutionPolicy Bypass -NoProfile -File "$ToolsPath\09-recriar-tarefas-automaticas-andon.ps1"
}

if (Test-Path "$ToolsPath\04-iniciar-servicos-andon.ps1") {
    powershell.exe -ExecutionPolicy Bypass -NoProfile -File "$ToolsPath\04-iniciar-servicos-andon.ps1"
}

Write-Host "===== ATUALIZACAO PELA MAIN FINALIZADA ====="
