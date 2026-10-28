# ANDON Web Industrial — Assistente HTTPS

## Objetivo

O menu oficial do ANDON oferece configuracao de HTTPS sem exigir comandos manuais para o perfil
**local**. A integracao nao muda a topologia industrial existente; producao continua fora do escopo.
A opcao `14 - Configurar HTTPS (assistente)` tem tres caminhos:

- **1 - HTTP legado:** restaura configuracao HTTP sem eliminar banco, dados, certificados ou workstations.
- **2 - HTTPS local assistido:** gera certificado para `127.0.0.1`, `localhost` e `::1` usando
  `mkcert`, apos consentimento explicito para confiar na CA local. Nao solicita caminhos PEM.
- **3 - HTTPS de rede assistido:** identifica IPs do servidor, permite selecionar IP ou
  nome DNS completo (FQDN), verifica se o DNS aponta para a maquina e oferece tres caminhos:
  **1** emitir certificado local de homologacao em rede via mkcert (somente Windows cliente);
  **2** importar par PEM ja emitido pela CA confiavel da empresa;
  **3** gerar CSR corporativa usando OpenSSL previamente instalado (nao ativa HTTPS).
  O ANDON nao cria CA corporativa e nao modifica DNS nem firewall.

## Instalacao em um computador novo (Windows 10/11)

1. Instale o ANDON pelo fluxo oficial de instalacao e mantenha o banco/servicos isolados.
2. No menu, pare o ANDON (opcao 5) e escolha a opcao 14.
3. Selecione **2 - HTTPS local assistido**. A ferramenta explica que a confianca sera concedida
   **somente mediante sua confirmacao**. Ao negar, nenhuma configuracao de transporte e alterada.
4. Se `mkcert` nao existir, o instalador oferece instalacao pelo `winget`, mediante outro
   consentimento. Se o Windows nao suportar `winget`, use o instalador oficial do mkcert
   antes de repetir ou use o modo de rede com um certificado ja existente.
5. O certificado e a chave privada sao gerados em pasta temporaria com ACL exclusiva para
   Administradores/SYSTEM, verificados e instalados via transacao reversivel.
6. Use **4 - Iniciar ANDON** e **6 - Verificar saude**.
7. Abra `https://127.0.0.1:8080/hub` ou a porta local configurada.

O `mkcert` cria CA local de desenvolvimento. O arquivo privado da CA, mantido pelo proprio
mkcert, **nunca** deve ser compartilhado. O assistente nao copia nem publica esse segredo.
A alteracao da confianca na CA fica registrada no Windows, e **nao** e desfeita pelo rollback
HTTP do ANDON.

## Homologacao HTTPS de rede em estacao de testes (opcao 14 -> 3 -> 1)

1. Pare o ANDON e confirme backup e isolamento do banco.
2. Abra 14 -> 3, selecione **1 - Homologacao HTTPS em ambiente de rede**.
3. Escolha explicitamente um IPv4 valido (ignore interfaces Docker/VPN). Para teste imediato,
   escolha **IP de rede**, ou escolha **nome DNS** somente quando o registro A estiver
   resolvendo para o IPv4 escolhido.
4. O assistente explica a confianca da CA de teste e pede consentimento explicito.
   Se necessario oferece instalacao do mkcert via winget.
5. O certificado e a chave privada sao gerados sob ACL restritiva e validados,
   e a atualizacao de transporte existente e transacional (rollback em falha).
6. Inicie o ANDON com a opcao 4 e teste `https://IP:8080/hub` ou
   `https://NOME_DNS:8080/hub`, sempre com o host canonico escolhido.

O certificado mkcert nao e publico nem adequado a ambientes produtivos. Outros clientes
na rede **nao confiam automaticamente** na CA local. Para acesso remoto, a TI deve
decidir como distribuir *somente o certificado publico da CA* em dispositivos de teste.
Nunca distribua a chave privada da CA. O assistente nao altera firewall.

## DNS comercial: padrao recomendado

- Nome canonico estavel, por exemplo `andon.fabrica.empresa.internal`, dentro de uma
  zona DNS de propriedade/controlada pelo cliente (o nome e ilustrativo).
