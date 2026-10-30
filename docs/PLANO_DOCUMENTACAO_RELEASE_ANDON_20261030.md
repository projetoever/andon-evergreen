# ANDON Web Industrial — Plano de documentação do release de entrega

**Registrado em 30/10/2026 a pedido do proprietário.**

Este documento reserva como requisito obrigatório **após a estabilização técnica e antes da entrega** uma atualização integral do GitHub, README e documentação de todo o ecossistema. A existência deste plano **não significa que as funcionalidades estejam homologadas ou implantadas**.

## Momento e ordem

1. Finalizar PRs de segurança e fluxo de primeiro acesso (PR #297 e sucessores); aprovar CI Windows/Node/PostgreSQL/HTTPS; **não realizar merge ou deploy sem autorização**.
2. Homologar os 11 cenários funcionais no notebook isolado, seguindo `docs/SEC04_NOTEBOOK_HOMOLOGATION_11_CHECKLIST_20261030.md` (sem dados industriais).
3. Concluir evoluções visuais **#288** (tema claro/escuro por terminal), **#289** (paleta global com preset atual) e **#291** (alerta Discreto/Destacado por terminal), sempre com testes visual/teclado/acessibilidade e regressão.
4. Rever pendências de migração de escritas/contas Admin, acesso de serviços industriais, workstations e segurança de HTTPS. A gestão central pode permanecer OFF por padrão.
5. Executar regressão final por módulo, telas 16:9/kiosk/mobile, traduções PT/EN/ZH-TW e cenários de operação.
6. **Então** atualizar README e conjunto de documentos em um PR específico de documentação, com inventário de funcionalidades **verificado no código e testes**, sem publicidade de funções ainda não suportadas.
7. Preparar pacote versionado e manual de deploy/rollback, solicitar autorização específica para a implantação industrial.

## Checklist do futuro PR de documentação

- [ ] **README.md principal**: apresentação do produto, diagrama do Hub, módulos, instalação, versões suportadas, pré-requisitos, execução, links para manuais, diferenças entre demonstração, homologação e produção, status de maturidade/limitações, segurança e suporte.
- [ ] **Matriz de funcionalidades por módulo**: Dashboard ANDON, abertura/atendimento/acompanhamento/encerramento, múltiplos técnicos, parada física, OS, diagnóstico, cancelamento, histórico, sets/subsets, prioridade, PIN/RFID, sons, cores e idiomas; distinguir disponível, opt-in, piloto, planejado.
- [ ] **ANDON BI**: visão geral, métricas e fórmulas MTTA/MTTR/MTBF/disponibilidade/downtime, jornada programada, exclusões de teste, classificação de responsabilidade, dados ausentes/N/A, filtros, exportação PDF e limites metodológicos.
- [ ] **Hub e segurança**: autenticação por usuário, conta Admin central vs credencial global, instalação inicial sem senha de fábrica, política de senhas, primeiro acesso, perfis/permissões por ação, workstations/admissão, escopo de máquina, sessões, auditoria, recuperação e fluxos de negação.
- [ ] **Administração e operação**: telas de configuração, inventário de workstations, presença real vs último acesso, versão/SHA, identidade empresa/unidade, configurações globais vs preferências individuais por terminal.
- [ ] **Infraestrutura e instalador**: Windows Server, Node dedicado, PostgreSQL, portas, transporte HTTP/HTTPS, certificados/SAN, firewall, variáveis de ambiente, instalação limpa vs update vs reparo, watchdog, kiosk, backups, restauração e limpeza.
- [ ] **Integrações industriais**: Node-RED, payloads/estados, PLC, GPIO, serviços industriais, condições de validação e proibições de alteração durante homologação; nunca incluir segredos, dados reais ou topologia sensível.
- [ ] **Qualidade/entrega**: roteiro de homologação 11 cenários, cenários adicionais, testes CI, evidências sanitizadas, matriz de aceite, troubleshooting, plano de rollback e nota de release com comparação entre commits.
- [ ] **Exemplos**: dados sintéticos, imagens de tela atualizadas após testes, instruções para Admin e operadores, glossário e FAQ.
- [ ] **Identidade comercial**: marca neutra ANDON Web Industrial, empresa/unidade configuráveis; não confundir customização cliente com defaults industriais.

## Critérios para declarar documentação pronta

Cada afirmação funcional deve apontar para código/teste ou evidência de homologação. Todo endpoint citado deve estar no inventário e indicar autenticação e condição de habilitação. Verificar links, versões, telas atuais, comandos reais e caminhos Windows. Não expor PIN, senha, hashes, certificados/chaves, IPs industriais externos ou dados pessoais. **Documentação é condição de entrega**, não adendo opcional.

Referências: roadmap issue #232, PR #296, PR #297, issues #288/#289/#291 e checklist consolidado de homologação.
