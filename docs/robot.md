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

## Premier rapport reçu : un poste de comptoir, pas le robot (8 octobre 2026)

Rapport de **POSTE5** (Windows 11 Pro), lancé par la pharmacienne au comptoir. Ce qu'il établit :

- Le logiciel de l'officine est **Pharmagest LGPI** (ID. 7.4.1, OffiPos 2.3.0, Vitale Connect, PC Info…).
- Cet ordinateur est **un poste de comptoir** : aucun logiciel de robot (Rowa, Apostore, Willach, Consis…), **aucun port
  COM**, aucune connexion vers un robot. Les seuls services réseau sont ceux de Pharmagest pour les périphériques :
  `escpos2rest` (impression de tickets, port 9061, connexion avec lui-même) et `offipos` (caisse, JavaPOS).
- Les journaux sont vides ou minuscules (`offipos.log` 0 Ko, `requests.log` 0 Ko) : rien sur un échange avec un robot.
- La lecture automatique du rapport (« un programme du robot écoute… ») était une **fausse piste** : le diagnostic prenait le service
  d'impression de tickets pour un robot. Corrigé (voir plus bas).

**Conclusion : on ne sait toujours pas comment le logiciel et le robot se parlent**, parce que l'échange n'a pas lieu sur
ce poste. Il faut le rapport du **serveur** du logiciel et celui de l'**ordinateur du robot** (s'il en a un). Rien n'est
écrit pour le robot tant qu'on n'a pas vu une ligne réelle de cet échange : écrire un lecteur sans en connaître le
format serait inventer.

