# Test de l'installateur (SPEC / PLAN M9) : installation silencieuse (/S) dans un dossier temporaire, lancement,
# ouverture d'un .qsp passé en argument (ce que fait un double-clic dans l'Explorateur, grâce à l'association), puis
# désinstallation, le tout sans erreur. Usage : powershell -File tools\test-installer.ps1 [-Setup chemin\Setup.exe]

param(
  [string]$Setup = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $Setup) {
  $Setup = (Get-ChildItem (Join-Path $root "dist") -Filter "Quilt Studio Setup *.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}
if (-not (Test-Path $Setup)) { throw "Installateur introuvable : $Setup" }

$work = Join-Path $env:TEMP ("qs-install-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
$target = Join-Path $work "app"
New-Item -ItemType Directory -Path $work | Out-Null
$failures = @()
function Check([string]$what, [bool]$ok) {
  if ($ok) { Write-Host "  ok   $what" } else { Write-Host "  ECHEC $what"; $script:failures += $what }
}

try {
  Write-Host "Installation silencieuse dans $target"
  # NSIS : /D= doit être le dernier argument, sans guillemets.
  $p = Start-Process -FilePath $Setup -ArgumentList "/S", "/D=$target" -Wait -PassThru
  Check "l'installateur se termine sans erreur (code $($p.ExitCode))" ($p.ExitCode -eq 0)
  $exe = Join-Path $target "Quilt Studio.exe"
  Check "l'exécutable est installé" (Test-Path $exe)
  Check "le désinstallateur est installé" (Test-Path (Join-Path $target "Uninstall Quilt Studio.exe"))
  $assoc = Get-ItemProperty "HKCU:\Software\Classes\.qsp" -ErrorAction SilentlyContinue
  Check "l'extension .qsp est associée" ($null -ne $assoc)

  # Un projet vide valide, passé en argument comme le ferait un double-clic.
  $stage = Join-Path $work "projet"
  New-Item -ItemType Directory -Path $stage | Out-Null
  $json = '{"formatVersion":1,"settings":{"maxColorings":2},"sketchbook":{"quilts":[],"blocks":[],"motifs":[],"stencils":[],"fabrics":[],"colors":[],"photos":[],"threads":[],"embroideries":[]},"assets":{},"frameColors":{}}'
  [System.IO.File]::WriteAllText((Join-Path $stage "project.json"), $json, (New-Object System.Text.UTF8Encoding($false)))
  $zip = Join-Path $work "Essai.zip"
  Compress-Archive -Path (Join-Path $stage "project.json") -DestinationPath $zip
  $qsp = Join-Path $work "Essai double-clic.qsp"
  Move-Item $zip $qsp

  # Les données de l'application vont dans le dossier temporaire : la machine de test n'est pas modifiée.
  $env:QUILT_STUDIO_DATA_DIR = Join-Path $work "data"
  $env:QUILT_STUDIO_DOCUMENTS_DIR = Join-Path $work "docs"
  Write-Host "Lancement avec le fichier .qsp en argument"
  $app = Start-Process -FilePath $exe -ArgumentList "`"$qsp`"" -PassThru
  $title = ""
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    $app.Refresh()
    $title = $app.MainWindowTitle
    if ($title -like "*Essai double-clic*") { break }
  }
  Check "la fenêtre porte le nom du projet ouvert (« $title »)" ($title -like "*Essai double-clic*")
  if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force }
  Get-Process -Name "Quilt Studio" -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 1

  Write-Host "Désinstallation silencieuse"
  $un = Start-Process -FilePath (Join-Path $target "Uninstall Quilt Studio.exe") -ArgumentList "/S", "_?=$target" -Wait -PassThru
  Check "le désinstallateur se termine sans erreur (code $($un.ExitCode))" ($un.ExitCode -eq 0)
  Start-Sleep -Seconds 1
  Check "l'exécutable est retiré" (-not (Test-Path $exe))
} finally {
  Remove-Item Env:\QUILT_STUDIO_DATA_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:\QUILT_STUDIO_DOCUMENTS_DIR -ErrorAction SilentlyContinue
  Get-Process -Name "Quilt Studio" -ErrorAction SilentlyContinue | Stop-Process -Force
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}

if ($failures.Count -gt 0) {
  Write-Host ""
  Write-Host "$($failures.Count) vérification(s) en échec."
  exit 1
}
Write-Host ""
Write-Host "Installateur : toutes les vérifications passent."
