# =====================================================================
#  Crea (o actualiza) la tarea de Windows que hace el backup diario del
#  Gestor de RRHH. Corre con el usuario actual, todos los días a la hora
#  indicada; si la PC estaba apagada a esa hora, corre apenas se prende.
#  Uso (PowerShell, desde la carpeta del proyecto):
#    powershell -ExecutionPolicy Bypass -File backup\programar-tarea.ps1 [-Hora 13:30]
#  Para sacarla:  Unregister-ScheduledTask -TaskName "Backup RRHH Cindy" -Confirm:$false
# =====================================================================
param(
  [string]$Hora = "13:30",
  [string]$Carpeta = "G:\Mi unidad\Backups RRHH",
  [string]$ArchivoEnv = "$env:USERPROFILE\.claude\backup-rrhh.env"
)
$ErrorActionPreference = "Stop"
$nombre = "Backup RRHH Cindy"
$proyecto = Split-Path -Parent $PSScriptRoot
$script = Join-Path $proyecto "backup\hacer-backup.cjs"
$node = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path $ArchivoEnv)) { throw "No existe $ArchivoEnv. Corré primero: node backup\preparar-clave.cjs" }

$argumentos = "`"$script`" --env `"$ArchivoEnv`" --a-carpeta `"$Carpeta`" --origen programado"
$accion = New-ScheduledTaskAction -Execute $node -Argument $argumentos -WorkingDirectory $proyecto
$disparador = New-ScheduledTaskTrigger -Daily -At $Hora
$opciones = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 10)
# Con el usuario logueado: así ve la unidad de Google Drive para escritorio (G:)
$quien = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $disparador -Settings $opciones -Principal $quien `
  -Description "Backup diario de la base del Gestor de RRHH a $Carpeta (30 días). Proyecto: $proyecto" -Force | Out-Null

$t = Get-ScheduledTask -TaskName $nombre
$info = Get-ScheduledTaskInfo -TaskName $nombre
"Tarea '$nombre' lista: todos los días a las $Hora. Próxima: $($info.NextRunTime). Estado: $($t.State)."
