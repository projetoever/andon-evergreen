# REFINE19 CFG-15K — Transações locais de áudio IndexedDB (14/11/2026)

## Causa confirmada
No serviço de arquivos de som local, `runTransaction` configurava `tx.oncomplete`/`onerror`/`onabort` **após** aguardar `runner(store)`. Em leituras/gravações muito rápidas, a transação podia já ter concluído, deixando a Promise pendente. Isso afeta retorno dos botões de arquivos de áudio, não a sirene física.

## Correção
Registrar os três handlers imediatamente após criar a transação, antes do primeiro `await`. A resposta da API local só retorna após o evento de conclusão (commit); falhas solicitam `abort` quando a transação ainda está ativa, preservando o erro original; conexão é fechada em `finally`. Nenhuma mudança no formato do IndexedDB, nome da store, arquivos atuais ou reprodução do som padrão.

## Testes e segurança
Regressão `tests/soundStorageTransaction.test.ts`: mock IndexedDB conclui transação **antes de o runner retomar**, lê vazio, grava som e lê novamente sem travar; conta commits e encerramentos de conexão. Teste isolado, não migra banco, não toca dados de fábrica, HTTP/CSRF, GPIO, Node-RED ou CLP. CI Windows PowerShell5.1 + Linux/PostgreSQL + frontend/SSR antes de merge. Homologação: abrir aba Sons no notebook, listar e reproduzir arquivo local já cadastrado, salvar arquivo de teste em terminal de teste e verificar leitura sem espera infinita.
