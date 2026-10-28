# B2.4C / Etapa 2 — Participação de manutenção por máquina autorizada
Data: 28/10/2026. Sequência do PR #236, B2.4C/1.

## Escopo
A rota `GET/HEAD /api/analytics/maintenance` passa a aceitar sessões centrais de usuários com `bi.read` e escopo selecionado. Permissões, origem, HTTPS, workstation e validação da sessão são conferidas pelo middleware central existente antes da rota. O contexto das máquinas permitidas é associado **pelo servidor**, não por parâmetros do usuário.

## Isolamento e política
- A lista de máquinas autorizadas é aplicada diretamente em `TechnicianSession.machineId`, antes da consulta SQL, inclusive quando o cliente não informa uma máquina.
- O `AndonCall` relacionado deve pertencer a uma máquina também autorizada; um vínculo histórico inconsistente entre Máquina 37 e chamado da Máquina 38 não expõe participação, nome, OS ou responsabilidade da outra máquina.
- Uma máquina explicitamente fora do escopo recebe HTTP 404 **antes** de consultar o catálogo de falhas ou técnicos.
- Um usuário sem máquinas possui resultado vazio (sem técnicos ou pessoa-minutos). Usuários com `machineScope=all` e modo legado preservam as consultas originais.
- O cálculo de pessoa-minutos, união temporal por técnico, acompanhamento, classificação e tempos de manutenção **não foi modificado**.

## Testes
- `scopedBiMaintenance.test.ts` verifica escopo SQL para máquina selecionada, zero máquinas, global, origem sem vínculo de contexto autorizado, vínculo cruzado e modo legado.
- `workstationAccess.test.ts` passa a garantir binding central no GET/HEAD da nova rota.
- `centralScopedMachineReads.test.ts` restringe métodos permitidos a GET/HEAD.

## Bloqueios preservados
As rotas `/api/analytics/reliability`, `/failure-intelligence`, `/temporal`, `/data-quality-details` e agregações restantes **continuam não homologadas para contas centrais com escopo de máquinas selecionadas**. Não ativar gestão central no servidor industrial. Sem deploy, alterações no banco, Node-RED, GPIO, HTTPS ou estação 37.
