@AGENTS.md

# Mode LIVE — notre façon de travailler sur Pharma.ai

Le développement se fait avec **le vrai Pharma.ai ouvert dans une fenêtre**, pas
avec des captures d'écran ni des maquettes. Le cycle est :

> je demande une modification → tu codes → rechargement à chaud → la vraie
> application se met à jour → je vois le changement → tu le vérifies aussi dans
> le navigateur.

## Le serveur ne se relance pas

```
npm run live            démarre s'il ne tourne pas, ne fait rien sinon
npm run live -- --open  démarre puis ouvre l'onglet (macOS)
npm run live:status     ce qui tourne, et si la base répond
npm run live:stop       arrête
```

Le processus est **détaché** : il survit à la fermeture du terminal et tient
toute une session de développement. `npm run live` est idempotent — l'appeler
dix fois ne démarre qu'un serveur. Le rechargement à chaud de Next.js fait le
reste : aucun onglet à rouvrir après une modification.

Journal : `.live/dev.log`.

## Règles de travail en mode LIVE

1. **Vérifier que le serveur tourne avant de coder** (`npm run live`), et le
   démarrer s'il est éteint. Ne jamais demander à l'utilisateur de le lancer.
2. **Ne jamais tuer le serveur** pour « repartir propre ». Un redémarrage coûte
   une minute de recompilation et referme la fenêtre de travail. Next.js
   recharge à chaud, y compris après un changement de composant serveur.
   Exceptions : modification de `next.config.ts`, d'une variable de `.env`, du
   schéma Prisma, ou installation d'un paquet — dans ces cas seulement,
   `npm run live:stop && npm run live`, en le disant.
3. **Vérifier soi-même dans le navigateur** après chaque modification visible,
   avec le serveur MCP `navigateur` : ouvrir la page, cliquer, lire ce qui
   s'affiche. Ne pas conclure « c'est fait » sur la seule foi du code.
4. **Pas de captures d'écran, pas de maquettes HTML, pas d'artifacts** pour
   montrer un résultat que l'utilisateur a déjà sous les yeux. Décrire en une
   phrase ce qui a changé et où le regarder.
5. **Un test visuel temporaire se défait toujours**, dans le même tour.

## Le navigateur piloté

`.mcp.json` déclare le serveur `navigateur` (`@playwright/mcp`), en mode
**visible** : une fenêtre Chrome s'ouvre quand Claude l'utilise, et l'on voit
les clics. C'est la même application, au même endroit — `localhost:3000`.

Il pilote **Google Chrome installé sur la machine**, pas un navigateur
embarqué : c'est le comportement par défaut de `@playwright/mcp`. Si Chrome
manque, le serveur le dit et une commande suffit :

```
npx playwright install chrome
```

Sur une machine sans Chrome possible — un conteneur, une intégration continue —
on surcharge localement, sans toucher au fichier partagé :

```
claude mcp add navigateur --scope local -- npx -y @playwright/mcp@latest \
  --executable-path "$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1)" \
  --no-sandbox --headless --viewport-size=1440,950 --output-dir=.live/navigateur
```

Comptes de démonstration : `pharmacien@pharma.ai`, `titulaire@pharma.ai`,
`preparateur@pharma.ai` · mot de passe commun `Demo2026!Pharma`. Sur l'écran de
connexion, les profils sont cliquables.

## Ce que le mode LIVE ne remplace pas

Les tests (`npx vitest run`), `tsc --noEmit` et `eslint` restent la vérification
de fond. Voir une couleur changer dans le navigateur ne dit rien d'une règle de
sécurité. Le navigateur prouve que l'écran est juste ; les tests prouvent que le
moteur l'est.
