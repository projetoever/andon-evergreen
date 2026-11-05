# REFINE 9.3 — Tela fixa, identidade de workstations e futuro Agente ANDON

**Data:** 05/11/2026. **Escopo:** notebook LAB HTTPS, baseado na PR #348 (REFINE 9.2). Sem merge ou deploy.

## Diagnóstico do feedback HML

1. Foram vistos dois registros da mesma origem aparente, ambos com IP `127.0.0.1`: a estação atual `Admin — 8599fe7f` e a anterior `Admin local inicial`. Eles têm UUIDs distintos.
2. A identidade atual é um UUID `ws_...` guardado no cookie `andon.workstationId` e no `localStorage`; o usuário apagou cookies para sair da conta em teste. Isso pode invalidar a continuidade e criar novo registro. Mudança de origem/porta e conflito entre cookie e localStorage também podem produzir identidades distintas.
3. **IP não é prova de hardware:** localhost e IP de saída compartilhado/NAT são comuns a várias workstations. Não unir por IP automaticamente. Workstations já criadas podem conter chamados, sessões, vínculos, bloqueios e trilhas de auditoria.
4. O modal 'Desbloquear tela fixada' usa `AdminLoginModal` e `/api/admin-auth/login`, endpoint legado que é bloqueado em acesso central. A senha central correta não consegue desbloquear. Além disso, a rota central de preferência de tela aceitaria `machineId:null` sem comprovação separada de uma credencial autorizada: corrigir também o backend.

## Pacote de correção R9.3

| ID | Tarefa | Situação |
|---|---|---|
| R9.3-01 | Corrigir desbloqueio da tela fixa para fluxo de credencial central, com conta Admin principal OU mantenedor ativo autorizado na máquina, com permissão explícita de ler ANDON e atender chamados; nenhum login do operador é substituído | Código na branch; CI e HML pendentes |
| R9.3-02 | Impedir desbloqueio direto pela rota de preferências de workstation no modo central; usar endpoint HTTPS/CSRF exclusivo, limitação de tentativas, transação e auditoria, sem alterar chamados | Código na branch; CI e HML pendentes |
| R9.3-03 | Avisar sobre registros com mesmo IP, apresentar identificadores distintos e status, sem deduplicar automaticamente; reforçar que cookie/browser não prova dispositivo físico | Código na branch; CI e HML pendentes |
| R9.3-04 | Agente local com identidade física persistente para workstations da fábrica | **Planejado, não implementado**; depende do desenho abaixo |
| R9.3-05 | Controle remoto administrativo de workstations via agente | **Planejado, não implementado**, requer aprovação adicional de arquitetura/segurança |
| R9.1-03 | Seleção por nome no atendimento central | **Pendente**; GitHub #345 |
| R9-05…08 | Kiosk confiável, sessão contínua, revogação remota, heartbeat e presença confiável | **Pendente**; integrar com futuro agente, sem antecipar privilégios |

## Regras de desbloqueio central

- A sessão atual precisa estar válida e autorizada a visualizar a máquina. Um técnico de Manutenção informa **seu próprio usuário e senha**, com `andon.read` + `calls.attend` e escopo dessa máquina; o Admin principal também pode informar suas credenciais.
- Conta Produção, conta inativa, kiosk e quem não tem máquina ou permissão adequada não desbloqueiam. Credenciais corretas sem autorização continuam insuficientes.
- O backend checa a senha real da conta central; não usa `/api/admin-auth/login` legado. O endpoint `/api/access/workstations/screen-unlock` exige TLS, Origin, cookie de sessão HttpOnly, CSRF, identidade de workstation e rate limit; valida a conta de quem autorizou e salva auditoria na mesma transação que limpa `lockedMachineId`.
- A sessão do operador não muda; não se cria sessão Admin nem se desliga máquina, chamado, alarmes, GPIO, CLP ou Node-RED.
- Os atalhos antigos de `PATCH /api/workstations/:id/screen-lock` só podem **fixar**; desfazer por essa rota é proibido no modo central.
- Em modo legado, a compatibilidade do fluxo Admin antigo é preservada. Se o estado de ACL central ainda não estiver disponível, o cliente deve falhar fechado e não recorrer ao login legado por engano.

