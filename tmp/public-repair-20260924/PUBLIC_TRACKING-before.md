# Acompanhamento público

Inicie o administrativo normalmente (porta 3001). Para iniciar o público em segundo plano, abra `iniciar-acompanhamento.bat`: ele executa `iniciar-acompanhamento.ps1`, verifica se o serviço já está ativo, inicia um processo Node oculto e aguarda o health check. Os logs ficam em `backend/logs/public-tracking.out.log` e `backend/logs/public-tracking.err.log`. O processo continua ativo após fechar o terminal; depois de reiniciar o Windows, execute novamente esse arquivo. Não instala serviço ou tarefa automática no Windows.

Na instalação deste computador, execute o administrativo e o acompanhamento a partir de `G:\Outros computadores\Meu computador\itech-erp FINAL`. Os dois usam `backend\db\itech.db` dessa pasta quando `ITECH_DB_PATH` não está definido. O script de início do acompanhamento confere também o diretório do processo que ocupa a porta 3002; uma resposta `/health` de outra cópia do projeto não é suficiente para aceitá-lo. Se apontar outro diretório, identifique e encerre somente aquele processo público antes de iniciar esta cópia.

Alternativamente, em um terminal dentro de `backend`, execute `npm run start:tracking` e mantenha esse terminal aberto. O ponto de entrada é `backend/publicTrackingServer.js`. O processo separado escuta em `0.0.0.0:3002` por HTTP, sem TLS local, e abre o banco em modo somente leitura. `PUBLIC_PORT` permite mudar a porta pública, mas rejeita a porta administrativa. Se usar `ITECH_DB_PATH`, configure o mesmo caminho absoluto nos dois processos. A migração original do acompanhamento deve ter sido aplicada pelo administrativo antes da primeira inicialização pública.

Em uma OS, clique em **Gerar acompanhamento**. Copie o link ou imprima o QR Code antes de sair. Cada geração usa `crypto.randomBytes(32)` e substitui o hash SHA-256 anterior, invalidando o link antigo, inclusive conexões SSE abertas. O token não fica salvo no banco, logs de acompanhamento ou localStorage. O link funciona como credencial: compartilhe apenas com o cliente.

Configuração definitiva no `backend/.env`:

```ini
PUBLIC_TRACKING_URL=https://acompanhar.itechcelulareinformatica.com.br
PUBLIC_PORT=3002
PUBLIC_TRUST_PROXY=loopback
```

Reinicie o administrativo para carregar alterações da URL e gere novos links. A URL do QR Code será `https://acompanhar.itechcelulareinformatica.com.br/acompanhamento/<TOKEN>`. O fallback de desenvolvimento no código continua HTTP local quando a variável não existe. A URL pública não muda o protocolo do servidor local.

No Cloudflare Tunnel **os-publico**, ID `fe6b9737-6d93-487d-b9f2-7a1449ab96dc`, use esta rota publicada:

| Campo | Valor |
| --- | --- |
| Hostname | `acompanhar.itechcelulareinformatica.com.br` |
| Subdomínio, se houver campo separado | `acompanhar` |
| Domínio, se houver campo separado | `itechcelulareinformatica.com.br` |
| Path | vazio |
| Tipo de serviço | `HTTP` |
| URL da origem | `http://127.0.0.1:3002` |
| Campo URL quando o painel já fornece o tipo HTTP separado | `127.0.0.1:3002` |

Não configure HTTPS na origem, nem encaminhe o túnel para 3001. `127.0.0.1` evita depender da resolução IPv6 de `localhost`. O bind `0.0.0.0` aceita IPv4; ele não afirma escutar em `::1`. Os curls normais com `localhost` foram validados. O painel administrativo permanece em `127.0.0.1:3001`.

O servidor público oferece somente `/` (JSON `{"status":"online"}`), `/health` (JSON `{"status":"ok","service":"itech-public-tracking"}`), a página `/acompanhamento/:token`, dois arquivos CSS/JS próprios e `/api/public/service-order/:token/events`. O frontend público é HTML/JS/CSS nativo em `backend/tracking`, portanto não precisa de build Vite nem fallback de SPA. Tokens inválidos retornam 404 deliberadamente. Não carrega o build React administrativo nem importa roteadores administrativos. A antiga consulta `/api/track/:order_number` foi desativada; QR Codes antigos devem ser substituídos.

O SQLite registra o estado inicial e cada alteração de status atomicamente por triggers. Para OS preexistentes, o primeiro registro representa somente o estado conhecido na migração, com a última data registrada; não reconstrói transições antigas. Timestamps completos estão em UTC e são exibidos no horário local do navegador. Os sete status existentes são preservados.

O processo público consulta as conexões ativas a cada segundo e transmite alterações confirmadas no banco por SSE, incluindo histórico e previsão. Reconexões recebem um retrato completo; heartbeats são enviados a cada segundo. SSE usa `text/event-stream`, `Cache-Control: no-cache, no-store, no-transform`, `Connection: keep-alive` e `X-Accel-Buffering: no`. Limites: 60 requisições/minuto/IP, 5 conexões SSE/IP e 500 conexões totais. CORS não é necessário: página, assets e EventSource usam a mesma origem.

`PUBLIC_TRUST_PROXY=loopback` confia apenas no proxy local para interpretar X-Forwarded-For, evitando que todos os visitantes compartilhem os limites de 127.0.0.1. A Cloudflare acrescenta o endereço de origem ao cabeçalho, e o Express considera o salto externo mais próximo; prefixos arbitrários não substituem esse endereço. Referência: [cabeçalhos HTTP da Cloudflare](https://developers.cloudflare.com/fundamentals/reference/http-headers/). Não amplie trust proxy para `true`. Configure buffering desligado e timeout de leitura superior a 60 segundos se adicionar outro proxy. Desative/redija logs de URLs de acompanhamento no proxy para não registrar tokens. Os limites em memória são por processo e reiniciam com ele.

Validação: `cd backend && npm test`; `cd frontend && npm run build`. O build administrativo deve ser copiado para `backend/public` conforme o fluxo de distribuição existente. Nenhum build administrativo deve ser servido na porta 3002.

Diagnóstico e validação do Tunnel em 08/09/2026: antes da correção não havia listener na porta 3002; curls para 127.0.0.1 e localhost falhavam, o serviço Cloudflared estava Running e o hostname retornava 502. Depois de iniciar o público, os quatro curls locais (`/` e `/health`, com ambos os hosts) e os dois HTTPS pelo hostname retornaram 200, sem alterar DNS ou configurações da Cloudflare. Isso demonstra a indisponibilidade da origem como causa observada; não foi necessário atribuir o erro a IPv6. Um 404 de rota não é, por si só, um 502 do Tunnel. Referência: [diagnóstico oficial do Tunnel](https://developers.cloudflare.com/tunnel/troubleshooting/).

Os testes automatizados usam SQLite temporário separado da produção e cobrem token/hash, dados permitidos, histórico, atualização SSE, heartbeat, revogação, assets, portas, health, bloqueio das APIs internas e rate limiting com proxy. Há uma OS real com hash de acompanhamento no banco; o token original não pode ser recuperado do hash, portanto nenhum link real foi regenerado ou invalidado para testes. A verificação SSE com token válido foi feita em banco temporário. Para a verificação final com uma OS real, use o link guardado pelo operador ou gere pelo botão administrativo e abra em dois dispositivos enquanto altera o status normalmente.
