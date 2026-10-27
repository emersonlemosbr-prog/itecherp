# Relatório da intervenção — 24/09/2026

**Situação: infraestrutura local corrigida e persistente; tarefa ainda não concluída integralmente. Persistem respostas 502 em algumas sondas externas, e o painel Cloudflare autenticado não está disponível às ferramentas.**

## Causa e evidências

Antes de qualquer alteração, o administrativo respondia 200 em 3001 (PID 228) e o acompanhamento respondia 200 em 3002 (PID 11260, supervisor 4700). O serviço Cloudflared estava ativo (PID 3172), `/ready` indicava quatro conexões, mas o domínio retornava 502. Cinco pedidos adicionais não alteraram os contadores do conector local (`total_requests=7284`, `request_errors=10`).

Reiniciar somente o Cloudflared restaurou HTTP 200 sem reiniciar os servidores Node. Isso localiza a ocorrência inicial no caminho do Tunnel/encaminhamento externo, não em conflito de porta ou crash do origin. A causa última do comportamento remoto ainda não foi determinada. Conectores concorrentes em outro computador ou configuração/encaminhamento na Cloudflare são hipóteses a verificar no painel, não fatos comprovados.

Falhas concretas da arquitetura anterior também foram corrigidas: o monitor apenas registrava 502 sem recuperar o Tunnel; o supervisor Node só tratava saída, não travamento; logs não tinham limite; a execução dependia do Google Drive e de login interativo. Essas falhas impediam recuperação confiável e disponibilidade antes do login.

A porta IPv6 `::1:3002` não escutava, mas `localhost` e `127.0.0.1` respondiam em IPv4. Isso não demonstra IPv6 como causa do erro observado.

## Porta antiga e nova

- **3002:** permaneceu saudável, sem conflito, e foi mantida em produção.
- **Nova porta:** nenhuma foi ativada. A 3010 estava livre no diagnóstico, mas a falha não estava no listener local.
- `PUBLIC_PORT=3002` está no `.env` de produção. Um único módulo, `backend/config/publicTracking.js`, fornece validação e fallback coerente aos consumidores.
- Administrativo mantido na porta **3001**.

## Cloudflare efetivamente aplicado

Tunnel `os-publico`, ID `fe6b9737-6d93-487d-b9f2-7a1449ab96dc`, confirmado também no log nativo da execução atual.

A configuração **remota v4**, capturada pelo endpoint local do conector, continua:

`acompanhar.itechcelulareinformatica.com.br -> http://localhost:3002`

Fallback `http_status:404`. Não foi criado `config.yml` concorrente. O ajuste para IPv4 explícito e a auditoria dos demais conectores dependem do painel Cloudflare ou de acesso administrativo à API; o token de execução do serviço não foi exposto nem substituído.

Comando atual do serviço:

```text
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --log-directory "C:\ProgramData\iTechERP\backend\logs\native-tunnel" run --token-file C:\ProgramData\cloudflared\token
```

O serviço está com início Manual, acionado pela tarefa após as origens saudáveis, e recuperação de falha Windows em 5/15/60 segundos. Logs nativos têm rotação; o watchdog registra decisões separadamente.

## Persistência e dados

Runtime oficial: `C:\ProgramData\iTechERP`.

Banco único: `C:\ProgramData\iTechERP\backend\db\itech.db`.

Uploads: `C:\ProgramData\iTechERP\backend\uploads`.

Uma única tarefa `iTech ERP - Startup Supervisor`, como **SYSTEM**, com gatilho de **boot** e repetição a cada minuto, substituiu a tarefa interativa anterior. A execução foi confirmada na **sessão 0**, com `LastTaskResult=0`. Não depende de terminal nem de G: para executar. Os inicializadores em G: solicitam essa tarefa oficial.

A fonte também foi configurada para usar o banco e os uploads locais; não foi criada uma réplica independente para atender o público. `integrity_check` retornou `ok` para origem e destino, e as contagens das **40 tabelas coincidiram**. Backups e caminhos estão no manifesto `runtime.json`.

Houve uma interrupção controlada na migração, aproximadamente de 12:44:45 a 12:46:08. A primeira tentativa local detectou uma dependência de catálogo fora do backend; ela foi copiada, e os serviços foram novamente validados. O registro inicial do instalador que dizia health aprovado foi prematuro: uma execução aninhada tinha sido ignorada pelo mutex. A lógica do instalador foi corrigida e a confirmação real foi obtida nas execuções seguintes. Nenhuma alegação de zero interrupções inclui essa manutenção ou as falhas provocadas para teste.

O Caddy e sua CA existente foram preservados. O health HTTPS sob SYSTEM passou a usar o certificado raiz existente explicitamente, sem desativar validação TLS.

## Supervisão e testes

- **25 testes de backend aprovados**, incluindo financeiro, dados, armazenamento, usuários e acompanhamento.
- Reexecução final dos **6 testes públicos/supervisor aprovada** após os últimos ajustes.
- Teste SSE em banco temporário: consulta, mudança de status, heartbeat, revogação e 50 desconexões abruptas sem queda.
- O supervisor recusa duplicatas, tolera uma falha isolada e recupera travamento após três falhas; testes automatizados também validaram recuperação após saída inesperada e rotação.
- Em produção, encerramento controlado do público: PID **4660 -> 8760**, mantido supervisor **10132**. Administrativo permaneceu PID **13148** durante esse teste.
- Em produção, serviço Tunnel parado e recuperado automaticamente, com domínio novamente 200.
- PID Cloudflared após ativação dos logs nativos: **9348**.
- A lista de tarefas, inicializações e atalhos consultados não mostrou outro inicializador local ativo do acompanhamento. Pastas antigas sem uso comprovado não foram apagadas. Isso não equivale a auditar conectores em outros computadores.

