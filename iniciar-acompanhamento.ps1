$ErrorActionPreference = 'Stop'
$runtimeFile = 'C:\ProgramData\iTechERP\runtime.json'
if (Test-Path -LiteralPath $runtimeFile) {
    $runtime = Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json
    if ($runtime.installed -and $PSScriptRoot -ne $runtime.root) {
        Start-ScheduledTask -TaskName 'iTech ERP - Startup Supervisor'
        Write-Output 'Acompanhamento gerenciado pela tarefa oficial SYSTEM. Logs: C:\ProgramData\iTechERP\backend\logs'
        exit 0
    }
}
$backendPath = Join-Path $PSScriptRoot 'backend'

# A resposta de /health sozinha pode vir de outra copia do projeto com outro SQLite.
function Get-ListeningProcessDirectory([int]$Port) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
        Where-Object { $_.LocalAddress -eq '0.0.0.0' -or $_.LocalAddress -eq '127.0.0.1' } |
        Select-Object -First 1
    if (-not $listener) { throw "Nenhum processo escuta na porta $Port." }
    if (-not ('TrackingProcessDirectory' -as [type])) {
        Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class TrackingProcessDirectory {
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(int access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] buffer, int size, out IntPtr read);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr process);
    [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr process, int cls, byte[] buffer, int length, out int result);
    static byte[] Read(IntPtr handle, long address, int length) {
        var bytes = new byte[length]; IntPtr count;
        if (!ReadProcessMemory(handle, new IntPtr(address), bytes, length, out count) || count.ToInt64() != length)
            throw new Exception("ReadProcessMemory failed: " + Marshal.GetLastWin32Error());
        return bytes;
    }
    public static string Get(int pid) {
        var handle = OpenProcess(0x410, false, pid);
        if (handle == IntPtr.Zero) throw new Exception("OpenProcess failed: " + Marshal.GetLastWin32Error());
        try {
            var pbi = new byte[48]; int result;
            int status = NtQueryInformationProcess(handle, 0, pbi, pbi.Length, out result);
            if (status != 0) throw new Exception("NtQueryInformationProcess failed: " + status);
            long peb = BitConverter.ToInt64(pbi, 8);
            long parameters = BitConverter.ToInt64(Read(handle, peb + 0x20, 8), 0);
            var currentDirectory = Read(handle, parameters + 0x38, 16);
            int length = BitConverter.ToUInt16(currentDirectory, 0);
            long address = BitConverter.ToInt64(currentDirectory, 8);
            return Encoding.Unicode.GetString(Read(handle, address, length));
        } finally { CloseHandle(handle); }
    }
}
'@
    }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ParentProcessId)" -ErrorAction SilentlyContinue
    return [PSCustomObject]@{
        Pid = $listener.OwningProcess
        Directory = [TrackingProcessDirectory]::Get($listener.OwningProcess)
        CommandLine = $process.CommandLine
        ParentPid = $process.ParentProcessId
        ParentCommandLine = $parent.CommandLine
    }
}

