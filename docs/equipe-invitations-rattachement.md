# Équipe, invitations, rattachement, comptoirs

Le parcours d'entrée dans une officine, sans aucun réglage de la console PharmaBoost.

1. **Le titulaire crée son officine** (dossier commercial → lien d'accueil, inchangé). Il est administrateur de son espace : « Mon équipe » et « Mes comptoirs ».
2. **Invitation par e-mail** (« Mon équipe » → « Inviter des collaborateurs ») : une ou plusieurs adresses, un poste (pharmacien, préparateur,
   étudiant, consultation). Chacun reçoit un lien **personnel, daté (7 jours), à usage unique** (`/invitation/<jeton>`) : il choisit son mot de
   passe, son compte est créé **dans l'officine du titulaire**, avec le poste prévu, et il est connecté. Seule l'empreinte du jeton est conservée.
   Le titulaire voit qui n'a pas répondu (renvoyer / annuler) et est prévenu de chaque arrivée. Un compte déjà existant du même groupe prouve son
   mot de passe ; une adresse connue d'une autre organisation reste « indisponible ».
3. **« Rejoindre mon officine »** (`/rejoindre`, lien sous le formulaire de connexion) : le collaborateur cherche sa pharmacie (nom, ville ou code
   postal, 3 caractères au moins, nom + commune seulement, jamais une officine de démonstration), puis envoie une demande. **Aucun compte n'est
   créé** tant que le titulaire n'a pas approuvé : la demande garde seulement l'empreinte du mot de passe choisi, effacée à la décision. Le
   titulaire est prévenu (cloche + e-mail), choisit le poste réel, approuve ou refuse ; la personne reçoit la réponse par e-mail. L'écran public
   dit la même chose que l'adresse ait un compte ou non (c'est un e-mail qui prévient la personne concernée). Plafond : 25 demandes en attente par officine.
4. **Mes comptoirs** : le téléchargement de PharmaBoost Connect (code d'appairage à usage unique, 7 jours, créé pour le titulaire seul), l'état de
   chaque ordinateur, et le collaborateur de chacun. Les anciens libellés « Mes connexions » y mènent désormais sous ce nom.
5. **Identifier le collaborateur** : « Nouvelle vente » → « Je travaille ici » (un clic, sans réinstaller) attribue le comptoir à la personne
   connectée ; elle n'est qu'à un comptoir à la fois (en prendre un libère l'autre) ; celui qui l'occupait en est prévenu ; le titulaire voit qui
   est où. Les conseils et ventes sont attribués à la personne (instantané pris au bip), pas à l'ordinateur.

Isolation : tout geste du titulaire est borné à l'officine de **sa session** ; une demande, une invitation ou un comptoir d'une autre officine est
« introuvable ». Essai sur la vraie base, deux officines, requêtes simultanées : `npm run essai:equipe` (nettoie tout ; `-- --garder` conserve les
deux officines pour un essai à l'écran).

Migration : `20261024090000_equipe_invitations_rattachement` (tables `team_invitations`, `join_requests`).
