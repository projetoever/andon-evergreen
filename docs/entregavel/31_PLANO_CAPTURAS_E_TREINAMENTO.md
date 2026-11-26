# M1-UX-001 — Plano de capturas oficiais e roteiro de treinamento

**Edição:** 0.1 · **Status:** capturas pendentes; esta é uma especificação, não um álbum de imagens homologadas.  
**Objetivo:** produzir manuais com screenshots reais, legíveis e auditáveis, evitando imagens de versão antiga ou dados do chão de fábrica.

## 1. Condições para autorizar uma imagem

Cada screenshot deve identificar o SHA efetivo instalado do frontend, release/ambiente, perfil de teste, tema, idioma, viewport e ID de caso `DOC1-QA-Hnn`. A captura deve refletir a UI **homologada**, sem PIN/senha, nomes pessoais, IP industrial, cookies, tokens ou dados de produção.

Toda imagem terá:
- título e código de captura;
- legenda explicando **ação / resultado / critério de observação**, não simplesmente “tela 1”;
- borda/zoom e contraste que respeitem o padrão [M1-EDI-001](PADRAO_EDITORIAL_M1.md);
- equivalência de navegação PT-BR, inglês e zh-TW quando a UI exigir;
- evidência privada e status de revisão: `PLANEJADA → CAPTURADA → REVISADA → HOMOLOGADA`.

**Proibido:** usar screenshot de interface anterior como imagem final; usar dados fabris não redigidos; “criar” imagem artificial para simular evidência de homologação.

## 2. Inventário obrigatório por módulo

| Captura | Origem / tela a registrar | Estado de interface e objetivo | Caso QA |
|---|---|---|---|
| HUB-01 | `/hub` | Módulos autorizados, navegação e retorno | H01, H02 |
| HUB-02 | Login | Credencial inicial, comportamento de erro temporário e acesso legítimo | H01,H21,H25 |
| HUB-03 | `/hub/admin` | Navegação lateral e distinção de conta versus workstation | H02,H21 |
| HUB-04 | Usuários/permissões | Concessão por módulo e ação, sem expor login real | H02,H19 |
| HUB-05 | Workstations | Pedido de aprovação e bloqueio de estação | H02,H28 |
| AND-01 | `/andon` | Cards com nomes curtos/longos e prioridade | H12,H18 |
| AND-02 | `/machines/:machineId` | Título, setores diretos e chamados ativos | H03,H05 |
| AND-03 | Modal de abertura direta | Motivo, opção, OS e validação | H03 |
| AND-04 | Modal de grupo | Seleção múltipla e setor ocupado | H04,H05 |
| AND-05 | Card com grupo | Exibir setor + nome de grupo no chamado ativo | H04 |
| MNT-01 | Atendimento | Identificação do primeiro técnico e hora inicial | H06 |
| MNT-02 | Múltiplos técnicos | Participações sobrepostas e tempo individual | H06,H07 |
| MNT-03 | Concluir manutenção | Transição de atendimento para acompanhamento | H07 |
| MNT-04 | Retornar/Finalizar | Retorno, justificativa, diagnóstico e impacto físico | H07,H08 |
| HIS-01 | Histórico por máquina | Lista e status, OS, tipo, elegibilidade BI | H09,H10 |
| HIS-02 | `/history` | Lista Global + detalhe simultâneo | H09,H11 |
| HIS-03 | Detalhe completo | Tempos técnicos, parada e fases, em desktop/mobile | H10 |
| PRI-01 | `/machine-priorities` | Visão geral e sequência P1..Pn | H12 |
| PRI-02 | Contagem e 409 | 1/5/N destaques, conflito de concorrência | H12,H13 |
| PRI-03 | Programação | Condição programada e fluxo de autorização | H14 |
| BI-01 | `/bi` / Visão Geral | Período, filtros e KPIs | H15–H18 |
| BI-02 | Confiabilidade | MTBF/MTTR, limites de amostra e classificação | H16 |
| BI-03 | Falhas | Gráficos e drilldown com legenda contrastante | H17,H18 |
| BI-04 | Manutenção | Coorte, retornos, técnico e tempo | H15,H17 |
| BI-05 | Qualidade de Dados | “Sem amostra”/0%, motivo de exclusão e causa pendente | H15,H16 |
| BI-06 | Modal exploratório | Rosca/barra/disco/Pareto com filtros e leitura legíveis | H18 |
| AUD-01 | Auditoria Hub | Filtros, eventos transacionais versus `ui.click` | H19,H20 |
| AUD-02 | Exportação CSV | Permissões de leitura/export e proteção de segredo | H19,H20 |
| ADM-01 | `/andon/admin` | Máquina, grupo/setor, motivo, técnico, classificação | H04,H24 |
| MOB-01 | 320/360 px | Cabeçalhos, cards e ações essenciais com toque | H22 |
| MOB-02 | Android Chrome real | Modal, OS, teclado e navegação em rede confiável | H23 |
| MOB-03 | Safari iOS real | Drawer, gráficos, modal e certificados válidos | H23 |
| I18N-01 | PT/EN/zh-TW | Labels longos e ausência de truncamento | H24 |
| SUP-01 | Erro de rede/API | Diferença 401/403 versus 503; recuperação sem falso logout | H25 |
| SUP-02 | Instalação/Health | Menu de diagnóstico e dados de versão sem segredos | H26 |

