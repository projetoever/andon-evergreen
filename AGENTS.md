# AGENTS — ANDON Web Industrial

## 1. Finalidade e escopo

Este arquivo orienta agentes e desenvolvedores que alteram qualquer conteúdo deste repositório.

As regras valem para frontend, backend, banco de dados, instalador, runtime, scripts, documentação e testes. Alterações devem preservar a operação industrial, a rastreabilidade dos chamados e a compatibilidade com instalações existentes.

## 2. Estado oficial do produto

- Produto: **ANDON Web Industrial**
- Release atual: `1.0.0-pilot.3`
- Canal: `pilot`
- Branch oficial: `main`
- Frontend produtivo: modo API obrigatório
- Backend: Node.js + Fastify + TypeScript
- Persistência: PostgreSQL + Prisma
- Implantação atual do piloto: Windows, com PostgreSQL em Docker
- Operação normal: local e independente de internet após a instalação
- Perfis de instalação entregues: `empty`, `starter` e `demo`, com camada interna `core`

A fonte de verdade deve ser consultada nesta ordem:

1. commit oficial da `main`;
2. código, schema e migrations;
3. `release-manifest.json`;
4. evidência validada do ambiente instalado;
5. documentação controlada.

Não apresente planejamento, proposta ou roadmap como funcionalidade entregue.

## 3. Arquitetura obrigatória

### 3.1 Frontend

- React 19, TypeScript, Vite, Tailwind CSS e TanStack Router.
- Builds de produção operam obrigatoriamente pela API.
- `VITE_ANDON_DATA_MODE=local` é permitido somente em desenvolvimento.
- Não criar fallback silencioso para LocalStorage em produção.
- A indisponibilidade da API deve ser apresentada como falha operacional clara, nunca mascarada por dados locais.
- Textos visíveis da interface devem permanecer em português do Brasil.
- Código, variáveis, funções, tipos e componentes devem permanecer em inglês.

### 3.2 Backend

- A API Fastify em `server/` é parte entregue do produto.
- Regras de negócio e validações que protegem consistência ou auditoria devem existir no backend, ainda que a interface também valide.
- Não contornar a API com gravações diretas no banco a partir do frontend.
- Mudanças de contrato devem considerar clientes instalados e compatibilidade da release.
- Erros devem ser explícitos, úteis para diagnóstico e não devem expor credenciais ou dados sensíveis.

### 3.3 Banco de dados

- PostgreSQL é a fonte produtiva dos dados.
- Prisma é a camada oficial de schema, client e migrations.
- Toda alteração persistente deve ser representada no schema e, quando aplicável, em migration versionada.
- Prefira mudanças aditivas e compatíveis.
- Não execute `db:reset`, `db:seed` ou migrations de desenvolvimento em banco produtivo.
- Backup é obrigatório antes de deploys ou procedimentos que possam alterar dados.
- Credenciais e arquivos `.env` produtivos nunca devem ser versionados.

### 3.4 Implantação

- O launcher oficial é `ABRIR_MENU_ANDON.bat`.
- O instalador oficial está em `installer/`.
- O diretório padrão é `C:\web-andon-industrial`.
- O repositório instalado é esperado em `C:\web-andon-industrial\andon`.
- Instalação limpa, atualização, reparação, backup, restauração e desinstalação são fluxos distintos.
- Não misture esses fluxos nem execute instalação limpa sobre um ambiente produtivo existente.
- Preserve configuração, banco e dados em atualizações e reparações.
- Scripts PowerShell que modificam serviços, tarefas, firewall, banco ou diretórios devem falhar com mensagem clara e evitar estados parciais silenciosos.

## 4. Regras de domínio que não podem ser quebradas

### 4.1 Estado da máquina e estado Andon

Preserve a separação entre:

- `machineStatus`: condição física/operacional da máquina;
- `andonStatus`: situação do fluxo Andon.

Não derive um estado do outro sem regra de negócio comprovada.

### 4.2 Chamado operacional atual

- `currentCallId` representa o chamado operacional atual da máquina.
- Um chamado real não pode ser substituído, liberado ou alterado por rotinas de teste.
- Transições de estado devem preservar datas, responsáveis, sessões e tempos já registrados.
- Cancelamento, conclusão, retorno à manutenção e finalização devem continuar auditáveis.

### 4.3 Chamados automáticos de teste

Registros com `isSystemTest = true` devem permanecer isolados da operação real.

Eles não podem:

- substituir `andonStatus`;
- ocupar `currentCallId`;
- liberar chamado operacional;
- alterar indevidamente o estado da máquina;
- entrar nos indicadores operacionais comuns.

Devem conservar origem, identificação histórica e capacidade de auditoria.

### 4.4 Manutenção e responsáveis

- Chamados de manutenção que exigem mantenedor não podem ser finalizados sem responsável técnico válido.
- Sessões de técnicos e múltiplos mantenedores devem continuar coerentes com o atendimento.
- O responsável pela confirmação da localização deve seguir os dados reais das sessões e os fallbacks legados aprovados.
- Não invente identidade, horário ou vínculo técnico.

### 4.5 Hierarquia e localização dos ativos

A hierarquia oficial é:

```text
Máquina
└── Conjunto ou módulo
    └── Subconjunto ou equipamento
```

Na confirmação de localização da `pilot.2`:

