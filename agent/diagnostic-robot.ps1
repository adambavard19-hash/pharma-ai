# PharmaBoost — diagnostic du robot de dispensation. LECTURE SEULE.
#
# Objectif : savoir COMMENT le logiciel de l'officine (LGPI…) parle au robot (BD Rowa…),
# pour que PharmaBoost puisse un jour lire ce qui est dispensé, sans rien modifier.
# En France, cet échange suit le protocole CDAPI (côté Rowa : l'interface WWKS2, du XML sur
# TCP/IP) dont les spécifications ne sont pas publiques : on observe d'abord.
#
# À lancer sur l'ordinateur du robot ET sur le serveur du logiciel de l'officine (un rapport chacun).
#
# Ce que ce script FAIT : il écrit un rapport texte sur le Bureau. Il lit les logiciels installés,
# les services et processus liés au robot, les ports réseau et série, les noms des dossiers et
# fichiers de journaux (pas leur contenu), quelques lignes de réglages réseau (adresses et ports,
# jamais un mot de passe), et la STRUCTURE masquée de la fin des journaux récents.
# Ce qu'il NE FAIT PAS : il ne contient aucune donnée patient dans le rapport (valeurs masquées),
# n'écrit rien dans le logiciel ni dans le robot, n'envoie rien sur Internet, ne capture pas le réseau,
# n'installe rien. Le rapport est un fichier que VOUS relisez avant de nous l'envoyer.

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

# Les mots qui désignent le robot et le logiciel de l'officine (noms de logiciels, de dossiers, de services).
$script:MotifRobot = "rowa|becton|pharmagest|lgpi|equasens|winpharma|alliadis|apostore|mediskill|consis|willach|pillpick|cdapi|robot|automat|kardex|\barx\b|meditech|pharmatic|cegedim|wwks"
# Une ligne de réglage qui parle de réseau ou de liaison : adresse, port, protocole…
$script:MotifReseau = "port|\bip\b|host|adresse|address|server|serveur|interface|protocol|protocole|cdapi|wwks|\bcom\d|baud|tcp|socket"
# Une ligne qui pourrait contenir un secret : jamais copiée.
$script:MotifSecret = "pass|pwd|mdp|secret|token|key|cl[eé]|login|user|utilisateur|licen"

function Get-Heading([string]$title) {
  return @("", ("=" * 70), $title, ("=" * 70))
}

# Une ligne XML sans ses VALEURS : on garde les noms des balises et des attributs, jamais ce qu'ils contiennent
# (ni le texte entre deux balises, ni celui qui précède la première ou suit la dernière, ni un CDATA, ni un commentaire).
function Hide-XmlValues([string]$line) {
  $masked = [regex]::Replace($line, '<!\[CDATA\[.*?\]\]>', '<![CDATA[…]]>')
  $masked = [regex]::Replace($masked, '<!--.*?-->', '<!--…-->')
  $masked = [regex]::Replace($masked, '>[^<]+<', '>…<')
  $masked = [regex]::Replace($masked, '^[^<]+<', '…<')
  $masked = [regex]::Replace($masked, '>[^>]+$', '>…')
  $masked = [regex]::Replace($masked, '="[^"]*"', '="…"')
  $masked = [regex]::Replace($masked, "='[^']*'", "='…'")
  if ($masked.Length -gt 220) { $masked = $masked.Substring(0, 220) + " …" }
  return $masked
}

# Les seuls mots gardés en clair dans une ligne de texte : le vocabulaire GÉNÉRIQUE d'un échange (pick, status, error…).
# Tout autre mot — un nom, un produit, un identifiant — est masqué. On ne devine pas qu'un mot est « du protocole »
# parce qu'il revient souvent : un nom de patient revient sur chaque ligne d'une même ordonnance.
$script:MotsDuProtocole = @{}
foreach ($word in @("pick", "picking", "request", "response", "reply", "answer", "article", "product", "produit", "item", "status", "state",
    "order", "commande", "stock", "input", "output", "store", "delivery", "deliver", "dispense", "dispensing", "sortie", "entree", "quantity",
    "qty", "quantite", "count", "number", "message", "send", "sent", "recv", "receive", "received", "connect", "connected", "disconnect",
    "disconnected", "tcp", "socket", "port", "host", "start", "started", "stop", "stopped", "begin", "end", "true", "false", "null", "none",
    "version", "type", "code", "error", "erreur", "warn", "warning", "info", "debug", "trace", "lgpi", "rowa", "cdapi", "wwks", "robot", "ack", "nak",
    "timeout", "retry", "busy", "ready", "idle", "done", "failed", "success", "unknown", "inconnu", "cip", "ean", "gtin", "pzn")) {
  $script:MotsDuProtocole[$word] = $true
}

