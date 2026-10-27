# Etapa 3B.1 — evidências visuais

O teste `tests/browser/workstationAdmission.mjs` renderiza o frontend de produção em HTTPS nos
viewports 1366×768 e 390×844. O workflow do PR publica oito capturas no artefato
`workstation-admission-visual-evidence`:

- identificação restrita;
- solicitação aguardando aprovação;
- decisão administrativa expandida;
- Hub aprovado exibindo somente o módulo efetivamente autorizado.

O mesmo teste rejeita overflow horizontal, erros de página e liberação visual de módulos não
autorizados.
