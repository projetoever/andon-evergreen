ANDON WEB INDUSTRIAL - INSTALLER V10.5.1 OFICIAL

Marco validado no notebook:
- PostgreSQL via Docker recomendado
- PostgreSQL local Windows avancado/compatibilidade
- databaseMode salvo em C:\web-andon-industrial\andon-config.json
- .env gerado a partir da config global
- build frontend em modo API dinamica
- health check com teste real de escrita API
- desinstalacao Docker tolerante a container/volume inexistente
- Chrome Kiosk robusto: tarefa + fallback direto

Como aplicar em maquina que ja tem C:\web-andon-industrial:
1. Extrair este pacote.
2. Executar como Administrador: APLICAR_INSTALLER_V10_5_1.bat
3. Usar: C:\web-andon-industrial\ABRIR_MENU_ANDON.bat

Ambiente virgem:
Use INSTALAR_ANDON_AMBIENTE_VIRGEM_V10_5_1.ps1.
Esta versao ainda nao instala Git, Node.js, Docker Desktop ou PostgreSQL local automaticamente.
Essa automacao fica para a proxima etapa do produto.
