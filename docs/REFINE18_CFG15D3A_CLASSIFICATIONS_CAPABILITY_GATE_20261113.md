# REFINE 18 — CFG-15D3A | Classificações do Admin em acesso central

Data: 13/11/2026. Continuação de #497–#499.

## Situação verificada
`AdminSettingsModal.tsx` renderizava a aba Classificações com botões e campos de criação/edição/ativação sempre operacionais mesmo quando o servidor informava `centralClassificationWriteEnabled: false`. O guard real `server/src/security/centralClassificationHttp.ts` suporta somente `POST /api/failure-classifications` e `PATCH /api/failure-classifications/:id`, sob flag OFF por padrão, sessão, workstation, ACL, CSRF e auditoria.

## Alterações
- ClassificationsTab recebe `centralAccess` do Admin e consulta `getSystemSettings()` apenas em modo central. O gate `canWriteClassifications` nasce false e só fica true com capability explícita true.
- Quando a capability está ausente, desligada ou falha ao carregar, mantém lista, filtros, seleção e tentativa de nova consulta; impede POST/PATCH no botão e nos handlers.
- Inputs de nome, ID, responsabilidade, classificação BI e ativo ficam read-only em acesso central sem escrita; ativar/inativar idem.
- Continua possível editar via fluxo legado quando `centralAccess === false`; nem flags nem ACL foram alteradas.
- Teste de regressão em `tests/adminUxRefinementA.test.ts`, que já participa da CI; sem mudanças no backend ou em dados históricos.

## Limites
A capability não é autorização do usuário. O backend continua validando permissões por operação. Nunca deduzir direito de escrita da presença da aba. Sem hardware industrial, banco de fábrica, Node-RED, GPIO ou CLP.

## Critérios de conclusão
CI Windows PowerShell 5.1 e Linux/PG/API/SSR/frontend/desktop/mobile verdes; depois merge; teste real de perfil e flag OFF/ON no notebook (ainda não executado). A aba Máquinas será tratada separadamente em CFG-15D3B.
