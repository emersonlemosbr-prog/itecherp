# Diagnóstico anterior às alterações — 24/09/2026

- Administrativo: 0.0.0.0:3001, Node PID 228, HTTP 200.
- Público: 0.0.0.0:3002, Node PID 11260, supervisor Node PID 4700; /health HTTP 200.
- Porta 3010 livre no netstat inicial.
- Cloudflared: serviço automático, PID 3172; comando: C:\Program Files (x86)\cloudflared\cloudflared.exe tunnel run --token-file C:\ProgramData\cloudflared\token.
- Configuração remota efetiva v4: acompanhar.itechcelulareinformatica.com.br -> http://localhost:3002; fallback http_status:404. Capturada em cloudflared-config-before.json.
- /ready: quatro conexões; connectorId 246b5eaa-c177-42c8-9b9f-2202b94dbb5b.
- Domínio: HTTP 502 repetidamente. Cinco pedidos adicionais não alteraram total_requests=7284 nem request_errors=10 no conector local. Causa remota/conexão ainda exige investigação; não demonstrado crash do Node.
- localhost IPv4 funciona; ::1:3002 não escuta. Não prova que IPv6 causou o 502.
- Tarefa única encontrada: iTech ERP - Startup Supervisor, logon interativo + repetição de um minuto, execução máxima de quatro minutos. Depende de G: / Google Drive e login.
- Inicializador não recupera Tunnel após erros externos; supervisor Node só trata saída, não travamento; logs sem rotação.
- startup-supervisor.log tinha 9.2 MB. Sem fatal recente no final do log Node; ECONNRESET registrado sem encerrar processo.
- Sessão de ferramentas sem elevação; linhas de comando dos processos elevados não disponíveis via CIM. Nenhum navegador conectado. Não há API Cloudflare administrativa configurada nas variáveis de ambiente.
- Backup do XML e dos scripts de inicialização neste diretório. Nenhuma alteração de produção feita antes deste registro.
