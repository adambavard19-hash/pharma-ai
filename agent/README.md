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
