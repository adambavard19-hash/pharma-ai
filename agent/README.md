# PharmaBoost Connect

L'agent qui relie le logiciel de gestion de l'officine (LGO) à PharmaBoost.
Installé sur le serveur de l'officine, il lit l'export de stock que le LGO
produit dans un dossier et l'envoie à PharmaBoost dès qu'il change. Il peut
aussi surveiller le dossier des ordonnances scannées. Il n'écrit jamais dans le
LGO.

## Installation (Windows, serveur de l'officine)

1. Dans PharmaBoost : Stock → Connecter mon logiciel → générer le code d'appairage.
2. Activer dans le LGO l'export planifié du stock vers un dossier (CSV, texte ou Excel).
3. PowerShell en administrateur, dans ce dossier :

    .\install-windows.ps1 -Code 123456 -Lgo lgpi -Export "C:\LGPI\Exports" [-Scans "C:\LGPI\Scans"]

L'agent est enregistré comme tâche planifiée « PharmaBoost Connect » et démarre
avec le serveur. Sa configuration est dans
`C:\ProgramData\PharmaBoost\Connect\pharmaboost-connect.json`.

## Sans installateur

    node pharmaboost-connect.js --appairer 123456 --serveur https://pharmaboost.app --lgo lgpi --export "/chemin/export"
    node pharmaboost-connect.js

Prérequis : Node.js 18 ou plus récent.
