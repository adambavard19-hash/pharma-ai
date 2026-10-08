# Le robot de dispensation (BD Rowa…) : ce qu'on sait, ce qu'on ignore, ce qui est prêt

## Pourquoi

Dans une officine à robot, le pharmacien ne bipe pas toujours les boîtes : le logiciel de gestion
(LGPI…) demande au robot de les sortir. C'est cette demande — la liste des produits — qui déclenche
le conseil chez le concurrent (il lit « l'échange LGO ↔ robot »). Chez PharmaBoost, aujourd'hui, le
seul déclencheur est la douchette : rien n'est branché sur le robot.

## Ce qui est établi (sources publiques)

- En France, le logiciel de l'officine et le robot se parlent par un protocole commun, **CDAPI**,
  défini ensemble par les fabricants d'automates et les éditeurs ; le titulaire, « via son fournisseur
  informatique », doit disposer de l'ensemble des fonctions de son cahier des charges
  ([Le Quotidien du Pharmacien](https://www.lequotidiendupharmacien.fr/gestion-de-lofficine/agencement-equipement/gros-plan-sur-la-connexion-robotordinateur)).
- Côté BD Rowa, l'interface s'appelle **WWKS2** : « conçue pour relier les automates de flux de
  matières aux ERP », très répandue ; la communication se fait par fichier ou en **TCP/IP**
  ([BD, Interfaces and Robotics](https://www.bd.com/en-eu/offerings/integrated-solutions/cato-software-solutions/interfaces-and-robotics)).
- L'API publique de BD (**Pickup Cloud API**) sert aux commandes d'une boutique en ligne vers un point
  de retrait : elle n'a rien à voir avec la dispensation au comptoir
  ([documentation](https://developers.api.pickup.bd.com/docs)).

## Ce qu'on ignore, et qu'on n'invente pas

- Les **spécifications** de CDAPI et de WWKS2 ne sont pas publiques.
- Comment, chez UNE officine donnée, cet échange peut être lu sans rien toucher : journal du logiciel du
  robot ? fichier d'échange ? trafic réseau ? câble série ?
- Si la liste envoyée au robot porte les quantités, et si elle précède ou suit le geste du pharmacien.

## Ce que PharmaBoost ne fera jamais

- **Se placer entre le logiciel et le robot** (relais, proxy) : la chaîne de dispensation ne se touche pas.
- **Écrire** dans le logiciel ou dans le robot, ou lui poser une question.
- **Capturer des données patient** : seuls des codes de produit seraient lus, jamais autre chose.

## Les pistes, toutes en lecture seule

| Piste | Quand | Ce qu'il faut |
| --- | --- | --- |
| **Journal** | Le logiciel du robot (ou l'interface) tient un fichier de log des échanges. | Le chemin du fichier et une expression qui désigne le code produit. **Prêt** (voir plus bas). |
| **Réseau** | L'échange passe en TCP/IP, en clair (XML). | Une capture passive de quelques secondes (`pktmon`, droits d'administrateur), analysée ensemble. Pas encore écrit : on ne sait pas si c'est utile avant le diagnostic. |
| **Série** | Câble série entre le serveur et le robot. | Un port COM observé passivement : à étudier si le diagnostic en montre un. |
| **Officielle** | Dans tous les cas, c'est la voie propre. | La spécification, en lecture seule, auprès de l'éditeur du logiciel et de BD Rowa France (modèle de demande ci-dessous). |

## Le diagnostic (prêt)

Un fichier à double-cliquer, `PharmaBoost-Diagnostic-Robot.cmd`, à lancer **sur l'ordinateur du robot et
sur le serveur du logiciel de l'officine** (un rapport chacun) :

```
https://pharmaboost.app/api/agent/fichiers/diagnostic-robot.cmd
```

(En local : `http://localhost:3000/api/agent/fichiers/diagnostic-robot.cmd`.) Windows peut demander
confirmation à l'ouverture ; aucun droit d'administrateur n'est nécessaire.

Il écrit **un rapport texte sur le Bureau**, que la personne relit avant de l'envoyer à
contact@pharmaboost.app. Il contient :

1. les logiciels installés qui ressemblent à un robot ou à un logiciel d'officine ;
2. les services et processus liés ;
3. les ports réseau en écoute et les connexions de ces programmes ;
4. les ports série (COM) ;
5. les **noms** de dossiers et de fichiers de journaux, leurs tailles et dates (jamais le contenu) ;
6. quelques lignes de réglages réseau (adresses, ports), **jamais** une ligne qui ressemble à un secret ;
7. la **structure masquée** de la fin des journaux récents : pour du XML, les noms des balises et des
   attributs sans aucune valeur ; pour du texte, les chiffres deviennent « 9 » et tout mot qui n'est pas
   du vocabulaire générique (pick, status, error…) devient « aaaa » : on voit la forme d'une ligne, jamais
   un nom, un produit ou un numéro ;
8. une lecture : quelle piste le rapport suggère.

Il **n'envoie rien** sur Internet, n'installe rien, ne change aucun réglage et n'écrit rien d'autre que le
rapport (un test vérifie qu'il ne contient aucune commande qui modifie, supprime, installe ou envoie).

Testé ici : la syntaxe (PowerShell 7), les fonctions de masquage sur des lignes inventées, l'enveloppe
.cmd. **Pas testé** : l'exécution sur un vrai Windows avec un vrai robot.

## Brancher un journal (prêt, à utiliser quand le diagnostic en a trouvé un)

Sur le poste de caisse déjà installé (voir `installation-poste-caisse.md`), dans le dossier
`%LOCALAPPDATA%\PharmaBoost\Poste`, avec le programme du poste :

```
node\node.exe pharmaboost-connect.js --test-robot "C:\chemin\journal.log" --motif "article=(\d{13})"
node\node.exe pharmaboost-connect.js --robot "C:\chemin\journal.log" --motif "article=(\d{13})"
```

`--test-robot` lit la fin du fichier et affiche les codes que l'expression y trouve, sans rien envoyer ni
écrire. `--robot` écrit la configuration ; quitter puis relancer l'icône PharmaBoost.

- Le **premier groupe de capture** de l'expression désigne le code produit (CIP13, EAN, CIP7). Pas de
  valeur par défaut : un nombre de treize chiffres peut être autre chose qu'un produit. Un nombre de 7 ou
  8 chiffres a la forme d'un CIP7 : ancrer l'expression sur un mot du journal (`article=(\d+)`).
- Au démarrage, l'agent part de la **fin** du fichier : l'historique n'est jamais rejoué.
- Chaque code lu suit **le même chemin qu'un bip** (le comptoir PharmaBoost, la fenêtre d'une minute) : le
  serveur n'a pas changé.
- Si la douchette et le robot annoncent la même boîte à moins de 45 secondes, elle ne compte **qu'une
  fois**. Hypothèse à confirmer en officine.
- Limite connue : la **quantité** n'est pas lue. Une ligne qui sort deux boîtes du même produit compte une
  boîte tant qu'on n'a pas vu le format.

Les tests (`agent/src/__tests__/robot.test.ts`) vérifient ce mécanisme sur des lignes de forme libre,
inventées pour l'essai : ils ne disent rien du format réel d'un journal BD Rowa ou LGPI.

## Demande officielle (modèle)

À envoyer à l'éditeur du logiciel de l'officine (Pharmagest pour LGPI) et à BD Rowa France :

> Bonjour,
>
> PharmaBoost est un outil d'aide au conseil à l'officine. Il s'installe sur un poste de comptoir et
> affiche, en lecture seule, des conseils associés aux produits dispensés. Pour les officines équipées d'un
> robot, nous souhaitons connaître la liste des produits que le logiciel demande au robot de sortir, **sans
> rien écrire ni relayer** entre le logiciel et le robot, et sans donnée patient.
>
> Pourriez-vous nous indiquer : (1) comment obtenir la spécification du protocole CDAPI (et de l'interface
> WWKS2 côté BD Rowa) ; (2) s'il existe un moyen officiel de lire, en lecture seule, les demandes de
> dispensation (journal, interface secondaire, API) ; (3) les conditions d'un accord de partenariat.
>
> Nous disposons d'une officine pilote équipée de LGPI et d'un robot BD Rowa pour valider l'intégration.
>
> Cordialement,

## Préparation dans PharmaBoost (8 octobre 2026)

La page « Ma connexion » a une étape « Connecter mon robot » (facultatif) : le pharmacien enregistre le fabricant
(BD Rowa, Mach4, Willach, Apostore, autre) et le modèle. **Rien n'est connecté** : l'écran dit « Intégration non
disponible », ne simule aucun état « connecté » et le test de connexion de l'assistance le classe en information, jamais
en réussite.

- Les paramètres techniques d'une future intégration (comment le logiciel et le robot se parlent, ordinateur et port,
  fichier d'échange) et le diagnostic en lecture seule sont dans l'**espace d'assistance** de la console. Le pharmacien
  n'en voit rien ; son enregistrement n'efface jamais ces paramètres, et l'assistance n'en crée pas avant que le titulaire
  ait désigné son robot.
- Les deux flux sont séparés dans le code et dans l'assistance : le **logiciel** apporte le stock (disponible par
  fichier), le **robot** apportera la délivrance en cours (non disponible). Ce ne sont pas les mêmes informations.
- Architecture : `src/core/robot/integration.ts`. `ROBOT_CONNECTORS` est **vide exprès** ; y inscrire un connecteur
  (fabricant, logiciels, stade, flux, paramètres) est le seul moyen de faire afficher « en essai » ou « disponible ».
  `DispenseSignal` fixe le contrat d'une délivrance détectée (mêmes codes qu'un bip, source « robot »).
- Configuration gardée dans `Pharmacy.settings.robot` (pas de migration). Les schémas sont stricts : toute clé inconnue,
  en premier lieu un mot de passe ou un jeton, est refusée. L'audit ne retient ni adresse ni chemin. La liste des
  fabricants est une liste de **choix**, pas de compatibilités.

## Suite

1. Lancer le diagnostic à l'officine pilote (robot et serveur), lire les deux rapports ensemble.
2. Selon la piste : brancher le journal (déjà prêt), ou écrire la lecture passive du réseau.
3. Envoyer la demande officielle en parallèle : elle débloque la lecture propre, avec quantités.
