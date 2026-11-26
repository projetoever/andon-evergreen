# [MAN-XXX-001] — [Nome do módulo]

**Produto:** ANDON Web Industrial · **Marco:** [M1 ou release] · **Revisão:** [0.1]  
**SHA de referência:** [SHA imutável] · **Versão instalada:** [identificador real] · **Data:** [dd/mm/aaaa]  
**Público:** [perfil] · **Permissões:** [grant/escopo] · **Status:** [RASCUNHO / EM_REVISAO / HOMOLOGADO]  
**Revisor e aprovador:** [função/nome] · **Evidências:** [IDs/links controlados]

## 1 | Objetivo e pré-requisitos
[O que o usuário poderá fazer, papel, equipamento e ambiente autorizados.]

## 2 | Identificação da tela
- **Módulo:** [nome]
- **Rota:** [URL relativa verificada]
- **Botão/ícone:** [texto exatamente como exibido no SHA]
- **Imagem:** [captura de ambiente sintético com SHA, idioma, tema, viewport]
- **Regra de acesso:** [sessão, workstation, grant, escopo; 401/403]

## 3 | Procedimento
1. **Ação:** [passo real].
   **Resposta esperada:** [mudança visível/persistente].
   **Como comprovar:** [ID/histórico/consulta].
2. **Ação:** [...].
   **Resposta esperada:** [...].
   **Como comprovar:** [...].

## 4 | Regras e exceções
| Caso | Causa observável | Procedimento autorizado |
|---|---|---|
| Sem acesso | 401/403 e contexto | Solicitar autenticação/permissão; não contornar |
| Conflito | 409 ou revisão | Recarregar e revisar sem sobrescrever |
| Rede | Timeout/503 | Consultar se ação já persistiu antes de repetir |

## 5 | Validação e treinamento
| Caso DOC1-QA | Massa sintética | Esperado | Realizado | Evidência |
|---|---|---|---|---|
| H__ | [descrição] | [resultado] | NOT_RUN | [pendente] |

## 6 | Suporte e referências
[FAQ curto, fonte técnica vinculada, contato/canal de incidente autorizado.]

## 7 | Revisões e aprovação
| Revisão | Data | Mudança | Revisor | Status |
|---|---|---|---|---|
| 0.1 | [data] | Primeira minuta | [função] | EM_REVISAO |

**Termo:** [ ] aprovado editorialmente [ ] homologado em ambiente identificado.  
**Nunca** considerar os campos marcados como modelos como aprovação preexistente.
