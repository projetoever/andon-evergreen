# REFINE 15 — Critérios de produto comercial para instalador, health e HTTPS

**Registrado em 12/11/2026 após incidente real no notebook.** Documento normativo para todos os próximos chats REFINE até conclusão; acompanhar GitHub issue #232 e diário Google Drive EV-108 em diante.

## Contexto do piloto

- Desenvolvimento **exclusivamente pela `main` oficial**, GitHub `projetoever/andon-evergreen`. O ambiente HML antigo está fora do fluxo ativo.
- Notebook: `C:\web-andon-industrial\andon`, Node dedicado 22.23.2, banco PostgreSQL Docker `127.0.0.1:5432/andon_db`, API HTTPS 3001, frontend HTTPS 8080, acesso central habilitado, IP Wi-Fi usado no último teste `192.168.68.100` (não presumir IP estático).
- Destino final: Windows Server 2016 e banco original da fábrica, que **não devem ser tocados antes de release controlado, backup, restore isolado e aceite explícito**.
- Evidência: depois de uma atualização bem-sucedida, menu 14 HTTPS rede mkcert tentou desligar login central; a transação restaurou config, mas serviços permaneceram parados; corrigido pela PR #459. Em seguida, menu 6 confundiu `GET /api/machines` anônimo 403 (proteção normal) com API quebrada; corrigido na PR #460.
- Smartphone no mesmo Wi-Fi não carregava `https://192.168.68.100:8080/hub`. O fato de a URL responder no notebook **não demonstra** conectividade externa. Sem mensagem de erro do celular ou teste remoto, causa é indeterminada.

## 1. Contrato imutável do menu

| Opção | Contrato de comportamento |
|---|---|
| 2 — Atualizar pela main | Validar repositório/SHAs, identidade do banco local e credenciais; gerar e testar backup/restauração isolada; migrar sem seed; validar runtime, HTTPS, permissões; falha clara e nenhum sucesso falso; preservar banco e parâmetros. |
| 4 — Iniciar ANDON | Idempotente, acionar somente tarefas/processos ANDON, verificar prontidão da API e frontend, manter segurança central; limites de espera e mensagens específicas; não modificar firewall/TLS/DB sem autorização. |
| 5 — Parar ANDON | Parar somente recursos ANDON, explicar se é pré-requisito para uma troca de certificado; preservar banco. |
| **6 — Verificar saúde** | **Somente leitura e previsível**: sem start/stop/autoheal, sem criar/cancelar chamados ou dados de teste, sem alterar firewall, certificados, CA, confiança, settings ou tarefas. Testar runtime, banco, readiness, frontend, acesso central, bind, firewall, TLS; separar `OK` serviço, `AVISO` investigação e `FALHA` real. Exibir latência e diagnóstico acionável, também quando um componente falhar. Não recomendar `reparar` genericamente. |
| **14 — HTTPS** | Checar pré-condições antes de alterar configuração, exigir seleção explícita de IP de interface física/DNS corporativo, nunca alterar `centralAccessEnabled` silenciosamente, proteger privates/certificados, permitir cancelar sem parada desnecessária, fazer transação reversível e relatar claramente se o runtime precisa reiniciar. **Sem downgrade para HTTP quando acesso central ativo.** |

## 2. Segurança HTTPS e acesso por dispositivo

1. Verificar a **cadeia de confiança do cliente** separadamente da validade e do SAN do certificado do servidor. `mkcert` é CA de homologação instalada localmente, **não é certificado corporativo e não é confiável por padrão no smartphone**. Não compartilhar a chave da CA nem desativar validação TLS.
2. Em outro aparelho, testar primeiro `https://<IP>:3001/health` e depois `https://<IP>:8080/hub`. Classificar: timeout/sem TCP, aviso TLS, carregamento do Hub, 401/403 da sessão/workstation. Jamais abrir permissões anonimamente para contornar falhas.
3. Diagnóstico de IP da interface Wi-Fi atual, bind `0.0.0.0` vs `127.0.0.1`, perfil `Public/Private`, regras inbound com origem restrita, isolamento de clientes Wi-Fi/guest e DHCP. IP e porta de servidor não devem ser presumidos permanentemente.
4. Acesso central requer cookie seguro, CSRF, credenciais e workstation aprovada; **401/403 sem autenticação no endpoint operacional é esperado**. Se GET anônimo às máquinas retorna 200 enquanto central ON, isto é **falha de segurança**.
5. Acesso móvel deve permanecer um cliente **opcional e controlado**, sem depender de agente físico e sem autorizar controle indevido de workstations/máquinas. Não inventar identidade física por IP.

## 3. Desempenho e confiabilidade

- Medir, não apenas prometer: cronômetro para `/health`, `/health/db`, `/health/ready` e frontend; sinalizar lentidão repetida. Health interativo deve ter timeouts curtos e definidos, sem dormir 15 s nem executar reparos implícitos.
- Testar cold start e restart, reconexão após perda Wi-Fi, certificado revogado/expirado, IP novo, browser desktop/mobile, duas estações concorrentes, sessão expirada e permissão negada.
- Não assumir que HTTPS resolvido no próprio notebook implica latência ou disponibilidade aceitável na rede; medir cliente real e servidor.
- Falha da sirene GPIO/Node-RED não pode impedir os sons originais do navegador nem a abertura de chamados.
- Eventos físicos e KPIs não devem ser adulterados por testes automáticos do instalador.

## 4. Aceite/exit gates

- [ ] Cada PR pequena passa CI completa Windows PowerShell 5.1, build, PostgreSQL isolado e fluxos críticos/browser sem alterar fábrica.
- [ ] Menu 6 no notebook retorna saúde local real sem erro falso 403, sem escrituras; quando serviço cai, continua imprimindo diagnóstico de rede e causa provável.
- [ ] Menu 14 em HTTPS de rede com login central ON preserva perfil e certificado válido; cancelamento/erro deixa estado anterior íntegro e comunica necessidade de reiniciar apenas se houve parada.
- [ ] Smartphone de testes no mesmo Wi-Fi alcança API `/health` e Hub com HTTPS confiável no dispositivo, sem bypass de certificado; eventual workstation é registrada/aprovada conforme regra central.
- [ ] Verificar latências de API/UI no notebook e smartphone com evidências, sob carga normal e reentrada/reconexão.
- [ ] Validar temas, modal RGB/HEX, abertura de chamados, OS duplicada, histórico antigo, som, sessão kiosk, perfis e BI, inclusive após cold start.
- [ ] Auditar 33 controles, dependências, regras de firewall abrangentes e riscos de publicação de serviço na rede antes de liberar produção.
- [ ] Liberar na fábrica somente SHA fixo, backup restaurável, plano de rollback validado e aprovação expressa do responsável.

**Princípio:** estabilidade do notebook simula o servidor, mas não basta passar em CI: só aceitar componentes com comportamento comprovado, erros claros e segurança mantida. Registrar em cada novo REFINE o que está em `main`, o que está em PR, o que foi instalado no notebook e o que foi efetivamente testado.
