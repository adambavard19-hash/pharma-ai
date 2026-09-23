# Installer PharmaBoost sur un poste de caisse (douchette) — fiche pas à pas

Objectif : chaque boîte scannée dans le LGPI apparaît dans PharmaBoost à
l'instant du bip, sans second scan. Le LGPI n'est ni modifié ni interrogé.

## Ce qu'il faut

- Le poste de caisse Windows où la douchette est branchée (pas le serveur).
- Être connecté à Windows avec la session qui affiche le LGPI.
- Un accès Internet depuis ce poste.
- Dix minutes.

## Étape 0 — vérifier la douchette (une minute)

1. Ouvrir le Bloc-notes de Windows.
2. Passer une boîte à la douchette.
3. Les 13 chiffres du code-barres doivent s'écrire dans le Bloc-notes.

Si oui, la douchette est une douchette « clavier » : c'est le cas attendu.
Si rien ne s'écrit, la douchette est branchée sur un autre appareil ou dans
un autre mode : ne pas aller plus loin, envoyer une photo du branchement.

## Étape 1 — le code du poste (dans PharmaBoost)

Stock → Connecter mon logiciel → « Postes de caisse » → « Ajouter un poste »
(nom : « Caisse 1 »). Un code à six chiffres s'affiche, valable une heure.

## Étape 2 — installer sur le poste

1. Sur le poste, ouvrir PharmaBoost, Stock → Connecter mon logiciel, cliquer
   « Télécharger PharmaBoost Connect », puis décompresser l'archive (clic
   droit → Extraire tout).
2. Dans le dossier décompressé : clic droit → « Ouvrir dans le Terminal ».
3. Coller la commande affichée sous le code, qui ressemble à :

```
powershell -ExecutionPolicy Bypass -File .\install-poste-windows.ps1 -Code 123456 -Serveur https://pharmaboost.app
```

4. Attendre « Le poste est relié ». Si Node.js manque, le script l'installe
   (une minute de plus).

## Étape 3 — vérifier

1. Sur un second écran ou une tablette, ouvrir PharmaBoost → Nouvelle vente.
2. Dans le LGPI, faire une vente normale : passer une boîte à la douchette.
3. Dans PharmaBoost, la vente apparaît dans « Douchette : ventes en cours »
   et s'ouvre d'elle-même ; six secondes après le dernier bip, les conseils
   et les alertes s'affichent.

Pour tester la douchette sans rien envoyer : ajouter `-Test` à la commande
de l'étape 2. Chaque bip s'affiche dans la fenêtre.

## Si ça ne marche pas

- « Appairage impossible » : le code a plus d'une heure, en générer un
  nouveau ; ou le poste n'a pas Internet.
- Rien n'apparaît dans PharmaBoost : dans PharmaBoost, Stock → Connecter mon
  logiciel, la ligne du poste doit être « En ligne ». Si elle est « Muette »,
  le journal est dans `%LOCALAPPDATA%\PharmaBoost\Poste\pharmaboost-connect.log`.
- Le LGPI est affiché dans une fenêtre de bureau à distance (session
  secondaire) : l'agent doit être installé sur le poste physique, celui où la
  douchette est branchée, pas sur le serveur distant.

## Ce que l'agent du poste transmet, et rien d'autre

Les codes-barres de boîtes (rafales de chiffres d'une douchette), le nom de
la machine et un signe de vie par minute. Aucune lettre tapée au clavier
n'est conservée ni envoyée.

## Le stock

Chaque bip retire une boîte du stock PharmaBoost. L'export de stock du LGPI
(serveur, agent « serveur ») remet le compte exact quand il arrive.
