# Acompanhamento público — operação após 24/09/2026

## Instalação oficial

A execução de produção fica em **C:\ProgramData\iTechERP**. O projeto em G: é a fonte de desenvolvimento; não é mais a dependência de execução do servidor.

- Backend e frontend administrativo compilado: `C:\ProgramData\iTechERP\backend`.
- Banco único: `C:\ProgramData\iTechERP\backend\db\itech.db`.
- Uploads: `C:\ProgramData\iTechERP\backend\uploads`.
- Configuração de produção: `C:\ProgramData\iTechERP\backend\.env`.
- Manifesto da instalação, origem e backup: `C:\ProgramData\iTechERP\runtime.json`.
- Logs: `C:\ProgramData\iTechERP\backend\logs`.

O `.env` da fonte foi ajustado com `ITECH_DB_PATH` e `ITECH_UPLOAD_PATH` para usar os mesmos dados, caso o código seja iniciado manualmente. O banco antigo em G: foi preservado como referência anterior à migração; não é o banco de produção atual. Não copie esse banco antigo por cima do banco local.

`iniciar.bat` e `iniciar-acompanhamento.bat` solicitam a execução da tarefa oficial **iTech ERP - Startup Supervisor**. Essa tarefa foi substituída, não duplicada: executa como SYSTEM, no boot e a cada minuto, sem login, sem limite de duração que encerre os filhos e com instâncias simultâneas ignoradas. Ela verifica administrativo 3001, acompanhamento e health real, Cloudflared e domínio; depois verifica o proxy interno. Falha no Caddy não impede a verificação do Tunnel.

O Cloudflared continua como serviço Windows. Seu início é Manual, ordenado pela tarefa após as origens saudáveis; recuperação de falha do serviço em 5/15/60 segundos foi configurada. A supervisão também detecta o caso de processo ativo com domínio indisponível.

## Porta e Tunnel

A porta **3002 foi mantida** porque estava saudável durante o 502. Não houve conflito de porta nem evidência de crash do Node nessa ocorrência. A 3010 estava livre, mas trocar a porta não corrigiria requisições que sequer chegavam ao conector local.

A configuração de porta foi centralizada em `backend/config/publicTracking.js`: lê `PUBLIC_PORT` e tem fallback 3002; rejeita a porta administrativa e valores inválidos. Servidor, supervisor, inicializadores e URL de desenvolvimento consomem essa configuração.

```ini
PUBLIC_TRACKING_URL=https://acompanhar.itechcelulareinformatica.com.br
PUBLIC_PORT=3002
PUBLIC_TRUST_PROXY=loopback
```

Configuração remota efetivamente observada, versão 4:

```yaml
ingress:
  - hostname: acompanhar.itechcelulareinformatica.com.br
    service: http://localhost:3002
  - service: http_status:404
```

O Tunnel documentado anteriormente é `os-publico`, ID `fe6b9737-6d93-487d-b9f2-7a1449ab96dc`. O comando do serviço usa o token protegido em `C:\ProgramData\cloudflared\token`; não se deve colocar o token em documentação, argumentos de diagnóstico ou Git.

A rota é **remota**, não um `config.yml` local. O painel autenticado não estava acessível às ferramentas. Ainda é necessário conferir os conectores remotos e preferir origem IPv4 explícita `http://127.0.0.1:3002`. Não alegar que essa alteração remota já foi aplicada. Nenhuma nova porta foi publicada.

## Supervisão e logs

- `publicTrackingSupervisor.js` mantém apenas seu filho público, usa trava de sistema por porta, reinicia após saída e verifica `/health` a cada 15 segundos.
- Uma falha isolada é registrada; três falhas consecutivas após a tolerância de inicialização provocam reinício apenas do filho público. O administrativo não é encerrado por essa lógica.
- `/health` verifica a conexão SQLite e não participa do limite de requisições dos visitantes.
- `watch-public-tunnel.ps1` confirma health local e verifica domínio via IPv4, HTTP 200 e identidade JSON do serviço. Três falhas externas provocam recuperação somente do Tunnel, com intervalo mínimo de cinco minutos entre reinícios. Conectores recém-iniciados recebem tempo para registro.
- `public-server.log`, `public-server-error.log`, `watchdog.log`, `cloudflared.log` e `startup-supervisor.log` têm rotação de 5 MiB, com três cópias anteriores.
- `logs/native-tunnel/cloudflared.log` usa a rotação nativa do Cloudflared via `--log-directory` (1 MB e cinco cópias na implementação consultada). `cloudflared.log` na pasta principal contém decisões e diagnósticos do watchdog.

SSE mantém snapshot completo, heartbeat e atualização por leitura do SQLite compartilhado. Clientes desconectados são removidos por close/error/aborted. Clientes sem escoamento de dados não acumulam escritas indefinidamente. Exceções fatais do Node continuam encerrando o filho, com registro e recuperação; não são ignoradas para manter um processo inconsistente vivo.

## Validação e manutenção

```powershell
curl.exe http://127.0.0.1:3001/api/health
curl.exe http://127.0.0.1:3002/health
curl.exe -4 https://acompanhar.itechcelulareinformatica.com.br/health
Get-ScheduledTaskInfo -TaskName 'iTech ERP - Startup Supervisor'
Get-Service Cloudflared
```

Após alterar código em G:, execute `infra/runtime/update-runtime.ps1` em PowerShell administrativo durante manutenção. O script para somente os processos identificados do runtime, publica código e catálogos e reativa a tarefa. **Não sobrescreve banco, uploads, `.env` ou logs de produção.** Alterações de configuração devem ser aplicadas no `.env` de produção e coordenadas com a rota remota quando mudarem a porta. Não execute novamente o instalador inicial para atualizar o sistema.

A migração original tem backup em `C:\ProgramData\iTechERP\backups\before-runtime-20260924-124445`. Restaurar esse backup após novas operações descartaria dados novos: qualquer rollback deve preservar o banco atual e seus arquivos WAL, com todos os escritores parados, ou usar backup consistente do SQLite.

Os 25 testes do backend passaram, incluindo isolamento público, tokens, SSE, desconexões abruptas e testes do supervisor com travamento, saída inesperada e duplicatas. As 40 tabelas preservaram as contagens e os dois bancos passaram em `integrity_check`. O teste controlado de recuperação está em `C:\ProgramData\iTechERP\recovery-test.json`.

Ainda não foram validados um reboot real do Windows, uma OS real em múltiplos dispositivos e o acesso por celular. Testes de SSE usam banco isolado; links de clientes não foram regenerados nem seus status alterados para teste. Veja `infra/runtime/RELATORIO-20260924.md` para os resultados externos e limitações.