# Une ligne de texte sans ses valeurs : chiffres → 9 ; mots hors vocabulaire générique → a/A.
function Hide-TextValues([string]$line) {
  $keep = $script:MotsDuProtocole
  $evaluator = [System.Text.RegularExpressions.MatchEvaluator]{
    param($m)
    if ($keep.ContainsKey($m.Value.ToLowerInvariant())) { return $m.Value }
    $shape = [regex]::Replace($m.Value, '[a-zà-ÿ]', 'a')
    return [regex]::Replace($shape, '[A-ZÀ-Ý]', 'A')
  }
  $masked = [regex]::Replace($line, '[A-Za-zÀ-ÿ_]{3,}', $evaluator)
  $masked = [regex]::Replace($masked, '\d', '9')
  if ($masked.Length -gt 220) { $masked = $masked.Substring(0, 220) + " …" }
  return $masked
}

# La structure masquée de la fin d'un fichier : jamais une valeur.
function Get-MaskedTail([string]$path, [int]$bytes, [int]$maxLines) {
  $stream = $null
  try {
    $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $length = [Math]::Min([long]$bytes, $stream.Length)
    [void]$stream.Seek(-$length, [System.IO.SeekOrigin]::End)
    $buffer = New-Object byte[] ([int]$length)
    [void]$stream.Read($buffer, 0, [int]$length)
    $text = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($buffer)
  } catch {
    return @("(illisible : " + $_.Exception.Message + ")")
  } finally {
    if ($stream) { $stream.Dispose() }
  }
  $lines = @($text -split "\r?\n" | Where-Object { $_.Trim() -ne "" })
  if ($lines.Count -gt 0) { $lines = $lines[0..([Math]::Min($lines.Count, 200) - 1)] }
  $shown = @()
  foreach ($line in $lines | Select-Object -Last $maxLines) {
    # Une ligne sans balise, même dans un fichier XML (une valeur sur sa propre ligne), est du texte : elle est masquée comme telle.
    if ($line.Contains("<")) { $shown += (Hide-XmlValues $line) } else { $shown += (Hide-TextValues $line) }
  }
  return $shown
}

# Une ligne de réglage réseau, sans secret : l'adresse et le port, c'est tout ce qu'on cherche.
function Get-NetworkSettings([string]$path) {
  $found = @()
  try {
    if ((Get-Item -LiteralPath $path).Length -gt 200KB) { return $found }
    foreach ($line in (Get-Content -LiteralPath $path -ErrorAction Stop -TotalCount 400)) {
      if ($line -match $script:MotifReseau -and $line -notmatch $script:MotifSecret) {
        $found += $line.Trim().Substring(0, [Math]::Min($line.Trim().Length, 160))
        if ($found.Count -ge 15) { break }
      }
    }
  } catch { }
  return $found
}

