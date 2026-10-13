import { redirect } from "next/navigation";

/**
 * « Mes comptoirs » a quitté le menu (retour du fondateur, 13 oct. 2026) : le robot se connecte seul, et « Envoyer mon stock »
 * faisait doublon avec « Mon stock → Mettre à jour mon stock ». Ce qui restait d'indispensable — installer un poste, voir ceux
 * qui sont connectés, les nommer, en retirer un — est dans Paramètres → « Postes du comptoir ». Les anciens liens y arrivent.
 */
export default function ConnectPage() {
  redirect("/parametres/postes");
}
