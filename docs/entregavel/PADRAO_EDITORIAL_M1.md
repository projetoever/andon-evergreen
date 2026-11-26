# M1-EDI-001 — Padrão editorial oficial para relatórios e manuais do ANDON

**Versão:** 0.2 · **Aplicabilidade:** dossiês, manuais de operação/manutenção, documentos técnicos, termos, release notes e guias comerciais futuros.  
**Marca do piloto:** Ever Green; produto: ANDON Web Industrial.  
**Condição:** a regra de formatação pode ser adotada para novas publicações; a validação funcional de conteúdo segue gates independentes.

## 1. Grade e hierarquia visual — A4

| Elemento | Estilo | Regra de paginação |
|---|---|---|
| Papel | A4, retrato, laterais 1,85 cm; superior 1,75 cm; inferior 1,60 cm | Evitar espaços vazios artificiais |
| Família | Carlito (métrica próxima de Calibri) ou equivalente corporativa disponível; nunca anexar fontes | Verificar glifos PT/EN/zh-TW na exportação |
| Corpo | **11,5 pt**, entrelinha **1,19**; espaço posterior 5 pt | Parágrafos concisos e sem texto espremido |
| Tabelas | **10,8 pt**; cabeçalho **11 pt** em negrito; padding vertical moderado | Cabeçalho repetido, não dividir linha, evitar tabelas >1 página sem necessidade |
| H1 / capítulo | **19 pt**, negrito, azul petróleo | Título acompanha primeiro parágrafo ou tabela |
| H2 / seção | **14,2 pt**, negrito, verde petróleo | Não deixar título sozinho na última linha |
| H3 / tópico | **12 pt**, sem exceder H2 | Usar apenas quando melhora navegação |
| Título de capa | 46 pt (dossiê) ou 30 pt (modelo geral) | Identificação antes de conteúdo |
| Subtítulo | 16–24 pt | Propósito do material, sem slogan repetitivo |
| Rodapé / metadados | 8,5–10,5 pt | Revisão, edição, status e numeração |
| Alertas importantes | Corpo normal/sem caixa colorida; rótulo em negrito e alto contraste | Preferir precisão a elementos decorativos |

**Cores de referência:** título/texto escuro `#142B3A`; seções `#187378`; tabelas com cabeçalho azul escuro, linhas alternadas discretas e contraste de texto adequado. A versão preto-e-branco deve continuar legível.

## 2. Diagramação eficiente

1. Usar **quebra de página apenas** para capa, capítulos extensos ou exigências de assinatura, não para toda seção numerada.
2. Incluir títulos na mesma página de seu conteúdo inicial e preservar linhas de tabela; se uma tabela ultrapassar a página, repetir seu cabeçalho.
3. Substituir tabelas redundantes por sumário interpretável ou texto curto; conservar dados numéricos, status e unidades.
4. Usar 2–3 colunas quando informações forem comparáveis; usar lista para procedimentos ordenados. Priorizar leitura em A4 e celular.
5. Ter links descritivos e navegação textual; nunca depender exclusivamente de cor ou ícone para significado.
6. Cortar repetição entre sumário, notas e rodapé; não cortar regra operacional só para encaixar página.
7. Documentar **Sem amostra**, zero observado, provisório e status de homologação sem ambiguidade.
8. Capturas devem vir do SHA homologado, com tema, idioma, viewport, perfil e dados sintéticos; nada sensível.

## 3. Estrutura mínima de cada entrega

**Identificação:** código, título, destinatário, revisão, data, baseline Git, versão instalada e status; informar proprietário e revisores.

**Sumário do escopo:** objetivos, funções entregues e limites sem alegações não verificadas.

**Corpo técnico:** telas/módulos, permissões, passos reais, respostas e erros, exemplos e evidências.

**Controle:** matriz de teste `DOC1-QA-Hnn`, referências de código/PR, riscos, mudanças, decisões e assinaturas.

**Anexos quando cabíveis:** dicionário de campos, diagramas, screenshots, política de dados/privacidade, build/recovery.

## 4. Convenções e organização

- Diretórios: `docs/` = engenharia atual + históricos preservados; `docs/entregavel/` = biblioteca M1; `docs/entregavel/modelos/` = fontes editoriais de novas peças.
- Prefixos: `M1-GOV`, `M1-REL`, `M1-TRC`, `M1-BOM`, `M1-ACC`, `MAN-OP/MNT/...-`, `M1-EDI`.
- Nomes de arquivo: `NN_TITULO_DESCRITIVO.md` na biblioteca; PDFs/DOCX com código, tema, revisão e data; evitar `final2_novo_final`.
- Estado formal: `RASCUNHO`, `EM_REVISAO`, `APROVADO_EDITORIAL`, `HOMOLOGADO`, `OBSOLETO`; status de CI e instalação têm campos separados.
- Fonte normativa: `main@<SHA>` ou release tag imutável; apontar branch/PR quando texto ainda não integrado.
- Corrigir erro sem apagar histórico: nova revisão, changelog e link para versão anterior quando necessário.

## 5. Verificação de qualidade antes de publicar

**DOCX:** revisão de estilos, hierarquia de títulos, cabeçalhos de tabelas, acessibilidade, links, não existência de páginas quase vazias, órfãos e texto fora de área.  
**PDF:** renderizar cada página e inspecionar visualmente em tela; verificar seleção de texto, caracteres e não corte.  
**Paridade:** texto, quantidade de tabelas, números e dados entre DOCX e PDF não podem divergir.  
**Pacote:** após fechar o conteúdo, gerar manifesto SHA-256 e ZIP do conjunto sem segredos; conferir descompactação, links e metadados.  
**Drive:** publicar revisão identificada, atualizar Índice Mestre e **não sobrescrever versões aprovadas sem autorização**.  
**GitHub:** PR de documentação isolada, integridade dos links relativos, referências a módulos reais e CI no último HEAD.  
**Aceite:** assinatura de responsável e resultado HML; documentação bonita não certifica software.

## 6. Modelos reutilizáveis

- [Modelo de manual](modelos/MODELO_MANUAL.md) — operação, permissão, tela, procedimento, erro, evidência.
- [Modelo de dossiê/relatório](modelos/MODELO_RELATORIO.md) — sumário, arquitetura, métricas, riscos e decisão.
- [Biblioteca M1](README.md) — governança, manuais, release notes e termo.

**Fontes de layout:** [dossiê M1](https://drive.google.com/file/d/1kg6PdhApI156aYAlbSUcQz2gu5XFBEN8/view) (versão original), modelo Word v0.2 e dossiê v0.2 serão publicados como **nova revisão** no Drive. O documento não requer nome de fonte proprietária nem compartilhamento de arquivos de fonte.