function New-Report {
  $out = New-Object System.Collections.Generic.List[string]
  $out.Add("PharmaBoost — diagnostic du robot (lecture seule)")
  $out.Add("Ordinateur : " + $env:COMPUTERNAME + " · " + (Get-Date -Format "yyyy-MM-dd HH:mm"))
  try {
    $os = Get-CimInstance Win32_OperatingSystem
    $out.Add("Windows : " + $os.Caption + " " + $os.Version + " (" + $os.OSArchitecture + ")")
  } catch { $out.Add("Windows : illisible") }

  # -------- 1. logiciels installés
  $out.AddRange([string[]](Get-Heading "1. Logiciels installés qui ressemblent à un robot ou à un logiciel d'officine"))
  $apps = @()
  foreach ($key in @("HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*")) {
    try { $apps += Get-ItemProperty $key -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and (($_.DisplayName + " " + $_.Publisher) -match $script:MotifRobot) } } catch { }
  }
  if ($apps.Count -eq 0) { $out.Add("(aucun)") }
  foreach ($app in ($apps | Sort-Object DisplayName -Unique)) { $out.Add(" - " + $app.DisplayName + " " + $app.DisplayVersion + " · " + $app.Publisher) }

  # -------- 2. services et processus
  $out.AddRange([string[]](Get-Heading "2. Services et processus liés"))
  $ids = @()
  try {
    foreach ($service in (Get-CimInstance Win32_Service | Where-Object { ($_.Name + " " + $_.DisplayName + " " + $_.PathName) -match $script:MotifRobot })) {
      $out.Add(" service : " + $service.Name + " · " + $service.State + " · démarrage " + $service.StartMode + " · " + $service.PathName)
      if ($service.ProcessId -gt 0) { $ids += [int]$service.ProcessId }
    }
  } catch { $out.Add("(services illisibles)") }
  try {
    foreach ($process in (Get-Process | Where-Object { $_.Name -match $script:MotifRobot })) {
      $path = ""
      try { $path = $process.Path } catch { }
      $out.Add(" processus : " + $process.Name + " (" + $process.Id + ") " + $path)
      $ids += [int]$process.Id
    }
  } catch { $out.Add("(processus illisibles)") }
  $ids = @($ids | Sort-Object -Unique)

  # -------- 3. réseau
  $out.AddRange([string[]](Get-Heading "3. Réseau : ports ouverts et connexions de ces programmes"))
  try {
    $names = @{}
    Get-Process | ForEach-Object { $names[[int]$_.Id] = $_.Name }
    $listening = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)
    $mine = @($listening | Where-Object { $ids -contains [int]$_.OwningProcess })
    $out.Add("Ports en écoute par ces programmes :")
    if ($mine.Count -eq 0) { $out.Add("  (aucun)") }
    foreach ($c in ($mine | Sort-Object LocalPort)) { $out.Add("  " + $c.LocalAddress + ":" + $c.LocalPort + " ← " + $names[[int]$c.OwningProcess]) }
    $links = @(Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Where-Object { $ids -contains [int]$_.OwningProcess })
    $out.Add("Connexions établies par ces programmes :")
    if ($links.Count -eq 0) { $out.Add("  (aucune)") }
    foreach ($c in ($links | Sort-Object RemoteAddress, RemotePort)) { $out.Add("  " + $names[[int]$c.OwningProcess] + " : " + $c.LocalAddress + ":" + $c.LocalPort + " → " + $c.RemoteAddress + ":" + $c.RemotePort) }
    $out.Add("Tous les ports en écoute sur cet ordinateur (nom du programme seulement) :")
    foreach ($c in ($listening | Sort-Object LocalPort | Select-Object -First 80)) { $out.Add("  " + $c.LocalPort + " ← " + $names[[int]$c.OwningProcess]) }
  } catch { $out.Add("(réseau illisible : " + $_.Exception.Message + ")") }

  # -------- 4. liaisons série
  $out.AddRange([string[]](Get-Heading "4. Ports série (COM) — une liaison par câble série passerait ici"))
  try {
    $serial = @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match '\(COM\d+\)' })
    if ($serial.Count -eq 0) { $out.Add("(aucun port COM)") }
    foreach ($port in $serial) { $out.Add(" - " + $port.Name) }
  } catch { $out.Add("(illisible)") }

  # -------- 5. dossiers
  $out.AddRange([string[]](Get-Heading "5. Dossiers et fichiers de journaux (noms, tailles, dates : jamais le contenu)"))
  $folders = @()
  foreach ($root in @("C:\Program Files", "C:\Program Files (x86)", "C:\ProgramData", "C:\", $env:LOCALAPPDATA, $env:APPDATA)) {
    if ($root -and (Test-Path -LiteralPath $root)) {
      try { $folders += Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match $script:MotifRobot } } catch { }
    }
  }
  if ($folders.Count -eq 0) { $out.Add("(aucun dossier à ce nom)") }
  $recent = @()
  foreach ($folder in ($folders | Sort-Object FullName -Unique)) {
    $out.Add("Dossier : " + $folder.FullName)
    try {
      foreach ($sub in (Get-ChildItem -LiteralPath $folder.FullName -Directory -ErrorAction SilentlyContinue | Select-Object -First 25)) { $out.Add("   [dossier] " + $sub.Name) }
      $files = @(Get-ChildItem -LiteralPath $folder.FullName -Recurse -Depth 3 -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -match '^\.(log|xml|txt|ini|cfg|conf|json|csv)$' } | Sort-Object LastWriteTime -Descending | Select-Object -First 25)
      foreach ($file in $files) { $out.Add("   " + $file.FullName.Substring($folder.FullName.Length) + " · " + [Math]::Round($file.Length / 1KB) + " Ko · " + $file.LastWriteTime.ToString("yyyy-MM-dd HH:mm")) }
      $recent += $files | Where-Object { $_.Extension -match '^\.(log|xml|txt)$' -and $_.LastWriteTime -gt (Get-Date).AddDays(-2) }
    } catch { $out.Add("   (illisible)") }
  }

  # -------- 6. réglages réseau
  $out.AddRange([string[]](Get-Heading "6. Réglages réseau trouvés (adresses et ports ; jamais un mot de passe)"))
  $anySettings = $false
  foreach ($folder in ($folders | Sort-Object FullName -Unique | Where-Object { $_.FullName -ne "C:\" })) {
    try {
      foreach ($file in (Get-ChildItem -LiteralPath $folder.FullName -Recurse -Depth 3 -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -match '^\.(ini|cfg|conf)$' } | Select-Object -First 20)) {
        $lines = @(Get-NetworkSettings $file.FullName)
        if ($lines.Count -gt 0) {
          $anySettings = $true
          $out.Add($file.FullName)
          foreach ($line in $lines) { $out.Add("   " + $line) }
        }
      }
    } catch { }
  }
  if (-not $anySettings) { $out.Add("(aucun)") }

  # -------- 7. structure des échanges
  $out.AddRange([string[]](Get-Heading "7. Structure de la fin des journaux récents (valeurs masquées : chiffres → 9, mots hors vocabulaire générique → a/A)"))
  $tails = @($recent | Sort-Object LastWriteTime -Descending | Select-Object -First 3)
  if ($tails.Count -eq 0) { $out.Add("(aucun journal modifié depuis deux jours dans ces dossiers)") }
  foreach ($file in $tails) {
    $out.Add("Fichier : " + $file.FullName + " (" + $file.LastWriteTime.ToString("yyyy-MM-dd HH:mm") + ")")
    foreach ($line in (Get-MaskedTail $file.FullName 8192 25)) { $out.Add("   " + $line) }
  }

  # -------- 8. lecture
  $out.AddRange([string[]](Get-Heading "8. Ce que cela suggère"))
  if ($mine -and $mine.Count -gt 0) { $out.Add(" - Un programme du robot écoute sur le réseau : l'échange peut passer par TCP/IP (piste « réseau »).") }
  if ($links -and $links.Count -gt 0) { $out.Add(" - Un programme du robot est connecté à une autre machine : noter l'adresse et le port ci-dessus.") }
  if ($serial -and $serial.Count -gt 0) { $out.Add(" - Des ports série existent : si le robot est relié par câble série, l'échange passe par là (piste « série »).") }
  if ($tails.Count -gt 0) { $out.Add(" - Un journal est tenu à jour : il contient peut-être les échanges (piste « journal »).") }
  if ($apps.Count -eq 0 -and $folders.Count -eq 0) { $out.Add(" - Rien ne ressemble à un robot sur cet ordinateur : lancer aussi ce diagnostic sur l'ordinateur du robot.") }
  return $out
}

