$ErrorActionPreference = "Stop"

$CommonPath = Join-Path $PSScriptRoot "AndonInstaller.Common.ps1"

if (!(Test-Path $CommonPath)) {
    Write-Host "ERRO: biblioteca comum nao encontrada:" -ForegroundColor Red
    Write-Host $CommonPath
    exit 1
}

. $CommonPath

Write-AndonHeader "ANDON - CONFIGURACAO DE REDE"

if (!(Test-AndonAdmin)) {
    Write-AndonFail "Execute este script como Administrador."
    exit 1
}

Write-Host "Esta rotina configura o IP oficial do servidor ANDON para acesso em rede."
Write-Host ""
Write-Host "Ela atualiza:"
Write-Host "- installer\andon-network.config.json"
Write-Host "- server\.env com CORS_ORIGINS"
Write-Host ""

$networkConfig = Select-AndonServerIp

if (!$networkConfig) {
    Write-AndonFail "Configuracao de rede cancelada ou invalida."
    exit 1
}

Write-AndonBackendEnv -NetworkConfig $networkConfig -PreserveExisting

Write-Host ""
Write-AndonOk "Configuracao de rede concluida."
Write-Host ""
Write-Host "IP configurado:       $($networkConfig.serverIp)"
Write-Host "API configurada:      $($networkConfig.apiUrl)"
Write-Host "Frontend esperado:    $($networkConfig.frontendUrl)"
Write-Host "CORS_ORIGINS:         $($networkConfig.corsOrigins)"
Write-Host ""
Write-AndonWarn "Para aplicar este IP no frontend, rode em seguida a opcao 2 - Atualizar pela main."
Write-Host ""
