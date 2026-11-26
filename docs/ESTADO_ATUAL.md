# Estado atual — ANDON Web Industrial

**Revisão documental:** 25/11/2026 · **Canal:** piloto `1.0.0-pilot.3`  
**Fonte verificada:** `main@6018335c6f085757a0fd35faed8a2893f4f03e0a`.  
**Importante:** versão de código integrado **não** significa que este SHA esteja instalado ou homologado no notebook/servidor industrial. Veja [DOC 1](DOC1_MARCO_20261125.md).

## Arquitetura efetiva da linha piloto
- Web frontend via Hub e módulos ANDON, Histórico, Prioridades, BI e painéis administrativos.
- Backend Node.js/Fastify + Prisma com PostgreSQL persistente.
- Controle de usuários, sessão, permissões, escopo de máquinas e workstations; ações protegidas no servidor.
- Operações industriais registradas em histórico e eventos auditáveis.
- Instalador Windows do piloto, Health, scripts de atualização e recuperação documentados; `release-manifest.json` é a fonte da versão de instalação (`1.0.0-pilot.3`).
- Configurações de rede, PostgreSQL e transporte variam por perfil e ambiente; não extrapolar HTTPS de laboratório para fábrica.

## Funcionalidades presentes no código da main
1. **ANDON operacional:** máquinas, setores/grupos, chamados e OS conforme política, múltiplos técnicos, atendimento/acompanhamento/encerramento e histórico.
2. **Dashboard:** cards com setor e grupo, status e rótulos de máquinas mais legíveis; destaques configuráveis de prioridades P1..Pn.
3. **Prioridades:** sequência, visão de programação independente do rank, operação sujeita a permissão, concorrência e auditoria.
4. **Histórico Global:** filtros, navegação, identificação dos participantes, tempos individuais e indicadores de parada.
5. **BI:** indicadores com regras de elegibilidade/coortes, filtros, visuais interativos e estados de falta de amostra; gráficos revisados para leitura/contraste.
6. **Hub/Admin/Auditoria:** menus conforme autorização, configuração, `audit.read` e `audit.export`, log central e exports protegidos.
7. **Mobile (MOB 1):** refinamento responsivo integrado, ainda **sem aceite funcional comprovado em aparelhos reais**.

Os detalhes e PRs estão em [Matriz DOC 1](DOC1_MATRIZ_FUNCIONAL_20261125.md); os critérios de integridade em [Metodologia BI](BI_METODOLOGIA_E_QUALIDADE.md). A documentação REFINE e PENTE mais antiga permanece como registro de evolução, não é automaticamente o estado final da main.

## Distinção de estados
- **Integrado:** código mesclado em main; SHA de referência acima.
- **CI:** último workflow da PR MOB 1 [45724520894](https://github.com/projetoever/andon-evergreen/actions/runs/45724520894) consta como `success`; executar novamente os gates pertinentes se o SHA de release mudar.
- **Homologação:** ainda precisa completar cenários DOC1-H01..H12 no notebook e dispositivos reais.
- **Implantação fabril:** não inferida e não realizada nesta atualização documental.
- **Comercialização:** requer aceite de segurança, suporte, licença/direitos e pacote documentado.

## Próximos gates
Revisar mudanças paralelas, congelar o SHA candidato, validar backup e restaurabilidade em ambiente isolado, homologar por perfil/módulo, construir manuais com screenshots dessa versão, gerar release notes e entregável com código após autorização. A documentação pública evita segredos e topologia interna de clientes.
