# REFINE 12 / R12-04A — Edição segura de mantenedores por qualquer perfil delegado (#368)
Data 09/11/2026. Branch independente empilhada **somente sobre E034 #385**.

## Escopo implementado (uma família de configuração)
- `PATCH /api/technicians/:id` agora possui adapter próprio de acesso central e flag **`ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED=1`**, **OFF por padrão**. `POST /api/technicians` continua com a sua flag independente e o modo legado não foi alterado.
- Acesso por Admin principal ou qualquer perfil humano normal com `andon.settings.open`; contas selecionadas `machineScope=selected` podem editar o catálogo **global** apenas nessa rota de Configurações do ANDON. Perfil/cargo não decide privilégio. Contas com somente `catalog.technicians.manage` continuam exigindo full machine scope; nenhuma transição para Hub, BI, workstations, solicitações, senha global ou chamados.
- HTTPS, origem, cookie Hub, sessão ativa, workstation admitida, `andon.read`, CSRF; todos os privilégios revalidados dentro da transação após adquirir locks de usuário, workstation, catálogo e sessão do mantenedor.
- Corpo PATCH com allowlist `name, employeeId, technicalArea, technicalAreas, shiftId, active, pin, tag`; rejeita ID forjado, hashes, alterações de histórico, atendimento e campos extras.
- Valida turno ativo e áreas de manutenção, nomes/IDs de colaborador sem duplicação (ignorando caixa), PIN 4–8 dígitos e RFID normalizado; trava credenciais e compara hashes de todos técnicos para impedir reutilização. PIN/tag armazenados como hashes salgados `scrypt`, jamais retornados no JSON.
- **Bloqueia integralmente a edição enquanto houver sessão ativa desse técnico (inclusive sessão legada identificada somente pelo nome)**, protegendo encerramento e snapshots históricos. Não modifica horários, status de chamado ou KPI.
- Transação PostgreSQL com escritas atômicas em técnico/áreas e evento imutável `andon.technician.catalog.update` com autor humano, sessão/workstation, before/after sanitizados; nenhum segredo de PIN, tag ou hash em auditoria. Falha na auditoria desfaz a alteração.
- Frontend passa a enviar CSRF nesta rota. Ações já existentes na aba de técnicos continuam chamando o mesmo endpoint; quando flag OFF, o servidor retorna negativa e a HML E034 não muda.

## Testes
- Unitários `server/src/security/centralTechnicianCatalogUpdateHttp.test.ts`: flag OFF, método/rota exatos, CSRF, delegação de Produção/Manutenção/Líder/Gerente/Customizado, escopo selected, negação conta kiosk sem grant, validação de allowlist.
- PostgreSQL real isolado `server/scripts/validate-central-technician-update-pg.mjs`: requer `ANDON_INTEGRATION_TEST=1` e DATABASE_URL exatamente banco `/andon_test`, flags central e PATCH inicialmente OFF. Testa HTTP permissões/CSRF, configurações em escopo selected, hash/rotação de credenciais, bloqueio de sessão ativa, rollback quando audit falha, 2 workstations/2 conexões em corrida por nome, revogação e OFF.
- Integrado ao `test:access` e `test:access:integration` do servidor. CI Windows + Linux/PostgreSQL + frontend + browser; Ubuntu 24.04 fixado para Playwright v1.56.1 (incompatibilidade detectada no #395).

## Restrições / aceite
PR DRAFT; SEM merge, SEM deploy. **Não entra na E034 #385 instalada no notebook**. Flags não são habilitadas no launcher. O usuário está testando E034, e seu feedback de cadastro/histórico/cancelamento/som é independente. Para próxima HML, revisão de CI, backup/restore e autorização explícita. #368 continua ABERTA: ainda faltam edições de máquinas, turnos, setores/categorias, conjuntos/subconjuntos, sons globais e demais 10 abas. **Não declarar 100% das configurações concluídas**. Não tocar `C:\web-andon-industrial\andon`, `andon_db`, servidor da fábrica, M37, GPIO, CLP ou Node-RED.
