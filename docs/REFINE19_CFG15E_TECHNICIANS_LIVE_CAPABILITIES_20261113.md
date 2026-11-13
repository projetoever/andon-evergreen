# REFINE 19 — CFG-15E | Capacidades de cadastro/edição de mantenedores em tempo real

Data: 13/11/2026. Issue #477. Complementa #521 (aviso das 11 abas) e os gates independentes CFG-15D1.

## Diagnóstico
O editor de mantenedores reconsultava criação/edição apenas ao montar ou acionar o retry manual. Seu aviso de capacidade global já atualizava ao foco e eventos, permitindo mensagens contraditórias ao operador.

## Correção
Revalidar ambas as flags independentes centralTechnicianCreateEnabled / centralTechnicianUpdateEnabled por GET ao montar, em SYSTEM_SETTINGS_CHANGED_EVENT, foco ou retry. Enquanto aguarda resposta, controles de escrita centrais ficam fechados. Erros negam ambas as funções até uma nova confirmação. Ignorar respostas antigas, limpar listeners. Não tocar no draft/seleção local durante a revalidação.

## Segurança e aceite
Nenhum evento do navegador concede grants, nenhuma modificação de PIN/RFID ou API. POST/PATCH central continuam sob ACL, workstation, TLS/CSRF e auditoria existentes. Teste de regressão CFG-15E verifica revalidação, limpeza, negativa conservadora e preservação de edições em progresso. Submeter CI Windows/Linux/PostgreSQL. Homologação exclusivamente posterior no notebook, sem ligação com ambiente fabril.
