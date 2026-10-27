# HTTPS no computador principal

Copie os dois arquivos deste pacote para o computador que terá o Android conectado por USB.

1. Confira a identidade da CA: SHA-1 `686592067740E3AEF5437ADA5211267578CEA3B6`.
2. Abra PowerShell **como Administrador** na pasta extraída.
3. Execute:
   `powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-main-computer.ps1`
4. Feche e abra novamente Chrome ou Edge.
5. Acesse `https://itech.internal/removedor-virus`.

O script associa `itech.internal` a `192.168.1.199` no arquivo hosts e instala apenas o certificado público da CA no repositório de raízes confiáveis do Windows. Ele não contém a chave privada da CA. O certificado pode ser removido pelo thumbprint acima se a configuração deixar de ser usada.
