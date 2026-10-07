; PharmaBoost — installateur d'un poste de comptoir (Windows 10 ou plus récent).
;
; Un seul fichier à double-cliquer : PharmaBoost-Installation-<jeton>.exe. Le
; jeton du lien d'installation est dans le NOM du fichier (les octets sont les
; mêmes pour tout le monde, donc signables une fois pour toutes).
;
; Sans droits d'administrateur : tout va dans %LOCALAPPDATA%\PharmaBoost\Poste,
; et l'icône démarre à l'ouverture de session (clé Run de l'utilisateur). Le
; poste doit tourner dans la session de la personne qui utilise le logiciel de
; l'officine, c'est là que la douchette tape.
;
; Compilé par scripts/construire-installateur.mjs, qui passe :
;   /DVERSION /DNODE_VERSION /DNODE_SHA256 /DSRC (dossier des fichiers) /DICON /DOUT
;
; Options en ligne de commande (techniciens) :
;   /S               silencieux (codes de sortie : 0 ok, 2 pas de code, 3 code refusé, 4 injoignable)
;   /CODE=<code>     le code à six chiffres, le jeton ou le lien, si le nom du fichier n'en porte pas
;   /SERVEUR=<url>   un autre PharmaBoost que https://pharmaboost.app (essais)

Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma
RequestExecutionLevel user

!ifndef VERSION
  !error "VERSION manquant : passez par scripts/construire-installateur.mjs"
!endif

!define PRODUCT "PharmaBoost"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\PharmaBoostPoste"
!define RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define FILE_PREFIX "PharmaBoost-Installation-"
!define DEFAULT_SERVER "https://pharmaboost.app"

Name "${PRODUCT}"
Caption "Installation de ${PRODUCT}"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\PharmaBoost\Poste"
BrandingText "${PRODUCT}"
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1036 "ProductName" "${PRODUCT}"
VIAddVersionKey /LANG=1036 "CompanyName" "${PRODUCT}"
VIAddVersionKey /LANG=1036 "FileDescription" "Installation de PharmaBoost sur un poste de comptoir"
VIAddVersionKey /LANG=1036 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "LegalCopyright" "PharmaBoost"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "FileFunc.nsh"
!include "WinVer.nsh"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Installer PharmaBoost sur ce poste"
!define MUI_WELCOMEPAGE_TEXT "PharmaBoost va être installé sur cet ordinateur et relié à votre officine.$\r$\n$\r$\nL'installation dure environ une minute et demande une connexion Internet. Aucun mot de passe administrateur n'est nécessaire.$\r$\n$\r$\nVotre logiciel de gestion n'est ni modifié, ni ouvert : PharmaBoost ne lit que les codes-barres passés à la douchette."

!define MUI_FINISHPAGE_TITLE "PharmaBoost est installé"
!define MUI_FINISHPAGE_TEXT "Ce poste est relié à votre officine.$\r$\n$\r$\nL'icône PharmaBoost est près de l'horloge. Passez une boîte à la douchette dans votre logiciel : elle apparaît dans PharmaBoost, et l'avis s'affiche en bas de l'écran."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Ouvrir PharmaBoost dans le navigateur"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenApplication
!define MUI_UNCONFIRMPAGE_TEXT_TOP "PharmaBoost va être retiré de ce poste : la douchette ne sera plus écoutée et les avis ne s'afficheront plus. Votre logiciel de gestion n'est pas touché."

Var TypedCode
Var ServerUrl
Var AlreadyPaired
Var FileHasCode
Var CodeBox
Var NodeMarker

!insertmacro MUI_PAGE_WELCOME
Page custom CodePageShow CodePageLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "French"

; ---------------------------------------------------------------- démarrage

Function .onInit
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "PharmaBoost demande Windows 10 ou plus récent. Ce poste ne peut pas l'accueillir." /SD IDOK
    SetErrorLevel 5
    Abort
  ${EndIf}

  ; Un seul installateur à la fois.
  System::Call 'kernel32::CreateMutex(p 0, i 1, t "PharmaBoostInstallateur") p .r1 ?e'
  Pop $0
  ${If} $0 = 183 ; ERROR_ALREADY_EXISTS
    MessageBox MB_OK|MB_ICONEXCLAMATION "L'installation de PharmaBoost est déjà en cours sur ce poste." /SD IDOK
    SetErrorLevel 6
    Abort
  ${EndIf}

  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/CODE=" $TypedCode
  ${GetOptions} $0 "/SERVEUR=" $ServerUrl
  ${If} $ServerUrl == ""
    StrCpy $ServerUrl "${DEFAULT_SERVER}"
  ${EndIf}

  StrCpy $AlreadyPaired 0
  ${If} ${FileExists} "$INSTDIR\pharmaboost-connect.json"
    StrCpy $AlreadyPaired 1
  ${EndIf}

  ; Le nom du fichier porte-t-il un jeton ? « PharmaBoost-Installation-<jeton>.exe » : rien après le tiret, un point ou un espace, c'est non.
  StrCpy $FileHasCode 0
  StrCpy $0 $EXEFILE 25
  ${If} $0 == "${FILE_PREFIX}"
    StrCpy $0 $EXEFILE 1 25
    ${If} $0 != ""
    ${AndIf} $0 != "."
    ${AndIf} $0 != " "
      StrCpy $FileHasCode 1
    ${EndIf}
  ${EndIf}
FunctionEnd

Function OpenApplication
  ExecShell "open" "$ServerUrl/vente/nouvelle"
FunctionEnd

; --------------------------------------------- page « code », seulement si besoin

Function CodePageShow
  ; Rien à demander quand le nom du fichier porte le jeton, quand le poste est déjà relié (mise à jour), ou quand un technicien a passé /CODE=.
  ${If} $FileHasCode = 1
  ${OrIf} $AlreadyPaired = 1
  ${OrIf} $TypedCode != ""
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Code d'installation" "Ce fichier ne dit pas à quelle officine appartient ce poste."
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 44u "Dans PharmaBoost, ouvrez Stock → Connecter mon logiciel → Postes de caisse, puis « Ajouter un poste ».$\r$\n$\r$\nCollez ci-dessous le lien affiché, ou saisissez le code à six chiffres :"
  Pop $0
  ${NSD_CreateText} 0 52u 100% 14u ""
  Pop $CodeBox
  nsDialogs::Show
FunctionEnd

Function CodePageLeave
  ${NSD_GetText} $CodeBox $TypedCode
  ${If} $TypedCode == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "Collez le lien ou saisissez le code avant de continuer."
    Abort
  ${EndIf}
FunctionEnd

; ------------------------------------------------------------------ utilitaires

; Arrête la version qui tourne, et celle de l'ancienne installation en une ligne (tâche planifiée + agent seul).
!macro StopRunning un
Function ${un}StopRunning
  nsExec::Exec 'taskkill /F /T /IM PharmaBoost.exe'
  Pop $0
  nsExec::Exec 'schtasks /Delete /TN "PharmaBoost Connect (poste)" /F'
  Pop $0
  nsExec::Exec `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $$_.CommandLine -like '*pharmaboost-connect.js*' } | ForEach-Object { taskkill /PID $$_.ProcessId /T /F | Out-Null }"`
  Pop $0
  Sleep 1000
FunctionEnd
!macroend
!insertmacro StopRunning ""
!insertmacro StopRunning "un."

; Une installation qui échoue ne laisse rien derrière elle, sauf si le poste était déjà relié : alors on ne touche pas à ce qui marchait.
Function Rollback
  ${If} $AlreadyPaired = 0
    RMDir /r "$INSTDIR"
  ${EndIf}
FunctionEnd

!macro Fail code message
  DetailPrint "${message}"
  MessageBox MB_OK|MB_ICONSTOP "${message}" /SD IDOK
  SetErrorLevel ${code}
  Call Rollback
  Quit
!macroend

; ------------------------------------------------------------------ installation

Section "PharmaBoost" SecMain
  SetOutPath "$INSTDIR"

  DetailPrint "Arrêt de la version précédente…"
  Call StopRunning

  DetailPrint "Copie des fichiers…"
  File "${SRC}/PharmaBoost.exe"
  File "${SRC}/pharmaboost-connect.js"
  InitPluginsDir
  File "/oname=$PLUGINSDIR\PharmaBoostPreparation.exe" "${SRC}/PharmaBoostPreparation.exe"

  ; Le moteur (Node.js) : téléchargé depuis nodejs.org, version épinglée, empreinte SHA-256 vérifiée avant d'ouvrir l'archive.
  StrCpy $NodeMarker ""
  ClearErrors
  FileOpen $0 "$INSTDIR\node\version.txt" r
  ${IfNot} ${Errors}
    FileRead $0 $NodeMarker
    FileClose $0
  ${EndIf}
  ${If} $NodeMarker != "${NODE_VERSION}"
  ${OrIfNot} ${FileExists} "$INSTDIR\node\node.exe"
    DetailPrint "Téléchargement du moteur de PharmaBoost (environ 37 Mo)…"
    CreateDirectory "$INSTDIR\node"
    nsExec::ExecToLog '"$PLUGINSDIR\PharmaBoostPreparation.exe" node ${NODE_VERSION} ${NODE_SHA256} "$INSTDIR\node\node.exe"'
    Pop $0
    ${Select} $0
      ${Case} 0
      ${Case} 10
        !insertmacro Fail 10 "Impossible de télécharger le moteur de PharmaBoost depuis nodejs.org. Vérifiez la connexion Internet de ce poste (et qu'un pare-feu ne bloque pas nodejs.org), puis relancez l'installation."
      ${Case} 11
        !insertmacro Fail 11 "Le fichier téléchargé n'est pas celui attendu : son empreinte de sécurité est différente. Par précaution, l'installation est arrêtée. Prévenez PharmaBoost."
      ${Case} 12
        !insertmacro Fail 12 "Le moteur de PharmaBoost n'a pas pu être installé. Vérifiez l'espace disque de ce poste, puis relancez l'installation."
      ${Case} 14
        !insertmacro Fail 14 "Le moteur de PharmaBoost a été retiré par l'antivirus ou ne démarre pas. Autorisez le dossier $LOCALAPPDATA\PharmaBoost dans l'antivirus, puis relancez l'installation."
      ${CaseElse}
        !insertmacro Fail 6 "L'installation a rencontré une erreur inattendue ($0). Écrivez à contact@pharmaboost.app en joignant le fichier $INSTDIR\pharmaboost-connect.log."
    ${EndSelect}
    FileOpen $0 "$INSTDIR\node\version.txt" w
    FileWrite $0 "${NODE_VERSION}"
    FileClose $0
  ${Else}
    DetailPrint "Le moteur de PharmaBoost est déjà en place."
  ${EndIf}

  ; Relier le poste : le jeton du nom du fichier (ou le code saisi) devient la clé de ce poste, une seule fois.
  System::Call 'Kernel32::SetEnvironmentVariable(t "PHARMABOOST_CONNECT_CONFIG", t "$INSTDIR\pharmaboost-connect.json")i'
  ${If} $FileHasCode = 1
  ${OrIf} $TypedCode != ""
  ${OrIf} $AlreadyPaired = 0
    DetailPrint "Liaison de ce poste à votre officine…"
    StrCpy $1 '"$INSTDIR\node\node.exe" "$INSTDIR\pharmaboost-connect.js" --installer "$EXEFILE" --serveur "$ServerUrl"'
    ${If} $TypedCode != ""
      StrCpy $1 '$1 --code "$TypedCode"'
    ${EndIf}
    nsExec::ExecToLog $1
    Pop $0
    ; Comparaison de TEXTE : si nsExec n'a pas pu lancer le moteur, $0 vaut « error », jamais « 0 ».
    ${If} $0 == "3"
    ${AndIf} $AlreadyPaired = 1
      ; Le lien a déjà servi sur ce poste, qui reste relié : on met seulement le programme à jour.
      DetailPrint "Ce lien a déjà servi : le poste reste relié comme avant."
    ${ElseIf} $0 != "0"
      ${Select} $0
        ${Case} 2
          !insertmacro Fail 2 "Ce fichier d'installation ne contient pas de code. Téléchargez-le de nouveau depuis le lien donné par PharmaBoost (Stock → Connecter mon logiciel → Postes de caisse)."
        ${Case} 3
          !insertmacro Fail 3 "Ce lien d'installation n'est plus valable : il a expiré ou il a déjà servi. Dans PharmaBoost, ouvrez Stock → Connecter mon logiciel → Postes de caisse, cliquez « Ajouter un poste » et téléchargez le nouvel installateur."
        ${Case} 4
          !insertmacro Fail 4 "PharmaBoost est injoignable depuis ce poste. Vérifiez la connexion Internet (et qu'un pare-feu ne bloque pas pharmaboost.app), puis relancez l'installation."
        ${CaseElse}
          !insertmacro Fail 6 "Ce poste n'a pas pu être relié à PharmaBoost (erreur $0). Écrivez à contact@pharmaboost.app en joignant le fichier $INSTDIR\pharmaboost-connect.log."
      ${EndSelect}
    ${EndIf}
  ${Else}
    DetailPrint "Ce poste est déjà relié : mise à jour du programme."
  ${EndIf}

  ; Démarrage avec Windows, raccourcis, entrée « Applications installées ».
  DetailPrint "Réglages de Windows…"
  WriteUninstaller "$INSTDIR\Desinstaller.exe"
  WriteRegStr HKCU "${RUN_KEY}" "PharmaBoost" '"$INSTDIR\PharmaBoost.exe"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "PharmaBoost (poste de caisse)"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "PharmaBoost"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\PharmaBoost.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Desinstaller.exe"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\Desinstaller.exe" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "EstimatedSize" 98000

  CreateDirectory "$SMPROGRAMS\PharmaBoost"
  CreateShortCut "$SMPROGRAMS\PharmaBoost\PharmaBoost.lnk" "$INSTDIR\PharmaBoost.exe"
  CreateShortCut "$SMPROGRAMS\PharmaBoost\Désinstaller PharmaBoost.lnk" "$INSTDIR\Desinstaller.exe"
  ; Sur le Bureau, un raccourci vers l'application : c'est là que le titulaire retrouve ses conseils.
  WriteINIStr "$DESKTOP\PharmaBoost.url" "InternetShortcut" "URL" "$ServerUrl/vente/nouvelle"
  WriteINIStr "$DESKTOP\PharmaBoost.url" "InternetShortcut" "IconFile" "$INSTDIR\PharmaBoost.exe"
  WriteINIStr "$DESKTOP\PharmaBoost.url" "InternetShortcut" "IconIndex" "0"

  DetailPrint "Démarrage de PharmaBoost…"
  Exec '"$INSTDIR\PharmaBoost.exe" --premier-lancement'
SectionEnd

; ------------------------------------------------------------- désinstallation

Section "Uninstall"
  Call un.StopRunning
  Delete "$DESKTOP\PharmaBoost.url"
  Delete "$SMPROGRAMS\PharmaBoost\PharmaBoost.lnk"
  Delete "$SMPROGRAMS\PharmaBoost\Désinstaller PharmaBoost.lnk"
  RMDir "$SMPROGRAMS\PharmaBoost"
  DeleteRegValue HKCU "${RUN_KEY}" "PharmaBoost"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  RMDir /r "$INSTDIR"
SectionEnd
