import { redirect } from "next/navigation";

/** « Au comptoir » se dit aussi par son nom : l'adresse historique /vente/nouvelle reste celle de la page (liens, poste Windows). */
export default function AuComptoirAlias() {
  redirect("/vente/nouvelle");
}
