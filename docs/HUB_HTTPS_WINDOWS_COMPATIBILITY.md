# Hub — compatibilidade HTTPS no Windows Server

Diagnóstico da interface administrativa em 27/10/2026. Esta entrega não instala certificados,
não altera o runtime e não ativa HTTPS ou o acesso central.

| Área | Estado atual verificado | Necessário antes da ativação |
| --- | --- | --- |
| Certificado | A instalação não provisiona certificado. | Emitir certificado confiável com SAN para o DNS/IP usado pelos notebooks, celulares e kiosks; instalar e validar a cadeia de confiança em todos os clientes. |
| API | O Fastify aceita `ANDON_TLS_CERT` e `ANDON_TLS_KEY`, mas o runtime Windows não os configura. | Definir os caminhos protegidos do certificado/chave na tarefa da API, garantir leitura pela conta do serviço e validar renovação/reinício. |
| Frontend | O launcher atual serve o preview em HTTP na porta 8080. | Terminar TLS em proxy Windows/reverse proxy ou configurar um servidor HTTPS suportado; preferir frontend e API sob a mesma origem pública. |
| Build e origem | A API é inferida pelo protocolo/host do frontend; CORS e o acesso central exigem origem exata. | Gerar o frontend com a URL HTTPS definitiva quando necessário e configurar `CORS_ORIGINS` e `ANDON_ACCESS_ORIGIN` com a origem HTTPS exata. |
| Runtime e instalador | `Andon.Runtime.Common.ps1` e o instalador geram URLs `http://` para 3001/8080. | Parametrizar esquema, host público, portas e caminhos TLS; preservar configuração existente durante atualização e rollback. |
| Launcher e atalhos | Kiosk, atalhos e documentação abrem `http://...:8080`. | Atualizar URL para HTTPS, validar fullscreen, perfil persistente, identidade da workstation e comportamento após reinício. |
| Watchdog e health | Watchdog e health checks consultam endpoints HTTP locais. | Definir se os checks permanecem internos em HTTP atrás do proxy ou passam a HTTPS; nesse caso, confiar no certificado e ajustar todas as sondas sem enfraquecer a validação. |
| Firewall e portas | 8080 e 3001 são publicados pela configuração atual. | Definir a topologia final: porta HTTPS pública e portas internas, regras do Firewall do Windows e ausência de exposição HTTP indevida. |
| Clientes industriais | Node-RED/mini PC ainda consomem contratos HTTP existentes. | Após o PR de identidade técnica, instalar confiança no certificado, armazenar o segredo fora do fluxo/repositório, renovar tokens e homologar fisicamente as leituras antes de ligar o acesso central. |

Critério de ativação futura: testar instalação limpa e atualização, reboot do Windows Server, tarefas
agendadas, watchdog, launcher/kiosks, notebooks/celulares, Node-RED/mini PC e rollback. A flag
`ANDON_CENTRAL_ACCESS_ENABLED` deve permanecer desligada até essa homologação terminar.
