# REFINE 17 — CFG-15A | Auditoria funcional das 11 abas do Admin ANDON

Data: 13/11/2026. Escopo: corrigir informações de disponibilidade e ação insegura da aba Setores, sem habilitar funcionalidades industriais.

## Matriz de disponibilidade em acesso central

| Aba | Sinais efetivos | Limitação explícita |
| --- | --- | --- |
| Geral | `centralOperationalSettingsWriteEnabled` | PATCH ainda verifica autorização, validação e auditoria |
| Aparência | `andonVisualPaletteWriteEnabled` | Prévia local não significa gravação global |
| Sons | Sem flag de upload central; **não verificado** | Arquivos personalizados ficam no terminal, não são distribuídos automaticamente |
| Modo de atendimento | `centralDeclaredAttendanceEnabled` | Nome declarado é distinto de PIN/RFID e exige flag própria |
| Mantenedores | `centralTechnicianCreateEnabled` / `centralTechnicianUpdateEnabled` | Criar e editar são gates independentes; atendimento e credenciais também |
| Turnos | `centralShiftUpdateEnabled` | Somente edição; novo turno não é oferecido. Filtro segue regra separada |
| Setores / categorias | `centralCategorySettingsWriteEnabled` | POST/PATCH somente. DELETE não autorizado no acesso central |
| Motivos e subcategorias | `centralCallReasonsCatalogEnabled` | Edição, criação, vínculo, política KPI e abertura hierárquica possuem ACL/flags distintas |
| Classificações | `centralClassificationWriteEnabled` | Cadastro e edição sob flag central própria |
| Catálogos de ativos | `centralAssetTypeCatalogWriteEnabled` | Tipos criados/editados; remoção e instâncias por máquina são outra autorização |
| Máquinas | `centralMachineCreateEnabled` / `centralMachineSettingsWriteEnabled` | Somente cadastro/metadados; status, produção e controles físicos NÃO liberados |

Valores são produzidos diretamente pelas mesmas funções guardas do servidor e expostos como booleans de **capacidade de implantação**, não permissões individuais ou garantias de disponibilidade operacional. Toda gravação continua condicionada a sessão, permissão, estação aprovada, escopo, CSRF, transação e auditoria.

## Correção direta: setor com ação de exclusão impossível

A aba Setores exibida no Hub Central anteriormente tinha botão **Remover setor** operacionalmente clicável, mas a autorização central R12-04C permite apenas POST e PATCH; DELETE é intencionalmente bloqueado para proteger o histórico. Agora:
- botão Remover desabilitado no central, com aviso claro para inativar;
- botão Novo e Salvar respeitam a flag real `centralCategorySettingsWriteEnabled`, consultada via `/api/system-settings`;
- falha de consulta não deve ser interpretada como permissão concedida; mantém catálogo em leitura;
- modo legado e exclusão historicamente permitida em legacy não foram alterados;
- sem mudanças em schema, dados, setor real, flags, Hub grants, workstation, KPI, PLC ou GPIO.

## Testes e pendências

- `tests/centralSettingsCapabilityMatrix.test.ts`: todas as 11 abas mapeadas, flags tipadas e respaldadas no backend, bloqueio da exclusão em central e retorno seguro para feature desligada;
- CI automatizada deve validar frontend, SSR, PostgreSQL, autorização, i18n PT/EN/zh-TW e PowerShell Windows.
- O inventário estático não é equivalente a um teste visual/físico de cada operação no notebook. Continuar CFG-15B: validação aprofundada dos fluxos Salvar/Cancelar, mensagens de erro, 403, locks, estados de carregamento e sincronização entre abas (priorizar sons, turno, classificação, máquinas, mantenedores).
- Pré-condição para ativação de qualquer feature flag: homologação explícita no notebook; sem alteração do servidor industrial ou HML antigo.