*Capturas são propostas de evidência; sua posição exata no layout final depende do SHA, idioma e configuração. A lista não garante que todas essas superfícies sejam acessíveis a um perfil único.*

## 3. Padrão de arquivo e indexação

Nome recomendado: `M1_<CODIGO>_<PT|EN|ZHT>_<LIGHT|DARK>_<DESKTOP|ANDROID|IOS>_<SHA8>_rNN.png`.

Exemplo de nomenclatura, **não captura existente**: `M1_AND-03_PT_LIGHT_DESKTOP_1234abcd_r01.png`.

Guardar junto a cada captura um registro de metadados `evidence_id, original_sha256, screenshot_sha256, test_case, environment, role, viewport, locale, theme, author, reviewer, redact_status, capture_time_offset`. As imagens originais ficam em pasta restrita. Apenas cópias redigidas e aprovadas devem ir para PDFs compartilháveis.

## 4. Aplicação ao manual — layout editorial

1. Um procedimento por tarefa, título claro e seção curta.
2. Texto principal ≥11,5 pt e tabela ≥10,8 pt; legenda técnica não pode ser ilegível.
3. Imagem com **a interface relevante em evidência** e anotação numerada discreta quando a ação for complexa.
4. Nunca renderizar uma captura inteira do desktop minúscula numa meia coluna; preferir crop legitimamente representativo, declarando-o como recorte.
5. Botões e controles em geral devem aparecer junto à instrução, sem exigir troca de página para compreendê-la.
6. Usar tabelas somente para comparações, matrizes e casos, não para despejar parágrafos longos.
7. Adicionar rótulo de versão no rodapé e “HML pendente” de maneira inequívoca antes do aceite.
8. Reutilizar [modelo de manual](modelos/MODELO_MANUAL.md) e o [padrão editorial](PADRAO_EDITORIAL_M1.md).

## 5. Currículo de treinamento por público

| Curso | Duração | Competência final | Exercícios |
|---|---|---|---|
| Operação | A definir na HML | Abrir chamado setor/grupo com OS e confirmar histórico | H03–H05 |
| Manutenção | A definir | Registrar técnico, atendimento, fases, diagnóstico e fechamento | H06–H08 |
| Liderança | A definir | Interpretar estados, P1..Pn e programação independente | H12–H14 |
| Analista BI | A definir | Reconciliar coortes, tempo físico, Sem amostra e 0% | H15–H18 |
| Administrador | A definir | Cadastrar grants, revogar sessão/estação, sem bypass | H01,H02,H19–H21 |
| Auditor | A definir | Ler eventos, proteger CSV e distinguir clique de mutação | H19,H20 |
| TI/suporte | A definir | Identificar incidente, backup/restore, TLS, Health read-only | H25–H28 |

Avaliação de aprendizagem: (a) caso executado em HML com dados fictícios, (b) confirmação do resultado persistido, (c) pergunta de interpretação de exceção, (d) presença de responsável e evidência. Uma apresentação assistida sem execução não equivale a competência validada.

## 6. Critérios para publicação dos manuais ilustrados

- [ ] SHA efetivo instalado, UI/API e migrations identificados.
- [ ] Capturas reais obtidas e redigidas, com QA e ID por imagem.
- [ ] Manuais conferidos em português; nomenclatura comparada com o sistema em inglês e chinês tradicional.
- [ ] Privilégios e perfis revisados por responsáveis de TI/Admin.
- [ ] Seções do curso testadas por usuários de referência.
- [ ] PDF e DOCX renderizados em A4; texto legível; contraste claro/escuro; links ativos.
- [ ] Fonte e imagens com política de direitos e privacidade liberadas.
- [ ] Versão e revisão aprovadas; hashes calculados ao final.

**Status atual dos itens:** não executados e não atestados neste registro.

[HML-001](30_RUNBOOK_HML_EVIDENCIAS.md) · [M1-ACC-001](20_ACEITE_TERMO_E_FORMULARIOS.md) · [Modelos](modelos/README.md).
