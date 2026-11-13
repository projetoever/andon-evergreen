# REFINE 19 — CFG-15F | Configurações operacionais com gate atualizado

Data: 13/11/2026. Issue #477, sequência CFG-15B (#521) e CFG-15C/D/E.

## Problema
A aba Configurações da operação carregava o gate `centralOperationalSettingsWriteEnabled` uma vez, ao montar ou no botão de atualização manual; o aviso de capacidade das 11 abas já reagia a troca de aba/foco/evento, criando estados visuais divergentes quando o servidor alterava a liberação.

## Implementação
Revalidar por GET da API na montagem central, foco e SYSTEM_SETTINGS_CHANGED_EVENT. Bloquear ações de escrita enquanto o GET estiver pendente ou falhar; ignorar respostas de consultas antigas por versão e limpar listeners. Reaproveitar a atualização explícita de dados existente, guardando sua verificação contra respostas antigas. A revalidação da capacidade não altera os campos de OS, teclado virtual, restrição de finalização ou ordem do dashboard, preservando o estado da interface até ação explícita do usuário.

## Segurança e aceite
Somente React; sem flags novas, endpoints, ACL, banco, CLP, GPIO ou produção. Operações de sistema continuam em suas rotas PATCH com CSRF, sessão, workstation e logs existentes. Teste CFG-15F verifica fail-closed, revalidação, cancelamento de resposta antiga e não descarte de campos. CI Windows 5.1/Linux/PostgreSQL e teste posterior no notebook oficial.
