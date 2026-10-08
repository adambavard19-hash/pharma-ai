# PharmaBoost Connect

L'agent qui relie le logiciel de gestion de l'officine (LGO) à PharmaBoost.
Installé sur le serveur de l'officine, il surveille un dossier : dès que le
LGO y écrit — ou que vous y enregistrez — un export de stock (PDF d'édition
d'inventaire, CSV ou Excel), il l'envoie à PharmaBoost, qui met le stock à jour
dans la minute. Il peut aussi surveiller le dossier des ordonnances scannées.
Il n'écrit jamais dans le LGO, et donne signe de vie toutes les minutes.

## Installation (Windows, serveur de l'officine)

1. Dans PharmaBoost : Stock → Connecter mon logiciel → choisir le logiciel →
   « Générer mon code d'appairage ». Le code vaut une heure.
2. Sur le serveur, décompresser cette archive, puis dans PowerShell en
   administrateur, depuis le dossier décompressé :

       powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 -Code 123456 -Lgo lgpi

   Tout le reste est facultatif : `-Export` (dossier surveillé, par défaut
   `C:\PharmaBoost\Export`), `-Scans` (par défaut `C:\PharmaBoost\Ordonnances`),
   `-Serveur`. Les dossiers sont créés. Node.js est installé s'il manque.
3. L'agent est enregistré comme tâche planifiée « PharmaBoost Connect » et
   démarre avec le serveur. Configuration et journal :
   `C:\ProgramData\PharmaBoost\Connect\`.

## Avec LGPI (Pharmagest)

LGPI n'a pas d'export automatique du stock vers un fichier : c'est l'édition
d'inventaire, enregistrée en PDF, qui sert d'export. Procédure vérifiée en
officine :

1. Dans LGPI, module **Inventaire**, puis **Édition** (une édition n'a aucun
   effet sur l'inventaire ni sur la comptabilité : rien n'est validé).
2. Dans « Saisie des critères d'édition », choisir **Prix de vente** comme
   prix de référence, et l'ensemble du stock.
3. **Aperçu**, puis enregistrer l'édition en PDF dans `C:\PharmaBoost\Export`.
   Le nom du fichier n'a pas d'importance ; un fichier remplacé est relu.
4. PharmaBoost Connect envoie le fichier dans la minute. Refaire cette édition
   à chaque fois que le stock doit être rafraîchi — chaque matin, par exemple.

Les délivrances en temps réel (le stock qui bouge à chaque vente) demandent
l'accès au serveur LGPI, soumis à l'accord de Pharmagest.

## Sans installateur

    node pharmaboost-connect.js --appairer 123456 --serveur https://pharmaboost.app --lgo lgpi --export "/chemin/export"
    node pharmaboost-connect.js

Prérequis : Node.js 18 ou plus récent. Journal : `pharmaboost-connect.log` à
côté du fichier de configuration.

## Poste de caisse : la douchette alimente le comptoir

Sur chaque ordinateur où une douchette est branchée, l'agent peut écouter
les bips et envoyer le code-barres de la boîte à PharmaBoost à l'instant du
scan, sans second scan et sans rien changer au logiciel de l'officine.

```
powershell -ExecutionPolicy Bypass -File .\install-poste-windows.ps1 -Code 123456
powershell -ExecutionPolicy Bypass -File .\install-poste-windows.ps1 -Code 123456 -Test   (affiche les bips, n'envoie rien)
```

Le code s'obtient dans PharmaBoost : Stock → Connecter mon logiciel → Postes
de caisse. L'écoute tourne dans la session Windows de l'utilisateur (tâche à
l'ouverture de session). Seuls les codes-barres lus par la douchette sont
transmis (EAN/CIP, ou Datamatrix de médicament dont le CIP est extrait) ;
aucune frappe humaine n'est conservée.

## Poste de caisse : l'avis

En mode poste, l'agent interroge `/api/agent/conseil` après chaque bip et, dès que l'analyse est prête, confie l'avis à
une fenêtre Windows Forms (`notice-host.ts`, C# 5 compilé par PowerShell, un seul processus vivant) pilotée par
`notice-center.ts` : fond blanc, photo, disponibilité, « Voir le conseil » / « Ignorer », 30 s puis rangée près de
l'horloge avec un compteur, jamais le clavier (`WS_EX_NOACTIVATE`). L'ancienne fenêtre (`toast.ts`) reste le secours.
`--test-affichage` montre un conseil d'exemple. Détail : `docs/installation-poste-caisse.md`.

Contrôler la compilation du code Windows (demande `dotnet`) :
`PB_CSHARP_CHECK=1 npx vitest run agent/src/__tests__/notice-host.test.ts`.

## Robot de dispensation

Le branchement au robot (BD Rowa…) est décrit dans `docs/robot.md` : le diagnostic en lecture seule
(`diagnostic-robot.ps1`, servi en `.cmd` par `/api/agent/fichiers/diagnostic-robot.cmd`) et la lecture d'un
journal (`--test-robot`, `--robot`). Rien n'est lu tant qu'aucun robot n'est configuré.