- preserve separadamente a localização informada na abertura;
- registre a localização confirmada;
- registre se houve mudança;
- registre justificativa, responsável, data e hora;
- mantenha snapshots para preservar o histórico;
- continue aceitando chamados anteriores por meio do fallback legado aprovado;
- use `Não justificado` quando a regra vigente determinar esse valor.

Nunca sobrescreva o contexto original do chamado com a localização corrigida.

## 5. Segurança operacional e compatibilidade

Antes de alterar comportamento produtivo:

1. identifique o fluxo afetado;
2. verifique chamadas reais, chamadas de teste e registros legados;
3. avalie impacto no banco e em migrations;
4. avalie impacto no instalador, runtime, kiosk e rede;
5. preserve instalações existentes;
6. documente riscos e validações.

Não faça:

- exclusões destrutivas sem pedido explícito e procedimento de recuperação;
- reset ou seed de produção;
- alteração de portas, caminhos ou credenciais padrão sem atualizar manifesto, instalador e documentação;
- inclusão de segredo no repositório ou nos logs;
- mudança silenciosa de modo de dados;
- promessa de compatibilidade não testada;
- alteração de dados históricos para “corrigir” a apresentação atual.

## 6. Convenções de código

- Componentes React e tipos/interfaces: **PascalCase**.
- Funções e variáveis: **camelCase**.
- Constantes: **UPPER_SNAKE_CASE** quando forem constantes globais imutáveis.
- Prefira tipos explícitos para contratos de domínio e API.
- Reutilize serviços, hooks e utilitários existentes antes de criar duplicações.
- Mantenha componentes focados e regras de negócio fora de componentes puramente visuais.
- Preserve acessibilidade, legibilidade em kiosk e uso em telas industriais.
- Evite dependências novas quando a capacidade já existir no projeto.
- Não reformate ou reescreva arquivos sem relação com a tarefa.

## 7. Estrutura principal

- `src/config/` — modo de dados e configuração do frontend
- `src/types/` — tipos do domínio
- `src/constants/` — constantes da aplicação
- `src/data/` — dados auxiliares e catálogos do frontend
- `src/services/` — integração de dados e chamadas da API
- `src/utils/` — utilitários
- `src/context/` — estado e coordenação do frontend
- `src/hooks/` — hooks reutilizáveis
- `src/components/` — componentes por domínio
- `src/pages/` — páginas
- `src/routes/` — rotas
- `server/src/` — API Fastify e regras do servidor
- `server/prisma/` — schema, migrations e seed
- `installer/` — instalador e administração Windows
- `install-tools/` — ferramentas auxiliares da instalação
- `scripts/` — runtime, kiosk e rotinas operacionais
- `release-manifest.json` — manifesto da release
- `ABRIR_MENU_ANDON.bat` — launcher oficial

Confirme a estrutura real antes de assumir que um arquivo ou diretório ainda existe.

## 8. Comandos de desenvolvimento

### Frontend

```bash
npm install
npm run dev
npm run lint
npm run build
```

### Backend

```bash
cd server
npm install
npm run db:generate
npm run db:migrate
npm run build
npm run dev
```

`npm run db:migrate` usa `prisma migrate deploy` e requer `DATABASE_URL` válida.

Comandos destrutivos ou de inicialização:

```bash
cd server
npm run db:seed
npm run db:reset
```

Execute-os somente em ambiente controlado e nunca contra produção sem autorização explícita, backup confirmado e procedimento aprovado.

## 9. Validação mínima

Antes de considerar uma alteração concluída:

- execute `npm run lint` no frontend;
- execute `npm run build` no frontend;
- execute `npm run build` no backend;
- valide migrations quando houver mudança de schema;
- teste o fluxo afetado em modo API;
- verifique registros legados quando a mudança tocar dados históricos;
- verifique isolamento de `isSystemTest` quando a mudança tocar chamados ou indicadores;
- valide responsividade e legibilidade nas telas afetadas;
- atualize documentação e manifesto quando a mudança alterar fatos da release.

Se um teste não puder ser executado, registre claramente a razão e o risco residual. Não declare validação que não ocorreu.

## 10. Git e escopo das alterações

- Use uma branch própria para cada mudança.
- Não faça commit diretamente na `main`.
- Preserve alterações do usuário que não pertençam à tarefa.
- Mantenha commits pequenos, intencionais e rastreáveis.
- Revise o diff completo antes de publicar.
- Pull requests devem informar o que mudou, por que mudou, impacto, riscos e verificações executadas.
- Mudanças de banco, instalador ou fluxo de chamados exigem atenção explícita no pull request.

## 11. Documentação

- O `README.md` apresenta o estado público e técnico do produto.
- Documentos antigos que contradizem a release atual devem ser tratados como históricos ou obsoletos.
- Não copie instruções antigas de LocalStorage, ausência de backend ou banco futuro para documentação vigente.
- Separe claramente: **entregue**, **suportado conforme configuração** e **planejado**.
- Vincule documentação técnica relevante à versão e à evidência utilizada.

## 12. Limites e roadmap

Na `1.0.0-pilot.3`, não trate como entregues:

- autenticação centralizada e gestão corporativa de usuários;
- cliente ou watchdog homologado para Raspberry Pi;
- integração produtiva com Node-RED, MQTT, ESP32, sensores ou CLP;
- manutenção preditiva e análises industriais avançadas.

Os perfis são aplicados somente por instalação limpa. Atualização e reparação não podem executar seed nem alterar o perfil registrado em `andon-config.json`.
