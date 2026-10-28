# ANDON Web Industrial — Assistente HTTPS

## Objetivo

O menu oficial do ANDON oferece configuracao de HTTPS sem exigir comandos manuais para o perfil
**local**. A integracao nao muda a topologia industrial existente; producao continua fora do escopo.
A opcao `14 - Configurar HTTPS (assistente)` tem tres caminhos:

- **1 - HTTP legado:** restaura configuracao HTTP sem eliminar banco, dados, certificados ou workstations.
- **2 - HTTPS local assistido:** gera certificado para `127.0.0.1`, `localhost` e `::1` usando
  `mkcert`, apos consentimento explicito para confiar na CA local. Nao solicita caminhos PEM.
- **3 - HTTPS de rede:** requer nome/IP presente no certificado e par PEM emitido por CA
  confiavel, administrada pelo cliente. O ANDON nao cria CA corporativa.

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

## Servidor corporativo / ambiente industrial

Nao usar o modo local ou certificado de `localhost` para servidor de rede. Para acesso
por notebooks, kiosks e Node-RED use a opcao **3** com certificado cobrindo o host real e
uma cadeia confiavel em todos os dispositivos. O mini PC deve validar nome e CA do servidor;
os contratos REST de chamadas permanecem inalterados.

Provisao automatica de certificado por ACME (dominio validavel), CA corporativa e renovacao
nao estao implementadas neste assistente; requerem etapa especifica, inventario de
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
