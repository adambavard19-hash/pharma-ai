#!/usr/bin/env node
/**
 * Où en est le travail par rapport à la publication sur `main` — en français,
 * sans jargon Git. Ne publie rien, ne modifie rien.
 *
 *   npm run publication:etat                 (lit l'état local, sans réseau)
 *   npm run publication:etat -- --actualiser (récupère d'abord l'état de GitHub)
 */
import { execFileSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const essayer = (...args) => {
  try {
    return git(...args);
  } catch {
    return null;
  }
};

if (process.argv.includes("--actualiser")) essayer("fetch", "origin", "main");

const branche = git("branch", "--show-current");
if (!essayer("rev-parse", "--verify", "-q", "origin/main")) {
  console.log("La référence « origin/main » est absente : impossible de situer le travail par rapport à la publication.");
  process.exit(1);
}

const enAttente = git("log", "--format=%h %s", "origin/main..HEAD").split("\n").filter(Boolean);
const enRetard = Number(git("rev-list", "--count", "HEAD..origin/main"));
const fusionnable = essayer("merge-base", "--is-ancestor", "origin/main", "HEAD") !== null;
// Sans `trim` : la première colonne de la sortie est un espace qui compte.
const modifies = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" })
  .split("\n")
  .filter((ligne) => ligne && !ligne.includes(".live/"));

console.log(`\nBranche de travail : ${branche}${branche === "developpement" ? "" : "  (⚠ la branche de travail attendue est « developpement »)"}`);
console.log(enAttente.length === 0 ? "Rien n'attend la publication : main contient déjà tout." : `En attente de publication sur main : ${enAttente.length} modification(s)`);
for (const ligne of enAttente) console.log(`  · ${ligne.slice(ligne.indexOf(" ") + 1)}`);
console.log(
  fusionnable
    ? "Publication sur main : possible sans conflit (avance rapide)."
    : `Publication sur main : À RÉCONCILIER d'abord — main a avancé de ${enRetard} modification(s) que le travail n'a pas.`,
);
if (modifies.length > 0) console.log(`Attention : ${modifies.length} fichier(s) modifié(s) pas encore enregistré(s) :\n${modifies.map((ligne) => `  · ${ligne.slice(3)}`).join("\n")}`);
console.log("Rien n'est publié tant que vous ne le demandez pas.\n");
