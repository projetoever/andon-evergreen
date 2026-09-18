# ANDON I/O Agent Windows — Arquitetura proposta

Status: projeto em desenvolvimento
Branch: feat/windows-io-agent

## 1. Objetivo

Transformar o mini-PC industrial Inovattio em um gateway local de I/O para o ANDON Web Industrial, com operação segura, inicialização automática, controle dos GPOs, prioridade sonora compatível com o ANDON e administração por menu Windows.

O agente não grava diretamente no PostgreSQL. Toda integração de negócio deve ocorrer pela API do ANDON.

## 2. Componentes

### 2.1 Runtime Agent

Processo residente responsável por:

- manter uma única sessão PawnIO/PawnIOLib;
- validar chip IT8786F, LDN GPIO e GPIO base;
- aplicar fail-safe;
- consultar a API do ANDON;
- resolver o chamado prioritário;
- garantir exclusividade de saída;
- registrar estado e logs;
- expor diagnóstico local para o menu de administração.

### 2.2 I/O Hardware Layer

Camada que encapsula completamente PawnIO.

Responsabilidades:

- abrir/fechar sessão;
- descobrir e validar BAR;
- read-modify-write;
- leitura de estado;
- LOW global;
- teste temporizado;
- proibir escrita em GPO não mapeado;
- impedir duas saídas HIGH simultaneamente.

### 2.3 Priority Resolver

Regra alinhada ao som atual do dashboard ANDON:

1. obter chamados OPEN;
2. ignorar isSystemTest;
3. considerar somente subtypes/categorias elegíveis;
4. ordenar openedAt DESC;
5. escolher um único priorityCall;
6. mapear subtype para canal físico;
7. desligar canal anterior antes de ligar o próximo;
8. ao atendimento/cancelamento, recalcular e restaurar o próximo OPEN mais recente.

### 2.4 Category Sync

O agente deve consultar:

GET /api/andon-categories?active=true

A lista retornada pelo servidor é a fonte de verdade para áreas atualmente ativas no ANDON.

O menu local poderá associar uma categoria ativa a qualquer canal físico mapeado.

A associação local não deve alterar o cadastro da categoria no ANDON.

### 2.5 Windows Manager Menu

Interface em BAT + PowerShell, visualmente semelhante ao menu administrativo do ANDON.

Opções planejadas:

1. Status geral
2. Iniciar agente
3. Parar agente
4. Reiniciar agente
5. Testar conexão com ANDON
6. Sincronizar áreas ativas
7. Configurar área por canal
8. Ativar/desativar canal
9. Testar canal temporariamente
10. Estado atual dos GPOs
11. Monitorar log
12. Modo DRY-RUN / REAL
13. Instalar inicialização automática
14. Remover inicialização automática
15. Diagnóstico PawnIO / IT8786F
16. Ferramenta de mapeamento dos GPOs
0. Sair

Ações perigosas ou de saída física devem exigir confirmação.

## 3. Configuração

Separar configuração de instalação e arquivos do programa.

Diretórios finais sugeridos:

C:\Program Files\ANDON-IO-Agent\
  Agent\
  Hardware\
  Manager\

C:\ProgramData\ANDON-IO-Agent\
  config.json
  state.json
  cache\categories.json
  logs\andon-io-agent.log

O runtime não deve depender do Desktop de um usuário.

### Estrutura lógica

- server.apiBaseUrl
- polling.intervalMs
- priority.mode = latest_open_exclusive
- priority.switchBreakMs
- failure.apiMode
- hardware.chipId
- hardware.gpioBase
- hardware.channels[]
- mappings[]
- operation.dryRun
- logging

## 4. Modelo de canais

O mini-PC documenta 7 GPOs físicos. A sirene Schneider possui 8 canais remotos.

Consequência:

- CH1..CH7 podem ser controlados diretamente pelos 7 GPOs depois do mapeamento;
- CH8 exige I/O adicional caso seja necessário no futuro.

Tabela de hardware deverá armazenar:

- gpoNumber
- port
- bit
- mask
- validated
- measuredLowVolts
- measuredHighVolts
- mappedAt
- notes

Tabela lógica deverá armazenar separadamente:

- sirenChannel
- categoryId
- categoryDisplayName
- enabled

Não acoplar permanently GPO1=Elétrica no código. O vínculo deve ser configurável.

## 5. Mapeamento seguro dos 7 GPOs

GPO1 já validado:

- GPO1
- IT8786F GP41
- data port 0x0A03
- bit 1
- mask 0x02
- LOW ~0 V
- HIGH ~4,9 V

Para GPO2..GPO7:

1. manter todas as cargas desconectadas;
2. deixar todos os GPOs LOW na BIOS;
3. registrar snapshot baseline;
4. alterar somente um GPO para HIGH na BIOS;
5. boot no Windows;
6. medir pino físico contra GND;
7. executar snapshot somente leitura;
8. comparar byte a byte com baseline;
9. registrar único delta estável;
10. repetir leitura;
11. voltar o GPO anterior para LOW e avançar ao próximo;
12. ao final, deixar todos LOW;
13. somente depois testar escrita runtime via PawnIO.

Nenhum bit deve ser inferido por sequência numérica sem evidência.

## 6. Exclusividade de saída

Invariante principal:

at most one audible channel HIGH

Troca:

old HIGH
  -> old LOW
  -> readback LOW
  -> switchBreakMs
  -> new HIGH
  -> readback HIGH

Nunca fazer new HIGH antes de confirmar old LOW.

Se o priorityCall corresponder a uma área sem canal mapeado:
- todos os canais conhecidos LOW;
- gerar warning;
- não tocar uma área diferente.

## 7. Comportamento em falhas

### Falha da API

O modo deve ser configurável.

Recomendado para operação:
- hold_last por uma janela curta;
- depois de timeout de comunicação prolongado, aplicar política definida pela manutenção.

Não interpretar falha momentânea de rede como atendimento.

### Falha PawnIO / hardware

- tentar LOW em todas as saídas conhecidas;
- marcar hardware unhealthy;
- bloquear novos HIGH;
- logar erro;
- exigir nova inicialização/recuperação controlada.

### Encerramento do agente

- desligar todas as saídas mapeadas;
- liberar mutex;
- fechar PawnIO;
- salvar estado.

## 8. Estado e diagnóstico

state.json deverá conter:

- agentRunning
- startedAt
- apiConnected
- lastApiSuccessAt
- hardwareConnected
- chipId
- gpioBase
- priorityCallId
- prioritySubtype
- activeChannel
- currentOutputs
- dryRun
- lastError

O menu deve ler esse estado sem disputar o mutex de hardware.

## 9. Integração com categorias do ANDON

A API já oferece categorias ativas.

Fluxo:

ANDON category catalog
  -> GET /api/andon-categories?active=true
  -> cache local
  -> menu mostra áreas
  -> operador escolhe área para CH1..CH7
  -> valida duplicidade
  -> salva config local
  -> agente recarrega configuração de forma controlada

Exemplo inicial:

CH1 -> electrical -> Elétrica
CH2 -> mechanical -> Mecânica
CH3 -> hot_melt -> Hot Melt
CH4..CH7 -> definir posteriormente

Se uma categoria for inativada no ANDON:
- o mapeamento local é preservado para auditoria;
- ela passa a ser marcada inactive;
- não participa da seleção de prioridade;
- o menu alerta para remapear o canal.

## 10. Serviço Windows / inicialização

Fase piloto:
- tarefa agendada ONSTART, SYSTEM, highest privileges.

Fase estável:
- considerar Windows Service dedicado.

O menu deve administrar start/stop/restart independentemente do usuário logado.

## 11. Segurança elétrica

Os GPOs são sinais lógicos.

Nunca alimentar a sirene diretamente pelo GPIO.

Cada GPO deve acionar uma interface isolada adequada. A sirene possui alimentação própria 12/24 Vcc e entradas remotas por canal contra COM.

## 12. Fases de entrega

### Fase A — Mapeamento
- mapear GPO1..GPO7;
- validar LOW/HIGH físico;
- gerar hardware-map.json.

### Fase B — Core Agent
- sessão PawnIO persistente;
- camada de hardware;
- fail-safe;
- prioridade latest_open_exclusive;
- logs/state;
- DRY-RUN/REAL.

### Fase C — Manager
- menu BAT/PowerShell;
- status/start/stop/restart;
- categorias ativas;
- configuração de canal;
- testes manuais;
- logs;
- auto-start.

### Fase D — Integração
- testar chamadas simultâneas;
- testar preempção;
- testar retorno de prioridade;
- testar múltiplas máquinas;
- testar reinício Windows;
- testar perda/retorno de rede;
- testar categorias inativadas.

### Fase E — Instalação
- empacotar junto ao ecossistema ANDON;
- instalação/atualização separada e não destrutiva;
- documentação e rollback.

## 13. Critérios mínimos para produção

- 7 GPOs mapeados empiricamente;
- somente um canal HIGH por vez;
- prioridade idêntica ao dashboard;
- readback de toda mudança;
- inicialização automática comprovada;
- recuperação pós-reboot comprovada;
- ausência de dependência de usuário/desktop;
- logs claros;
- dry-run disponível;
- configuração local versionada;
- carga física somente por interface isolada;
- teste de perda de API;
- teste de reinício durante chamado aberto;
- teste com chamados simultâneos.