function Invoke-Diagnostic {
  # La console Windows affiche les accents en UTF-8 seulement si on le lui dit.
  try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
  Write-Host ""
  Write-Host "PharmaBoost — diagnostic du robot" -ForegroundColor Cyan
  Write-Host "Ce programme LIT seulement : il écrit un rapport sur le Bureau, rien d'autre."
  Write-Host "Il ne modifie ni votre logiciel ni le robot, n'envoie rien sur Internet, et masque toute valeur"
  Write-Host "dans le rapport (aucune donnée patient). Vous relisez le rapport avant de nous l'envoyer."
  Write-Host ""
  if (-not $env:PB_SANS_CONFIRMATION) {
    [void](Read-Host "Appuyez sur Entrée pour lancer le diagnostic (fermez la fenêtre pour annuler)")
  }
  Write-Host "Lecture en cours (une minute environ)…"
  $report = New-Report
  $desktop = [Environment]::GetFolderPath("Desktop")
  if (-not $desktop -or -not (Test-Path -LiteralPath $desktop)) { $desktop = $env:USERPROFILE }
  $file = Join-Path $desktop ("PharmaBoost-diagnostic-robot-" + $env:COMPUTERNAME + "-" + (Get-Date -Format "yyyyMMdd-HHmm") + ".txt")
  [System.IO.File]::WriteAllLines($file, [string[]]$report, (New-Object System.Text.UTF8Encoding($true)))
  Write-Host ""
  Write-Host "Rapport écrit : $file" -ForegroundColor Green
  Write-Host "Ouvrez-le, relisez-le, puis envoyez-le à contact@pharmaboost.app."
  try { Start-Process explorer.exe -ArgumentList ('/select,"' + $file + '"') } catch { }
}

# Les essais chargent ce fichier pour tester les fonctions de masquage, sans lancer le diagnostic.
if (-not $PB_ESSAI) { Invoke-Diagnostic }
