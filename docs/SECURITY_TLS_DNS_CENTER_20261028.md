# SEC-02 — Central de Certificados e DNS (primeira entrega)

Data: 28/10/2026
Base: Plano Mestre ANDON Web Industrial, após HTTPS-4.

## Escopo implementado

Nova visualização em **Hub > Administração > Segurança > Certificados e DNS**,
sem alterar a estrutura do menu nem credenciais do ANDON.

- Consulta sob HTTPS e sessão Admin legada ativa do certificado do processo da API.
- Emissor, validade, dias até o vencimento, status temporal e SHA-256.
- Nome do host canônico originado da configuração ativa e comparação com SAN
  DNS/IP do certificado (não apenas Common Name).
- Consulta somente leitura da resolução DNS no servidor para o host configurado;
  informa endereço(s) resolvido(s), sem modificar DNS, hosts, firewall ou DHCP.
- Exportação local manual de um arquivo TXT com metadados e **somente certificados
  públicos** de servidor/cadeia, nunca chaves privadas.
- Traduções PT/EN/ZH e mensagens alertando sobre confiança por dispositivo.

## Controles de segurança

- A rota `GET /api/admin-auth/tls-status` exige token da sessão Admin
  legada, API em HTTPS e cabeçalho Origin igual ao endereço da interface
  autorizado pela instalação.
- Respostas com `Cache-Control: no-store`.
- Acesso central habilitado: a rota permanece indisponível até integrar
  autenticação central e permissões da Fase B, sem criar bypass.
- O backend utiliza um retrato imutável do certificado público efetivamente
  carregado no listener HTTPS no início do processo; a página não reabre
  o certificado no disco em cada consulta. Uma substituição do arquivo sem
  reiniciar a API não será apresentada como renovação já ativa.
- O certificado público possui limite de tamanho; a API nunca devolve chave
  privada TLS, chave privada de CA, variáveis de banco, ambiente ou caminhos internos.
- Certificados públicos são extraídos apenas de blocos PEM `CERTIFICATE`,
  mesmo que um arquivo de origem contenha material adicional.
- A verificação local de datas/SAN não comprova a cadeia de confiança,
  revogação nem conectividade de outros dispositivos. DNS no servidor
  também não garante propagação ou acesso pelo mini PC.
- Nenhuma alteração de banco, migration, seed, serviço, certificado ativo
  ou ambiente industrial.
- Não expor identidade técnica do Node-RED nem alterar payloads 7–12.

## Testes e aceite

- Inspeção de certificado X.509 com SAN, impressão SHA-256, datas futuras
  e expiradas, rejeição de arquivos inválidos e garantia de PEM público.
- Rota fechada a usuário anônimo, HTTP e modo central ainda não integrado.
- Build frontend + servidor e suite integrada do CI.
- Homologação manual em Windows no dispositivo de testes:
  Administração > Segurança, atualização, exportação para TI e correlação
  com o certificado realmente apresentado no navegador.
- Aprovação antes do merge e aprovação independente antes de atualizar
  qualquer instalação.

## Próximas implementações, fora deste PR

1. Emissão e renovação corporativa automatizadas quando suportadas por PKI
   ou ACME, com trilhas de auditoria e rollback.
2. Exportação assistida de certificados de CA **públicos**, mediante
   verificação de procedência e autorização. Nunca a chave privada da CA.
3. Agendamento de verificações, alertas internos, diagnóstico por cliente
   e inventário de terminais industriais.
4. Integração definitiva com sessão central e RBAC da Fase B;
   migração da autenticação Admin legada apenas após homologação.
