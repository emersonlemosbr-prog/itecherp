# Operação do acesso interno e do acompanhamento

Atualizado em 24/09/2026. A instalação oficial agora fica em `C:\ProgramData\iTechERP`; consulte `PUBLIC_TRACKING.md` e `infra/runtime/RELATORIO-20260924.md`.

## Acesso interno preservado

- O hosts do servidor associa `itech.internal` a `192.168.1.199`.
- Caddy escuta em `192.168.1.199:80` e redireciona para HTTPS.
- HTTPS em `192.168.1.199:443` usa a CA interna existente e encaminha para `127.0.0.1:3001`.
- O acompanhamento na porta 3002 e a rota Cloudflare não passam pelo Caddy.
- As regras de firewall para a rede privada e a porta administrativa não foram alteradas nesta intervenção.
- Outros computadores ainda precisam da resolução hosts e da CA, conforme `setup-main-computer.ps1`. `nslookup` não testa o arquivo hosts.

## Inicialização persistente

Existe uma única tarefa oficial, `iTech ERP - Startup Supervisor`, executada como SYSTEM no boot e a cada minuto. Seu caminho aponta para C:, não para Google Drive. Ela verifica administrativo, público, health, Tunnel/domínio e proxy interno. O serviço Cloudflared inicia pela tarefa após os health checks e tem recuperação de falha configurada no Windows.

Os arquivos `iniciar.bat` e `iniciar-acompanhamento.bat` em G: solicitam a tarefa oficial; não criam uma segunda instalação. A pasta G: é a fonte de código. Após alterações de código, use `infra/runtime/update-runtime.ps1`, conforme a documentação de acompanhamento.

O Caddy conserva o executável e os dados/CA do perfil original, indicados em `C:\ProgramData\iTechERP\runtime.json`. Ao iniciá-lo sob SYSTEM, o script fornece o mesmo APPDATA ao processo. O health check HTTPS usa explicitamente o certificado raiz existente por `--cacert`, pois SYSTEM tem outro repositório de certificados. Não usa `--insecure`, não desativa TLS e não substitui a CA.

## Diagnóstico

```powershell
curl.exe http://127.0.0.1:3001/api/health
curl.exe http://127.0.0.1:3002/health
curl.exe -4 https://acompanhar.itechcelulareinformatica.com.br/health
curl.exe -L --ssl-revoke-best-effort http://itech.internal/api/health
Get-ScheduledTaskInfo -TaskName 'iTech ERP - Startup Supervisor'
Get-Service Cloudflared
```

Logs oficiais: `C:\ProgramData\iTechERP\backend\logs`. Logs do Caddy: `C:\ProgramData\iTechERP\tmp\lan-access` quando iniciado pelo runtime local. O processo Caddy que já estava funcionando foi preservado nesta migração.

Há verificações locais, recuperação controlada e execução na sessão 0 comprovadas. Um reboot real, consulta de OS em dispositivos físicos e a eliminação dos 502 em todas as sondas externas ainda não foram validados; não confundir esses resultados com garantia integral de disponibilidade.

O histórico da correção de 21/09 foi preservado em `tmp/internal-repair-20260921-183514`. O diagnóstico anterior à intervenção atual está em `tmp/public-repair-20260924/DIAGNOSTICO.md`.
