# UX-12/2A — Estrutura global somente leitura e migração aditiva

**Data:** 30/10/2026. **Issue:** #289. **Não é a etapa de gravação global.**

## Entregue neste pacote

- `system_settings.andonVisualPalette`: JSONB não nulo com default `{}`, que representa o preset industrial imutável. Nenhum dado prévio é apagado.
- `system_settings.andonVisualPaletteRevision`: contador de versão inteiro, padrão 0. Nesta etapa não existem endpoints capazes de aumentá-lo.
- O `GET /api/system-settings` **já existente e com regras de autenticação/workstation preservadas** inclui uma paleta estritamente normalizada e a revisão: `publicVisualPalette` sempre devolve o preset seguro diante de JSON inválido/desconhecido.
- Permite somente versão 1, os cinco nomes não críticos e os cinco acentos pré-definidos `slate|evergreen|ocean|indigo|violet`; NÃO aceita CSS, HEX arbitrário, `danger`, `warning`, nomes extras, scripts ou metadados do usuário.
- Não abre rotas de escrita, não adiciona campos ao `PATCH /api/system-settings`, não altera permissões centrais/legadas e não aplica a paleta em nenhum componente.
- Um teste de serviço garante fail-closed e compatibilidade do preset. A execução da migração em produção **não está autorizada** até a entrega e o plano de backup/rollback industrial.

## Fases restantes

1. **2B — Escrita dedicada e protegida:** endpoint separado `PATCH /api/andon-visual-palette`, somente Admin principal, workstation aprovada, sessão central válida, módulo permitido, CSRF/HTTPS, flag OFF por padrão, transação com locks e revalidação antes/depois, auditoria antes/depois do JSON e revisão monotônica; proteger concorrência de duas transações e restauro explícito com confirmação.
2. **3 — Aplicação global:** CSS de tokens de contorno/seleção sem alterar status críticos, atualização de todos os terminais por polling/evento e preview isolado do botão Salvar.
3. **4 — Homologação:** testes com browsers isolados, regressões industriais, contraste, versão incremental, downgrade e documentação de instalação/backup/rollback antes de qualquer deploy.

**Separação de escopos:** tema UX-11 = local; alerta UX-13 = local; paleta UX-12 = futuramente global. Nenhuma mudança no M37/Node-RED/PLC/GPIO.
