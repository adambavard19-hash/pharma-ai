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
$script:MotifRobot = "rowa|becton|pharmagest|lgpi|equasens|winpharma|alliadis|apostore|mediskill|consis|willach|pillpick|cdapi|robot|automates?\b|kardex|\barx\b|meditech|pharmatic|cegedim|wwks"
# Les noms du ROBOT lui-même, sans le logiciel de l'officine : un poste de comptoir montre le second et jamais le premier.
$script:MotifRobotSeul = "rowa|becton|apostore|mediskill|consis|willach|pillpick|cdapi|robot|automates?\b|kardex|\barx\b|wwks|vmax|mach4"
# Les mots comptés dans les journaux (jamais recopiés) : le robot et son interface. « pick » seul est trop courant pour prouver quoi que ce soit.
$script:MotsDuRobot = @("rowa", "vmax", "wwks", "cdapi", "robot", "automate", "mach4", "apostore", "willach", "consis", "kardex", "stockdelivery", "outputrequest", "inputrequest", "stockinfo", "hellorequest", "pick")
# Les lignes qu'on garde (masquées) : celles qui portent un de ces mots.
$script:MotifLigneRobot = $script:MotifRobotSeul + "|stockdelivery|outputrequest|inputrequest|stockinfo|hellorequest"
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
    "timeout", "retry", "busy", "ready", "idle", "done", "failed", "success", "unknown", "inconnu", "cip", "ean", "gtin", "pzn",
    "vmax", "mach4", "hellorequest", "keepalive", "keepaliverequest", "stockdeliveryrequest", "stockinforequest", "outputrequest", "inputrequest",
    "initiateinputrequest", "articleinforequest", "pickrequest", "pickresponse", "articleid", "articlecode", "packid", "packs", "amount")) {
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

# Une adresse du réseau local de l'officine (10.x, 192.168.x, 172.16 à 31.x) : un autre ordinateur de la pharmacie.
function Test-PrivateAddress([string]$address) {
  return [bool]($address -match '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)')
}

# Cette adresse est celle de l'ordinateur lui-même (boucle locale), du réseau local, ou d'Internet.
function Get-AddressKind([string]$address, [string]$localAddress) {
  if ($address -eq $localAddress -or $address -match '^(127\.|::1$|0\.0\.0\.0$|::$)') { return "cet ordinateur" }
  if (Test-PrivateAddress $address) { return "autre ordinateur du réseau local" }
  return "hors du réseau local"
}

# La lecture du rapport : ce que les constats disent, et ce qu'ils ne disent pas. Pure : elle ne lit que les constats reçus.
function Get-Reading([bool]$robotNamesFound, [bool]$officeSoftwareFound, [int]$listeningCount, [int]$localNetworkLinks, [int]$serialCount, [int]$recentLogs, [int]$robotLogFiles = 0, [int]$robotFiles = 0, [bool]$robotShare = $false) {
  $lines = @()
  if (-not $robotNamesFound) {
    $lines += " - Aucun nom de robot (Rowa, Apostore, Willach, Consis, Kardex…) n'a été trouvé sur cet ordinateur : ni programme, ni dossier, ni fichier, ni journal, ni dossier partagé."
    if ($officeSoftwareFound) {
      $lines += " - Le logiciel de l'officine y est installé : c'est probablement un poste de comptoir. Le robot et sa liaison sont ailleurs : lancer ce diagnostic sur le SERVEUR du logiciel et sur l'ordinateur du robot."
    } else {
      $lines += " - Rien ne ressemble non plus à un logiciel d'officine : lancer ce diagnostic sur le serveur du logiciel et sur l'ordinateur du robot."
    }
  }
  if ($robotLogFiles -gt 0) { $lines += " - $robotLogFiles journal(aux) récent(s) mentionnent le robot : ce sont eux qui peuvent contenir l'échange (piste « journal »). Voir les deux sections sur les journaux." }
  if ($robotFiles -gt 0) { $lines += " - $robotFiles fichier(s) portent un nom de robot : voir la section des fichiers." }
  if ($robotShare) { $lines += " - Un dossier partagé ou un lecteur réseau porte un nom de robot : l'échange peut se faire par fichiers (piste « fichier »)." }
  if ($listeningCount -gt 0) { $lines += " - Des programmes du logiciel ou du robot écoutent sur le réseau (ports ci-dessus). C'est leur NOM qui dit ce qu'ils font : un service d'impression de tickets ou de caisse n'est pas le robot." }
  if ($localNetworkLinks -gt 0) { $lines += " - Cet ordinateur est relié à un autre ordinateur de la pharmacie : l'adresse et le port notés ci-dessus montrent où se trouve le serveur, et peut-être le robot." }
  if ($serialCount -gt 0) { $lines += " - Des ports série existent : si le robot est relié par câble série, l'échange passe par là (piste « série »)." }
  if ($recentLogs -gt 0) { $lines += " - Un journal est tenu à jour : la structure masquée plus haut dit s'il contient des échanges ou seulement la vie du logiciel." }
  return $lines
}

# Le programme d'une ligne de lancement, SANS ses arguments (un argument peut porter un identifiant).
function Get-ExecutablePart([string]$commandLine) {
  if (-not $commandLine) { return "" }
  $text = $commandLine.Trim()
  if ($text.StartsWith('"')) {
    $end = $text.IndexOf('"', 1)
    if ($end -gt 0) { return $text.Substring(1, $end - 1) }
  }
  $match = [regex]::Match($text, '^.*?\.(exe|bat|cmd|com)\b', 'IgnoreCase')
  if ($match.Success) { return $match.Value }
  return ($text -split '\s+')[0]
}

# La fin d'un fichier, lue en partage (le logiciel peut l'écrire en même temps). $null si illisible.
function Read-TailText([string]$path, [long]$bytes) {
  $stream = $null
  try {
    $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $length = [Math]::Min($bytes, $stream.Length)
    [void]$stream.Seek(-$length, [System.IO.SeekOrigin]::End)
    $buffer = New-Object byte[] ([int]$length)
    [void]$stream.Read($buffer, 0, [int]$length)
    return [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($buffer)
  } catch {
    return $null
  } finally {
    if ($stream) { $stream.Dispose() }
  }
}

# Combien de fois chaque mot du robot apparaît dans un texte. Des nombres, jamais le texte.
function Get-TermCounts([string]$text) {
  $counts = [ordered]@{}
  foreach ($term in $script:MotsDuRobot) {
    $n = [regex]::Matches($text, [regex]::Escape($term), 'IgnoreCase').Count
    if ($n -gt 0) { $counts[$term] = $n }
  }
  return $counts
}

# Les lignes d'un texte qui parlent du robot, SANS leurs valeurs (mêmes règles de masquage que le reste du rapport).
function Get-RobotLines([string]$text, [int]$maxLines) {
  $found = @()
  foreach ($line in ($text -split "\r?\n")) {
    if ($line.Trim() -eq "" -or $line -notmatch $script:MotifLigneRobot) { continue }
    if ($line.Contains("<")) { $found += (Hide-XmlValues $line) } else { $found += (Hide-TextValues $line) }
  }
  $found = @($found | Select-Object -Unique)
  if ($found.Count -gt $maxLines) { $found = $found[($found.Count - $maxLines)..($found.Count - 1)] }
  return $found
}

# Les dossiers où chercher : ceux que les logiciels créent à la racine des disques, et ceux qui portent un nom connu ailleurs.
function Get-SearchRoots {
  $skip = '^(Windows|Users|Program Files|Program Files \(x86\)|ProgramData|\$Recycle\.Bin|System Volume Information|Recovery|PerfLogs|Intel|MSOCache|Documents and Settings|Config\.Msi)$'
  $roots = @()
  $drives = @()
  try { $drives = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { $_.DeviceID + "\" }) } catch { }
  if ($drives.Count -eq 0) { $drives = @("C:\") }
  foreach ($drive in $drives) {
    if (-not (Test-Path -LiteralPath $drive)) { continue }
    foreach ($dir in @(Get-ChildItem -LiteralPath $drive -Directory -Force -ErrorAction SilentlyContinue)) { if ($dir.Name -notmatch $skip) { $roots += $dir.FullName } }
  }
  foreach ($base in @("C:\Program Files", "C:\Program Files (x86)", "C:\ProgramData", $env:LOCALAPPDATA, $env:APPDATA)) {
    if ($base -and (Test-Path -LiteralPath $base)) {
      foreach ($dir in @(Get-ChildItem -LiteralPath $base -Directory -Force -ErrorAction SilentlyContinue)) { if ($dir.Name -match $script:MotifRobot -or $dir.Name -match '^BD\b') { $roots += $dir.FullName } }
    }
  }
  return @($roots | Sort-Object -Unique)
}

# Les fichiers de ces dossiers (nom, taille, date), dans la limite du temps accordé. Le contenu n'est pas lu ici.
function Get-CandidateFiles([string[]]$roots, [int]$seconds) {
  $clock = [System.Diagnostics.Stopwatch]::StartNew()
  $files = New-Object System.Collections.Generic.List[object]
  foreach ($root in $roots) {
    if ($clock.Elapsed.TotalSeconds -gt $seconds -or $files.Count -ge 20000) { break }
    try {
      foreach ($file in @(Get-ChildItem -LiteralPath $root -Recurse -Depth 5 -File -Force -ErrorAction SilentlyContinue)) {
        $files.Add([pscustomobject]@{ FullName = $file.FullName; Name = $file.Name; Extension = $file.Extension; Length = $file.Length; LastWriteTime = $file.LastWriteTime })
        if ($files.Count -ge 20000) { break }
      }
    } catch { }
  }
  return $files.ToArray()
}

# Une ligne d'avancement à l'écran (jamais dans le rapport) : la version complète prend quelques minutes.
function Write-Step([string]$text) {
  if (-not $PB_ESSAI) { Write-Host ("  " + $text) }
}

# Ajoute des lignes au rapport ; une liste vide (ou rien du tout) n'est pas une erreur.
function Add-Lines($list, $lines) {
  foreach ($line in @($lines)) { if ($null -ne $line) { $list.Add([string]$line) } }
}

# Les erreurs rencontrées pendant la lecture, pour qu'un échec se lise dans le rapport au lieu de défiler à l'écran.
# Les « accès refusé » et « introuvable » sont normaux sur un disque ouvert : on les compte sans les détailler.
function Get-ErrorLines {
  $lines = @()
  $ordinary = 0
  $seen = @{}
  foreach ($e in @($Error)) {
    $message = ""
    try { $message = [string]$e.Exception.Message } catch { }
    if ($message -match 'denied|refus|not find|introuvable|does not exist|n''existe pas|being used|utilisé par un autre') { $ordinary++; continue }
    $where = ""
    try { $where = " (ligne " + $e.InvocationInfo.ScriptLineNumber + ")" } catch { }
    $text = $message.Substring(0, [Math]::Min($message.Length, 220)) + $where
    if (-not $seen.ContainsKey($text)) { $seen[$text] = $true; $lines += (" - " + $text) }
    if ($lines.Count -ge 25) { break }
  }
  if ($ordinary -gt 0) { $lines += (" (" + $ordinary + " accès refusés ou fichiers introuvables ignorés : normal)") }
  if ($lines.Count -eq 0) { $lines += "(aucune)" }
  return $lines
}

function New-Report {
  $Error.Clear()
  $out = New-Object System.Collections.Generic.List[string]
  $script:Rapport = $out
  $out.Add("PharmaBoost — diagnostic du robot (lecture seule) · version complète")
  $out.Add("Ordinateur : " + $env:COMPUTERNAME + " · " + (Get-Date -Format "yyyy-MM-dd HH:mm"))
  try {
    $os = Get-CimInstance Win32_OperatingSystem
    $out.Add("Windows : " + $os.Caption + " " + $os.Version + " (" + $os.OSArchitecture + ")")
  } catch { $out.Add("Windows : illisible") }

  Write-Step "Logiciels installés…"
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
  $programFolders = @{}
  try {
    foreach ($process in (Get-CimInstance Win32_Process)) {
      $path = [string]$process.ExecutablePath
      if ($path) { $programFolders[[int]$process.ProcessId] = (Split-Path -Parent $path) }
      # Un programme Java s'appelle « java » : c'est son dossier, ou sa ligne de lancement, qui dit à qui il est.
      # La ligne de lancement sert UNIQUEMENT à reconnaître le programme ; elle n'est jamais écrite dans le rapport
      # (elle peut porter un identifiant). Le diagnostic ne se liste pas lui-même.
      $recognised = ($process.Name + " " + $path + " " + [string]$process.CommandLine)
      if ($process.ProcessId -ne $PID -and $recognised -match $script:MotifRobot -and $recognised -notmatch "pharmaboost|powershell|pwsh|conhost") {
        $out.Add(" processus : " + $process.Name + " (" + $process.ProcessId + ") " + $path)
        $ids += [int]$process.ProcessId
      }
    }
  } catch { $out.Add("(processus illisibles)") }
  $ids = @($ids | Sort-Object -Unique)

  Write-Step "Réseau des programmes du logiciel…"
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
    foreach ($c in ($links | Sort-Object RemoteAddress, RemotePort)) { $out.Add("  " + $names[[int]$c.OwningProcess] + " : " + $c.LocalAddress + ":" + $c.LocalPort + " → " + $c.RemoteAddress + ":" + $c.RemotePort + " (" + (Get-AddressKind $c.RemoteAddress $c.LocalAddress) + ")") }
    $out.Add("Tous les ports en écoute sur cet ordinateur (nom du programme et dossier où il se trouve) :")
    foreach ($c in ($listening | Sort-Object LocalPort | Select-Object -First 80)) {
      $folder = $programFolders[[int]$c.OwningProcess]
      $out.Add("  " + $c.LocalPort + " ← " + $names[[int]$c.OwningProcess] + $(if ($folder) { " (" + $folder + ")" } else { "" }))
    }
  } catch { $out.Add("(réseau illisible : " + $_.Exception.Message + ")") }

  # -------- 4. liaisons série
  $out.AddRange([string[]](Get-Heading "4. Ports série (COM) — une liaison par câble série passerait ici"))
  try {
    $serial = @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match '\(COM\d+\)' })
    if ($serial.Count -eq 0) { $out.Add("(aucun port COM)") }
    foreach ($port in $serial) { $out.Add(" - " + $port.Name) }
  } catch { $out.Add("(illisible)") }

  Write-Step "Dossiers et journaux du logiciel…"
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

  # =========================== COMPLÉMENT : tout ce qui peut trahir un robot, sous quelque nom que ce soit ===========================
  Write-Step "Programmes, services et processus…"

  # -------- 8. tous les programmes installés
  $out.AddRange([string[]](Get-Heading "8. Tous les programmes installés (hors Microsoft et Windows)"))
  try {
    $allApps = @()
    foreach ($key in @("HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*")) {
      try { $allApps += Get-ItemProperty $key -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } } catch { }
    }
    $allApps = @($allApps | Where-Object { $_.DisplayName -notmatch '^(Microsoft|Windows|Update for|Security Update|Hotfix)|Visual C\+\+|\.NET|Redistributable' } | Sort-Object DisplayName -Unique)
    if ($allApps.Count -eq 0) { $out.Add("(aucun)") }
    foreach ($app in ($allApps | Select-Object -First 250)) { $out.Add(" - " + $app.DisplayName + " " + $app.DisplayVersion + " · " + $app.Publisher) }
    if ($allApps.Count -gt 250) { $out.Add(" … et " + ($allApps.Count - 250) + " autres") }
  } catch { $out.Add("(illisible)") }

  # -------- 9. tous les services hors Windows
  $out.AddRange([string[]](Get-Heading "9. Tous les services hors Windows (nom, état, programme — jamais les arguments)"))
  $allServices = @()
  try {
    $allServices = @(Get-CimInstance Win32_Service | Where-Object { $_.PathName -and $_.PathName -notmatch '(?i)\\windows\\' } | Sort-Object Name)
    if ($allServices.Count -eq 0) { $out.Add("(aucun)") }
    foreach ($service in ($allServices | Select-Object -First 150)) { $out.Add(" - " + $service.Name + " · " + $service.State + " · " + $service.StartMode + " · " + (Get-ExecutablePart $service.PathName)) }
  } catch { $out.Add("(illisible)") }

  # -------- 10. tous les programmes en cours
  $out.AddRange([string[]](Get-Heading "10. Tous les programmes en cours d'exécution (hors Windows) : nom et dossier"))
  $allPrograms = @()
  try {
    $allPrograms = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath -notmatch '(?i)\\windows\\' } | ForEach-Object { $_.Name + " · " + (Split-Path -Parent $_.ExecutablePath) } | Sort-Object -Unique)
    if ($allPrograms.Count -eq 0) { $out.Add("(aucun)") }
    foreach ($program in ($allPrograms | Select-Object -First 200)) { $out.Add(" - " + $program) }
  } catch { $out.Add("(illisible)") }

  # -------- 11. toutes les connexions
  Write-Step "Réseau…"
  $out.AddRange([string[]](Get-Heading "11. Toutes les connexions établies (programme → adresse:port), regroupées"))
  try {
    $procNames = @{}
    Get-Process | ForEach-Object { $procNames[[int]$_.Id] = $_.Name }
    $everyLink = @(Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Where-Object { $procNames[[int]$_.OwningProcess] -notmatch '^(chrome|msedge|firefox|brave|opera|whatsapp|teams|onedrive|searchhost)$' })
    $grouped = @($everyLink | Group-Object { $procNames[[int]$_.OwningProcess] + " → " + $_.RemoteAddress + ":" + $_.RemotePort + " (" + (Get-AddressKind $_.RemoteAddress $_.LocalAddress) + ")" } | Sort-Object Name)
    if ($grouped.Count -eq 0) { $out.Add("(aucune)") }
    foreach ($group in ($grouped | Select-Object -First 150)) { $out.Add(" - " + $group.Name + $(if ($group.Count -gt 1) { " · " + $group.Count + " connexions" } else { "" })) }
  } catch { $out.Add("(illisible : " + $_.Exception.Message + ")") }

  # -------- 12. adresses et voisins
  $out.AddRange([string[]](Get-Heading "12. Adresses de cet ordinateur, passerelle et ordinateurs voisins du réseau local"))
  try {
    foreach ($address in @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' })) { $out.Add(" - adresse : " + $address.IPAddress + "/" + $address.PrefixLength + " (" + $address.InterfaceAlias + ")") }
    foreach ($route in @(Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue)) { $out.Add(" - passerelle : " + $route.NextHop) }
    $neighbors = @(Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.State -match 'Reachable|Stale|Delay|Probe' -and (Test-PrivateAddress $_.IPAddress) -and $_.IPAddress -notmatch '\.255$' })
    if ($neighbors.Count -eq 0) { $out.Add(" (aucun voisin visible)") }
    foreach ($neighbor in ($neighbors | Sort-Object IPAddress | Select-Object -First 80)) {
      $vendor = ([string]$neighbor.LinkLayerAddress).Substring(0, [Math]::Min(8, ([string]$neighbor.LinkLayerAddress).Length))
      $out.Add(" - voisin : " + $neighbor.IPAddress + " · " + $neighbor.State + " · constructeur " + $vendor)
    }
  } catch { $out.Add("(illisible : " + $_.Exception.Message + ")") }

  # -------- 13. dossiers partagés et lecteurs réseau
  $out.AddRange([string[]](Get-Heading "13. Dossiers partagés par cet ordinateur et lecteurs réseau"))
  $shareNames = @()
  try {
    $shares = @(Get-CimInstance Win32_Share | Where-Object { $_.Name -notmatch '\$$' })
    $drives = @(Get-CimInstance Win32_MappedLogicalDisk)
    if ($shares.Count -eq 0 -and $drives.Count -eq 0) { $out.Add("(aucun)") }
    foreach ($share in $shares) { $out.Add(" - partagé : " + $share.Name + " → " + $share.Path); $shareNames += ($share.Name + " " + $share.Path) }
    foreach ($drive in $drives) { $out.Add(" - lecteur réseau : " + $drive.LocalName + " → " + $drive.ProviderName); $shareNames += ($drive.LocalName + " " + $drive.ProviderName) }
  } catch { $out.Add("(illisible)") }

  # -------- 14. appareils série ou adaptateurs
  $out.AddRange([string[]](Get-Heading "14. Appareils série, adaptateurs USB-série et autres ports que les ports COM"))
  try {
    $devices = @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match 'serial|série|serie|rs-?232|rs-?485|ftdi|prolific|ch34\d|uart|moxa|lantronix|\(COM\d+\)' })
    if ($devices.Count -eq 0) { $out.Add("(aucun)") }
    foreach ($device in ($devices | Select-Object -First 40)) { $out.Add(" - " + $device.Name) }
  } catch { $out.Add("(illisible)") }

  # -------- 15. tâches planifiées
  $out.AddRange([string[]](Get-Heading "15. Tâches planifiées hors Windows (nom et état)"))
  try {
    $tasks = @(Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskPath -notmatch '^\\Microsoft\\' } | Sort-Object TaskPath, TaskName)
    if ($tasks.Count -eq 0) { $out.Add("(aucune)") }
    foreach ($task in ($tasks | Select-Object -First 80)) { $out.Add(" - " + $task.TaskPath + $task.TaskName + " · " + $task.State) }
  } catch { $out.Add("(illisible)") }

  # -------- 16. registre
  $out.AddRange([string[]](Get-Heading "16. Registre : noms des clés qui parlent du robot ou du logiciel de l'officine (jamais leurs valeurs)"))
  try {
    $registryHits = @()
    foreach ($base in @("HKLM:\SOFTWARE", "HKLM:\SOFTWARE\WOW6432Node", "HKCU:\SOFTWARE")) {
      try { $registryHits += @(Get-ChildItem $base -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match $script:MotifRobot } | ForEach-Object { $base + "\" + $_.PSChildName }) } catch { }
    }
    if ($registryHits.Count -eq 0) { $out.Add("(aucune)") }
    foreach ($hit in $registryHits) { $out.Add(" - " + $hit) }
  } catch { $out.Add("(illisible)") }

  # -------- 17 à 19. fichiers et journaux : le robot est-il nommé quelque part sur ce disque ?
  Write-Step "Recherche des fichiers et des journaux qui parlent du robot (la plus longue étape)…"
  $roots = @(Get-SearchRoots)
  $candidates = @(Get-CandidateFiles $roots 90)
  $out.AddRange([string[]](Get-Heading ("17. Fichiers dont le NOM parle du robot (" + $roots.Count + " dossiers parcourus, " + $candidates.Count + " fichiers vus)")))
  $namedAfterRobot = @($candidates | Where-Object { $_.Name -match $script:MotifRobotSeul -or (Split-Path -Parent $_.FullName) -match $script:MotifRobotSeul } | Sort-Object LastWriteTime -Descending)
  if ($namedAfterRobot.Count -eq 0) { $out.Add("(aucun)") }
  foreach ($file in ($namedAfterRobot | Select-Object -First 80)) { $out.Add(" - " + $file.FullName + " · " + [Math]::Round($file.Length / 1KB) + " Ko · " + $file.LastWriteTime.ToString("yyyy-MM-dd HH:mm")) }

  $out.AddRange([string[]](Get-Heading "18. Journaux modifiés depuis 30 jours qui mentionnent le robot (nombre de mentions par mot — jamais le contenu)"))
  $logs = @($candidates | Where-Object { $_.Extension -match '^\.(log|txt|xml|ini|cfg|conf|json|csv)$' -and $_.LastWriteTime -gt (Get-Date).AddDays(-30) -and $_.Length -gt 0 -and $_.Length -lt 60MB } | Sort-Object LastWriteTime -Descending | Select-Object -First 80)
  $mentions = @()
  $logClock = [System.Diagnostics.Stopwatch]::StartNew()
  foreach ($log in $logs) {
    if ($logClock.Elapsed.TotalSeconds -gt 100) { $out.Add("(délai atteint : les journaux les plus anciens n'ont pas été lus)"); break }
    $text = Read-TailText $log.FullName 4MB
    if ($null -eq $text) { continue }
    $counts = Get-TermCounts $text
    $strong = 0
    foreach ($term in $counts.Keys) { if ($term -ne "pick") { $strong += $counts[$term] } }
    if ($strong -gt 0) { $mentions += [pscustomobject]@{ File = $log; Counts = $counts; Strong = $strong; Text = $text } }
  }
  $mentions = @($mentions | Sort-Object Strong -Descending | Select-Object -First 40)
  if ($mentions.Count -eq 0) { $out.Add("(aucun des " + $logs.Count + " journaux récents ne mentionne le robot)") }
  foreach ($mention in $mentions) {
    $summary = @(foreach ($term in $mention.Counts.Keys) { $term + ":" + $mention.Counts[$term] }) -join " "
    $out.Add(" - " + $mention.File.FullName + " · " + $mention.File.LastWriteTime.ToString("yyyy-MM-dd HH:mm") + " · " + $summary)
  }

  $out.AddRange([string[]](Get-Heading "19. Lignes de ces journaux qui parlent du robot (valeurs masquées : chiffres → 9, mots hors vocabulaire générique → a/A)"))
  if ($mentions.Count -eq 0) { $out.Add("(aucune)") }
  foreach ($mention in ($mentions | Select-Object -First 5)) {
    $out.Add("Fichier : " + $mention.File.FullName)
    foreach ($line in (Get-RobotLines $mention.Text 10)) { $out.Add("   " + $line) }
  }
  Write-Step "Mise en forme du rapport…"

  # -------- 20. lecture
  $out.AddRange([string[]](Get-Heading "20. Ce que cela suggère"))
  $robotFound = $false
  foreach ($text in (@($apps | ForEach-Object { $_.DisplayName + " " + $_.Publisher }) + @($folders | ForEach-Object { $_.Name }) + @($ids | ForEach-Object { $programFolders[[int]$_] }) + @($allServices | ForEach-Object { $_.Name + " " + $_.PathName }) + @($allPrograms) + @($registryHits) + @($shareNames))) {
    if ($text -and $text -match $script:MotifRobotSeul) { $robotFound = $true; break }
  }
  if ($namedAfterRobot.Count -gt 0 -or $mentions.Count -gt 0) { $robotFound = $true }
  $localNetworkLinks = @($links | Where-Object { (Get-AddressKind $_.RemoteAddress $_.LocalAddress) -eq "autre ordinateur du réseau local" }).Count
  $shareMatchesRobot = @($shareNames | Where-Object { $_ -match $script:MotifRobotSeul }).Count -gt 0
  Add-Lines $out (Get-Reading $robotFound ($apps.Count -gt 0 -or $folders.Count -gt 0 -or @($ids).Count -gt 0) @($mine).Count $localNetworkLinks @($serial).Count $tails.Count $mentions.Count $namedAfterRobot.Count $shareMatchesRobot)

  # -------- 21. erreurs
  $out.AddRange([string[]](Get-Heading "21. Erreurs rencontrées pendant la lecture (pour le dépannage)"))
  Add-Lines $out (Get-ErrorLines)
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
    [void](Read-Host "ÉTAPE 1 sur 2 : appuyez sur Entrée pour LANCER la lecture (fermez la fenêtre pour annuler)")
  }
  Write-Host ""
  Write-Host "ÉTAPE 2 sur 2 : lecture en cours — de deux à cinq minutes. NE FERMEZ PAS cette fenêtre." -ForegroundColor Yellow
  Write-Host "Les lignes qui vont apparaître ci-dessous montrent l'étape en cours. Le message « Appuyez sur une touche » ne vient qu'à la toute fin."
  Write-Host ""
  $report = $null
  $failure = $null
  try { $report = New-Report } catch { $failure = $_ }
  # Si la lecture s'est arrêtée net, on garde ce qui était déjà écrit, et la raison de l'arrêt.
  if (-not $report -or @($report).Count -eq 0) {
    $report = New-Object System.Collections.Generic.List[string]
    if ($script:Rapport) { $report.AddRange([string[]]@($script:Rapport)) }
    $report.Add("")
    $report.Add("LA LECTURE S'EST ARRÊTÉE AVANT LA FIN.")
    if ($failure) { $report.Add("Raison : " + $failure.Exception.Message) }
    Add-Lines $report (Get-ErrorLines)
  }
  # PB_BUREAU : dossier de sortie choisi par les essais automatiques, pour qu'ils n'écrivent jamais sur un vrai Bureau.
  $desktop = if ($env:PB_BUREAU) { $env:PB_BUREAU } else { [Environment]::GetFolderPath("Desktop") }
  if (-not $desktop -or -not (Test-Path -LiteralPath $desktop)) { $desktop = $env:USERPROFILE }
  $file = Join-Path $desktop ("PharmaBoost-diagnostic-robot-" + $env:COMPUTERNAME + "-" + (Get-Date -Format "yyyyMMdd-HHmm") + ".txt")
  [System.IO.File]::WriteAllLines($file, [string[]]@($report), (New-Object System.Text.UTF8Encoding($true)))
  Write-Host ""
  if ($failure) {
    Write-Host "La lecture s'est arrêtée avant la fin, mais ce qui a pu être lu est dans le rapport." -ForegroundColor Yellow
  } else {
    Write-Host "TERMINÉ." -ForegroundColor Green
  }
  Write-Host "Rapport écrit sur le Bureau : $file" -ForegroundColor Green
  Write-Host "Ouvrez-le, relisez-le, puis envoyez-le à contact@pharmaboost.app."
  try { Start-Process explorer.exe -ArgumentList ('/select,"' + $file + '"') } catch { }
}

# Les essais chargent ce fichier pour tester les fonctions de masquage, sans lancer le diagnostic.
if (-not $PB_ESSAI) { Invoke-Diagnostic }
