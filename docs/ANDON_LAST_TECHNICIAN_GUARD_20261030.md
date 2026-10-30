# ANDON — Ajuste 11: impedir chamado em manutenção sem mantenedor ativo

**Data:** 30/10/2026. Adicionado ao roadmap dos 10 ajustes originais (#232).

## Regra de domínio
Quando um chamado de manutenção está em `in_progress`, **o último mantenedor ativo não pode encerrar sua participação individual** por nome, PIN ou RFID. O operador deve adicionar um segundo mantenedor, ou utilizar o fluxo de **Concluir manutenção** (que transfere o chamado para `post_maintenance`). O bloqueio é aplicado no servidor dentro da transação após o lock de máquina e antes de encerrar a sessão, inclusive em solicitações concorrentes.

Com dois ou mais mantenedores, a saída individual continua possível até restar um. A saída do último participante de **acompanhamento** (`post_maintenance`) permanece permitida; não é um atendimento em manutenção e o chamado segue para finalização.

## Mensagem apresentada
> Não é possível encerrar o último mantenedor enquanto o chamado estiver em atendimento. Adicione outro mantenedor ou conclua a manutenção para iniciar o acompanhamento.

O modal exibe o aviso e desabilita o botão/autoenvio PIN-RFID enquanto há apenas uma sessão ativa em atendimento; backend revalida e responde HTTP 400 com a mesma mensagem, impedindo bypass pela API ou estado desatualizado. Traduções PT/EN/ZH tradicional.

## Testes automatizados
- Serviço local: único mantenedor bloqueado; dois técnicos permitem saída do primeiro, mas não do último; acompanhamento após conclusão continua possível.
- PostgreSQL real: `validate-attendance-integrity` valida que uma tentativa de sair com um só técnico retorna 400 sem alterar a sessão; conclusão normal continua possível. `validate-pr-flow` cobre a transição 2→1 permitida e 1→0 bloqueada.
- Teste estático: contagem sob lock de máquina e antes do `UPDATE`, mensagem e botão desabilitado.

Sem alteração no ambiente industrial ou na M37. Realizar teste no notebook somente com o pacote final de homologação.