- IP fixo ou reserva DHCP e registro `A` correspondente no DNS da empresa.
- O assistente verifica `Resolve-DnsName` para o IPv4 escolhido. Se nao corresponder,
  apresenta um **exemplo nao executavel automaticamente** de `Add-DnsServerResourceRecordA`
  para o administrador do DNS. Ele deve confirmar a zona correta, que nao pode ser
  inferida com certeza do FQDN; tambem deve validar registro existente, TTL e acessos.
- Confirme DNS nos outros computadores e no mini PC. A resolucao do proprio servidor
  nao prova a disponibilidade para todos os clientes.
- O nome escolhido deve estar em SAN do certificado; trocar IP/nome pode exigir
  reemissao do certificado e planejamento para preservar identidades de workstation.
- Nao alterar `hosts` automaticamente nem instalar servidores DNS na maquina ANDON.

## Certificado corporativo: 14 -> 3 -> 3 (CSR)

1. Escolha o host oficial (DNS preferencial; a CSR pode ser gerada antes do registro
   existir, sob autorizacao explicita). O assistente lista o registro DNS necessario.
2. Se `openssl.exe` de procedencia aprovada estiver presente, gere CSR RSA 3072 SHA-256
   com SAN de DNS/IP. A chave fica em
   `C:\web-andon-industrial\tls\requests\csr-<id>\private-key.pem`, sob ACL
   restrita para SYSTEM/Administradores. **Nunca envie essa chave a CA**.
3. Envie apenas `andon.csr` a autoridade corporativa. Solicite certificado TLS com
   Server Authentication e SAN correspondente, cadeia completa e prazo adequado.
4. Quando receber o certificado PEM, pare o ANDON, entre em 14 -> 3 -> 2,
   selecione o mesmo host, e indique o certificado PEM e a chave privada do CSR.
   O assistente valida host, chave, periodo e confianca local.
5. Antes da implantacao, valide a cadeia de confianca e a resolucao DNS de
   **cada cliente** (workstations, kiosks, Node-RED, mini PC) e o rollback.

Se OpenSSL nao estiver disponivel, a geracao CSR solicita instalacao aprovada pela TI.
Nao e feita instalacao automatica ou download de executaveis. Certificado empresarial
e emitido por CA do cliente; CSR nao equivale a certificado confiavel.

## Limites de produto comercial (ainda pendentes)

Este PR melhora a provisao **assistida**, nao conclui a gestao integral do ciclo de vida.
A seguir serao necessarios: inventario/monitoramento de validade e cadeia, renovacao
assistida ou ACME onde couber, distribuicao administrada de confianca, respaldo de chave
segura, teste de revogacao, assistente de DNS integrado ao ambiente de TI do cliente
e teste fim a fim com Node-RED/GPIO. A escolha entre CA publica, PKI interna e ACME
depende dos dominios, politica de rede e autoridades do cliente.

## Servidor corporativo / ambiente industrial

Nao usar o modo local ou certificado de `localhost` para servidor de rede. Para acesso
por notebooks, kiosks e Node-RED use a opcao **14 -> 3 -> 2** com certificado cobrindo o host real e
uma cadeia confiavel em todos os dispositivos. O mini PC deve validar nome e CA do servidor;
os contratos REST de chamadas permanecem inalterados.

Provisao automatica de certificado por ACME, emissao direta pela CA corporativa e renovacao
ainda nao estao implementadas; requerem etapa especifica, inventario de
clientes e planejamento de expiracao/renovacao. Nao prometer HTTPS publico "um clique" para
IP privado ou `localhost`.

## Regras de seguranca

- Nao desabilitar verificacao TLS no Chrome, Node-RED, API ou testes.
- Acesso central permanece desabilitado por padrao; a troca de transporte nao o habilita.
- Dados e PostgreSQL existentes nao sao recriados; a transacao preserva `andon-config.json`,
  configuracao de rede, `server/.env` e pares TLS anteriores.
- Nenhum instalador deve modificar a Evergreen sem janela e autorizacao de implantacao.
- Homologar parada, reinicio, watchdog, Chrome, permissoes, certificados, rollback,
  funcionamento do ANDON e compatibilidade Node-RED/GPIO antes de mudar a rede industrial.

Referencias:
- https://github.com/FiloSottile/mkcert
- https://www.win-acme.com/ (futura avaliacao de ACME para DNS real)
