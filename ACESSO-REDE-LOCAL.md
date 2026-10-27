# Acesso administrativo pela rede local

A porta 4001 é servida pelo Node/Express (`backend/server.js`), incluindo API e frontend estático em `backend/public`. O Vite de desenvolvimento usa 5174.

O bind fixo é `0.0.0.0`. A porta usa `process.env.PORT || 4001`. O servidor de acompanhamento público do Projeto 2 roda na porta 3102 (`PUBLIC_PORT=3102`).

## Inicialização

O processo anterior, PID 8664, era iniciado pela cadeia `cmd /k "npm start"` → npm → `node server.js`. O `iniciar.bat` inicia o mesmo comando na pasta backend, portanto já incorpora a correção em futuras execuções. `npm run dev` usa `nodemon server.js` e também incorpora a correção.


O processo antigo da porta 3001 foi encerrado especificamente por PID e substituído pelo mesmo `node server.js`, com diretório de trabalho backend, em segundo plano. Logs desta execução: `tmp/lan-access/panel.out.log` e `panel.err.log`.

## Verificação em 09/09/2026

```text
TCP    0.0.0.0:3001    0.0.0.0:0    LISTENING    14480
```

Frontend HTTP 200 e `/api/health` com status `ok` nos três endereços:

- http://localhost:4001
- http://127.0.0.1:4001
- http://192.168.1.199:4001

IPv4 atual: `192.168.1.199`, interface Ethernet, perfil Private. O usuário confirmou que o painel abriu normalmente no celular pelo Wi-Fi. O netstat também registrou conexões de outro dispositivo da LAN, `192.168.1.209`, para a porta 3001.

O serviço público em `http://127.0.0.1:3002/health` retornou `ok`, `itech-public-tracking`, antes e depois do reinício do painel.

## Firewall

A consulta elevada encontrou uma regra existente, habilitada, de entrada Allow para TCP 3001, nome `{e64d06a6-5f16-4c15-b17a-a3a3d89cba28}`, com perfil Any e endereços remotos Any. Ela inclui rede privada. Nenhuma regra foi criada ou alterada. O escopo mais amplo já existia; esta correção não o ampliou.

O script de diagnóstico `tmp/lan-access/ensure-firewall.ps1` e o resultado `firewall-result.txt` registram a verificação. Não houve alteração em roteador, encaminhamento de portas ou Cloudflare Tunnel.

Se o IPv4 mudar por DHCP, use o novo endereço. A alteração do bind permanece ao reiniciar o servidor ou executar o inicializador existente.

