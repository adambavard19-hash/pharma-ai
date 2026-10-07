#!/usr/bin/env node
/**
 * Un faux PharmaBoost, pour essayer l'installateur sans aucune donnée réelle :
 * il accepte un seul jeton (JETON_VALABLE), compte les signes de vie, et sert
 * l'agent et son empreinte comme le vrai serveur. Utilisé par le test Windows
 * (.github/workflows/installateur-windows.yml) et à la main :
 *
 *   node installateur/tests/serveur-factice.mjs 8787
 *   curl localhost:8787/__etat
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const JETON_VALABLE = "GOODGOODGOODGOODGOOD";
const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const agent = readFileSync(join(racine, "agent", "dist", "pharmaboost-connect.js"));
const etat = { pairages: 0, refus: 0, signesDeVie: 0, versions: 0 };

const serveur = createServer((requete, reponse) => {
  const json = (statut, corps) => {
    reponse.writeHead(statut, { "Content-Type": "application/json" });
    reponse.end(JSON.stringify(corps));
  };
  let corps = "";
  requete.on("data", (morceau) => (corps += morceau));
  requete.on("end", () => {
    const chemin = new URL(requete.url, "http://x").pathname;
    if (chemin === "/api/agent/pair" && requete.method === "POST") {
      const { code } = JSON.parse(corps || "{}");
      if (code === JETON_VALABLE) {
        etat.pairages += 1;
        return json(200, { ok: true, agentKey: "k".repeat(43), pharmacyName: "Pharmacie d'essai", postLabel: "Caisse d'essai" });
      }
      etat.refus += 1;
      return json(400, { ok: false, error: "Code de poste inconnu ou expiré." });
    }
    if (chemin === "/api/agent/heartbeat" && requete.method === "POST") {
      etat.signesDeVie += 1;
      return json(200, { ok: true, exportPath: null, syncRequestedAt: null });
    }
    if (chemin === "/api/agent/version") {
      etat.versions += 1;
      return json(200, { version: "0.0.0-essai", sha256: createHash("sha256").update(agent).digest("hex"), size: agent.length });
    }
    if (chemin === "/api/agent/fichiers/pharmaboost-connect.js") {
      reponse.writeHead(200, { "Content-Type": "application/javascript" });
      return reponse.end(agent);
    }
    if (chemin === "/__etat") return json(200, etat);
    return json(404, { error: "inconnu" });
  });
});

serveur.listen(Number(process.argv[2] ?? 0), "127.0.0.1", () => console.log(`serveur factice sur http://127.0.0.1:${serveur.address().port}`));
