# MAN-MOB-001 — Utilização do ANDON em dispositivos móveis

**Edição:** 0.1, M1 · **Status:** roteiro de treinamento e homologação, sem garantia de compatibilidade física.  
**Origem:** PR funcional [#653](https://github.com/projetoever/andon-evergreen/pull/653) e [MOB 1 — aceitação](../MOB1_RESPONSIVE_ACCEPTANCE_20261125.md).

## 1. Princípio

Mobile não é um produto paralelo: trata-se da mesma aplicação web ANDON, com interface adaptada por viewport. Os direitos de acesso, chamadas, identidade, cancelamento, auditoria e regras do backend **não mudam** porque a tela ficou menor. A autorização não pode ser substituída por menus locais ou botões invisíveis.

## 2. Antes de usar

1. Abrir o endereço HTTPS de rede autorizado pela TI e **validar a confiança do certificado no aparelho**. O certificado de laboratório `mkcert` do notebook não se torna confiável automaticamente no Android ou iPhone.
2. Garantir que a rede/roteador permita acesso ao serviço de maneira controlada. Acesso externo à rede industrial não é aprovado por esta documentação.
3. Registrar/aprovar a workstation quando o acesso central exigir. O ID do navegador não equivale à identificação pessoal.
4. Usar conta própria, perfil correto e verificar os módulos apresentados no Hub.
5. Na mesma máquina, não executar uma mutação em dois dispositivos simultâneos sem conferir o estado de servidor.

## 3. Mapa por superfície

| Tela | Como se comportar | O que precisa permanecer acessível |
|---|---|---|
| Hub | Launcher compacto, acessos por permissão | Login/logout, módulos e retorno |
| Dashboard | Cards fluidos com nome e estado | Máquina, status, prioridade, som e chamados |
| Máquina | Setores/grupos e modais compactos | Abrir, OS, atender, técnicos, finalizar e cancelar quando autorizados |
| Prioridades | Lista/filtros adaptados | Ranking, badge de produção, histórico autorizado e salvar/409 |
| Histórico | Filtros e detalhe em sequência vertical | Lista, técnico, tempo físico e elegibilidade BI |
| BI | Seletor mobile das cinco áreas | KPIs, gráficos, modal, “Sem amostra”, qualidade, exportação conforme grant |
| Administração | Navegação por grupos/drawer | Usuários, estação, catálogo, mudanças e auditoria conforme perfil |
| Auditoria | Filtros em espaço compacto | Consulta, CSV, detalhes e ausência de segredo |

## 4. Procedimento padrão de toque

1. Confirmar título da página e qual máquina está selecionada.
2. Abrir drawer/seletor quando necessário; tocar no item identificado, sem usar zoom de página para “encontrar” função cortada.
3. Preencher OS ou justificativa com teclado nativo, observando se o campo permanece visível quando o teclado sobe.
4. Confirmar ação uma só vez; aguardar sucesso persistido ou mostrar erro sem duplicar requisição.
5. Se o modal for extenso, utilizar a rolagem interna; os botões Cancelar/Confirmar precisam estar alcançáveis.
6. Retornar ao Hub preservando as sessões e estados necessários, sem apresentar falha de carregamento falsa.
7. Em 401/403, usar o fluxo de sessão e solicitar grant; em rede lenta/503, verificar situação antes de repetir a mudança.

## 5. Matriz de ensaio de responsividade

| Resolução | Cenário | Resultado requerido |
|---|---|---|
| 320×568 | Tela compacta e teclado | Sem controles cortados e sem scroll horizontal global indevido |
| 360×640 | Android estreito | Botões e modais legíveis |
| 390×844 | Smartphone comum | Títulos e cards com nomes longos completos |
| 430×932 | Smartphone amplo | Aproveitamento da largura, toque sem sobreposição |
| 768×1024 | Tablet retrato | Drawer/tabelas acessíveis |
| 1024×768 | Tablet paisagem | Navegação fluida e sem compressão excessiva |
| 1366×768 | Desktop | Layout tradicional e modais legíveis |
| 1920×1080 | Kiosk/painel | Contraste, prioridade e módulos completos |

Repetir em modo claro/escuro e idiomas PT-BR/EN/zh-TW com nomes longos. Usar Android Chrome **real** e iOS Safari **real** para comprovar o uso físico; DevTools/Playwright são evidências complementares, não substitutas.

## 6. Checklist de aprovação do mobile

- [ ] Todas as funções permitidas no desktop também estão acessíveis por toque.
- [ ] Nenhum botão essencial fica oculto atrás de cabeçalho, footer, teclado ou modal.
- [ ] Falha de rede não gera segundo chamado ou fechamento duplicado.
- [ ] Modais permitem cancelar, confirmar e voltar, com foco e contraste.
- [ ] Histórico mostra tempos individuais e parada física sem comprimir os dados.
- [ ] BI distingue 0 real, N/A, amostra parcial e indicadores causais.
- [ ] Perfil sem grant não obtém acesso pela URL direta.
- [ ] Sessão e estação mantêm regras de segurança idênticas às do desktop.
- [ ] Fotos/capturas aprovadas e redigidas para os manuais.
- [ ] Responsáveis de manutenção, produção e TI assinam o resultado.

**Todos os itens estão inicialmente pendentes.** IDs de homologação: `DOC1-QA-H22/H23/H24/H25/H28`.

## 7. Limites e suporte

Em caso de ausência de acesso HTTPS, diferenciar falha de Wi-Fi, resolução de hostname, bind/porta, firewall, confiança na CA e erro 401/403. Não desativar o TLS, não liberar porta do banco e não criar exceção de ACL como “conserto” de UI.

[Plano MOB1](../MOB1_RESPONSIVE_ACCEPTANCE_20261125.md) · [Instalação/HTTPS](../HTTPS_ASSISTED_SETUP.md) · [Matriz de aceite](20_ACEITE_TERMO_E_FORMULARIOS.md).

**Evidência em dispositivos reais:** não anexada até a presente revisão.
