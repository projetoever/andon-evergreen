# REFINE 19 — UX-19 | Paletas industriais e contorno de prioridades

Data: 13/11/2026. Origem: solicitação do painel Aparência e cores com seleção HEX/RGB.

## Alterações desenvolvidas
- **Seis presets de acentos não críticos**, aplicáveis somente à prévia até "Salvar globalmente": Evergreen Industrial, Alto Contraste Escuro, Alto Contraste Claro, Industrial Azul/Aço, Quente Operacional e Tech Neutro.
- O modo claro/escuro da aplicação continua sendo uma preferência separada do usuário/workstation. Os presets são **paletas de acentos**, não um tema de superfícies completo nesta primeira etapa.
- **Contorno de prioridades** como sexto campo da paleta global. Afeta exclusivamente o contorno decorativo do grupo de máquinas priorizadas no dashboard, nunca gravidade, parada, atenção, alarme ou leitura de status de máquina.
- O valor padrão é #F97316; sem override, CSS preserva border-orange-500/70 existente. Cores personalizadas só aplicadas pela variável CSS allowlist **--andon-palette-priority-border**.
- Previews dark/light e aviso se alguma borda ficar abaixo de 3:1 em relação ao card/fundo. A advertência é consultiva; não implica comprovação WCAG para texto nem altera indicador crítico.
- A persistência continua no endpoint de paleta atual, com ACL, Origin, CSRF, HTTPS, expectedRevision otimista, auditoria e flag global existentes. **Nenhuma ampliação de permissões, alteração de banco ou ativação de flags**.
- **Compatibilidade aditiva:** os registros JSON v1 existentes com cinco campos são aceitos e normalizados com priorityBorder padrão; rejeitam-se chaves extras e qualquer CSS fora dos cinco nomes antigos ou seis HEX válidos. O novo formato v1 inclui sexto campo. Antes de instalar, validar rollback para clientes antigos que conheçam apenas os cinco campos.
- O botão de preset não grava imediatamente e pode ser revertido; o Admin precisa confirmar o salvamento global.
- Três idiomas PT/EN/ZH.

## Critérios de aceite em notebook
1. Abrir Painel Admin > Aparência e cores, conferir seis presets, amostras e seis seletores HEX/RGB.
2. Selecionar cada preset e comparar prévia escura/clara, foco, contorno prioridade e aviso de contraste.
3. Garantir que disparos físicos, chamadas, stop/warning, sirenes, GPIO, Node-RED e relatórios não são alterados.
4. Salvar uma cor de prioridade com estação/admin autorizado, verificar API revision, auditoria e propagação para segunda estação.
5. Abrir histórico legado com paleta de cinco campos e confirmar cores preservadas e prioridade preenchida.
6. Validar erro 409 com duas sessões admins editando simultaneamente e botão de restauração; verificar offline e refresh.
7. CI Windows PowerShell 5.1, Linux/PostgreSQL, compilação, testes de regressão e i18n.

## Pesquisa oficial que orientou a arquitetura
- Ignition Perspective 8.3: light/dark + warm/cool, variáveis CSS, recomendação de temas derivados customizados.
- SAP Fiori: opções light/dark e alto contraste; personalização central.
- Siemens WinCC Unified: paleta e gestão central de cores.
- FactoryTalk Optix: bibliotecas de stylesheets e seleção HEX/RGB.

## Continuação
UX-19B: temas completos de superfícies e tipografia por empresa/unidade com política de contraste e exportação/importação de presets validados.
INS/DNS: endereço HTTPS profissional por DNS e certificados, documentação no instalador e menu (sem depender de .local reservado a mDNS).
CONNECT: hub de integrações extensíveis CLP, OPC UA, MQTT, Modbus, SAP PM/EAM, inventário de ativos, máquinas/conjuntos/subconjuntos, validação/dry-run e log de importação.
