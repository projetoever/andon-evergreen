# DOC 1 — Arquitetura editorial do entregável profissional

**Data:** 25/11/2026 · **Status:** plano, não kit final publicado.  
**Índice oficial de referência no Drive:** `ANDON-00-GOV-001_Indice_Mestre_Documentacao_1.0.0-pilot.3`. Preservar os arquivos históricos, revisar em nova versão, não sobrescrever evidências antigas.

## Conjunto documental por pasta do pacote 1.0.0-pilot.3
| Pasta | Documento-alvo | Público | Aceite editorial |
|---|---|---|---|
| 00 — Comece aqui | Leia-me da versão; índice e matriz documental; notas de release; critérios e termo de aceite | Todos | SHA, instalador, status, limites, links verificados |
| 01 — Apresentação geral | Visão executiva; arquitetura lógica sem dados sensíveis; benefícios esperados sem alegações econômicas não medidas | Liderança/cliente | Escopo entregue versus roadmap distinguível |
| 02 — Manuais de uso | Operador; manutenção; liderança; Hub/Admin; Prioridades; Histórico; BI; Auditoria; Mobile | Usuários por papel | Telas reais, permissão, passos e resultados testados |
| 03 — Instalador e suporte | Instalação/atualização; dados e backup; recuperação; troubleshooting e escalonamento | TI/suporte | Comandos reais, rollback e Health verificados |
| 04 — Código-fonte | Release tag/SHA, manifest, dependências, build/testes, esquema de licenciamento e checksum | Engenharia | Pacote reproduzível e direito de distribuição revisado |
| 05 — Identidade visual | Temas, ícones, cores, responsividade e orientação TV/mobile | UX/treinamento | Capturas sanitizadas do SHA congelado |
| 90 — Técnico e controle | Arquitetura, API, modelo de dados, ACL, auditoria, regras BI, matriz QA, histórico de mudanças | Equipe técnica | Evidência rastreável por PR/caso/versão |

## Padrão de cada manual de módulo
1. Identificação e edição do documento; versão do sistema e SHA de referência.
2. Objetivo e público-alvo; pré-requisitos, acesso e permissões.
3. Visão geral da tela; mapa de navegação e elementos principais.
4. Procedimentos numerados de operação normal, com imagens anotadas reais.
5. Estados excepcionais, mensagens, 401/403/409, “Sem amostra” e contingência.
6. Regras de negócio e diferenças por perfil/máquina, se aplicável.
7. Testes práticos, casos de uso e confirmação de resultado.
8. FAQ, limitações, suporte e links cruzados.
9. Histórico de revisões, revisor, homologação e aprovação.

## Sequência de produção para evitar retrabalho
**Gate A — Inventário:** congelar SHA, auditar código/API, PRs e perfis; atualizar matriz do DOC 1.  
**Gate B — Homologação:** executar DOC1-H01..H12 com dados isolados; recolher capturas aprovadas.  
**Gate C — Autoria:** escrever manuais operacionais e guias rápidos primeiro; em paralelo, manual Admin/BI e referência técnica.  
**Gate D — Controle:** revisão cruzada de tela × código × permissão × texto × idioma; revisão de privacidade, acessibilidade e qualidade.  
**Gate E — Entrega:** gerar arquivos editáveis, PDFs, índice com hiperlinks, manifest/checksums e snapshot de código conforme direitos; entrega externa só com aprovação formal.

## Regra de publicação, versionamento e compliance
- Documentação interna pode detalhar implantação com ambiente fictício; no GitHub **público** manter somente informações não sensíveis, sem nomes de usuários, rede privada, identificadores fabris, credenciais, segredos nem dados reais.
- Não transformar a versão `1.0.0-pilot.3` em release comercial só por atualizar documentação.
- Caso as telas mudem após o congelamento, registrar mudança de baseline e invalidar capturas afetadas.
- Atualizar índice mestre e links no Drive após aceite; não apagar versões antigas ou substituir relatórios gerenciais aprovados.
- SDK/CLP/Node-RED futuro é trilha independente: não apresentar integração como parte comprovada do kit.
