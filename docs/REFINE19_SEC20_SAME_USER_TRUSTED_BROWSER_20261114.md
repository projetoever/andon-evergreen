# REFINE19 SEC-20 — Mesma conta, múltiplos navegadores na workstation confiável

## Defeito real
Em `login`, cada novo login numa estação confiável fixada revogava indiscriminadamente **todas** as sessões da estação, apesar do comentário dizer que somente outra pessoa deveria deslocar a sessão existente. O operador usando dois navegadores no mesmo identificador lógico acabava obrigado a se reautenticar no navegador anterior.

## Alteração
A atualização condicional revoga somente sessões de **outros usuários** na workstation confiável, mantendo sessões já autorizadas da **mesma** conta. A validação do servidor em cada requisição, as flags de confiança, vinculação da máquina, escopo, permissões, cookies, versão de autorização, exclusão de Admin e revogação remota continuam intactas. Contas diferentes no mesmo terminal continuam não coexistindo durante troca de usuário. Workstations comuns preservam comportamento anterior.

## Não confundir
Navegadores distintos **não compartilham** cookies, identidades locais ou logins; o primeiro login em cada navegador ainda precisa de senha e o certificado HTTPS deve ser válido. Se o navegador gera outra identidade de workstation, necessita de aprovação específica. Perfis sem elegibilidade durável expiram como sessões humanas. Não há prova criptográfica de dispositivo nesta etapa (kiosk reservado).

## Testes
CI PostgreSQL isolado: duas autenticações com a mesma conta e workstation ID (dois cookies válidos), não invalidar sessão anterior, logout remoto invalida ambos, troca de senha preserva política elegível e renova token. Sem alteração de migrações/flags, servidor industrial, CLP, GPIO ou agentes.