Logs oficiais em `C:\ProgramData\iTechERP\backend\logs`:

- `public-server.log`, `public-server-error.log`, `watchdog.log`, `cloudflared.log`, `startup-supervisor.log`: 5 MiB + três cópias.
- `native-tunnel/cloudflared.log`: rotação nativa via `--log-directory`.

## Estabilidade

Duas séries, com intervalo aproximado de 15 segundos entre amostras:

| Período local | Amostras | Administrativo/origin/domínio vistos do servidor |
| --- | ---: | --- |
| 12:38:40–12:44:34 | 24 | todas HTTP 200 |
| 12:51:27–12:57:21 | 24 | todas HTTP 200 |

Portanto, aproximadamente 12 minutos de amostragem passaram pelo caminho do servidor. Isso **não elimina os 502 geográficos** descritos abaixo e não é garantia de funcionamento indefinido.

## Teste externo real

Foi usada a API pública do Check-Host, apenas com a URL pública `/health`, sem tokens de OS ou dados de clientes.

| Sonda independente | Resultado repetido |
| --- | --- |
| São Paulo, Brasil | HTTP 200 |
| Miami, EUA | HTTP 200 |
| Viena, Áustria | HTTP 200 na primeira rodada |
| Nuremberg, Alemanha | HTTP 502 |
| Qom, Irã | HTTP 502 |

Relatórios: [primeira rodada](https://check-host.net/check-report/4d3a338ak3d), [segunda rodada](https://check-host.net/check-report/4d3a3de2k5a3), [terceira rodada](https://check-host.net/check-report/4d3a5569kf9b).

A origem local permaneceu 200 e o conector consultado não registrou erros de proxy à origem nessas verificações. O próximo passo necessário é inspecionar no painel autenticado os conectores ativos do Tunnel, a rota publicada e o DNS/encaminhamento do hostname. Não é correto afirmar que todos os acessos externos foram corrigidos.

## Critérios que continuam pendentes

- Eliminar o 502 nas sondas da Alemanha e do Irã e esclarecer a causa remota.
- Conferir e, se necessário, remover conectores remotos concorrentes, com identificação de qual máquina os mantém.
- Validar uma OS real/de teste pelo domínio com alterações no administrativo e dois dispositivos. Não foi fornecido um link utilizável; não se regenerou link de cliente nem se alterou OS de produção para teste.
- Validar navegador em outro computador e celular em dados móveis. Sondas independentes são evidência de acesso externo, mas não substituem esses dispositivos.
- Reboot real do Windows. A tarefa SYSTEM e o gatilho de boot foram instalados e a execução em sessão 0 testada; o Windows não foi reiniciado nesta intervenção.

## Arquivos alterados ou criados no projeto

- `backend/.env`: caminhos do banco e uploads oficiais.
- `backend/config/publicTracking.js`: configuração central da porta.
- `backend/publicTrackingServer.js`: health independente de rate limit, tratamento de backpressure e remoção de token dos logs de erro de rota.
- `backend/services/publicTracking.js`: URL de fallback usa a configuração central.
- `backend/scripts/publicTrackingSupervisor.js`: supervisão por health, trava e recuperação.
- `backend/scripts/rotatingLog.js`: logs limitados.
- `backend/services/storage.js` e `backend/routes/notes.js`: caminho compartilhado de uploads configurável.
- `backend/tests/publicTracking.test.js` e `backend/tests/publicTrackingSupervisor.test.js`: testes de acompanhamento e recuperação.
- `iniciar-acompanhamento.ps1`, `iniciar-servicos.ps1`, `instalar-inicializacao-automatica.ps1`: inicialização oficial e tarefa SYSTEM.
- `infra/https/watch-public-tunnel.ps1`: recuperação separada do Tunnel.
- `infra/https/start-https.ps1`: preservação de CA e validação sob SYSTEM.
- `infra/runtime/install-runtime.ps1`: migração com backup e validação.
- `infra/runtime/update-runtime.ps1`: publicação futura sem sobrescrever os dados.
- `infra/runtime/test-recovery.ps1`: teste controlado de recuperação.
- `infra/runtime/configure-tunnel-service.ps1`: configuração de logs nativos com rotação.
- `PUBLIC_TRACKING.md`, `infra/https/OPERACAO.md` e este relatório.

Também foram criados o runtime local, backups, manifesto, logs, evidências JSON e o registro `infra/runtime/install.completed.json`. O diagnóstico inicial e os scripts anteriores estão em `tmp/public-repair-20260924/`.

## Referências técnicas

- [Diagnóstico oficial do Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/troubleshooting/).
- [Configuração remota do Tunnel](https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/subresources/configurations/methods/get/).
- [Rotação nativa no código do Cloudflared](https://github.com/cloudflare/cloudflared/blob/master/logger/configuration.go).
- [API de sondas externas](https://check-host.net/about/api).
