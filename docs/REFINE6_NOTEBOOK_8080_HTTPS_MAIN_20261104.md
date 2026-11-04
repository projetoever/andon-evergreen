# REFINE 6 — Notebook: atualizar a main e testar HTTPS nas portas habituais

**Data:** 04/11/2026. Escopo estrito: Windows cliente local com banco Docker exclusivo de homologação. Não altera a Evergreen, suas estações ou a Máquina 37.

## Um único comando para os próximos updates

A partir do PR deste roteiro, na raiz do **clone Git do notebook** (PowerShell), execute:

```powershell
.\ATUALIZAR_NOTEBOOK.ps1
```

O script valida que é Windows cliente (não Windows Server), confirma o repositório esperado, não sobrescreve alterações locais, muda para `main`, faz `git pull --ff-only origin main`, encerra **somente** a instância de homologação identificada pelo próprio arquivo de estado, preserva o banco de teste e inicia:

- **Hub:** `https://localhost:8080/hub`
- **API:** `https://localhost:3001`
- **Banco de teste:** `andon_https_hml` em `127.0.0.1:55432`
- **Sessão Admin central e HTTPS:** ligados para teste
- **Operações centrais e paleta:** ligadas **somente** no banco isolado local
- **PLC, Node-RED e GPIO físicos:** não conectados, operações físicas desabilitadas

Os testes automatizados da CI não substituem o primeiro ensaio manual no notebook. O certificado localhost é provisionado via mkcert, com consentimento para instalar sua CA; nenhuma verificação TLS é desativada.

**Primeiro uso:** se as portas 8080 ou 3001 estiverem ocupadas pelo ANDON antigo do notebook, **pare o ANDON antigo no menu, opção 5**, e então execute o comando acima. Não apague nenhum banco. O script não mata processos desconhecidos, não modifica tarefas automáticas e não desliga o servidor da fábrica. Se houver watchdog local que reinicie a instância antiga, desative-o apenas no notebook pelo menu antes do teste.

**Se você usa o menu de instalação no notebook:** após trazer a atualização, poderá selecionar **opção 15 — Notebook: atualizar main + testar HTTPS central em 8080/3001**. A opção 2 tradicional permanece segura para a fábrica e não muda configurações de instalação automaticamente.

## O que aparece na tela

1. Abra `https://localhost:8080/hub` (não `http://`). Na primeira instalação deste banco, crie a senha Admin central, sem senha-padrão.
2. Em Administração → Usuários e Acessos, escolha Produção, Manutenção ou Gerente; permissões individuais ficam ocultas, com acesso avançado opcional. Usuários legados não perdem grants ao editar.
3. Em Workstations, filtre Pendentes ou Online, inspecione dados sem atribuir presença indevida ao último acesso.
4. Em Integrações API, emita, rotacione e revogue uma credencial fictícia para Node-RED ou mini PC GPIO. Só há leituras, nenhuma escrita física, e o segredo é mostrado uma vez.
5. Teste chamados e BI **no banco de homologação**, verificando ACL, sessões, temporizações, históricos e KPIs. Os dados desta base podem diferir dos dados anteriores do notebook, que ficam preservados e não são migrados automaticamente.

## O que NÃO acontece só com git pull

`git pull` traz os arquivos. **Não** reinicia o processo já aberto e **não** muda seu transporte HTTP/senha legada. Por isso, use `ATUALIZAR_NOTEBOOK.ps1` como rotina de atualização + inicialização do **notebook**. Não marque a instalação industrial como homologada só por CI verde.

## Encerrar teste (sem apagar banco)

```powershell
.\homologation\https\Stop-AndonHttpsHomologation.ps1
```

O perfil técnico antigo em 8443/3443 permanece disponível para regressões paralelas quando necessário, **mas não faz parte do fluxo diário do notebook**. Não é possível manter duas instâncias nas mesmas portas simultaneamente; este roteiro usa **apenas 8080/3001** para a interface e API visíveis.

## Restrições de implantação

- Não execute `ATUALIZAR_NOTEBOOK.ps1` no Windows Server nem em computadores industriais.
- Nunca ajuste `ANDON_CENTRAL_ACCESS_ENABLED=1` manualmente na Evergreen para imitar o notebook.
- O certificado local mkcert é adequado à homologação localhost, não à CA corporativa.
- Integrações físicas Node-RED/GPIO, recuperação da senha de instalações existentes, migração para o banco real, backup/restore e rollback ainda exigem ensaios controlados antes do deploy da fábrica.
