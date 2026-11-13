# REFINE 18 — BRAND-02: identidade oficial de engrenagem ANDON (13/11/2026)

## Decisão do responsável
Aprovado o **primeiro emblema com engrenagem** apresentado no planejamento de campanha: engrenagem prateada, arco de status verde→amarelo→laranja→vermelho, pulso branco, onda verde, fundo azul-grafite e palavra **ANDON**. **Nunca incluir o nome de cliente Evergreen na arte**; o nome da empresa é dado de instalação e só aparece dinamicamente no título da aba conforme o campo configurado em Hub > Empresa e unidade.

## Materiais de marca oficiais
- **PNG 4096×4096:** https://drive.google.com/file/d/1jP5GJYEZ_JIcK-aJN2O8WmHYi2WYD1cj/view?usp=drivesdk
- **Kit completo de tamanhos e favicon (.ico, PNG 16–4096):** https://drive.google.com/file/d/1yjDWotrErN5VVk4z41KX35_tTfSFPIzy/view?usp=drivesdk
- Arte raster oficial aprovada 1254×1254, ampliada com reamostragem Lanczos para 4K (não alegar imagem raster como vetor nativo).
- SHA256 do PNG 4K: `c6971cc83b9801b9da80f78682bc9f4ce801e5b6adf4220353fcfab00fe703c4`.
- O **favicon SVG** em `public/favicon.svg` é uma **adaptação vetorial reduzida**, da mesma identidade, com engrenagem + indicador de status + pulso; sem tipografia ilegível. O logo completo PNG é a referência oficial para marketing/portfólio.
- A URL do favicon mudou de `/favicon.svg?v=1` para `/favicon.svg?v=2` para invalidar o cache. Nenhum logotipo já existente nas páginas será substituído nesta etapa.
- O título da aba usa `formatAndonBrowserTitle(clientName)`, implementado anteriormente, com fallback neutro `Andon` e atualização após gravação do cadastro.

## Homologação
CI de build Windows, Linux/PG/SSR/frontend e testes de regressão. Confirmar no notebook Chrome Windows/Android após atualização pela main, incluindo cache, 16×16, 32×32 e título. Sem qualquer alteração a configuração industrial, banco original, APIs, ACL, GPIO, Node-RED ou CLPs.