Push-Location $backendPath
try {
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $publicPort = & $nodePath -e "console.log(require('./config/publicTracking').getListenConfig().port)"
    if ($LASTEXITCODE -ne 0) { throw 'Configuracao da porta publica invalida.' }
    $healthUrl = "http://127.0.0.1:$publicPort/health"
    $health = $null
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    } catch { }
    if ($health -and $health.status -eq 'ok' -and $health.service -eq 'itech-public-tracking') {
        $owner = Get-ListeningProcessDirectory $publicPort
        $expectedDirectory = [IO.Path]::GetFullPath($backendPath).TrimEnd('\')
        $actualDirectory = [IO.Path]::GetFullPath($owner.Directory).TrimEnd('\')
        # Google Drive exposes the same directory through two aliases. Compare
        # filesystem identity, never contents, before accepting another spelling.
        $sameDirectory = $actualDirectory -eq $expectedDirectory
        if (-not $sameDirectory) {
            $identityMatch = & $nodePath -e "const fs=require('fs'); const [a,b]=process.argv.slice(1).map(p=>fs.statSync(p,{bigint:true})); console.log(a.ino!==0n && a.dev===b.dev && a.ino===b.ino ? 'same' : 'different')" $actualDirectory $expectedDirectory
            $sameDirectory = $LASTEXITCODE -eq 0 -and $identityMatch -eq 'same'
        }
        if (-not $sameDirectory) {
            throw "A porta $publicPort pertence ao PID $($owner.Pid) em '$actualDirectory'. Esperado: '$expectedDirectory'. Pare apenas esse servidor publico antes de iniciar esta copia."
        }
        $expectedScript = Join-Path $actualDirectory 'publicTrackingServer.js'
        if ($owner.CommandLine -notmatch 'publicTrackingServer\.js' -or
            ($owner.CommandLine -match '[A-Za-z]:\\[^\"]*publicTrackingServer\.js' -and
             $owner.CommandLine.IndexOf($expectedScript, [StringComparison]::OrdinalIgnoreCase) -lt 0)) {
            throw "A porta $publicPort pertence ao PID $($owner.Pid), mas executa outro arquivo de servidor publico."
        }
        if ($owner.ParentCommandLine -match 'publicTrackingSupervisor\.js') {
            $supervisorFile = Get-Item (Join-Path $backendPath 'scripts/publicTrackingSupervisor.js')
            $parentProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($owner.ParentPid)"
            if ($parentProcess.CreationDate -ge $supervisorFile.LastWriteTime) {
                Write-Output "Acompanhamento supervisionado ja esta ativo: $healthUrl | Supervisor: $($owner.ParentPid) | PID: $($owner.Pid)"
                exit 0
            }
            Write-Output "Atualizando supervisor antigo PID=$($owner.ParentPid); administrativo preservado."
            Stop-Process -Id $owner.ParentPid -Force
        }
        Write-Output "Servidor publico PID $($owner.Pid) esta saudavel, mas sem supervisor. Migrando com seguranca."
        Stop-Process -Id $owner.Pid -Force
        Start-Sleep -Seconds 1
    }
    $logPath = Join-Path $backendPath 'logs'
    $busy = Get-NetTCPConnection -State Listen -LocalPort $publicPort -ErrorAction SilentlyContinue
    $existingSupervisor = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match [regex]::Escape($backendPath) -and $_.CommandLine -match 'publicTrackingSupervisor\.js' }
    if ($busy -or $existingSupervisor) {
        if ($existingSupervisor) {
            Write-Output "Encerrando supervisor publico anterior nao saudavel..."
            $existingSupervisor | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
            Start-Sleep -Seconds 1
        }
        $busyAgain = Get-NetTCPConnection -State Listen -LocalPort $publicPort -ErrorAction SilentlyContinue
        if ($busyAgain) {
            $busyAgain | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
            Start-Sleep -Seconds 1
        }
    }
    New-Item -ItemType Directory -Path $logPath -Force | Out-Null
    $supervisorScript = Join-Path $backendPath 'scripts/publicTrackingSupervisor.js'
    $publicProcess = Start-Process -FilePath $nodePath -ArgumentList ('"' + $supervisorScript + '"') -WorkingDirectory $backendPath -WindowStyle Hidden -PassThru
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 500
        if ($publicProcess.HasExited) { throw 'Supervisor publico encerrou. Consulte backend/logs/public-server-error.log.' }
        try {
            $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
            if ($health.status -eq 'ok' -and $health.service -eq 'itech-public-tracking') {
                Write-Output "Acompanhamento iniciado em segundo plano. PID: $($publicProcess.Id). Health: $healthUrl"
                exit 0
            }
        } catch { }
    }
    throw 'Health check nao respondeu. Consulte backend/logs/public-server-error.log.'
} finally { Pop-Location }
