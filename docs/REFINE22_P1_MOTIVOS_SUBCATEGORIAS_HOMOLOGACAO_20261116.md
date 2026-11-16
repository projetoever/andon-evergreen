# REFINE 22 — P1 Motivos e subcategorias | Preparação para homologação

Data: 16/11/2026. Origem: REFINE 21/22, itens P1 4 e 9. Destino inicial: **notebook de homologação isolado**, nunca ativação automática no servidor industrial.

## Resultado funcional

No Config ANDON, a seção **Setores, categorias e motivos** contém dois editores:
- **Setores / categorias**: áreas técnicas cadastradas, cor, natureza manutenção/produção, ordem e ativação.
- **Motivos e subcategorias**: motivos pais (nome, natureza, cor, ordem, status), vínculo das áreas técnicas compatíveis como especialidades/subcategorias, nome individual de apresentação, ordem e status por vínculo. Busca por motivo, ID ou especialidade; filtro de status.
- O mesmo setor técnico pode pertencer a motivos distintos. Não é permitido duplicar a mesma especialidade dentro do mesmo motivo.
- Alteração de nome ou ordem não muda automaticamente responsabilidade, KPI ou histórico. Admin principal detém alteração de política de KPI e precisa confirmar; delegado do Config ANDON recebe restrições conservadoras no servidor.

## Por que antes aparecia «catálogo em homologação — edição indisponível»

O frontend consulta o valor real `centralCallReasonsCatalogEnabled` na API. O backend exige o par `ANDON_CENTRAL_ACCESS_ENABLED=1` e `ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED=1`. A segunda variável **não era gerada pelo instalador**, portanto, mesmo que o editor estivesse implementado, o painel permanecia indisponível.

A partir deste pacote, `Write-AndonBackendEnv` inclui o catálogo **apenas no perfil de homologação central preexistente** (`centralSecurityValidationEnabled=true`), cujo preflight exige login central, HTTPS e PostgreSQL local. Em produção ou instalação legada sem esse opt-in o catálogo permanece desligado.

`ANDON_HIERARCHICAL_CALL_OPEN_ENABLED=0` é emitido explicitamente: a liberação do catálogo **não habilita** botões hierárquicos na máquina, não envia nenhuma abertura de chamado e não altera a camada de BI. Abertura hierárquica requer revisão independente da compatibilidade de OS, concorrência, timestamps/snapshots e causalidade dos indicadores.

### Atualização segura

1. Validar que o teste P0 em curso foi registrado. Usar menu **2 (Atualizar pela main)** no notebook com backup/restauração, sem instalação limpa.
2. Conferir o SHA da versão, atualizar e iniciar pelo menu 4; conferir saúde pelo menu 6.
3. Conferir no `C:\web-andon-industrial\andon-config.json` que `centralAccessEnabled=true`, `centralSecurityValidationEnabled=true`, `transportMode=https` e `postgresHost=127.0.0.1` (ou localhost), sem divulgar segredos. Se o perfil não estiver em modo de homologação, não alterar o banco; usar exclusivamente o procedimento isolado já autorizado `installer/configure-andon-security-validation.ps1`, com parada controlada e confirmação `NOTEBOOK_ISOLADO`.
4. Conferir **somente os nomes das variáveis** em `server\.env`: catálogo = 1 e abertura hierárquica = 0. Nunca compartilhar `DATABASE_URL`, cookies ou senhas.
5. Config ANDON > Setores, categorias e motivos > Motivos e subcategorias: a lista e o editor devem carregar sem a mensagem de recurso desabilitado.

### Checklist de homologação

- [ ] Catálogo abre sem 403 com Admin autorizado; workstation não aprovada / sessão inválida continua negada.
- [ ] Motivo novo: ID estável, nome, natureza, cor, ordem 0–9999, ativo. Falhas de validação são mensagens claras.
- [ ] Criar/vincular uma especialidade já cadastrada ao motivo compatível. Nenhum vínculo duplicado.
- [ ] Alterar somente nome/ordem/ativação da especialidade; ao recarregar, alterações persistem.
- [ ] Motivo de manutenção e motivo de Setup/Apoio ficam corretamente classificados; KPI corretivo não é automaticamente concedido.
- [ ] Perfil de Config ANDON delegado pode apenas operações permitidas sem manipular KPI.
- [ ] Página mantém leitura e mensagens corretas após refresh/voltar, foco e alteração real das capacidades.
- [ ] Operador não recebe editor global; rota de abertura hierárquica segue 403 enquanto OFF.
- [ ] Sem alteração de chamados reais, históricos, MTTA/MTTR/MTBF, downtime, CLP, GPIO ou Node-RED.

**Estado após CI:** codificado e testado em ambientes isolados; **não homologado no notebook** até conferência manual. A fase de ativar e testar abertura hierárquica em chamados de teste será coordenada separadamente, sem modificar equipamento real.
