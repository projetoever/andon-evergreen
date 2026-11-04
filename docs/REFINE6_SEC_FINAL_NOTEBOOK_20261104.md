# REFINE 6 — SEC-FINAL | Homologação da experiência de segurança no notebook

**Data:** 04/11/2026 · **Ambiente autorizado:** apenas notebook Windows com perfil HTTPS em loopback. **Não é deploy industrial.**

## Alterações deste pacote

- O cadastro de usuário inicia sempre em **modo simples** (perfil e máquinas), inclusive para contas legadas com ACL personalizada. A lista de permissões técnicas permanece acessível somente por ação explícita do Admin. Os grants já existentes não são modificados automaticamente.
- A aba **Integrações API** aparece somente na administração central do Admin principal. Ela usa a API segura já implementada para emitir, listar, rotacionar e revogar identidades técnicas Node-RED e mini PC GPIO, com escopos limitados à leitura. Segredos são exibidos apenas na resposta de emissão ou rotação, sem armazenamento no navegador.
- **Workstations** têm filtros para pendentes e online (online apenas no modo central). Aprovações pendentes ganham prioridade na lista. Nenhum UUID é excluído ou arquivado automaticamente.
- O modo legado exibe aviso contextual. A aba legada de senhas pode continuar presente para rollback quando central estiver OFF; isso **não** significa que a autenticação central foi ativada.
- Nenhum endpoint de controle GPIO, sirene, Node-RED, CLP ou máquina física foi adicionado/ativado. Identidades industriais são **somente leitura** e requerem client HTTPS real homologado separadamente.

## Como testar exclusivamente no notebook de desenvolvimento

1. Faça backup/commit das alterações locais antes de trocar a branch, atualize o clone depois que o PR deste pacote tiver sido integrado à `main`. Não executar sobre `C:\web-andon-industrial\andon` de produção.
2. Na raiz do clone **do notebook**, encerre o perfil HTTPS isolado sem apagar dados:

   ```powershell
   .\homologation\https\Stop-AndonHttpsHomologation.ps1
   git checkout main
   git pull --ff-only origin main
   .\homologation\https\Start-AndonHttpsHomologation.ps1
   ```

   A inicialização opera em `https://localhost:8443/hub`, API `https://localhost:3443`, banco fictício Docker `andon_https_hml` em `127.0.0.1:55432`. O launcher fixa `ANDON_CENTRAL_ACCESS_ENABLED=1` **somente neste processo isolado**. Todas as flags de escrita operacional continuam OFF por padrão.
3. Entre com o Admin central **existente no banco de homologação** ou siga a primeira configuração local segura, caso seja um banco realmente novo. Não limpe o banco nem as credenciais para forçar o cenário.
4. Abra `Hub → Administração → Usuários e Acessos`: perfis simples aparecem sem a matriz de 27+ permissões. Edite um usuário previamente personalizado, salve sem trocar o perfil, confira que seus grants seguem intactos.
5. Abra `Workstations`: teste os filtros Todas, Ativas, Inativas, Pendentes, Online e expansão de detalhes. Com segundo navegador de teste, confira aprovação pendente e proteção da workstation Admin.
6. Abra `Integrações API`: escolha Node-RED ou mini PC GPIO, selecione apenas os escopos necessários e emita **uma credencial de teste fictícia**. Confira clientId/secret uma única vez, revalidação da senha central e a listagem sem segredo. Faça rotação e revogação com justificativa. **Não inserir segredos em flows reais nem conectar clientes físicos**.
7. Verifique que a aba de senhas redundantes dos módulos **não** existe no Hub central. Se ainda aparecer, diagnostique endereço/modo/processos e procure a mensagem de **modo legado ativo**; não altere variáveis da instalação industrial.
8. Registre se Hub, ANDON, BI e Prioridades continuam acessíveis conforme a workstation e os grants. A ausência de permissão é um bloqueio esperado; não contorne ACL.

Para testar as operações centrais de chamado **com dados fictícios somente no notebook** e após avaliar riscos do ambiente local, reinicie o launcher explicitamente com:

```powershell
.\homologation\https\Stop-AndonHttpsHomologation.ps1
.\homologation\https\Start-AndonHttpsHomologation.ps1 -EnableCentralOperationalWrites
```

Não use `-RemoveData`. Esse comando não libera eventos físicos, sirene global, integrações físicas ou senhas antigas; mantenha os testes em rede local do notebook.

## Portões ainda abertos

- A funcionalidade de API Node-RED/GPIO fornece autenticação *read-only*, não software cliente nem integração da Máquina 37.
- Não declarar estação física online somente porque possui último contato; heartbeat/sessão precisam comprovar presença.
- Backup e restore com paridade de KPI, todos os clientes Node-RED/GPIO físicos, ACL remanescente e migração/rollback da senha legada exigem homologação.
- **Não habilitar `ANDON_CENTRAL_ACCESS_ENABLED` no servidor Evergreen** nem replicar a configuração de homologação como se fosse deploy.
