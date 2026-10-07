#!/usr/bin/env node
/**
 * Construit l'installateur Windows d'un poste de comptoir :
 *   agent/installateur/PharmaBoost-Installation.exe   (le binaire livré, committé)
 *   agent/installateur/installateur.json              (version, empreinte, taille)
 *
 *   npm run installateur:construire
 *
 * Se construit depuis macOS ou Linux, sans Windows :
 *   - dotnet (SDK 8 ou plus) compile l'icône (PharmaBoost.exe) et l'outil de
 *     préparation (PharmaBoostPreparation.exe), en .NET Framework 4.8 ;
 *   - makensis (NSIS 3) assemble l'installateur.      brew install makensis dotnet
 *
 * Signature (recommandée : sans elle, Windows affiche « éditeur inconnu »).
 * Avec un certificat de signature de code au format PFX et osslsigncode
 * (brew install osslsigncode) :
 *   INSTALLATEUR_PFX=/chemin/certificat.pfx INSTALLATEUR_PFX_MOT_DE_PASSE=… npm run installateur:construire
 * Le mot de passe n'est lu que dans l'environnement : jamais écrit, jamais affiché.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sources = join(racine, "installateur");
const sortie = join(racine, "agent", "installateur");
const config = JSON.parse(readFileSync(join(sources, "installateur.json"), "utf8"));

function lancer(commande, args, options = {}) {
  console.log(`$ ${commande} ${args.join(" ")}`);
  return execFileSync(commande, args, { stdio: "inherit", cwd: racine, ...options });
}

function exiger(commande, arg, aide) {
  try {
    execFileSync(commande, [arg], { stdio: "ignore" });
  } catch {
    console.error(`${commande} est introuvable. ${aide}`);
    process.exit(1);
  }
}

exiger("dotnet", "--version", "Installez-le : brew install dotnet");
exiger("makensis", "-VERSION", "Installez-le : brew install makensis");

if (!/^v\d+\.\d+\.\d+$/.test(config.node.version) || !/^[0-9a-f]{64}$/.test(config.node.sha256)) {
  console.error("installateur/installateur.json : version de Node ou empreinte SHA-256 illisible.");
  process.exit(1);
}

const travail = mkdtempSync(join(tmpdir(), "pharmaboost-installateur-"));
try {
  // 1. L'agent, tel que PharmaBoost le sert (un test vérifie que dist/ est à jour).
  lancer("npm", ["run", "agent:build"]);

  // 2. Les deux petits programmes Windows.
  const pret = join(travail, "pret");
  mkdirSync(pret);
  for (const [projet, exe] of [["Tray", "PharmaBoost.exe"], ["Setup", "PharmaBoostPreparation.exe"]]) {
    const dossier = join(travail, projet);
    lancer("dotnet", ["build", join(sources, projet, `${projet}.csproj`), "-c", "Release", "-o", dossier, "--nologo", "-v", "q"]);
    copyFileSync(join(dossier, exe), join(pret, exe));
  }
  copyFileSync(join(racine, "agent", "dist", "pharmaboost-connect.js"), join(pret, "pharmaboost-connect.js"));

  // 3. L'installateur.
  mkdirSync(sortie, { recursive: true });
  const fichier = join(sortie, "PharmaBoost-Installation.exe");
  rmSync(fichier, { force: true });
  lancer("makensis", [
    "-V2",
    `-DVERSION=${config.version}`,
    `-DNODE_VERSION=${config.node.version}`,
    `-DNODE_SHA256=${config.node.sha256}`,
    `-DSRC=${pret}`,
    `-DICON=${join(sources, "assets", "pharmaboost.ico")}`,
    `-DOUT=${fichier}`,
    join(sources, "installer.nsi"),
  ]);

  // 4. Signature, si un certificat est fourni.
  let signe = false;
  const pfx = process.env.INSTALLATEUR_PFX;
  if (pfx) {
    if (!existsSync(pfx)) {
      console.error(`Certificat introuvable : ${pfx}`);
      process.exit(1);
    }
    exiger("osslsigncode", "--version", "Installez-le : brew install osslsigncode");
    const signature = `${fichier}.signe`;
    execFileSync(
      "osslsigncode",
      ["sign", "-pkcs12", pfx, "-pass", process.env.INSTALLATEUR_PFX_MOT_DE_PASSE ?? "", "-n", "PharmaBoost", "-i", "https://pharmaboost.app", "-h", "sha256", "-t", "http://timestamp.digicert.com", "-in", fichier, "-out", signature],
      { stdio: "inherit" },
    );
    renameSync(signature, fichier);
    signe = true;
  } else {
    console.warn("\nNon signé : Windows affichera « éditeur inconnu » à l'ouverture (SmartScreen). Voir installateur/README.md.");
  }

  // 5. La fiche du binaire : un test relit l'empreinte pour s'assurer qu'il n'a pas été remplacé à la main.
  const octets = readFileSync(fichier);
  const fiche = {
    version: config.version,
    node: config.node.version,
    agent: /const VERSION = "([^"]+)"/.exec(readFileSync(join(racine, "agent", "src", "index.ts"), "utf8"))?.[1] ?? null,
    sha256: createHash("sha256").update(octets).digest("hex"),
    taille: statSync(fichier).size,
    signe,
    construitLe: new Date().toISOString(),
  };
  writeFileSync(join(sortie, "installateur.json"), `${JSON.stringify(fiche, null, 2)}\n`);
  console.log(`\nInstallateur prêt : ${fichier}\n  ${(fiche.taille / 1024).toFixed(0)} Ko · SHA-256 ${fiche.sha256}${signe ? " · signé" : ""}`);
} finally {
  rmSync(travail, { recursive: true, force: true });
}
