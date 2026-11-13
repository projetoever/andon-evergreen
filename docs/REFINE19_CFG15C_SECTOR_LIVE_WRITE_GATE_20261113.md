# REFINE 19 — CFG-15C | Escrita de setores revalidada em tempo real

Data: 13/11/2026. Issue #477; complemento à CFG-15B (#521).

## Problema de código confirmado
A faixa de capacidade das 11 abas já refaz GET /api/system-settings ao trocar de aba, recuperar foco e detectar mudança nas configurações. Entretanto, o editor de Setores / categorias consultava a própria capacidade de gravação apenas na montagem do componente. A indicação podia mudar enquanto o botão Salvar continuava com estado antigo.

## Alteração
O editor de Setores volta a consultar getSystemSettings ao montar, recuperar foco ou receber SYSTEM_SETTINGS_CHANGED_EVENT. Enquanto a consulta está pendente, e em caso de falha, criação e edição centrais ficam bloqueadas. Respostas antigas não podem sobrescrever a verificação mais recente; limpeza de listeners ao desmontar. O evento do navegador nunca traz permissão: exige GET do servidor.

## Segurança, testes e aceite
Preserva DELETE central desabilitado; POST/PATCH exigem os mesmos controles e flags no backend. Teste de regressão verifica revalidação, limpeza, fail-closed e ausência de grants derivados de eventos. Exige CI Windows/Linux/PG e verificação posterior no notebook: abrir aba Setores, variar capability no ambiente autorizado, voltar foco, confirmar estado dos botões e bloqueio em erro de GET. Não ativar flags, não alterar backend/DB, nem estação, PLC, GPIO ou produção.