**Diagnostic complet (8 octobre 2026, après que l'utilisateur a précisé que le robot Rowa est bien branché sur cet
ordinateur — la première version ne l'a donc pas vu, ce qui était un défaut du diagnostic)** : le rapport garde les sections
1 à 7 et ajoute, sans rien modifier ni envoyer : 8 tous les programmes installés (hors Microsoft) · 9 tous les services
hors Windows (le programme, jamais ses arguments) · 10 tous les programmes en cours, avec leur dossier · 11 toutes les
connexions établies, regroupées, avec « cet ordinateur / autre ordinateur du réseau local / hors du réseau local » · 12
adresses, passerelle et voisins du réseau local · 13 dossiers partagés et lecteurs réseau (un échange par fichier passe
par là) · 14 appareils série et adaptateurs USB-série · 15 tâches planifiées hors Windows · 16 noms de clés du registre ·
17 fichiers dont le NOM parle du robot · 18 journaux des 30 derniers jours qui mentionnent le robot (**nombre de mentions
par mot**, jamais le texte) · 19 les lignes de ces journaux, masquées comme avant · 20 la lecture. Un programme Java est
reconnu par son dossier ou sa ligne de lancement (jamais écrite dans le rapport). Durée : deux à cinq minutes (recherche
bornée à 90 s, lecture des journaux à 100 s, 4 Mo par journal). Testé avec PowerShell 7 sur des machines et un disque
simulés ; **pas testé avec Windows PowerShell 5.1 (celui de Windows 11 par défaut) ni sur un vrai Windows**.

## Deuxième rapport complet : la piste « journal » existe (9 octobre 2026, POSTE5)

Le diagnostic complet de POSTE5 a trouvé ce que le premier ne cherchait pas : **LGPI tient lui-même, sur chaque poste, un journal
en clair de son échange avec l'automate** — `C:\var\log\lgpi\application\lgpi.AAAA-MM-JJ.log`, un fichier par jour, écrit en continu.
Sur les 30 derniers jours, 9 journaux citent le robot (jusqu'à 692 lignes « automate » et 44 « OutputRequest » dans une même journée).

Ce que le rapport établit (valeurs masquées) :

- des lignes `Réception message en provenance de l'automate : …Request(…)` et les envois correspondants, avec un identifiant à
  huit chiffres (`id=99999999`) ; `OutputRequest` est le terme de l'interface WWKS2 de BD Rowa pour **une demande de sortie**, donc la
  délivrance elle-même ;
- des lignes `… : Code produit 9999999 … 9 …` : un code produit à **sept chiffres** (la forme d'un CIP7), cité par un composant qui
  parle au stock de l'automate ;
- l'échange passe par le serveur de l'officine (192.168.0.100 : base de données, file de messages RabbitMQ sur le port 5672) ; le poste n'a ni
  logiciel de robot, ni port COM, ni dossier partagé — il n'y a **rien à brancher ni à capturer** : le journal local suffit, en lecture seule.

Ce qu'on **ignore encore** (et qu'on n'invente pas) : à quel moment exact ces lignes apparaissent par rapport au geste du pharmacien
(sélection du produit ? sortie du robot ? validation de la vente ?), et quel champ porte le code produit dans une demande de sortie.
Le masquage du premier rapport cachait les noms des champs ; un second rapport les montre.

### La lecture du journal de LGPI (prête)

`lire-journal.cmd` (fichier `PharmaBoost-Lecture-Journal.cmd`, à télécharger depuis la console : Officines → fiche → Technique & stock →
Assistance → Robot, ou `https://pharmaboost.app/api/agent/fichiers/lire-journal.cmd`), à double-cliquer **sur un poste où PharmaBoost est
installé**, juste après une vente de test d'UNE boîte connue. Il lit la fin des trois derniers journaux de LGPI (6 Mo chacun, en lecture
partagée : LGPI continue d'écrire) et écrit un rapport sur le Bureau :

1. quels journaux, quelles tailles, combien de lignes du robot par jour ;
2. les **formes** de lignes du robot, comptées, avec première et dernière heure — les noms de structures (`OutputRequest(`) et de champs
   (`articleId=`) restent lisibles, tout le reste est masqué (chiffres → 9, mots → a/A) ;
3. les 40 dernières lignes du robot, masquées ;
4. les **codes produit** que trois motifs candidats trouvent (`Code produit …`, `article…=…`, `cip/ean/gtin…=…`), avec l'heure : des
   produits, jamais un patient ; on les compare à la vente de test, à la minute près.

Jamais lues : les lignes qui ne commencent pas par une date (la suite d'une trace d'erreur, où passent les noms). Rien n'est envoyé, rien n'est
installé, le seul programme lancé est PowerShell pour demander où est le Bureau. Le programme (`agent/src/lire-journal.ts`) est
exécuté par le Node.js que PharmaBoost a installé sur le poste (`%LOCALAPPDATA%\PharmaBoost\Poste\node\node.exe`) : testé ici de bout en bout
(le .cmd est relu par Node comme Windows le fait), mais **pas encore sur un vrai Windows**.

Ensuite : le bon motif entre dans `--robot` (voir ci-dessous), le fichier du jour change chaque matin (`lgpi.AAAA-MM-JJ.log`) — le poste devra
suivre le journal du jour, ce que `--robot` ne sait pas encore faire.

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

La page « Mes connexions » a une étape « Connecter mon robot » (facultatif) : le pharmacien enregistre le fabricant
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

## Le journal de LGPI lu en direct (agent 0.9.0, 10 octobre 2026)

Source : le rapport de lecture de **POSTE3** du 9 octobre 2026 (trois jours de journaux, 65 791 lignes, 4 170 lignes du
robot, puis une vente de test d'une boîte à 02:06).

**Ce que le rapport établit.** LGPI écrit `C:\var\log\lgpi\application\lgpi.AAAA-MM-JJ.log` (un fichier par jour, en ANSI),
et chaque demande faite au robot depuis CE poste y laisse un petit cycle de lignes de la classe `ControlerAutomate` :

```
Demande à la …            → début
Code produit 3400935294227 … → le produit (CIP 13 chiffres ; 7 chiffres pour un produit numéroté par LGPI)
… on en … K sur 999 …
Fin de la demande à la …  → fin ; la réponse du robot (StockOutputResponse, avec le code à 13 chiffres) suit dans la seconde
```

D'autres cycles s'arrêtent à « on n'en … pas » et ne finissent jamais : le robot n'a pas la boîte, rien ne sort, et la
même boîte peut y être redemandée cinq fois en vingt secondes (19:13 le 8 octobre). Le message de sortie réelle
(`StockOutputMessage … packs=[StockOutputPack…`) arrive de 10 secondes à 2 minutes plus tard.

**Ce que fait l'agent.** `agent/src/robot-lgpi.ts` suit le journal du jour (il change à minuit : la fin de la veille est
lue, puis le nouveau fichier depuis son début) et annonce comme un bip **les produits d'un cycle terminé**, une fois chacun.
Une ligne « Code produit » seule n'annonce rien (sinon la même boîte compterait cinq fois). Un code à 7 chiffres que
la réponse du robot remplace sans ambiguïté par un code-barres à 13 chiffres est annoncé sous ce dernier (le lecteur de
glycémie demandé sous « 5162291 » est sorti sous « 4015630063253 »). Le doublon avec la douchette reste écarté
(`CrossSourceDedupe`, 45 s).

- **Automatique** sur Windows dès l'agent 0.9.0 ; il ne dit rien tant qu'aucun cycle terminé ne passe. Éteindre :
  `pharmaboost-connect --robot-aucun` ; rallumer : `--robot-lgpi`. L'ancien mode (un fichier + une expression, `--robot`)
  reste possible.
- Les codes de la vente de test (DOLIPRANE 1000 mg, 3400935294227) et ceux du soir du 8 octobre (MACROGOL, AZYTER,
  DACUDOSES, DOLIPRANE 500 mg) sont tous des produits connus de la base.

**Ce qui n'est PAS établi** (rien n'est inventé) : le sens des mots que le rapport masquait ; la quantité demandée (le
chiffre qui suit le code n'est pas lu : une boîte par code et par demande) ; si certaines demandes terminées n'ont pas de ligne
« Code produit » ; si une demande terminée est toujours suivie d'une sortie de boîte (131 messages de sortie sur 312 sont
vides, tous avant le 8 octobre 13:24). Le rapport de lecture (`PharmaBoost-Lecture-Journal.cmd`) a une section 5 « Ce que
PharmaBoost annoncerait » qui répond à ces questions sur les vrais journaux : produits annoncés, suivis ou non d'une sortie.
Jamais lu sur un vrai Windows par l'agent lui-même ; seulement sur des lignes de la même forme.

## Suite

0. Vente de test à trois cas (une boîte ; deux boîtes différentes ; la même boîte deux fois), puis le rapport de lecture : la
   section 5 doit montrer exactement ces produits, à la minute près.

1. Lancer le diagnostic à l'officine pilote (robot et serveur), lire les deux rapports ensemble.
2. Selon la piste : brancher le journal (déjà prêt), ou écrire la lecture passive du réseau.
3. Envoyer la demande officielle en parallèle : elle débloque la lecture propre, avec quantités.