## Programa futuro — Agente ANDON por máquina

### Fase A — Identidade e matrícula
- Windows Service ou agente supervisionado no mini PC/terminal industrial, com ID de agente aleatório persistido em armazenamento protegido do sistema (ACL SYSTEM/Administradores, idealmente chave privada não exportável/TPM), separado do ID de navegador e do usuário.
- Matrícula controlada por Admin com código único de validade curta, aprovação vinculada a workstation/máquina e emissão de credencial mTLS ou token assinado de curta duração, revogável/rotativo. Nunca identificar só por IP/MAC/hostname, que podem mudar ou ser duplicados.
- Ao recriar cookie ou perfil do navegador, o agente **recomprova** o vínculo do terminal; servidor decide se realocar o ID. Não reescrever histórico nem mesclar automaticamente workstations com chamadas/sessões em atividade.
- Registrar versões de agente, host, OS, última verificação, conectividade, certificado, hashes assinados do instalador e última autorização. Não coletar dados pessoais desnecessários.

### Fase B — Telemetria e presença precisa
- Heartbeat autenticado do agente, diferente de `/api/access/heartbeat` da sessão humana. Detectar online, offline e perda de comunicação, com carimbo de tempo do servidor e janela de tolerância. Sem estender o timeout de usuário.
- Inventário de estados: aplicação iniciada, serviço rodando, versão, diagnóstico de conectividade, alimentação e status do navegador kiosk. Monitoramento de Node-RED/GPIO somente leitura e inicialmente desabilitado.

### Fase C — Administração remota controlada
- Ações limitadas e auditáveis: solicitar atualização de status, reiniciar apenas o frontend kiosk, invalidar sessão humana da workstation, aplicar configuração aprovada e solicitar logs técnicos sanitizados. Exigir reautenticação recente do Admin, justificativa, confirmação e proteção contra ações na workstation Admin atual.
- Acesso remoto à tela, caso necessário: fluxo separado, consentimento/indicação visível no terminal quando aplicável, solução corporativa autorizada, TLS, logs de sessão; **sem** acesso irrestrito a shell/execução de comandos arbitrários, CLP, GPIO ou desligamento de máquinas.
- Fila de comando com expiração, nonce, idempotência, assinatura, recebimento e resultado. Revogação do agente interrompe comandos futuros.
- Construir e homologar o agente em LAB dedicado antes de qualquer instalação na fábrica. Preparar rollback e auditoria. Nenhuma integração física sem liberação expressa.

## Portões

G0 — Mudanças de código / testes unitários: em desenvolvimento.
G1 — CI Windows/backend/PostgreSQL/navegador: pendente.
G2 — Backup e restauração do banco HML antes de atualizar: responsabilidade do operador no notebook.
G3 — HML visual: usuário validará desbloqueio com Admin e Manutenção autorizada, senha inválida, Produção, mudança de usuário, status das duas workstations e chamados inalterados.
G4 — Merge/release: **não autorizado nesta etapa**.
G5 — Banco oficial / servidor da fábrica / mini PC / GPIO/Node-RED/PLC: **fora do escopo**.

Referências: PR #348 (base): https://github.com/projetoever/andon-evergreen/pull/348 ; diário Google Drive: https://docs.google.com/document/d/14ctodyrT2xsVgEf3IKPBqJ8FV_cJl5KDhTVJjHS3ZCE/edit ; planilha mestre https://docs.google.com/spreadsheets/d/1Jh0AqVL0YsNzGhss1xyM-XnfV5MGDbzH/edit .
